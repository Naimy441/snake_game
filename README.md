# Coil Rush

Classic Snake reimagined as a fast, cinematic 3D browser game. Race a scaly
serpent around a floating checkered island, grab spinning crystal apples,
chase down a golden mouse, string together orb chains and hit boost pads, while the world
transforms around you through four zones, each with its own adaptive
chiptune soundtrack. Play from overhead, from a chase camera behind the head,
or in first person, and switch at any moment: every view plays the same game.

Built with [Three.js](https://threejs.org/) and [Vite](https://vitejs.dev/).
Every model, texture and sound is generated in code at runtime; the only
bundled asset is the Exo 2 font in `src/fonts/` (SIL Open Font License).

## Launch

Requires [Node.js](https://nodejs.org/) 18 or newer and a browser with WebGL 2.

```bash
npm install
npm run dev
```

Open the address Vite prints (usually http://localhost:5173). After pulling
new changes, run `npm install` again in case dependencies changed. A loading
screen shows while the world is built; if something fails to load, it says so
there instead of leaving a blank page. The dev server
also listens on your local network, so you can open the "Network" address on a
phone or tablet on the same Wi-Fi.

To make a static build (any web server can host the `dist/` folder):

```bash
npm run build
npm run preview   # serves dist/ at http://localhost:4173
```

## How to play

Eat spinning crystal **apples** to grow and score. Don't hit the walls, the pillars or
your own body.

| Action | Overhead view | Chase and first-person views |
| --- | --- | --- |
| Steer | Arrow keys / WASD move in that screen direction | Left/Right or A/D turn left/right |
| Steer (any view) | Q / E turn left / right relative to the snake | same |
| Rush (hold) | Space or Shift | same |
| Cycle camera | C (overhead → chase → first-person) | C |
| Pause / resume | P or Esc | same |
| Restart | R | same |
| Mute | M | same |
| Ghost guide on / off | G | same |

**Touch:** swipe to steer in the overhead view; in the chase and first-person
views, tap or swipe left/right (or use the on-screen turn buttons). Hold the
RUSH button to boost.

**Gamepad:** D-pad or left stick steers, A (or triggers) rushes, Y cycles the
camera, Start pauses, bumpers turn left/right.

### Pickups and hazards

- **Crystal apple:** 10 points, grows the snake by 1, adds 25% Rush.
- **Prism:** appears now and then, worth 50 points, grows by 2 and fills Rush.
  It disappears after 9 seconds (it blinks near the end).
- **Orb chain:** 3 to 5 numbered orbs. Eat them in order for rising points,
  a big completion bonus and a full Rush meter. Eating one out of order breaks
  the chain, and chains fade if you take too long. Chain orbs don't make you
  longer.
- **Golden mouse:** shows up every so often and runs away from you, hopping
  cell to cell. Corner it for 100 points (times your combo); it escapes after
  14 seconds.
- **Boost pad:** from zone 2 on. Driving over one gives a free burst of speed
  and double points, then it reappears somewhere else.
- **Pillars:** from Golden Canyon on, some level-ups raise pillars on the board. A pulsing red ring
  marks each spot for a couple of seconds first. Pillars never rise under the
  snake and never wall off part of the board.

### Scoring, levels and zones

- **Combo:** eat again within 5 seconds to raise the multiplier, up to x8.
- **Rush:** hold Space to move 1.7x faster and score double while the meter lasts.
- **Speed levels:** eating apples raises your speed level. The difficulty
  eases in: Emerald Coast levels take 3 apples each, start slow (about 6
  moves a second) and have no pillars, so 9 apples reach Golden Canyon. Later
  levels take 4, then 5 apples and keep speeding up to the top speed. The HUD
  shows how many apples are left until the next level and which level brings
  the next zone.
- **Zones:** every 3 speed levels the world transforms. A glowing wave sweeps
  out from the arena, the old scenery shrinks away, new scenery grows in, and
  the sky, light, water, board and music all change: Emerald Coast, Golden
  Canyon, Neon Night, then Cyber Overdrive. The visuals get more intense with
  each level inside a zone too.
- At game over you get a rank from D to S.

### Controls that feel instant

The snake moves on a grid, and the drawn snake trails the game's logic a
little so it can glide smoothly. A few things keep that from feeling laggy:

- **Late-turn grace:** a turn pressed just after the snake committed to its
  next cell would normally only happen one cell later. If that last move was
  a plain straight step, the game quietly redoes it in the new direction, so
  turns land where you see the head.
- **Turn buffering:** up to three turns can be queued, one per move, so a
  quick double tap gives a tight U-turn and a third tap the next turn after it.
- **Cameras lead the turn:** the chase and first-person cameras start turning
  toward your next move as soon as you press, instead of waiting for the head.
- **Humane top speed:** speed is capped (about 14 cells/s, 21 with Rush or a
  boost pad) so double taps stay physically possible at full speed.
- **Countdown:** keys pressed during READY/GO keep only your latest turn, so
  mashing can't stack up moves for the start.

### Ghost guide

Turn on the **ghost guide** (G, the button on the main menu, or Settings)
to race a perfect bot. A translucent ghost snake plays the same board
alongside you: it takes the shortest safe route to each pickup, grabbing
chain orbs in order and prisms before they vanish, then the apple. It steers
around pillars (even ones still in their warning phase), never traps itself
on its own tail, ignores the golden mouse and fires its Rush only when the
meter carries it all the way to the next pickup, so it scores double. Once
it has collected everything on the board it waits in place until you eat
the apple, so it is never more than one apple ahead. It is a ghost: it never
takes your pickups or blocks you, and keeps its own length, Rush meter and
score (shown under yours in the HUD and as faint dots on the minimap).
Turning it on mid-run starts it from your snake's current position.

### Garage

Open the **Garage** from the main menu (or after a run) to customise your
snake. The camera swings in close for a live preview.

- **16 skins:** Viper, Coral, Python, Emerald Boa, Tiger, Candy Cane, Glacier,
  plus unlockables: Neon Runner and Circuit (glowing light lines), Magma
  (molten cracks that pulse), Golden King, Chrome (mirror metal), Galaxy
  (twinkling stars), Prism (an animated rainbow), Dragon and Phantom.
- **9 accessories:** shades, top hat, party hat, horns, bow, flower, plus an
  unlockable crown and halo.
- Locked items show what unlocks them, with your progress (for example
  "Catch 3 golden mice (1 / 3)"). Unlocks come from your best score and
  lifetime totals: runs played, apples eaten, mice caught, chains completed
  and the furthest zone reached. New unlocks are announced on the results
  screen. You can preview a locked item, but it only equips once unlocked.

### Music

The soundtrack is an adaptive chiptune engine (Web Audio, no files). Each zone
has its own song with a verse and a chorus. Instrument layers (bass, arpeggio,
drums, lead, chord stabs, a counter-melody and a Rush sparkle) fade in and out
smoothly as the action heats up, the drums step through three grooves, and
section and zone changes land on bar lines after a drum fill, so the music
flows instead of cutting. Pausing muffles it rather than stopping it.

### Chase and first-person aids

Glowing chevrons on the floor show the cells straight ahead (they turn red
just before an obstacle), the compass points to the nearest apple (plus the
prism and mouse) with its distance in cells, a heading-up minimap shows the
whole board, the screen edge glows red when the next move would be fatal, and
each wall's rim glows red as you approach it. The guide, minimap and compass
can be turned off in Settings.

## Settings

- **Graphics quality:** Auto (default), High, Medium, Low. See Performance.
- **Reduce motion:** removes speed lines, motion blur, camera shake, camera
  roll and FOV kicks, softens animations and shortens camera transitions. It
  is on by default if your system asks for reduced motion.
- Path guide, minimap and compass, FPS counter, sound effect and music volume.

Settings, your snake's look, lifetime stats and your best score are saved in
the browser.

## Performance

The renderer is built to stay smooth on laptops with high-DPI screens:

- **Resolution:** the canvas pixel ratio is capped (1.5x on High) instead of
  rendering at the full Retina 2x, and the 3D scene is rendered at a dynamic
  scale (60 to 100%) that drops automatically if frames take too long and
  creeps back up when there is headroom. Auto quality also steps down a tier
  if even the lowest scale is too slow.
- **Post-processing:** one fused pass (bloom, tone mapping, colour grade,
  vignette, speed blur and speed lines) with a cheap dual-filter bloom
  instead of a multi-pass bloom chain.
- **No stalls on zone changes:** the light count never changes (food glows
  are fake floor glows, not lights), and at startup, behind the loading
  screen, every shader is compiled and one full frame is drawn with every
  zone, pickup and pillar visible, so all meshes and textures are already on
  the GPU when a zone first appears.
- **Hitch-free resolution scaling:** the scene's render target is allocated
  once at full size and drawn into a smaller viewport when scaled, so the
  dynamic resolution can step down during a heavy moment (like a zone
  transition) and back up afterwards without reallocating anything. Auto
  quality never changes tier during or just after a transition.
- **Cheap materials and draw calls:** standard PBR materials with an
  environment map instead of clearcoat; each zone's scenery is merged into a
  few meshes; clouds, particles and birds are single instanced draws animated
  on the GPU.
- **HUD:** no `backdrop-filter` blur over the live canvas, and bars animate
  with transforms so the page never re-lays out per frame.

Turn on "Show FPS" in Settings to see the frame rate, quality tier, render
scale and draw calls.

## Development

```bash
npm test           # game-rule unit tests (node:test)
npm run build
npm run test:e2e   # plays the built game in headless Chromium, saves screenshots to test-results/
npm run bench      # rough frame-time benchmark of the built game (emulated Retina, High quality)
```

`npm run test:e2e` and `npm run bench` use `playwright-core` and need a
Chromium binary: set `CHROMIUM_PATH` to one if Playwright's default isn't
installed. Headless Chromium renders on the CPU, so the benchmark's absolute
numbers aren't real frame rates; it's for before/after comparisons. 

### Project layout

```
src/
  game/SnakeGame.js      pure game state and rules: obstacles, chains, prey, pads, zones
  game/GhostBot.js       the ghost guide: a perfect-play bot (safe pathfinding, Rush timing)
  render/World.js        orchestrates sky, sea, island, zone scenery, lighting and zone transitions
  render/zones.js        the four zones' palettes and post-processing looks
  render/Scenery.js      procedural props for each zone, revealed by a growing wave
  render/Island.js       the floating island, the board, bumpers and posts
  render/Sky.js          sky dome (sun, stars, cyber grid) and instanced clouds
  render/Water.js        ocean shader and waterfalls
  render/Ambient.js      GPU-animated ambient particles and birds
  render/Post.js         fused post-processing pipeline with dynamic render scale
  render/materials.js    reveal, checker and board shaders on standard materials
  render/geo.js          noise and geometry helpers, prop merging
  render/SnakeView.js    the animated snake (dynamic tube mesh, modelled head, skins, boost aura)
  render/accessories.js  hats, horns, shades and other head accessories
  skins.js               skin patterns, accessories and their unlock rules
  render/SnakePath.js    smooth path through grid cells with rounded corners
  render/FoodView.js     crystal apples, prisms, orb chains and the golden mouse
  render/BoardObjects.js pillars with warnings, and boost pads
  render/Effects.js      particles, shockwaves, path guide
  render/CameraRig.js    orbit / garage / overhead / chase / first-person cameras and blending
  render/textures.js     procedural textures
  audio/Audio.js         synthesized sound effects and the adaptive music engine
  Input.js               keyboard, touch and gamepad
  main.js                app shell, game loop, HUD and menus
```

The game runs on a fixed grid tick; the renderer interpolates between ticks
so the snake glides and bends smoothly through corners while collisions stay
exact.

## Known limitations

- Visuals and performance were checked in headless software rendering, not
  on a real GPU or a Mac. The dynamic resolution should keep frame rates
  smooth, but if it still stutters, pick Medium or Low quality.
- No online leaderboard; the best score and unlocks are per browser.
- Touch controls were checked in an emulated phone viewport, not on a physical
  device.

## License

MIT. See [LICENSE](LICENSE). The bundled Exo 2 font is licensed under the SIL
Open Font License 1.1 (see `src/fonts/OFL-Exo2.txt`).
