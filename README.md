# Snake Rush

Classic Snake reimagined as a fast, cinematic 3D browser game. Race a scaly
serpent around a floating checkered island, grab spinning crystal apples,
chase down a golden mouse, string together orb chains and hit boost pads, while the world
transforms around you through five zones. In the last zone the snake straps on a jetpack and flies
through a laser-fenced box of sky at sunset, in full 3D. Play from overhead, from a chase camera behind the head,
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
| Climb / dive (Sunset Heavens) | ↑ / ↓ (the other key levels out) | same |
| Pick the starting level (menu) | Left / Right | |

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
  the sky, light, water and board all change: Emerald Coast, Golden
  Canyon, Neon Night, Cyber Overdrive, then Sunset Heavens. The visuals get
  more intense with each level inside a zone too.
- **Slow motion on level-ups:** while the level-up banner or a new zone's
  title card covers the screen, the game drops into slow motion (about a
  quarter speed for a new zone, a short dip for a normal level-up), with
  a softer, desaturated look. It eases back to full speed
  once the card clears, so the card never gets you killed.
- **Level select:** the start menu has a "Start at" picker. Once you have
  reached a level in any run, you can start a new run straight from it (or
  from any lower level) with the ‹ › buttons or Left/Right on the menu. The run
  starts with that level's speed, zone, apples-to-next-level and pillars.
- At game over you get a rank from D to S.

### Sunset Heavens: flying in 3D

Reach level 13 (the end of Cyber Overdrive) and the snake lifts off. A
jetpack ignites on its back, the island sinks away into a sea of clouds under
a huge striped sunset sun, and the board becomes a box of air fenced in by
lasers: 25 x 25 cells wide (two more than the board on every side) and 13
layers tall.

- **Lift-off:** the snake flips nose-up and rockets three layers straight up
  by itself, into the middle of the box, while the camera pulls out to a high,
  near-isometric view and swings a full circle around it. Then it levels out
  the way it was heading, control comes back and the camera glides into your
  usual view. Gameplay runs in slow motion meanwhile. (Reduce motion skips the
  camera spin.) A run started from the level select begins already flying,
  in the middle of the box.

- **Flight controls (every camera):** ← → turn left and right, ↑ climbs and
  ↓ dives. While climbing or diving, the opposite key levels out again in the
  direction you were flying, and ← → turn you back to level flight. Q/E turn
  too. On touch, swipe in any direction or use the ▲ ▼ buttons; on a gamepad
  the D-pad does the same.
- **Cameras:** in the sky the overhead view becomes a high chase camera
  behind the snake (a fixed overhead view can't show height). The chase and
  first-person cameras tilt up a climb and down a dive. The chase cameras stay
  inside the box: near the ceiling or floor they slide back instead of poking
  through it.
- **Seeing the boundaries:** the floor (orange) and ceiling (violet) grids are
  always visible around you, with a ring marking the spot right under and
  right over your head and lines running down to the floor and up to the
  ceiling. Any face of the box turns hot pink-red as you close in on it, and
  marks your position on it. The side walls glow in a band at your altitude
  and the apple's. The altitude gauge on the left (violet ceiling at the top,
  orange floor at the bottom) shows your layer (cyan) and the apple's (red),
  and its end flashes red when you're one layer from the ceiling or floor.
  A red vignette pulses when you're about to fly into a wall. Apples and
  prisms drop a beam to the floor, and the compass says whether the apple is
  above (▲) or below (▼).
- **Hazards:** flying out of the box hits the laser fence; that's the only
  hazard besides your own body. The ground's pillars are left behind at
  lift-off and no new obstacles appear in the sky.
- **Pickups:** apples, prisms and orb chains float at any altitude (chains
  can run up and down). Boost pads become spinning gold boost rings to fly
  through. The golden mouse can't fly, so it stays on the ground.
- **Speed:** flying is a new skill, so the sky starts slower again (about 8
  moves a second) and speeds back up over its four levels.
- The ghost guide flies too, with the same perfect pathfinding in 3D.
- Reaching Sunset Heavens unlocks the **Phoenix** skin in the Garage, and the
  level select lets you start a run straight in the sky once you've been
  there.

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

- **17 skins:** Viper, Coral, Python, Emerald Boa, Tiger, Candy Cane, Glacier,
  plus unlockables: Neon Runner and Circuit (glowing light lines), Magma
  (molten cracks that pulse), Golden King, Chrome (mirror metal), Galaxy
  (twinkling stars), Prism (an animated rainbow), Dragon, Phoenix (sunset
  feathers, from reaching Sunset Heavens) and Phantom.
- **9 accessories:** shades, top hat, party hat, horns, bow, flower, plus an
  unlockable crown and halo.
- Locked items show what unlocks them, with your progress (for example
  "Catch 3 golden mice (1 / 3)"). Unlocks come from your best score and
  lifetime totals: runs played, apples eaten, mice caught, chains completed
  and the furthest zone reached. New unlocks are announced on the results
  screen. You can preview a locked item, but it only equips once unlocked.

### Sound

There is no music, only sound effects, all synthesised with Web Audio at
runtime (no audio files): chimes that climb with the combo, chain and prism
arpeggios, the boost whoosh, level-up and zone fanfares, and a
jetpack-ignition roar at lift-off.

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
- Path guide, minimap and compass, FPS counter, sound effect volume.

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
LEVEL=12 npm run bench   # the same, flying in Sunset Heavens
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
  render/zones.js        the five zones' palettes and post-processing looks
  render/Heavens.js      Sunset Heavens backdrop: the sea of clouds and the striped sunset sun
  render/SkyArena.js     the laser flight box: edges, force-field walls, floor grid, depth cues
  render/Scenery.js      procedural props for each zone, revealed by a growing wave
  render/Island.js       the floating island, the board, bumpers and posts
  render/Sky.js          sky dome (sun, stars, cyber grid) and instanced clouds
  render/Water.js        ocean shader and waterfalls
  render/Ambient.js      GPU-animated ambient particles and birds
  render/Post.js         fused post-processing pipeline with dynamic render scale
  render/materials.js    reveal, checker and board shaders on standard materials
  render/geo.js          noise and geometry helpers, prop merging
  render/SnakeView.js    the animated snake (dynamic 3D tube mesh, modelled head, skins, boost aura, jetpack)
  render/accessories.js  hats, horns, shades and other head accessories
  skins.js               skin patterns, accessories and their unlock rules
  render/SnakePath.js    smooth path through grid cells with rounded corners
  render/FoodView.js     crystal apples, prisms, orb chains and the golden mouse
  render/BoardObjects.js pillars with warnings, boost pads and the sky's boost rings
  render/Effects.js      particles, shockwaves, path guide
  render/CameraRig.js    orbit / garage / overhead / chase / first-person cameras and blending
  render/textures.js     procedural textures
  audio/Audio.js         synthesized sound effects
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
