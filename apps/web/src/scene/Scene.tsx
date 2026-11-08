import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { type ComponentRef, type RefObject, Suspense, useRef } from 'react';
import * as THREE from 'three';
import { Backdrop, type BackdropHandle } from './Backdrop';
import { DotoroModel, type ScreenPose } from './DotoroModel';

const HOME_POSITION = new THREE.Vector3(0, 0.45, 4.75);
const HOME_TARGET = new THREE.Vector3(0, -0.05, 0);

/** The screen's share of the view when zoomed. */
const ZOOM_FIT = 0.8;

/** Dotoro on the desk: a little smaller than life-size in frame, and set back from the front edge. */
const DOTORO_SCALE = 0.84;
const DOTORO_POSITION = [0, -0.75, -0.2] as const;

/**
 * How far the view can be dragged. The painted room only turns so far, so the camera stops where
 * the diorama's parallax runs out.
 */
const MAX_AZIMUTH = 0.12;
const MAX_RISE = 0.07;
const MAX_DIP = 0.03;

/** How far the pointer leans the camera, so moving the mouse looks around the room. */
const LEAN_X = 0.34;
const LEAN_Y = 0.16;

/**
 * The diorama's parallax at infinite depth, in art pixels, at the drag limits. Dotoro turns only a
 * little; the city behind turns a lot, which is what sells the depth.
 */
const PARALLAX_X = 46;
const PARALLAX_Y = 16;
/**
 * How far behind Dotoro the city sits, in scene units. The backdrop grows as a dolly would make
 * something that far away grow: a little, not as much as the device itself.
 */
const BACKDROP_DEPTH = 9;

const HOME_ELEVATION = Math.atan2(
  HOME_POSITION.y - HOME_TARGET.y,
  Math.hypot(HOME_POSITION.x - HOME_TARGET.x, HOME_POSITION.z - HOME_TARGET.z),
);

const HOME_POLAR = Math.PI / 2 - HOME_ELEVATION;
const HOME_DISTANCE = HOME_POSITION.distanceTo(HOME_TARGET);

const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

const goalPosition = new THREE.Vector3();
const goalTarget = new THREE.Vector3();

interface RigProps {
  dragging: React.RefObject<boolean>;
  zoomed: React.RefObject<boolean>;
  screenPose: React.RefObject<ScreenPose | null>;
  controls: React.RefObject<ComponentRef<typeof OrbitControls> | null>;
}

/**
 * Eases to the home view, or square-on to the screen when zoomed, whenever the user isn't orbiting.
 * When nothing moves the pointer, the camera holds perfectly still.
 */
function CameraRig({ dragging, zoomed, screenPose, controls }: RigProps) {
  const target = useRef(HOME_TARGET.clone());

  useFrame((state, delta) => {
    if (dragging.current) return;
    const camera = state.camera as THREE.PerspectiveCamera;
    const pose = zoomed.current ? screenPose.current : null;
    if (pose) {
      const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const fillHeight = pose.v.length() / tan;
      const fillWidth = pose.u.length() / (tan * camera.aspect);
      goalTarget.copy(pose.center);
      goalPosition.copy(pose.center).addScaledVector(pose.normal, Math.max(fillHeight, fillWidth) / ZOOM_FIT);
    } else {
      goalTarget.copy(HOME_TARGET);
      goalPosition.copy(HOME_POSITION);
      if (!REDUCED_MOTION) {
        goalPosition.x += state.pointer.x * LEAN_X;
        goalPosition.y += state.pointer.y * LEAN_Y;
      }
    }

    const ease = Math.min(1, 4 * delta);
    camera.position.lerp(goalPosition, ease);
    target.current.lerp(goalTarget, ease);
    controls.current?.target.copy(target.current);

    camera.lookAt(target.current);
  });
  return null;
}

const homeCamera = new THREE.PerspectiveCamera();
const projected = new THREE.Vector3();

interface LinkProps {
  backdrop: RefObject<BackdropHandle | null>;
  controls: RigProps['controls'];
  screenPose: RigProps['screenPose'];
}

/**
 * Feeds the camera to the backdrop: its angle around what it is looking at becomes parallax, and
 * its push toward Dotoro's screen becomes a zoom into the city behind, centered where the screen was.
 */
function BackdropLink({ backdrop, controls, screenPose }: LinkProps) {
  // Infinity, not NaN: any comparison with NaN is false, which would never let the first value through.
  const sent = useRef({ x: Infinity, y: Infinity, zoom: Infinity, ox: Infinity, oy: Infinity, progress: Infinity });
  useFrame(({ camera }) => {
    const target = controls.current?.target ?? HOME_TARGET;
    const { x, y, z } = camera.position;
    const dx = x - target.x;
    const dz = z - target.z;
    const azimuth = Math.atan2(dx, dz);
    const elevation = Math.atan2(y - target.y, Math.hypot(dx, dz)) - HOME_ELEVATION;
    const px = (PARALLAX_X * azimuth) / MAX_AZIMUTH;
    const py = (-PARALLAX_Y * elevation) / MAX_RISE;

    const pose = screenPose.current;
    const distance = camera.position.distanceTo(target);
    const zoom = Math.max(1, (BACKDROP_DEPTH + HOME_DISTANCE) / (BACKDROP_DEPTH + distance));
    let ox = 0.5;
    let oy = 0.5;
    let progress = 0;
    if (pose) {
      const perspective = camera as THREE.PerspectiveCamera;
      homeCamera.fov = perspective.fov;
      homeCamera.aspect = perspective.aspect;
      homeCamera.position.copy(HOME_POSITION);
      homeCamera.lookAt(HOME_TARGET);
      homeCamera.updateProjectionMatrix();
      homeCamera.updateMatrixWorld();
      projected.copy(pose.center).project(homeCamera);
      ox = (projected.x + 1) / 2;
      oy = (1 - projected.y) / 2;
      progress = THREE.MathUtils.clamp(target.distanceTo(HOME_TARGET) / pose.center.distanceTo(HOME_TARGET), 0, 1);
    }

    const last = sent.current;
    if (Math.abs(px - last.x) >= 0.1 || Math.abs(py - last.y) >= 0.1) {
      last.x = px;
      last.y = py;
      backdrop.current?.setCamera(px, py);
    }
    if (Math.abs(zoom - last.zoom) > 0.0005 || Math.abs(progress - last.progress) > 0.001 || ox !== last.ox || oy !== last.oy) {
      Object.assign(last, { zoom, ox, oy, progress });
      backdrop.current?.setZoom(zoom, ox, oy, progress);
    }
  });
  return null;
}

/**
 * The room's light on Dotoro: dim, cool from above, with the city's neon spilling in from behind
 * (pink on the left, cyan on the right) and the desk lamp warming its left flank.
 */
function Lighting({ accent }: { accent: string }) {
  return (
    <>
      <ambientLight intensity={0.22} color="#9aa0c8" />
      <directionalLight
        position={[1.5, 5, 4]}
        intensity={0.95}
        color="#b8c4e8"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0001}
      />
      <pointLight position={[-3.2, 1.6, -2.2]} intensity={46} color="#ff3fa8" distance={12} />
      <pointLight position={[3.2, 1.2, -2.4]} intensity={46} color="#2fe0f0" distance={12} />
      <pointLight position={[-2.8, -0.2, 1.1]} intensity={7} color="#ffa040" distance={6} />
      <directionalLight position={[-4, 2, -3]} intensity={0.15} color={accent} />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={0.5} color="#b8c4e8" position={[0, 4, 3]} scale={[6, 2, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#ff3fa8" position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[4, 2, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#2fe0f0" position={[5, 0.5, -2]} rotation-y={-Math.PI / 2} scale={[4, 2, 1]} />
        <Lightformer form="rect" intensity={0.5} color="#ffa040" position={[-3, -0.5, 3]} scale={[2, 1, 1]} />
      </Environment>
    </>
  );
}

export function Scene({ accent }: { accent: string }) {
  const dragging = useRef(false);
  const zoomed = useRef(false);
  const screenPose = useRef<ScreenPose | null>(null);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const backdrop = useRef<BackdropHandle>(null);
  return (
    <>
      <Backdrop handle={backdrop} />
      <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ position: HOME_POSITION.toArray(), fov: 42 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: 'transparent', touchAction: 'none' }}
      onPointerMissed={(e) => {
        if (e.type === 'dblclick') zoomed.current = false;
      }}
    >
      <Lighting accent={accent} />
      <Suspense fallback={null}>
        <group position={DOTORO_POSITION} scale={DOTORO_SCALE}>
          <DotoroModel screenPose={screenPose} onScreenDoubleClick={() => (zoomed.current = !zoomed.current)} />
        </group>
      </Suspense>
      <ContactShadows position={[0, -0.74, DOTORO_POSITION[2]]} opacity={0.85} scale={5} blur={1.6} far={1.5} />
      <CameraRig dragging={dragging} zoomed={zoomed} screenPose={screenPose} controls={controls} />
      <BackdropLink backdrop={backdrop} controls={controls} screenPose={screenPose} />
      <OrbitControls
        ref={controls}
        target={HOME_TARGET.toArray()}
        enableZoom={false}
        enablePan={false}
        maxPolarAngle={HOME_POLAR + MAX_DIP}
        minPolarAngle={HOME_POLAR - MAX_RISE}
        maxAzimuthAngle={MAX_AZIMUTH}
        minAzimuthAngle={-MAX_AZIMUTH}
        enableDamping
        dampingFactor={0.05}
        onStart={() => (dragging.current = true)}
        onEnd={() => (dragging.current = false)}
      />
      </Canvas>
    </>
  );
}
