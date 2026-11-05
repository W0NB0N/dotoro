import { type AppDefinition, DIRECTIONS, FONT_3X5, hex, isDirection, measureText } from '@dotoro/kernel';

// Snake keeps its own "cartridge" palette (pea-soup LCD) regardless of theme.
const BG = hex('#9dbf4e');
const FG = hex('#322f3b');

// Playfield inside a 30x26 border (x 1..30, y 5..30); score sits above it in rows 0..4.
const MIN_X = 2;
const MAX_X = 29;
const MIN_Y = 6;
const MAX_Y = 29;

/** 10-cell loop the 9-long title-screen snake chases around. */
const LOOP_PATH: readonly (readonly [number, number])[] = [
  [14, 13], [15, 13], [16, 13], [17, 13],
  [17, 14],
  [17, 15], [16, 15], [15, 15], [14, 15],
  [14, 14],
];

const LOOP_STEP_MS = 120;
/** Ignore input briefly after dying so a held direction doesn't restart instantly. */
const RESTART_LOCKOUT_MS = 350;

type Cell = readonly [number, number];
type Vec = readonly [number, number];
const key = ([x, y]: Cell) => y * 32 + x;

export const snakeApp: AppDefinition = {
  id: 'snake',
  title: 'Snake',
  showInMenu: true,
  create(ctx) {
    let state: 'start' | 'alive' | 'over' = 'start';
    let stateSince = ctx.now();
    let highScore = ctx.store.get<number>('highScore') ?? 0;

    let snake: Cell[] = [];
    let direction: Vec = DIRECTIONS.up;
    let queue: Vec[] = [];
    let apples: Cell[] = [];
    let score = 0;
    let aliveMs = 0;
    let moveTimer = 0;

    const targetApples = () => (score < 5 ? 4 : score < 12 ? 3 : score < 25 ? 2 : 1);

    const freeCell = (): Cell | undefined => {
      const occupied = new Set([...snake, ...apples].map(key));
      const free: Cell[] = [];
      for (let x = MIN_X; x <= MAX_X; x++)
        for (let y = MIN_Y; y <= MAX_Y; y++) if (!occupied.has(y * 32 + x)) free.push([x, y]);
      return ctx.rng.pick(free);
    };

    const spawnApples = (count: number) => {
      const target = targetApples();
      const needed = Math.min(count, Math.max(1, target - apples.length));
      for (let i = 0; i < needed && apples.length < target; i++) {
        const cell = freeCell();
        if (cell) apples.push(cell);
      }
    };

    const startGame = () => {
      snake = [[15, 16], [15, 17], [15, 18]];
      direction = DIRECTIONS.up;
      queue = [];
      apples = [];
      score = 0;
      aliveMs = 0;
      moveTimer = 0;
      spawnApples(targetApples());
      state = 'alive';
      stateSince = ctx.now();
    };

    const die = () => {
      state = 'over';
      stateSince = ctx.now();
      if (score > highScore) {
        highScore = score;
        ctx.store.set('highScore', highScore);
      }
      ctx.audio.play('die');
    };

    const move = () => {
      const next = queue.shift();
      if (next) direction = next;
      const head = snake[0]!;
      const newHead: Cell = [head[0] + direction[0], head[1] + direction[1]];
      const hitsBody = snake.slice(0, -1).some((c) => c[0] === newHead[0] && c[1] === newHead[1]);
      if (newHead[0] < MIN_X || newHead[0] > MAX_X || newHead[1] < MIN_Y || newHead[1] > MAX_Y || hitsBody) {
        die();
        return;
      }
      snake.unshift(newHead);
      const eaten = apples.findIndex((a) => a[0] === newHead[0] && a[1] === newHead[1]);
      if (eaten >= 0) {
        apples.splice(eaten, 1);
        score++;
        ctx.audio.play('eat');
        spawnApples(score < 8 ? 2 : 1);
      } else {
        snake.pop();
      }
    };

    return {
      update(dt) {
        if (state !== 'alive') return;
        aliveMs += dt;
        moveTimer += dt;
        // Speeds up with time survived and apples eaten.
        const delay = Math.max(60, 160 - (aliveMs / 1000) * 0.6 - score * 2);
        if (moveTimer >= delay) {
          moveTimer = 0;
          move();
        }
      },

      onInput({ button, kind }) {
        if (kind !== 'press') return;
        if (state !== 'alive') {
          const locked = state === 'over' && ctx.now() - stateSince < RESTART_LOCKOUT_MS;
          if (!locked && (button === 'enter' || isDirection(button))) startGame();
          return;
        }
        if (!isDirection(button)) return;
        const want = DIRECTIONS[button];
        const ref = queue[queue.length - 1] ?? direction;
        const reverse = want[0] === -ref[0] && want[1] === -ref[1];
        const same = want[0] === ref[0] && want[1] === ref[1];
        if (!reverse && !same && queue.length < 2) queue.push(want);
      },

      render(g) {
        const now = ctx.now();
        g.clear(BG);
        g.strokeRect(1, 5, 30, 26, FG);

        if (state === 'alive') {
          g.textCentered(String(score), 0, FG, FONT_3X5);
          for (const [x, y] of apples) g.pixel(x, y, FG);
          for (const [x, y] of snake) g.pixel(x, y, FG);
          return;
        }

        g.textCentered(state === 'start' ? 'SNAKE' : 'OVER', 7, FG, FONT_3X5);
        const frame = Math.floor((now - stateSince) / LOOP_STEP_MS);
        for (let i = 0; i < 9; i++) {
          const [x, y] = LOOP_PATH[(((frame - i) % 10) + 10) % 10]!;
          g.pixel(x, y, FG);
        }

        if (state === 'start') {
          g.textCentered(`HI ${highScore}`, 18, FG, FONT_3X5);
        } else {
          g.textCentered(String(score), 0, FG, FONT_3X5);
          const line = `${score} HI ${highScore}`;
          if (measureText(line, FONT_3X5) <= 27) g.textCentered(line, 18, FG, FONT_3X5);
          else {
            const alt = Math.floor(now * 0.0008) % 2 === 0 ? `SC ${score}` : `HI ${highScore}`;
            g.textCentered(alt, 18, FG, FONT_3X5);
          }
        }
        if (Math.floor(now / 500) % 2 === 0) g.textCentered('ENTER', 24, FG, FONT_3X5);
      },
    };
  },
};
