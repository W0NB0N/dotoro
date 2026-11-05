import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense, useRef } from 'react';
import * as THREE from 'three';
import { DotoroModel } from './DotoroModel';

const HOME_POSITION = new THREE.Vector3(0, 0.45, 4.75);
const HOME_TARGET = new THREE.Vector3(0, -0.05, 0);

/** When the user lets go after orbiting, ease back to the home view with a faint idle drift. */
function CameraRig({ dragging }: { dragging: React.RefObject<boolean> }) {
  useFrame((state, delta) => {
    if (dragging.current) return;
    state.camera.position.lerp(HOME_POSITION, Math.min(1, 4 * delta));
    const t = state.clock.elapsedTime;
    state.camera.position.x += Math.sin(t * 0.7) * 0.003 + Math.sin(t * 1.35) * 0.0015;
    state.camera.position.y += Math.sin(t * 0.5) * 0.002 + Math.cos(t * 1.15) * 0.001;
    state.camera.lookAt(HOME_TARGET);
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
  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ position: HOME_POSITION.toArray(), fov: 42 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: 'transparent', touchAction: 'none' }}
    >
      <Lighting accent={accent} />
      <Suspense fallback={null}>
        <group position={[0, -0.75, 0]}>
          <DotoroModel />
        </group>
      </Suspense>
      <ContactShadows position={[0, -0.74, 0]} opacity={0.55} scale={5} blur={2.2} far={1.5} />
      <CameraRig dragging={dragging} />
      <OrbitControls
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
