import type { Button } from '@dotoro/kernel';
import { useGLTF } from '@react-three/drei';
import { type ThreeEvent, useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { host } from '../host/host';
import { createGlowFloorMaterial, withScreenGlow } from './screenGlow';
import { createScreen } from './screenMaterial';

const MODEL_URL = '/models/dotoro.glb';

/** GLB node name -> Dotoro button. */
const KEYS: Record<string, Button> = {
  'key-up': 'up',
  'key-down': 'down',
  'key-left': 'left',
  'key-right': 'right',
  'key-enter': 'enter',
  'key-menu': 'menu',
  'key-boot': 'power',
};

const PRESS_DEPTH = 0.045;
const SPRING = 22;

const FLOOR_SIZE = 10;

type Nodes = Record<string, THREE.Mesh>;

/** Where the screen is in the world, for the glow and the zoom camera. */
export interface ScreenPose {
  center: THREE.Vector3;
  /** Half-extent vectors along texture u and v. */
  u: THREE.Vector3;
  v: THREE.Vector3;
  normal: THREE.Vector3;
}

/** The curved screen's corners, by uv, as a flat rectangle in world space. */
function measureScreen(mesh: THREE.Mesh): ScreenPose {
  const position = mesh.geometry.attributes.position!;
  const uv = mesh.geometry.attributes.uv!;
  const corner = (cu: number, cv: number) => {
    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < uv.count; i++) {
      const distance = Math.hypot(uv.getX(i) - cu, uv.getY(i) - cv);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    return new THREE.Vector3().fromBufferAttribute(position, best).applyMatrix4(mesh.matrixWorld);
  };
  const [a, b, c, d] = [corner(0, 0), corner(1, 0), corner(0, 1), corner(1, 1)];
  const center = a.clone().add(b).add(c).add(d).multiplyScalar(0.25);
  const u = b.clone().sub(a).add(d).sub(c).multiplyScalar(0.25);
  const v = c.clone().sub(a).add(d).sub(b).multiplyScalar(0.25);
  const normal = u.clone().cross(v).normalize();
  if (normal.z < 0) normal.negate();
  return { center, u, v, normal };
}

interface Props {
  screenPose: React.RefObject<ScreenPose | null>;
  onScreenDoubleClick: () => void;
}

export function DotoroModel({ screenPose, onScreenDoubleClick }: Props) {
  const { nodes } = useGLTF(MODEL_URL) as unknown as { nodes: Nodes };
  const screen = useMemo(() => createScreen(host.kernel), []);
  const keyRefs = useRef<Partial<Record<string, THREE.Mesh>>>({});
  const offsets = useRef<Record<string, number>>({});
  const flicks = useRef<Record<string, number>>({});

  const screenRef = useRef<THREE.Mesh>(null);

  const lit = useMemo(() => {
    const copies = new Map<THREE.Material, THREE.Material>();
    return (source: THREE.Mesh['material']) => {
      const material = source as THREE.Material;
      if (!copies.has(material)) copies.set(material, withScreenGlow(material, screen.glow));
      return copies.get(material)!;
    };
  }, [screen]);
  const floorMaterial = useMemo(() => createGlowFloorMaterial(screen.glow), [screen]);

  useEffect(() => () => screen.dispose(), [screen]);

  useLayoutEffect(() => {
    const mesh = screenRef.current;
    if (!mesh) return;
    mesh.updateWorldMatrix(true, false);
    const pose = measureScreen(mesh);
    screenPose.current = pose;
    screen.glow.uGlowCenter.value.copy(pose.center);
    screen.glow.uGlowU.value.copy(pose.u);
    screen.glow.uGlowV.value.copy(pose.v);
    screen.glow.uGlowNormal.value.copy(pose.normal);
  }, [screen, screenPose]);

  // A pointer released anywhere (e.g. after sliding off a key) lets go of on-screen keys.
  useEffect(() => {
    const up = () => host.input.releaseSource('pointer');
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  // Every press (keyboard, pointer) comes through the bus, so keys animate exactly once.
  useEffect(
    () =>
      host.input.subscribe((button, kind) => {
        if (kind !== 'press') return;
        const name = Object.keys(KEYS).find((k) => KEYS[k] === button);
        if (name) flicks.current[name] = 0.09; // keep a quick tap visible
      }),
    [],
  );

  useFrame((state, delta) => {
    screen.update(delta);
    for (const [name, button] of Object.entries(KEYS)) {
      const mesh = keyRefs.current[name];
      const node = nodes[name];
      if (!mesh || !node) continue;
      flicks.current[name] = Math.max(0, (flicks.current[name] ?? 0) - delta);
      const target = host.input.isHeld(button) || flicks.current[name]! > 0 ? -PRESS_DEPTH : 0;
      const current = offsets.current[name] ?? 0;
      offsets.current[name] = current + (target - current) * Math.min(1, SPRING * delta);
      mesh.position.y = node.position.y + offsets.current[name]!;
    }
  });

  const keyHandlers = (button: Button) => ({
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      host.input.press(button, 'pointer', true);
    },
    onPointerUp: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      host.input.release(button);
    },
    onPointerLeave: () => host.input.release(button),
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      document.body.style.cursor = 'pointer';
    },
    onPointerOut: () => {
      document.body.style.cursor = '';
    },
  });

  const body = nodes.body;
  const screenNode = nodes.screen;

  return (
    <group dispose={null}>
      {body && (
        <mesh
          geometry={body.geometry}
          material={lit(body.material)}
          position={body.position}
          rotation={body.rotation}
          scale={body.scale}
          castShadow
          receiveShadow
        />
      )}
      {screenNode && (
        <mesh
          ref={screenRef}
          geometry={screenNode.geometry}
          material={screen.material}
          position={screenNode.position}
          rotation={screenNode.rotation}
          scale={screenNode.scale}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onScreenDoubleClick();
          }}
        />
      )}
      <mesh
        material={floorMaterial}
        position={[0, 0.02, 1]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={FLOOR_SIZE}
        raycast={() => null}
        renderOrder={1}
      >
        <planeGeometry />
      </mesh>
      {Object.entries(KEYS).map(([name, button]) => {
        const node = nodes[name];
        if (!node) return null;
        return (
          <mesh
            key={name}
            ref={(m) => {
              keyRefs.current[name] = m ?? undefined;
            }}
            geometry={node.geometry}
            material={lit(node.material)}
            position={node.position}
            rotation={node.rotation}
            scale={node.scale}
            castShadow
            {...keyHandlers(button)}
          />
        );
      })}
    </group>
  );
}

useGLTF.preload(MODEL_URL);
