/**
 * Pixel icons, drawn as crisp SVG rects: '#' lit, '.' empty. They take `currentColor`, so the glow
 * and color come from CSS like the text around them. Most are lofi.cafe's 9×9 icons (icons/ in the
 * repo), rasterized; each pixel is drawn `scale` CSS pixels wide so every icon shares one grid.
 */
export function PixelIcon({ rows, scale = 3 }: { rows: readonly string[]; scale?: number }) {
  const w = rows[0]!.length;
  const h = rows.length;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w * scale}
      height={h * scale}
      shapeRendering="crispEdges"
      aria-hidden
      className="pixel-icon"
    >
      {rows.flatMap((row, y) =>
        [...row].map((ch, x) => (ch === '#' ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" /> : null)),
      )}
    </svg>
  );
}

export const ICON = {
  play: ['.........', '...#.....', '...##....', '...###...', '...####..', '...###...', '...##....', '...#.....', '.........'],
  pause: ['.........', '..##.##..', '..##.##..', '..##.##..', '..##.##..', '..##.##..', '..##.##..', '..##.##..', '.........'],
  previous: ['.........', '....#..#.', '...##.##.', '..######.', '.#######.', '..######.', '...##.##.', '....#..#.', '.........'],
  next: ['.........', '..#..#...', '..##.##..', '..######.', '..#######', '..######.', '..##.##..', '..#..#...', '.........'],
  shuffle: ['.........', '......#..', '.##...##.', '..#.###..', '....#....', '..###.#..', '.##...##.', '......#..', '.........'],
  fullscreen: ['.........', '.....###.', '......##.', '.....#.#.', '.........', '.#.#.....', '.##......', '.###.....', '.........'],
  fullscreenExit: ['.........', '.....#.#.', '.....##..', '.....###.', '.........', '.###.....', '..##.....', '.#.#.....', '.........'],
  about: ['.........', '..#...#..', '.###.###.', '.#######.', '.#######.', '..#####..', '...###...', '....#....', '.........'],
  // A speaker with two sound waves.
  soundOn: [
    '...........',
    '....#...#..',
    '...##.#..#.',
    '.####..#..#',
    '.####..#..#',
    '.####..#..#',
    '...##.#..#.',
    '....#...#..',
    '...........',
  ],
  soundOff: [
    '...........',
    '....#......',
    '...##......',
    '.####.#.#..',
    '.####..#...',
    '.####.#.#..',
    '...##......',
    '....#......',
    '...........',
  ],
} as const;
