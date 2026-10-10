// Random placeholder airships (hangar: locked ships). Same export format as the planner
// (atomic-drifter-ship-godot v1, meters, 2 m tiles), so they load through parseShip like any planner ship.
// Layout: a row of system rooms along z – machinery column at x = -1, floor column at x = 1 (console tile, facing the
// machine), interior walls between rooms with a door in the floor column. Seeded: same seed, same ship.

const SYSTEMS: [string, string][] = [
  ['engines', 'ENGINES'], ['weapons', 'WEAPONS'], ['shields', 'SHIELDS'], ['piloting', 'COCKPIT'],
  ['medbay', 'MED BAY'], ['sensor', 'SENSORS'], ['doors', 'DOORS'], ['drones', 'DRONES'],
];
const NAMES = ['IRON MAIDEN', 'LUCKY STRIKE', 'BLUE BOMBER', 'DUST QUEEN', 'ATOM BELLE', 'RUST BUCKET', 'SKY JUNKER', 'MISS NUCLEAR'];

type P = [number, number];

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** A random ship as raw planner export JSON (parse it with parseShip). */
export function generateShipRaw(seed: number): Record<string, unknown> {
  const r = rng(seed);
  const pool = [...SYSTEMS].sort(() => r() - 0.5);
  // the cockpit, engines and shields are always on board
  const must = ['piloting', 'engines', 'shields'];
  const count = 4 + Math.floor(r() * 3); // 4–6 rooms
  const chosen = [...pool.filter(([id]) => must.includes(id)), ...pool.filter(([id]) => !must.includes(id))].slice(0, count).sort(() => r() - 0.5);
  const z0 = -count; // rooms are 2 m long, centred around z = 0
  const tiles: unknown[] = [];
  const rooms: unknown[] = [];
  const walls: unknown[] = [];
  const doors: unknown[] = [];
  const sq = (c: P) => [[c[0] - 1, c[1] + 1], [c[0] - 1, c[1] - 1], [c[0] + 1, c[1] - 1], [c[0] + 1, c[1] + 1]];
  chosen.forEach(([sys, label], i) => {
    const z = z0 + 1 + i * 2;
    const id = `${sys}`;
    tiles.push({ room: id, shape: 'full', machinery: true, center: [-1, z], polygon: sq([-1, z]) });
    tiles.push({ room: id, shape: 'full', machinery: false, center: [1, z], polygon: sq([1, z]) });
    rooms.push({ id, kind: 'system', system: sys, label, color: null, console: { tile: [1, z], facing: [-1, 0] } });
    // hull sides
    walls.push({ kind: 'hull', a: [-2, z - 1], b: [-2, z + 1] }, { kind: 'hull', a: [2, z - 1], b: [2, z + 1] });
    if (i > 0) {
      // wall to the previous room: closed over the machinery, a door gap in the floor column
      const zb = z - 1;
      walls.push({ kind: 'interior', a: [-2, zb], b: [0, zb] }, { kind: 'interior', a: [0, zb], b: [0.4, zb] }, { kind: 'interior', a: [1.6, zb], b: [2, zb] });
      doors.push({ kind: 'door', center: [1, zb], axis: 'x', width: 1.2, rooms: [(chosen[i - 1] as [string, string])[0], id] });
    }
  });
  const zEnd = z0 + count * 2;
  walls.push({ kind: 'hull', a: [-2, z0], b: [0, z0] }, { kind: 'hull', a: [0, z0], b: [2, z0] });
  walls.push({ kind: 'hull', a: [-2, zEnd], b: [0, zEnd] }, { kind: 'hull', a: [0, zEnd], b: [2, zEnd] });
  return {
    format: 'atomic-drifter-ship-godot',
    version: 1,
    revision: `gen-${seed}`,
    name: NAMES[Math.floor(r() * NAMES.length)],
    design_id: null,
    tile_size: 2,
    wall_height: 1.0,
    door_width: 1.2,
    size: { x: 4, z: count * 2 },
    rooms,
    tiles,
    walls,
    doors,
    vehicles: [],
  };
}
