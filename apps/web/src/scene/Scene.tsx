import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { type ComponentRef, Suspense, useRef } from 'react';
import * as THREE from 'three';
import { DotoroModel, type ScreenPose } from './DotoroModel';

const HOME_POSITION = new THREE.Vector3(0, 0.45, 4.75);
const HOME_TARGET = new THREE.Vector3(0, -0.05, 0);

/** The screen's share of the view when zoomed. */
const ZOOM_FIT = 0.8;
const ZOOM_DRIFT = 0.25;

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
 * A faint idle drift keeps the scene alive.
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
    }

    const ease = Math.min(1, 4 * delta);
    camera.position.lerp(goalPosition, ease);
    target.current.lerp(goalTarget, ease);
    controls.current?.target.copy(target.current);

    const drift = pose ? ZOOM_DRIFT : 1;
    const t = state.clock.elapsedTime;
    camera.position.x += (Math.sin(t * 0.7) * 0.003 + Math.sin(t * 1.35) * 0.0015) * drift;
    camera.position.y += (Math.sin(t * 0.5) * 0.002 + Math.cos(t * 1.15) * 0.001) * drift;
    camera.lookAt(target.current);
  });
  return null;
}

/**
 * Offline-safe studio lighting: an environment built from Lightformers (no HDRI download),
 * a warm key light and a cool rim so the shell reads as plastic instead of muddy olive.
 */
function Lighting({ accent }: { accent: string }) {
  return (
    <>
      <ambientLight intensity={0.25} />
      <directionalLight
        position={[3.5, 5, 4]}
        intensity={1.6}
        color="#fff4e6"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0001}
      />
      <directionalLight position={[-4, 2, -3]} intensity={0.9} color={accent} />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.2} color="#fff1df" position={[0, 4, 3]} scale={[6, 2, 1]} />
        <Lightformer form="rect" intensity={0.9} color="#dfe8ff" position={[-5, 1, 1]} rotation-y={Math.PI / 2} scale={[4, 2, 1]} />
        <Lightformer form="rect" intensity={0.6} color={accent} position={[5, 0.5, -2]} rotation-y={-Math.PI / 2} scale={[4, 2, 1]} />
        <Lightformer form="ring" intensity={0.4} color="#ffffff" position={[0, -3, 2]} scale={2} />
      </Environment>
    </>
  );
}

export function Scene({ accent }: { accent: string }) {
  const dragging = useRef(false);
  const zoomed = useRef(false);
  const screenPose = useRef<ScreenPose | null>(null);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  return (
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
        <group position={[0, -0.75, 0]}>
          <DotoroModel screenPose={screenPose} onScreenDoubleClick={() => (zoomed.current = !zoomed.current)} />
        </group>
      </Suspense>
      <ContactShadows position={[0, -0.74, 0]} opacity={0.55} scale={5} blur={2.2} far={1.5} />
      <CameraRig dragging={dragging} zoomed={zoomed} screenPose={screenPose} controls={controls} />
      <OrbitControls
        ref={controls}
        target={HOME_TARGET.toArray()}
        enableZoom={false}
        enablePan={false}
        maxPolarAngle={Math.PI / 2 - 0.05}
        minPolarAngle={Math.PI / 8}
        maxAzimuthAngle={Math.PI / 2}
        minAzimuthAngle={-Math.PI / 2}
        enableDamping
        dampingFactor={0.05}
        onStart={() => (dragging.current = true)}
        onEnd={() => (dragging.current = false)}
      />
    </Canvas>
  );
}
