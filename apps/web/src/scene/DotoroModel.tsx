import type { Button } from '@dotoro/kernel';
import { useGLTF } from '@react-three/drei';
import { type ThreeEvent, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { host } from '../host/host';
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

type Nodes = Record<string, THREE.Mesh>;

export function DotoroModel() {
  const { nodes } = useGLTF(MODEL_URL) as unknown as { nodes: Nodes };
  const screen = useMemo(() => createScreen(host.kernel), []);
  const keyRefs = useRef<Partial<Record<string, THREE.Mesh>>>({});
  const offsets = useRef<Record<string, number>>({});
  const flicks = useRef<Record<string, number>>({});

  useEffect(() => () => screen.dispose(), [screen]);

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
    screen.update(state.clock.elapsedTime, delta);
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
          material={body.material}
          position={body.position}
          rotation={body.rotation}
          scale={body.scale}
          castShadow
          receiveShadow
        />
      )}
      {screenNode && (
        <mesh
          geometry={screenNode.geometry}
          material={screen.material}
          position={screenNode.position}
          rotation={screenNode.rotation}
          scale={screenNode.scale}
        />
      )}
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
            material={node.material}
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
