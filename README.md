# Dotoro

A tiny 32×32 pixel computer that lives in your browser: a Pomodoro timer, games and toys on a
chunky 3D device. The whole OS runs client-side, so the site is static and works offline.
A small optional backend (later) handles only high scores and multiplayer.

## Layout

```
packages/kernel   Pure TypeScript OS (no DOM): framebuffer, Gfx, fonts, sprites, input,
                  fixed-step kernel, themes, storage + audio interfaces, transitions, seeded RNG
packages/apps     Built-in apps (boot, menu, pomodoro, snake, themes, gallery) + generated assets
apps/web          Vite + React + R3F shell: 3D model, screen shader, input bus, Web Audio, PWA
assets-src/       Source art (GIF/PNG) + manifest.json -> converted by `pnpm assets`
tools/assets      Asset converter (sharp): images/GIFs -> indexed-palette sprite JSON
tools/parity      Python harness that records reference frames from the prototype
```

The kernel never touches the DOM, so the same code runs in the browser, in tests, and (later)
on the server to verify high-score replays.

## Commands

```sh
pnpm install
pnpm dev          # web app at http://localhost:5173
pnpm build        # typecheck + production build (apps/web/dist)
pnpm preview      # serve the production build
pnpm test         # kernel + apps tests, including prototype parity
pnpm typecheck    # all packages
pnpm assets       # regenerate packages/apps/assets/*.json from assets-src/
```

## Writing an app

```ts
import { type AppDefinition, FONT_3X5 } from '@dotoro/kernel';

export const helloApp: AppDefinition = {
  id: 'hello',
  title: 'Hello',
  showInMenu: true,
  create(ctx) {
    let n = ctx.store.get<number>('count') ?? 0;
    return {
      onInput({ button, kind }) {
        if (button === 'enter' && kind === 'press') ctx.store.set('count', ++n);
      },
      render(g) {
        g.textCentered(`HI ${n}`, 13, ctx.theme.screen.accent, FONT_3X5);
      },
    };
  },
};
```

Then add it to `DEFAULT_APPS` in `packages/apps/src/index.ts`.

Rules of the road:
- Draw with theme roles (`ctx.theme.screen.*`), not hard-coded hex. The exception is an app's own
  "cartridge" palette, like Snake's.
- Use `ctx.now()` for wall-clock time and `update(dt)` for game logic. Never call `Date.now()` or
  `Math.random()` (use `ctx.rng`); this keeps games deterministic and replayable.
- Long-running timers derive from timestamps (see Pomodoro), so they keep running while other
  apps are open, in throttled tabs, and across reloads.

## Parity with the prototype

`packages/apps/test/parity.test.ts` replays a timeline recorded from the Python prototype
(`tools/parity/dump_python.py`) and compares every frame pixel by pixel. Intentional changes are
listed in its `DEVIATIONS` table:
- Menu labels are centered.
- Long names scroll instead of being truncated.
- The snake title loop's animation phase starts when the screen opens.

To regenerate the fixtures (needs the prototype's venv):

```sh
../dotoro-proto/backend/.venv/Scripts/python.exe -I tools/parity/dump_python.py ../dotoro-proto/backend fixtures
DOTORO_DUMP=1 pnpm test   # writes Python|TS comparison PNGs to packages/apps/test/__out__/
```

## Deploying (Cloudflare Pages)

Static site, built from the repo root:

| Setting | Value |
| --- | --- |
| Build command | `pnpm build` |
| Build output directory | `apps/web/dist` |
| Root directory | *(repo root, leave empty)* |
| Env vars | `NODE_VERSION=24`, `PNPM_VERSION=11.24.0` |

`apps/web/public/_headers` keeps `sw.js`/`index.html` revalidating and hashed assets immutable.
