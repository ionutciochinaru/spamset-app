/**
 * Profile picture: take one with the camera or pick one from your photos, square-cropped.
 * Native copies it into the app's documents (the picker's copy is temporary); web keeps the
 * picker's URI. Stays on this device.
 */
import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export type AvatarSource = 'camera' | 'library';

const OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 };

/** The stored picture's URI, or null when cancelled. Throws when permission is denied. */
export async function pickAvatar(source: AvatarSource, previous?: string): Promise<string | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Camera access is off. Turn it on in Settings to take a picture.');
  }
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(OPTIONS) : await ImagePicker.launchImageLibraryAsync(OPTIONS);
  if (result.canceled || !result.assets[0]) return null;
  const picked = result.assets[0].uri;
  if (Platform.OS === 'web') return picked;

  // A new name each time, so cached images of the old picture never show.
  const stored = new File(Paths.document, `avatar-${Date.now()}.jpg`);
  new File(picked).copy(stored);
  removeAvatar(previous);
  return stored.uri;
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
