/**
 * Profile picture: take one with the camera or pick one from your photos. It is cropped square
 * and resized to a small JPEG (256 px, about 20-40 KB) before it is kept or uploaded. Native
 * keeps it in the app's documents; web keeps the picker's URI. With a leaderboard profile it
 * is also uploaded so the boards can show it (supabase/migrations/0004_avatars.sql).
 */
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { useApp } from '@/store/app-store';

import { setRemoteAvatar } from './leaderboard';
import { supabase } from './supabase';

export type AvatarSource = 'camera' | 'library';

/** Pixels per side; avatars never show bigger than 88 pt (3x is about 256 px). */
const SIZE = 256;
const QUALITY = 0.7;

const OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 };

/** The stored picture's URI, or null when cancelled. Throws when permission is denied. */
export async function pickAvatar(source: AvatarSource, previous?: string): Promise<string | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Camera access is off. Turn it on in Settings to take a picture.');
  }
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(OPTIONS) : await ImagePicker.launchImageLibraryAsync(OPTIONS);
  if (result.canceled || !result.assets[0]) return null;
  const small = await shrink(result.assets[0]);
  if (Platform.OS === 'web') return small;

  // A new name each time, so cached images of the old picture never show.
  const stored = new File(Paths.document, `avatar-${Date.now()}.jpg`);
  new File(small).copy(stored);
  removeAvatar(previous);
  return stored.uri;
}

/** Centre-crop to a square (when the picker didn't) and resize to SIZE, as a compressed JPEG. */
async function shrink(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const context = ImageManipulator.manipulate(asset.uri);
  const side = Math.min(asset.width, asset.height);
  if (side && asset.width !== asset.height) {
    context.crop({ originX: (asset.width - side) / 2, originY: (asset.height - side) / 2, width: side, height: side });
  }
  context.resize({ width: SIZE, height: SIZE });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: QUALITY });
  return saved.uri;
}

/** Delete a stored picture (no-op for web or missing files). */
export function removeAvatar(uri?: string) {
  if (!uri || Platform.OS === 'web') return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Already gone.
  }
}

async function bytesOf(uri: string): Promise<ArrayBuffer | Uint8Array> {
  if (Platform.OS === 'web') return (await fetch(uri)).arrayBuffer();
  return new File(uri).bytes();
}

/**
 * Upload your current picture (or remove the uploaded one) when it differs from what the boards
 * have. A no-op offline or without a leaderboard profile; safe to call often.
 */
export async function syncAvatar(): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  const { avatarUri, avatarUploaded, setAvatarUploaded } = useApp.getState();
  if ((avatarUri ?? null) === (avatarUploaded ?? null)) return;
  if (await setRemoteAvatar(avatarUri ? await bytesOf(avatarUri) : null)) setAvatarUploaded(avatarUri);
}
