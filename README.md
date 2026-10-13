# Coil Rush

Classic Snake reimagined as a fast, cinematic 3D browser game. Steer a scaly
serpent around a floating island arena, collect glowing orbs, build combos and
hit the Rush boost, in either a classic overhead view or a first-person view
from the snake's head. Switch between them at any moment; both views play the
same game.

Built with [Three.js](https://threejs.org/) and [Vite](https://vitejs.dev/).
Every model, texture and sound is generated in code at runtime, so the project
ships no third-party art or audio.

## Launch

Requires [Node.js](https://nodejs.org/) 18 or newer.

```bash
npm install
npm run dev
```

Open the address Vite prints (usually http://localhost:5173). The dev server
also listens on your local network, so you can open the "Network" address on a
phone or tablet on the same Wi-Fi.

To make a static build (any web server can host the `dist/` folder):

```bash
npm run build
npm run preview   # serves dist/ at http://localhost:4173
```

## How to play

Eat golden **orbs** to grow and score. Don't hit the walls or your own body.

| Action | Overhead view | First-person view |
| --- | --- | --- |
| Steer | Arrow keys / WASD move in that screen direction | Left/Right or A/D turn left/right |
| Steer (either view) | Q / E turn left / right relative to the snake | same |
| Rush (hold) | Space or Shift | same |
| Switch camera | C | C |
| Pause / resume | P or Esc | same |
| Restart | R | same |
| Mute | M | same |

**Touch:** swipe to steer in the overhead view; in first person, tap or swipe
left/right (or use the on-screen turn buttons). Hold the RUSH button to boost.

**Gamepad:** D-pad or left stick steers, A (or triggers) rushes, Y switches
camera, Start pauses, bumpers turn left/right.

### Scoring and mechanics

- **Orb:** 10 points, grows the snake by 1, adds 25% Rush.
- **Prism:** appears now and then, worth 50 points, grows by 2 and fills Rush.
  It disappears after 9 seconds (it blinks near the end).
- **Combo:** eat again within 5 seconds to raise the multiplier, up to x8.
- **Rush:** hold Space to move 1.7x faster and score double while the meter lasts.
- **Speed levels:** every 4 orbs the snake speeds up and the sky shifts from
  morning to golden hour, sunset and finally neon dusk.

### First-person navigation aids

Glowing chevrons on the floor show the cells straight ahead (they turn red
just before an obstacle), the compass at the top points to the nearest orb (and
prism) with its distance in cells, a heading-up minimap shows the whole board,
the screen edge glows red when the next move would be fatal, and each wall's
rim glows red as you approach it. The guide, minimap and compass can be turned
off in Settings.

## Settings

- **Graphics quality:** Auto (default), High, Medium, Low. High adds bloom,
  2048px soft shadows and full resolution on high-DPI screens; Medium drops
  bloom and halves shadow resolution; Low turns off shadows and food lights and
  renders at 1x pixel ratio. Auto starts at High on desktop (Medium on touch
  devices) and steps down if the frame rate stays under 45 FPS.
- **Reduce motion:** removes speed lines, camera shake, camera roll and FOV
  kicks, softens animations and shortens camera transitions. It is on by
  default if your system asks for reduced motion.
- Path guide, minimap and compass, FPS counter, sound effect and music volume.

Settings and your best score are saved in the browser.

## Development

```bash
npm test           # game-rule unit tests (node:test)
npm run build
npm run test:e2e   # plays the built game in headless Chromium, saves screenshots to test-results/
```

`npm run test:e2e` uses `playwright-core` and needs a Chromium binary: set
`CHROMIUM_PATH` to one if Playwright's default isn't installed.

### Project layout

```
src/
  game/SnakeGame.js    pure game state and rules (shared by both cameras)
  render/World.js      sky, lighting, arena, island scenery, water, palettes
  render/SnakeView.js  the animated snake (dynamic tube mesh + modelled head)
  render/SnakePath.js  smooth path through grid cells with rounded corners
  render/FoodView.js   orb and prism pickups
  render/Effects.js    particles, shockwaves, first-person path guide
  render/CameraRig.js  overhead / first-person / menu cameras and blending
  render/textures.js   procedural textures (board, scales, glow, checker)
  audio/Audio.js       synthesized sound effects and music
  Input.js             keyboard, touch and gamepad
  main.js              app shell, game loop, HUD and menus
```

The game runs on a fixed grid tick; the renderer interpolates between ticks
so the snake glides and bends smoothly through corners while collisions stay
exact.

## Known limitations

- Performance was verified only in headless software rendering (no GPU), which
  cannot show real frame rates. The 60 FPS target on a typical laptop is
  untested on real hardware; if it stutters, choose Medium or Low quality.
- No online leaderboard; the best score is per browser.
- The music is a simple synthesized loop.
- Touch controls were checked in an emulated phone viewport, not on a physical
  device.

## License

MIT. See [LICENSE](LICENSE).
