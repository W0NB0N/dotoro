"""Parity harness for the Python prototype -> TypeScript port.

Runs the prototype's real kernel + apps (dotoro-proto/backend) under a fake clock,
replays a scripted timeline of key presses, and records reference frames. The TS
test suite (packages/apps/test/parity.test.ts) replays the same timeline against
the new kernel and compares frames.

Subcommands:
  images    export core/images.py IMAGES as PNGs into assets-src/gallery/ (one-time port)
  fixtures  write packages/apps/test/fixtures/python-parity.json

Usage (from repo root):
  <proto>/backend/.venv/Scripts/python.exe -I tools/parity/dump_python.py <proto>/backend images
  <proto>/backend/.venv/Scripts/python.exe -I tools/parity/dump_python.py <proto>/backend fixtures
"""
import json
import os
import random
import sys
import time

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PROTO = os.path.abspath(sys.argv[1])
COMMAND = sys.argv[2]
sys.path.insert(0, PROTO)
os.chdir(PROTO)  # the prototype resolves anims/ relative to itself or cwd

EPOCH = 1_700_000_000.0


class FakeClock:
    def __init__(self):
        self.t = EPOCH

    def __call__(self):
        return self.t


clock = FakeClock()
time.time = clock  # every prototype module calls time.time() at call time

from PIL import Image  # noqa: E402

from core.images import IMAGES  # noqa: E402

GALLERY_IMAGE_FILES = {"Sunset": "sunset", "Coffee": "coffee", "Heart": "heart", "Logo": "logo"}


def export_images():
    out_dir = os.path.join(REPO, "assets-src", "gallery")
    for name, grid in IMAGES.items():
        h, w = len(grid), len(grid[0])
        img = Image.new("RGBA", (w, h))
        for y in range(h):
            for x in range(w):
                c = grid[y][x]
                img.putpixel((x, y), (0, 0, 0, 0) if c is None else tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) + (255,))
        path = os.path.join(out_dir, f"{GALLERY_IMAGE_FILES[name]}.png")
        img.save(path)
        print(f"wrote {path}")


def flat(grid):
    return "".join((c or "#000000")[1:].lower() for row in grid for c in row)


def write_fixtures():
    from core.animLoader import AnimationManager, load_gif_frames
    from core.gridSystem import GridManager
    from core.osKernel import OSKernel
    from apps.boot import BootApp
    from apps.gallery import GalleryApp
    from apps.menu import MenuApp
    from apps.pomodoro import PomodoroApp, SESSION_HEADERS
    from apps.snake import SnakeApp
    from apps.themeApp import ThemeApp

    fixtures = {"epochMs": EPOCH * 1000, "assets": {}, "timeline": []}

    # ---- asset parity ----
    def sample(frames, every):
        idx = sorted(set(list(range(0, len(frames), every)) + [len(frames) - 1]))
        return {"count": len(frames), "delays": [f["delay_ms"] for f in frames],
                "frames": {str(i): flat(frames[i]["pixels"]) for i in idx}}

    fixtures["assets"]["boot"] = sample(load_gif_frames(os.path.join("anims", "dotoro-boot.gif")), 3)
    for name in ("Hamburgurrr", "Miku", "Pepe", "Reze"):
        fixtures["assets"][f"gallery:{name}"] = sample(load_gif_frames(os.path.join("anims", f"{name}.gif")), 4)
    for name, grid in IMAGES.items():
        fixtures["assets"][f"image:{name}"] = flat(grid)
    fixtures["assets"]["vfdTemplate"] = flat(PomodoroApp.getTemplate())
    fixtures["assets"]["vfdHeaders"] = [flat(h) for h in SESSION_HEADERS]

    # ---- app timeline parity ----
    random.seed(7)
    grid = GridManager()
    kernel = OSKernel(grid)
    kernel.registerApp("Boot", BootApp(kernel))
    kernel.registerApp("Menu", MenuApp(kernel))
    kernel.registerApp("Pomodoro", PomodoroApp(kernel))
    kernel.registerApp("Snake", SnakeApp(kernel))
    kernel.registerApp("Themes", ThemeApp(kernel))
    kernel.registerApp("Gallery", GalleryApp(kernel, anim_manager=AnimationManager()))
    gallery_names = [item["name"] for item in kernel.apps["Gallery"].items]
    fixtures["galleryOrder"] = gallery_names

    step = 0.002

    def advance_to(t):
        target = EPOCH + t
        while clock.t + step <= target:
            clock.t += step
            kernel.update()
            app = kernel.activeApp
            # emulate main.py: the WS loop acknowledges boot completion
            if app and app.appName == "Boot" and app.bootComplete and not app.hasSignaledComplete:
                app.hasSignaledComplete = True
        clock.t = target
        kernel.update()

    def key(t, k):
        advance_to(t)
        kernel.handleInput(k)
        fixtures["timeline"].append({"op": "key", "t": t, "key": k})

    def snap(t, name):
        advance_to(t)
        grid.clearGrid(kernel.themeManager.get().background)
        kernel.activeApp.render(grid)
        fixtures["timeline"].append({"op": "snap", "t": t, "name": name, "app": kernel.activeApp.appName,
                                     "frame": flat(grid.getGrid())})

    # Boot
    key(0.0, "Boot")
    snap(0.055, "boot.frame0")
    snap(1.155, "boot.frame10")
    snap(3.355, "boot.frame30")

    # Menu (boot finishes at ~5.72s)
    snap(7.25, "menu.pomodoro")
    key(7.5, "Right")
    snap(7.75, "menu.snake")
    key(8.0, "Right")
    snap(8.25, "menu.theme")
    key(8.5, "Right")
    snap(8.75, "menu.gallery")
    key(9.0, "Left")
    key(9.1, "Left")
    key(9.2, "Left")

    # Pomodoro
    key(10.0, "Enter")
    snap(10.75, "pomo.stopped.blinkOff")
    snap(11.25, "pomo.stopped.blinkOn")
    key(11.5, "Up")
    key(11.6, "Up")
    key(11.7, "Right")
    key(11.8, "Up")
    snap(12.25, "pomo.edited.27m15s")
    snap(12.75, "pomo.edited.blinkOff")
    key(20.10, "Enter")  # RUNNING 27:15
    snap(23.25, "pomo.running.blinkOn")
    snap(23.75, "pomo.running.blinkOff")
    key(24.40, "Enter")  # PAUSED at 27:11
    snap(24.75, "pomo.paused.blinkOff")
    snap(25.25, "pomo.paused.blinkOn")
    key(25.40, "Left")
    for i in range(27):
        key(25.41 + i * 0.001, "Down")
    key(25.45, "Right")
    key(25.46, "Down")
    key(25.47, "Up")  # 00:15
    key(26.00, "Enter")
    snap(30.25, "pomo.running.short")
    snap(43.25, "pomo.alarm.blinkOn")
    snap(43.75, "pomo.alarm.blinkOff")
    key(44.10, "Enter")
    snap(44.25, "pomo.rest.stopped")

    # Snake
    key(44.5, "Menu")
    key(45.0, "Right")
    key(45.1, "Enter")
    snap(46.25, "snake.start")
    key(46.5, "Enter")
    snap(46.75, "snake.alive.early")
    snap(52.25, "snake.gameover")
    snake = kernel.apps["Snake"]
    assert snake.state == "GAMEOVER" and snake.lastScore == 0, "pick another random seed"

    # Themes
    key(52.5, "Menu")
    key(52.6, "Right")  # Theme
    key(53.0, "Enter")
    snap(53.75, "themes.catppuccin")
    for i, name in enumerate(["ocean", "minimal", "retrowave", "forest", "cyberpunk"]):
        key(54.0 + i, "Left")
        snap(54.25 + i, f"themes.{name}")
    key(59.5, "Enter")  # apply cyberpunk -> Menu (index 2)
    key(60.0, "Left")
    key(60.1, "Left")
    snap(60.75, "menu.pomodoro.cyberpunk")

    # Gallery
    key(61.0, "Right")
    key(61.1, "Right")
    key(61.2, "Right")
    key(61.5, "Enter")
    snap(62.25, "gallery.0")
    for i in range(1, 6):
        key(62.5 + i, "Right")
        snap(62.53 + i, f"gallery.{i}")

    out = os.path.join(REPO, "packages", "apps", "test", "fixtures", "python-parity.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(fixtures, f, separators=(",", ":"))
    print(f"wrote {out} ({os.path.getsize(out) // 1024} KB, {len(fixtures['timeline'])} ops)")
    print("gallery order:", gallery_names)


if COMMAND == "images":
    export_images()
elif COMMAND == "fixtures":
    write_fixtures()
else:
    raise SystemExit(f"unknown command {COMMAND}")
