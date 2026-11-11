# Snake Rush

Classic Snake reimagined as a fast, cinematic 3D browser game. Race a scaly
serpent around a floating checkered island, grab spinning crystal apples,
chase down a golden mouse, string together orb chains and hit boost pads, while the world
transforms around you through six zones, each with its own adaptive
chiptune soundtrack. In Sunset Heavens the snake straps on a jetpack and flies
through a laser-fenced box of sky in full 3D; clear it and it jumps to
hyperspeed, dropping out onto a board floating over the black hole at the
heart of a galaxy, and the black hole starts eating it. Fill every cell that's
left to win the game: a real, 100% ending. Play from
overhead, from a chase camera behind the head, or in first person, and switch
at any moment: every view plays the same game.

Snake Rush is open source: <https://github.com/Naimy441/snake_game>.

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

Eat spinning crystal **apples** to grow and score. Don't hit the walls or
your own body. The board is always clear: there are no obstacles on it.

| Action | Overhead view | Chase and first-person views |
| --- | --- | --- |
| Steer | Arrow keys / WASD move in that screen direction | Left/Right or A/D turn left/right |
| Steer (any view) | Q / E turn left / right relative to the snake | same |
| Rush (hold) | Space or Shift | same |
| Cycle camera | C (overhead → chase → first-person) | C |
| Pause / resume | P or Esc | same |
| Restart | R | same |
| Next song (on this map) | M | same |
| Mute | N | same |
| Speedrun timer on / off | T | same |
| Ghost guide on / off | G | same |
| Climb / dive (Sunset Heavens) | ↑ / ↓ (the other key levels out) | same |
| Pick the starting level (menu) | Left / Right | |

**Touch:** swipe to steer in the overhead view; in the chase and first-person
views, tap or swipe left/right (or use the on-screen turn buttons). Hold the
RUSH button to boost.

**Gamepad:** D-pad or left stick steers, A (or triggers) rushes, Y cycles the
camera, Start pauses, bumpers turn left/right.

### Pickups and hazards

- **Crystal apple:** 10 points, adds 25% Rush, and grows the snake by 1
  cell on Emerald Coast, 2 in Golden Canyon, then 3 from Neon Night on.
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
- **A growing board:** the first map is played on a 17 x 17 board. At
  Golden Canyon it widens to 19 x 19 and at Neon Night to 21 x 21, where it
  stays. It grows by a ring of cells on every side as the zone wave rolls
  out: the walls slide outward, the camera eases back to fit, and nothing
  on the board moves.

### Scoring, levels and zones

- **Combo:** eat again within 5 seconds to raise the multiplier by one. There
  is no cap: keep eating quickly and it keeps climbing.
- **Rush:** hold Space to move 1.7x faster and score double while the meter lasts.
- **Speed levels:** eating apples raises your speed level. The difficulty
  eases in: Emerald Coast levels take 3 apples each, start slow (about 6
  moves a second), so 9 apples reach Golden Canyon. Later
  levels take 4, then 5 apples and keep speeding up to the top speed. The HUD
  shows how many apples are left until the next level and which level brings
  the next zone.
- **Zones:** every 3 speed levels (2 in Sunset Heavens) the world transforms. A glowing wave sweeps
  out from the arena, the old scenery shrinks away, new scenery grows in, and
  the sky, light, water, board and music all change: Emerald Coast, Golden
  Canyon, Neon Night, Cyber Overdrive, Sunset Heavens, then the Galactic Core. The visuals get
  more intense with each level inside a zone too.
- **Living maps:** each zone has its own moving set pieces around the
  island, all animated on the GPU: a rainbow, drifting hot-air balloons,
  sailboats and butterflies on Emerald Coast; a festival of rising sky
  lanterns, warm balloons and swirling dust devils in Golden Canyon; an
  aurora, streams of flying cars, sweeping searchlights and shooting stars
  over Neon Night; a giant spinning hologram, falling data rain, a ringed
  planet and sonar pulses on the sea in Cyber Overdrive; and sky whales
  swimming through lanterns and drifting blossom petals in Sunset Heavens.
- **Slow motion on level-ups:** while the level-up banner or a new zone's
  title card covers the screen, the game drops into slow motion (about a
  quarter speed for a new zone, a short dip for a normal level-up), with
  muffled music and a softer, desaturated look. It eases back to full speed
  once the card clears, so the card never gets you killed.
- **Level select:** the start menu has a "Start at" picker. Once you have
  reached a level in any run, you can start a new run straight from it (or
  from any lower level) with the ‹ › buttons or Left/Right on the menu. The run
  starts with that level's speed, zone, board size and apples-to-next-level.
- At game over you get a rank from D to S. Beating the game always ranks ★.

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
  hazard besides your own body. There are no obstacles in the sky.
- **Pickups:** apples, prisms and orb chains float at any altitude (chains
  can run up and down). Boost pads become spinning gold boost rings to fly
  through. The golden mouse can't fly, so it stays on the ground.
- **Speed:** flying is a new skill, so the sky starts slower again (about 8
  moves a second) and speeds back up over its two levels.
- The ghost guide flies too, with the same perfect pathfinding in 3D.
- Reaching Sunset Heavens unlocks the **Phoenix** skin in the Garage, and the
  level select lets you start a run straight in the sky once you've been
  there.

### The Galactic Core: beating the game

Snake Rush can be won. Clear the last level of Sunset Heavens and the run
continues in the finale.

- **Hyperspeed:** the stars stretch into streaks and the snake races down a
  tunnel of light, still full length. It drops out over a spiral galaxy and
  the camera glides down to a black hole with a burning accretion disk.
- **Your tail is torn off:** you land on the board as four segments, with
  the rest of your body hanging off the back of it and spiralling down into
  the disk. Then it rips away and is reeled into the horizon, pouring in as
  light, while the length counter runs down.
- **The collapsing board:** you land on a 12 x 12 board of glowing glass
  tiles floating high above the black hole, and the black hole is eating it.
  Every apple grows you by one and dooms three more cells, spiralling in
  from the outer edge, clockwise. Doomed tiles shiver, crack with light and
  sag for 1.3 seconds, then break off and fall in: they stretch into needles
  of light and pour down round the edge of the board into the accretion
  disk as threads of light, and the core flares each time something reaches
  the horizon (it burns brighter the more it has eaten). The edge of the
  board is the void: slide off it and you fall in. Every camera works here;
  the minimap shows what's left of the board.
- **Fill what's left:** the board shrinks to meet you, so you never have to
  fill all 144 cells: the run is won when every cell still standing is
  snake, usually around 40. The HUD counts the empty cells left.
- **Fair by construction:** a tile only falls once the snake is off it; the
  collapse never takes the cells right in front of your head, never splits
  the board in two, and never cuts your head off from your own tail, so
  there is always a way to stay alive. Dead-end cells (one neighbour left,
  which could only ever be filled last) are eaten first, for free. The game
  speeds up as the board fills (about 6.7 to 7.6 moves a second).
- **Slow down:** once the snake is 35 long, the black hole flares and a
  shockwave rolls out across the board under a "Slow down" banner. Over the
  next 10 moves the game eases back to about 5.5 moves a second and stays
  there for the final stretch.
- **Fair apples:** a new apple only goes where the snake can still get
  itself safe (the game checks by playing it out ahead), preferring cells it
  can actually reach, eat and survive; it never lands on a dead end, and the
  collapse never turns its cell into one. If there's nowhere fair for it yet,
  the next apple waits a moment. An apple that has sat for 8 seconds and
  still can't be eaten without getting trapped is swallowed by the black
  hole (which takes a bite of the board as it does, if that's safe), and a
  fair one appears.
- **The autoplay wins every time:** the title-screen demo plays the board by
  trying moves out on copies of the game. It only goes for an apple if,
  once it has eaten and the black hole has taken its cells, it can still
  prove a way to be safe for good: nothing left to fall, and a clear run
  from its head round to its tail that it could circle for ever. Otherwise
  it stalls on a path it has already proved safe. It wins every run in
  thousands of simulated games.
- **The finale:** fill the last cell and everything goes silent. What's left
  of the board pours into the black hole, and the snake itself turns to
  light and unravels after it, tail first. When the light reaches the
  horizon the whole galaxy erupts: a wave of light sweeps out through every
  star, jets fire from the black hole, distant galaxies light up one by one,
  and the run ends on **Galaxy complete! 100%**.
- **Speedrun timer:** press **T** (or tick it in Settings) for a real-time
  run clock in the top right, to the hundredth of a second. Pauses don't
  count; the hyperspeed and finale cinematics do. It stops when the run ends,
  and a run started from level 1 that beats the game sets your best 100% time,
  shown under the clock.
- Beating the game is remembered: a gold **★ 100%** sits next to your best
  score, the title screen's tour shows the Galactic Core with its jets, and
  the **Event Horizon** skin unlocks in the Garage.
- The ghost guide sits the Galactic Core out; it's your puzzle. Once you've
  reached it, the level select can start a run there.

### Bonus level: lights out, then party

Grow to **length 30** in the Galactic Core and a secret unlocks: the **Bonus
level** button on the title screen (beating the game unlocks it too). It plays
in the same game, with the same HUD, cameras, Rush, pause and results screens.

- **The rules:** classic Snake on a 17 x 17 board. No power-ups, no golden
  mouse, no boost pads and no speed-ups (about 7.8 moves a second the whole
  way). Every **golden apple** grows the snake by one. Rush still works: hold
  it to go faster and score double while the meter lasts. The bonus level keeps
  its own best score.
- **Lights out:** it starts in total darkness. All you can see is the board's
  glow-in-the-dark rim (it turns pink-red as your head gets close), the golden
  apple (the regular crystal apple, in gold) under a small spotlight, and your
  snake's own rim light.
- **Party mode:** the tenth apple sets off a huge explosion of pixels and the
  lights come on over a magical lake at night: a starry violet sky with the
  milky way, mountains, a castle on the far shore with its windows lighting
  up, a little town and street lamps round the water, pine forests, and
  hundreds of sky lanterns rising from the lake. The lake is a real mirror,
  so the castle, the lanterns and the board shimmer in it. The board becomes a
  softly glowing dance floor in lantern colours, pulsing to the beat, its rim
  turns gold, and it lifts off the water and floats above it, trailing glitter.
  Fireflies drift round it and fireworks keep going off over the castle. Every
  10 apples after that sets off five firework rings over the board and lifts
  the music a semitone.
- **The music:** an original chiptune party anthem in C minor at 158 BPM. In the
  dark it starts as a lone heartbeat, and every apple adds a layer (hats, bass,
  an arpeggio opening up through a filter, a backbeat, the hook played softly,
  four-on-the-floor, snare rolls, then a rising siren on apple nine). Apple ten
  flips the song from dark C minor into bright E-flat major: a stuttered,
  chanted sing-along hook ("la-la-la-LAA") over oom-pah bass, offbeat chord
  stabs and a stomping beat, then a rapid-fire verse with crowd "HEY!"s that
  winds up with a snare roll and a beat of silence before the hook comes back,
  harmonised. A crash winds it down like a record losing power.
- **Playtesting:** open `?bonus` to start the bonus level straight away (it's
  unlocked for that visit), or `?bonus=9` to start nine apples in.

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
chain orbs in order and prisms before they vanish, then the apple. It never traps itself
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

- **26 skins:** Viper, Coral, Python, Emerald Boa, Tiger, Candy Cane, Glacier,
  plus unlockables: Neon Runner and Circuit (glowing light lines), Magma
  (molten cracks that pulse), Golden King, Chrome (mirror metal), Galaxy
  (twinkling stars), Prism (an animated rainbow), Dragon, Phoenix (sunset
  feathers, from reaching Sunset Heavens), Phantom and Event Horizon (from
  beating the game).
- **8 silly skins:** Hot Dog (a grilled sausage in a bun with mustard),
  Gummy Worm, Tape Measure, Toothpaste and Pickle are free; Watermelon
  (30 apples), Crispy Bacon (catch a golden mouse) and Disco Ball (play 5
  runs) unlock through play.
- Skin patterns are baked into a high-resolution texture, so fine details
  like bands, diamonds, ticks and circuit traces stay crisp up close.
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
flows instead of cutting. Pausing muffles it rather than stopping it. Sunset
Heavens gets a soaring major-key synthwave song, and lift-off has its own
jetpack-ignition roar. The Galactic Core has a slow, vast minor-key anthem,
with a hyperspeed riser, a deep boom as you drop out, and a finale that goes
silent before the eruption and resolves into a major-key victory chord. On the
title screen, the music follows the map the tour is showing.

The original songs are **Seaside Sprint** (Emerald Coast), **Desert Wind**
(Golden Canyon), **City Lights** (Neon Night), **Data Stream** (Cyber
Overdrive), **Skyward** (Sunset Heavens) and **Last Light** (Galactic Core).
Every map has **three songs** (the Galactic Core has two), and one is picked at random each time its music
starts (a new map or a new run); a small "♪ name" note says which, and on
the title screen the song playing is shown under the map name. The second
set is written hook first, in the same chiptune voices: a short catchy motif
that repeats and climbs through the verse, and a bigger chorus where the lead
doubles an octave up. **High Tide** (a sunny, bouncing anthem) on Emerald
Coast, **Gold Rush** (a galloping western) in Golden Canyon, **Midnight Drive**
(octave-popping disco synth-pop) on Neon Night, **Firewall** (a harmonic-minor
chase theme) in Cyber Overdrive, **Golden Hour** (a dreamy, soaring climb) in
Sunset Heavens and **Supernova** (a major-key anthem of wonder) in the Galactic Core.
Emerald Coast has a third song, **Seaglass**: chiptune city-pop after a clip
of a song (120 BPM in C major, lush sevenths and ninths on the "royal road",
Fmaj7 G Em7 Am then Dm7 G7 C, changing every two beats, under a dreamy top
line that leans on E and D). A soft intro of pad, arpeggio and that top line
as a bell, a syncopated verse hook, a pre-chorus that climbs to a borrowed
Fm6, a chorus up high and doubled over the royal road with its E7, a drumless
breakdown, a build over Ab7, and a last chorus a half step up, in Db. The band fills out like the clip's: a clap on 2 and 4, 16th shakers,
a syncopated kick, a funk bass that walks into each chord from a half step
below, electric-piano comping, a glockenspiel twinkling down the chords, and
a horn-like hit on the chorus downbeat. (A bar can hold two chords, one per
half bar.) The first version, **Seaglass Original** (the same song with
simpler pulse stabs, a plain bass and snare, and no clap, shakers or
glockenspiel), is kept in the code to compare but isn't played in the game.
Golden Canyon has a third song, **Mirage**: a sunny desert dembow in A
phrygian dominant (the snake charmer's scale) kept bright with major chords
(the triumphant F G A cadence, the Bb-A turn) at 112, with a clap and keys on
the 3-3-2, a tresillo bass and a hook that coils round its note with quick
turns. It drops fast: a four-bar call, a build, then a four-on-the-floor
"sandstorm" chorus, before its verse, chorus and breakdown.
Sunset Heavens has **Paper Planes**: an upbeat neo-soul glide in Eb at 112 over
chords that slide by half steps (Abmaj7 G7 Cm7 Bbm7 Eb7), a soaring chorus
on Abmaj9 Bb6 Gm7 Cm9 that bounces four on the floor, a drumless glide over a borrowed Dbmaj7, and a last
chorus a half step up in E. (Phrygian dominant is now one of the scales.)
Neon Night has a third song, **Afterglow**: a hook transcribed from a sung
voice recording (pitch-tracked frame by frame: a three-note E-F#-G chant in a
3-3-2 rhythm at about 120 BPM), grown into a song that goes from the feels to
a banger and back. It plays its sections in order: the hook at the 120 BPM it
was sung, over bittersweet maj7, add9 and m9 chords with a reverb-washed pad
and an arpeggio that pump with the kick (verse, then chorus); a four-bar
build (a noise riser, a doubling snare roll, the mix sweeping open under a
filter, then a beat of silence); and the drop at 124, a four-on-the-floor
groove with the bass, toms and stabs locked to the hook's rhythm, whose chorus
lifts the hook an octave over Em Am7 Cmaj7 B7. The drop plays twice, then it
falls back to the feels. (Songs can be sequenced like this: `seq` lists the
sections in order, and each section can carry its own tempo and style.)
Cyber Overdrive has a third song, **Overclock**, grown from the best part of
an earlier jam on a second sung voice memo: a deep three-note chant (Bb C Db,
the 1, 2 and b3 of Bb dorian) over a Bbm7 / Eb9 funk vamp, played as a
half-time shuffle with ghost-note snares, clav chops and a walking bass. It's
a tight song that gets to the hype fast and stays there: an intro on the slow
call it grew from, the chant as sung with the band answering each phrase, a
pre-chorus that walks it up, a chorus that throws it an octave up over Gbmaj7
Ab6 Bbm9 Eb9, a breakdown, a build, then a long hype run a key up, in B minor
(the chorus, a climbing hype section, the chorus again). Then it goes round
again from the chant.
Press **M** to skip to the map's next song (it starts from the top, and stays
the pick for that map for the rest of the visit). To pin one while testing, run
`__coil.audio.forceTrack = 0` (original), `1` (alternate) or `2` (each map's
third song, where it has one) in the console, or add `track` to
the URL: `?track=2` plays Seaglass, `?level=6&track=2` always plays Afterglow and `?level=9&track=2`
Overclock (add `&bot=1` to let the autoplay drive while you listen).

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
LEVEL=12 npm run bench   # the same, flying in Sunset Heavens
```

`npm run test:e2e` and `npm run bench` use `playwright-core` and need a
Chromium binary: set `CHROMIUM_PATH` to one if Playwright's default isn't
installed. Headless Chromium renders on the CPU, so the benchmark's absolute
numbers aren't real frame rates; it's for before/after comparisons. 

### Project layout

```
src/
  game/SnakeGame.js      pure game state and rules: obstacles, chains, prey, pads, zones, the collapsing board
  game/GhostBot.js       the ghost guide: a perfect-play bot (safe pathfinding, Rush timing)
  render/World.js        orchestrates sky, sea, island, zone scenery, lighting and zone transitions
  render/zones.js        the six zones' palettes and post-processing looks
  render/Space.js        the Galactic Core: galaxy, black hole, the collapsing board and its light, hyperspeed, finale
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
  render/BoardObjects.js boost pads, the sky's boost rings (and pillars, unused)
  render/Spectacles.js   each zone's animated set pieces: balloons, lanterns, aurora, whales...
  render/Effects.js      particles, shockwaves, path guide
  render/CameraRig.js    orbit / garage / overhead / chase / first-person cameras, the title tour, and blending
  render/textures.js     procedural textures
  audio/Audio.js         synthesized sound effects and the adaptive music engine
  Input.js               keyboard, touch and gamepad
  main.js                app shell, game loop, HUD and menus
  GalaxyDirector.js      the Galactic Core's set pieces: hyperspeed and the finale
  bonus/BonusStage.js    the bonus level's set: darkness and spotlights, then the lantern lake, castle, town and dance floor
  bonus/BonusMusic.js    the bonus level's song, layered by apples eaten, with the drop on apple ten
  bonus/PixelParticles.js instanced pixel-cube explosions and fireworks
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
