/** The asset converter must decode images/GIFs exactly like the prototype's PIL-based loader. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { channelDistance, type Sprite, toHex } from '@dotoro/kernel';
import { bindVfdRoles, DEFAULT_VFD, GALLERY, HEADER_ROLES, SPRITES } from '../src';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/python-parity.json', import.meta.url), 'utf8'));
const assets = fixture.assets as Record<string, unknown>;

function frameHex(sprite: Sprite, frame: number, rows = sprite.height): string {
  const f = sprite.frames[frame]!;
  let s = '';
  for (let i = 0; i < sprite.width * rows; i++) s += toHex(sprite.palette[f.indices[i]!]!).slice(1);
  return s;
}

function maxDistance(a: string, b: string): number {
  let max = 0;
  for (let i = 0; i < a.length; i += 6) {
    max = Math.max(max, channelDistance(parseInt(a.slice(i, i + 6), 16), parseInt(b.slice(i, i + 6), 16)));
  }
  return max;
}

const byName = (name: string) => GALLERY.find((s) => s.name === name)!;

describe('asset parity', () => {
  it('gallery order matches the prototype', () => {
    expect(GALLERY.map((s) => s.name)).toEqual(fixture.galleryOrder);
  });

  const animations: [string, Sprite][] = [
    ['boot', SPRITES.boot],
    ...['Hamburgurrr', 'Miku', 'Pepe', 'Reze'].map((n) => [`gallery:${n}`, byName(n)] as [string, Sprite]),
  ];
  for (const [key, sprite] of animations) {
    it(`${key}: frame count, delays and pixels`, () => {
      const ref = assets[key] as { count: number; delays: number[]; frames: Record<string, string> };
      expect(sprite.frames.length).toBe(ref.count);
      expect(sprite.frames.map((f) => f.delay)).toEqual(ref.delays.map((d) => Math.max(20, d)));
      for (const [i, hex] of Object.entries(ref.frames)) expect(frameHex(sprite, Number(i)), `frame ${i}`).toBe(hex);
    });
  }

  for (const name of ['Sunset', 'Coffee', 'Heart', 'Logo']) {
    it(`image ${name}`, () => {
      expect(frameHex(byName(name), 0)).toBe(assets[`image:${name}`]);
    });
  }

  it('VFD template (quantised within tolerance)', () => {
    expect(maxDistance(frameHex(SPRITES.vfdTemplate, 0), assets.vfdTemplate as string)).toBeLessThanOrEqual(8);
  });

  it('VFD session headers (rows 0-3, as rendered through the header roles)', () => {
    const headers = assets.vfdHeaders as string[];
    SPRITES.vfdHeaders.forEach((sprite, i) => {
      const rendered = { ...sprite, palette: bindVfdRoles(sprite, HEADER_ROLES)(DEFAULT_VFD) };
      expect(maxDistance(frameHex(rendered, 0, 4), headers[i]!), `header ${i}`).toBeLessThanOrEqual(8);
    });
  });
});
