// Arena layouts. Every ground zone has its own handcrafted map that builds up
// over the zone's three speed levels: walls rise at the zone's first level and
// more join at the next two. Later zones add portal pairs and laser gates.
// A run picks one of the square's eight symmetries per zone, so the same map
// turns up in different orientations.
//
// Legend (one row per z, one character per x, 21 x 21):
//   .      floor
//   1 2 3  wall that rises at the zone's 1st / 2nd / 3rd level (stage 0 / 1 / 2)
//   A-D    portal: the two cells with the same letter are a pair
//   g-j    laser gate: cells with the same letter form one gate
// Stages of portals and gates are listed per layout.

export const LAYOUTS = [
  {
    // Emerald Coast: the first level stays open, then hedges grow in.
    name: 'Hedge Garden',
    grid: [
      '.....................',
      '.....................',
      '..333...........333..',
      '..3...............3..',
      '..3...............3..',
      '.....................',
      '......22.....22......',
      '......22.....22......',
      '.....................',
      '..........3..........',
      '.........333.........',
      '..........3..........',
      '.....................',
      '......22.....22......',
      '......22.....22......',
      '.....................',
      '..3...............3..',
      '..3...............3..',
      '..333...........333..',
      '.....................',
      '.....................',
    ],
    portals: {},
    gates: {},
  },
  {
    // Golden Canyon: two sandstone ridges split the board into three bands,
    // joined through gaps that narrow; a mesa and spires follow.
    name: 'Canyon Ridges',
    grid: [
      '.....................',
      '.....................',
      '.....3.........3.....',
      '.....................',
      '.....................',
      '..1111112...2111111..',
      '..1111112...2111111..',
      '.....................',
      '.....................',
      '.........333.........',
      '.........333.........',
      '.........333.........',
      '.....................',
      '.....................',
      '..1111112...2111111..',
      '..1111112...2111111..',
      '.....................',
      '.....................',
      '.....3.........3.....',
      '.....................',
      '.....................',
    ],
    portals: {},
    gates: {},
  },
  {
    // Neon Night: four city blocks that grow taller and wider, with subway
    // portals between opposite corners.
    name: 'Neon City',
    grid: [
      '.....................',
      '.....................',
      '..A...............B..',
      '.....................',
      '.....................',
      '.....1112...2111.....',
      '.....1112...2111.....',
      '.....1112...2111.....',
      '.....2222...2222.....',
      '.....................',
      '.....................',
      '.....................',
      '.....2222...2222.....',
      '.....1112...2111.....',
      '.....1112...2111.....',
      '.....1112...2111.....',
      '.....................',
      '.....................',
      '..B...............A..',
      '.....................',
      '.....................',
    ],
    portals: { A: 0, B: 2 },
    gates: {},
  },
  {
    // Cyber Overdrive: a data core, four emitter towers and two laser gates
    // that switch on and off in turn; then edge portals and side bars.
    name: 'Data Core',
    grid: [
      '.....................',
      '.....................',
      '.....................',
      '...11...........11...',
      '...11ggggggggggg11...',
      '.....................',
      '.....................',
      '.....................',
      '......3.......3......',
      '......3..111..3......',
      '.A....3..111..3....A.',
      '......3..111..3......',
      '......3.......3......',
      '.....................',
      '.....................',
      '.....................',
      '...11hhhhhhhhhhh11...',
      '...11...........11...',
      '.....................',
      '.....................',
      '.....................',
    ],
    portals: { A: 1 },
    // phase: fraction of a gate cycle to offset the gate by, so they alternate
    gates: { g: { stage: 0, phase: 0 }, h: { stage: 0, phase: 0.5 } },
  },
];

// The eight symmetries of a square: optional transpose, then optional flips.
export const SYMMETRIES = 8;

export function transformCell(x, z, sym, size) {
  const m = size - 1;
  let a = x;
  let b = z;
  if (sym & 4) [a, b] = [b, a];
  if (sym & 1) a = m - a;
  if (sym & 2) b = m - b;
  return { x: a, z: b };
}

const cache = new Map();

// Parse a zone's layout under a symmetry into its stages. Each stage lists
// what it adds: walls (cells), portals ({ key, a, b }) and gates
// ({ key, cells, axis: 'x' | 'z', phase }). Returns [] for zones without a map.
export function layoutStages(zone, sym = 0, size = 21) {
  const key = `${zone}:${sym}:${size}`;
  if (cache.has(key)) return cache.get(key);
  const L = LAYOUTS[zone];
  const stages = [0, 1, 2].map(() => ({ walls: [], portals: [], gates: [] }));
  if (L && L.grid.length === size) {
    const portalCells = {};
    const gateCells = {};
    L.grid.forEach((row, z) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        const c = transformCell(x, z, sym, size);
        if (ch >= '1' && ch <= '3') stages[ch.charCodeAt(0) - 49].walls.push(c);
        else if (ch >= 'A' && ch <= 'Z') (portalCells[ch] || (portalCells[ch] = [])).push(c);
        else if (ch >= 'a' && ch <= 'z') (gateCells[ch] || (gateCells[ch] = [])).push(c);
      }
    });
    for (const [k, cells] of Object.entries(portalCells)) {
      stages[L.portals[k] || 0].portals.push({ key: k, a: cells[0], b: cells[1] });
    }
    for (const [k, cells] of Object.entries(gateCells)) {
      const g = L.gates[k] || { stage: 0, phase: 0 };
      const axis = cells.every((c) => c.z === cells[0].z) ? 'x' : 'z';
      cells.sort((p, q) => (axis === 'x' ? p.x - q.x : p.z - q.z));
      stages[g.stage].gates.push({ key: k, cells, axis, phase: g.phase || 0 });
    }
  }
  const out = L ? stages : [];
  cache.set(key, out);
  return out;
}

// Everything a zone's map holds up to and including `stage`.
export function layoutUpTo(zone, stage, sym = 0, size = 21) {
  const all = { walls: [], portals: [], gates: [] };
  layoutStages(zone, sym, size).slice(0, stage + 1).forEach((s) => {
    all.walls.push(...s.walls);
    all.portals.push(...s.portals);
    all.gates.push(...s.gates);
  });
  return all;
}
