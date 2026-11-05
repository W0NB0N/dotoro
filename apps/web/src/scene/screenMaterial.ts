import type { Kernel } from '@dotoro/kernel';
import * as THREE from 'three';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Each kernel pixel becomes a crisp LED/CRT cell: nearest sampling, a soft gap between cells,
// faint rolling scanlines and a vignette. `uPower` drives the CRT power-on/off line animation.
const fragmentShader = /* glsl */ `
  uniform sampler2D uScreen;
  uniform float uTime;
  uniform float uPower;
  uniform float uBrightness;
  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;
    vec2 cell = uv * 32.0;
    vec2 f = fract(cell);
    vec3 color = texture2D(uScreen, (floor(cell) + 0.5) / 32.0).rgb;

    float edge = 0.09;
    float m = smoothstep(0.0, edge, f.x) * smoothstep(1.0, 1.0 - edge, f.x)
            * smoothstep(0.0, edge, f.y) * smoothstep(1.0, 1.0 - edge, f.y);
    color *= mix(0.62, 1.0, m);

    color *= 0.93 + 0.07 * sin((uv.y * 96.0 - uTime * 1.5) * 6.2831853);

    vec2 d = uv - 0.5;
    color *= 1.0 - dot(d, d) * 0.8;

    // CRT power line: vertical extent grows from a thin line, then fills
    float open = smoothstep(0.0, 0.55, uPower);
    float lineH = mix(0.004, 0.5, smoothstep(0.35, 1.0, uPower));
    float inside = 1.0 - smoothstep(lineH, lineH + 0.01, abs(uv.y - 0.5));
    float flash = (1.0 - smoothstep(0.0, 0.5, abs(uPower - 0.3))) * 0.6 * step(uPower, 0.999);
    color = color * inside * open + vec3(flash) * inside;

    // glossy dark glass when off
    vec3 glass = vec3(0.012, 0.013, 0.016) + vec3(0.03) * smoothstep(0.6, 0.0, length(uv - vec2(0.3, 0.75)));
    gl_FragColor = vec4(max(color * uBrightness, glass * (1.0 - open)), 1.0);
    #include <colorspace_fragment>
  }
`;

/** Shader material + 32x32 texture that mirrors `kernel.screen`. Call `update` every frame. */
export function createScreen(kernel: Kernel) {
  const pixels = new Uint8Array(32 * 32 * 4);
  const texture = new THREE.DataTexture(pixels, 32, 32, THREE.RGBAFormat);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.needsUpdate = true;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uScreen: { value: texture },
      uTime: { value: 0 },
      uPower: { value: 0 },
      uBrightness: { value: 1.6 },
    },
    toneMapped: false,
  });

  let version = -1;
  let power = 0;

  return {
    material,
    texture,
    update(time: number, delta: number) {
      if (kernel.version !== version) {
        version = kernel.version;
        kernel.screen.writeRGBA(pixels);
        texture.needsUpdate = true;
      }
      const target = kernel.powered ? 1 : 0;
      // power on ~0.45s, off ~0.3s
      power = target > power ? Math.min(1, power + delta / 0.45) : Math.max(0, power - delta / 0.3);
      material.uniforms.uPower!.value = power;
      material.uniforms.uTime!.value = time;
    },
    dispose() {
      texture.dispose();
      material.dispose();
    },
  };
}
