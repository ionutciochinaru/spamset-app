/* eslint-disable react/no-unknown-property -- react-three-fiber JSX props */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent, type ViewStyle } from 'react-native';
import * as THREE from 'three';

import { Aura, repsPerLoop } from '@/animation/aura';
import { clips } from '@/animation/clips';
import { Figure } from '@/animation/figure';
import { PSXPass, snapVertices } from '@/animation/psx';
import { clipBounds, clipFootprint, samplePose } from '@/animation/sample';
import { Canvas, useFrame, useThree } from '@/animation/three-canvas';
import { Scanlines } from '@/components/ui';
import { DisplayFont, Palette, Psx, Radius } from '@/constants/theme';

type Orbit = { azimuth: number; elevation: number };

/** Clips lower than this (m) are floor work; their default camera starts higher (degrees). */
const FLOOR_CLIP_HEIGHT = 0.9;
const FLOOR_ELEVATION = 26;

const FOV = 30;
const MIN_ELEVATION = -0.05;
const MAX_ELEVATION = 1.25;

type SceneProps = {
  clipId: string;
  orbit: React.RefObject<Orbit>;
  speed: number;
  paused: boolean;
  /** Fixed loop position in [0, 1); overrides playback. */
  phase?: number;
  onPhase?: (phase: number) => void;
  /** Camera distance multiplier (1 = whole motion in frame). */
  zoom?: number;
  /** Joint to centre on (e.g. 'wrist_l'); default is the motion's bounding box. */
  focus?: string;
  /** PlayStation-style rendering (low-res pixels, vertex wobble, dithered 15-bit colour). */
  psx: boolean;
  /** XP burst (flare, shockwave, arrows) on every completed rep. */
  aura: boolean;
};

function Scene({ clipId, orbit, speed, paused, phase, onPhase, zoom = 1, focus, psx, aura: auraOn }: SceneProps) {
  const clip = clips[clipId];
  const figure = useMemo(() => new Figure(), []);
  const pass = useMemo(() => new PSXPass(), []);
  const aura = useMemo(() => (auraOn ? new Aura() : null), [auraOn]);
  useEffect(() => () => aura?.dispose(), [aura]);
  const reps = useMemo(() => repsPerLoop(clip), [clip]);
  const rep = useRef(0);
  useEffect(() => () => pass.dispose(), [pass]);
  useEffect(() => {
    if (psx) snapVertices(figure.group);
  }, [figure, psx]);
  const bounds = useMemo(() => clipBounds(clip), [clip]);
  useEffect(() => {
    const ground = clipFootprint(clip);
    figure.setGround(ground.x, ground.z, ground.radius);
  }, [clip, figure]);
  const { camera } = useThree();
  const time = useRef(0);
  const reported = useRef(0);

  useEffect(() => () => figure.dispose(), [figure]);

  useFrame((_, delta) => {
    if (phase !== undefined) time.current = phase * clip.duration;
    else if (!paused) time.current += Math.min(delta, 0.1) * speed;
    if (onPhase && performance.now() - reported.current > 100) {
      reported.current = performance.now();
      onPhase((((time.current / clip.duration) % 1) + 1) % 1);
    }
    const { azimuth, elevation } = orbit.current;
    const pose = samplePose(clip, time.current);
    // Aim slightly low so the figure sits above the playback controls.
    const target =
      focus && pose.joints[focus]
        ? new THREE.Vector3(...pose.joints[focus])
        : // A standing figure aims a little low (clear of the playback controls); a low, floor
          // clip is centred instead of sinking into the bottom of the frame.
          new THREE.Vector3(...bounds.center).add(new THREE.Vector3(0, -Math.min(bounds.size, bounds.height * 1.6) * 0.07, 0));
    const distance = (bounds.size / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2))) * 1.3 * zoom;
    camera.position.set(
      target.x + distance * Math.sin(azimuth) * Math.cos(elevation),
      target.y + distance * Math.sin(elevation),
      target.z + distance * Math.cos(azimuth) * Math.cos(elevation),
    );
    camera.lookAt(target);
    figure.update(pose, camera.position);
    aura?.update(pose.joints, camera.position, paused ? 0 : delta);
    // A rep ends at each 1/reps of the loop: burst then.
    const done = Math.floor((time.current / clip.duration) * reps);
    if (aura && done > rep.current && phase === undefined) aura.burst();
    rep.current = done;
  });

  // With PSX on, draw the frame ourselves through the low-res pass (a positive priority
  // takes over rendering from react-three-fiber).
  useFrame(({ gl, scene, camera: eye, size }) => {
    if (psx) pass.render(gl, scene, eye, size.width, size.height);
    else gl.render(scene, eye);
  }, 1);

  return (
    <>
      <color attach="background" args={[Palette.stage]} />
      <ambientLight intensity={1.7} />
      <directionalLight position={[2, 4, 3]} intensity={1.6} />
      <directionalLight position={[-3, 2, -2]} intensity={0.5} />
      {/* Rim light from behind, so the dark iron bell keeps an edge on the black stage. */}
      <directionalLight position={[0, 3, -4]} intensity={1.4} />
      <primitive object={figure.group} />
      {aura && <primitive object={aura.group} />}
    </>
  );
}

/**
 * Looping 3D exercise demonstration. Drag to spin around the figure and tilt
 * the view; the character keeps moving while you inspect it.
 */
export function FigureViewer({
  clipId,
  style,
  controls = true,
  view,
  phase,
  speed: speedProp,
  paused: pausedProp,
  onPhase,
  zoom,
  focus,
  psx = true,
  scan = true,
  aura = true,
}: {
  clipId: string;
  style?: ViewStyle;
  controls?: boolean;
  /** Camera in degrees; changing it moves the camera (dragging still works). */
  view?: { azimuth: number; elevation: number };
  phase?: number;
  speed?: number;
  paused?: boolean;
  onPhase?: (phase: number) => void;
  zoom?: number;
  focus?: string;
  /** PlayStation-style rendering; on by default. */
  psx?: boolean;
  /** CRT scanlines over the stage (off for review captures). */
  scan?: boolean;
  /** XP burst on every completed rep; on everywhere except the animation review. */
  aura?: boolean;
}) {
  const clip = clips[clipId];
  // Start from the watch camera, so the side it draws near (and single-arm work) faces you.
  const azimuth = view?.azimuth ?? clip.view.azimuth;
  // Floor work (lying, planks) seen from near floor level is a thin strip: start it from
  // at least 26 degrees up so the body reads as a shape. Standing clips keep their camera.
  const low = useMemo(() => clipBounds(clip).height < FLOOR_CLIP_HEIGHT, [clip]);
  const elevation = view?.elevation ?? (low ? Math.max(clip.view.elevation, FLOOR_ELEVATION) : clip.view.elevation);
  const home = useMemo<Orbit>(
    () => ({ azimuth: THREE.MathUtils.degToRad(azimuth), elevation: THREE.MathUtils.degToRad(elevation) }),
    [azimuth, elevation],
  );
  const orbit = useRef<Orbit>({ ...home });
  const start = useRef<Orbit>({ ...home });
  const [speedState, setSpeed] = useState(1);
  const [pausedState, setPaused] = useState(false);
  const speed = speedProp ?? speedState;
  const paused = pausedProp ?? pausedState;

  useEffect(() => {
    orbit.current = { ...home };
  }, [home]);

  const touch = useRef({ x: 0, y: 0 });
  const onGrant = (e: GestureResponderEvent) => {
    touch.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
    start.current = { ...orbit.current };
  };
  const onMove = (e: GestureResponderEvent) => {
    const dx = e.nativeEvent.pageX - touch.current.x;
    const dy = e.nativeEvent.pageY - touch.current.y;
    orbit.current = {
      azimuth: start.current.azimuth - dx * 0.01,
      elevation: THREE.MathUtils.clamp(start.current.elevation + dy * 0.006, MIN_ELEVATION, MAX_ELEVATION),
    };
  };

  return (
    <View style={[styles.frame, style]}>
      <View
        style={StyleSheet.absoluteFill}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={onGrant}
        onResponderMove={onMove}>
        <Canvas camera={{ fov: FOV, near: 0.05, far: 20 }} style={{ flex: 1 }}>
          <Scene clipId={clipId} orbit={orbit} speed={speed} paused={paused} phase={phase} onPhase={onPhase} zoom={zoom} focus={focus} psx={psx} aura={aura} />
        </Canvas>
      </View>
      {scan && <Scanlines />}
      {controls && (
        <View style={styles.controls} pointerEvents="box-none">
          <Chip label={paused ? 'Play' : 'Pause'} onPress={() => setPaused((p) => !p)} />
          <Chip label={speed === 1 ? '1×' : '½×'} onPress={() => setSpeed((s) => (s === 1 ? 0.5 : 1))} />
          <Chip label="Reset view" onPress={() => (orbit.current = { ...home })} />
        </View>
      )}
      {controls && (
        <Text style={styles.hint} pointerEvents="none">
          Drag to rotate
        </Text>
      )}
    </View>
  );
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={4} style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}>
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: Palette.stage,
    borderRadius: Radius.card,
    overflow: 'hidden',
    aspectRatio: 1,
    borderWidth: 1,
    borderColor: Psx.edge,
  },
  controls: { position: 'absolute', bottom: 10, left: 10, right: 10, flexDirection: 'row', gap: 8 },
  chip: { backgroundColor: 'rgba(48,48,44,0.88)', paddingHorizontal: 12, minHeight: 32, justifyContent: 'center', borderRadius: Radius.pill },
  chipPressed: { backgroundColor: Palette.pressed },
  chipText: { color: Palette.text, fontFamily: DisplayFont.semibold, fontSize: 13 },
  hint: { position: 'absolute', top: 10, right: 12, color: Palette.dim, fontSize: 12 },
});
