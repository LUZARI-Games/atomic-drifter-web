// Boarding combat, FTL-like: enemies (side 'enemy') and crew standing in the same room fight in melee automatically.
// Boarders walk to systems and wreck them while nobody stops them; crew repair damaged systems when the room is clear.
// Pure functions (state, dt) => state – engine-neutral.
import COMBAT from '../data/combat.json';
import LAB from '../data/crew_lab.json';
import PORTRAITS from '../data/portraits.json';
import { CREW_LOOKS, parseCrewLook, type CrewLook } from './crew';
import { maxHp, moveTo, navOf } from './crewmove';
import { findPath, nodeAt } from './nav';
import type { CrewMember, GameState, Point } from './types';

export const SYSTEM_MAX_DAMAGE = COMBAT.system_max_damage;

const isEnemy = (c: CrewMember) => c.side === 'enemy';
const alive = (c: CrewMember) => c.dying === undefined && c.hp > 0;

/** Room a crew member stands in (deck tiles only; vehicle seats belong to no room). */
export function roomOf(state: GameState, c: CrewMember): string | null {
  if (!c.node.startsWith('t')) return null;
  return state.ship.tiles[Number(c.node.slice(1))]?.room ?? null;
}


/** Put an enemy boarder onto the spot under ship point `p` (random hostile look + enemy portrait). */
export function spawnEnemy(state: GameState, p: Point, seed = state.crew.length * 7919 + 13): GameState {
  const nav = navOf(state.ship);
  const node = nodeAt(state.ship, nav, p);
  if (!node || !node.startsWith('t')) return state;
  let s = seed >>> 0 || 1;
  const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const bases = LAB.map(parseCrewLook).filter((l): l is CrewLook => !!l && COMBAT.enemy_origins.includes(l.origin));
  const faces = PORTRAITS.portraits.filter((f) => f.side === 'enemy');
  const base = bases[Math.floor(r() * bases.length)]!;
  const face = faces[Math.floor(r() * faces.length)];
  const n = state.crew.filter(isEnemy).length + state.crew.length;
  const id = `enemy_${n}_${Math.floor(r() * 1e6)}`;
  const look: CrewLook = {
    ...base,
    id,
    name: face?.name ?? 'BOARDER',
    sex: (face?.sex as CrewLook['sex']) ?? 'male',
    skin: Math.floor(r() * CREW_LOOKS.skin_tones.length),
    hair: Math.floor(r() * CREW_LOOKS.hair_colors.length),
    gear: [],
  };
  const hp = maxHp(look);
  const member: CrewMember = {
    id, name: look.name, look, node, dest: node, pos: nav.nodes.get(node)!.pos, path: [], heading: r() * Math.PI * 2,
    walked: 0, hp, hpMax: hp, side: 'enemy', portrait: face?.id, idle: 0,
  };
  // step onto a free spot of the tile (moveTo picks a free slot)
  const placed = { ...state, crew: [...state.crew, member] };
  const moved = moveTo(placed, id, nav.nodes.get(node)!.pos) ?? placed;
  return { ...moved, crew: moved.crew.map((m) => (m.id === id && m.pathEnd ? { ...m, pos: m.pathEnd, path: [], pathEnd: undefined } : m)) };
}

/** Enemies placed in the planner (ship.crew with side 'enemy'). */
export function spawnShipEnemies(state: GameState): GameState {
  let s = state;
  (state.ship.crew ?? []).forEach((c, i) => {
    if (c.side === 'enemy') s = spawnEnemy(s, c.tile, 1000 + i * 7919);
  });
  return s;
}

/** One combat / AI step: melee blows, deaths, boarders wrecking systems, crew repairing, idle timers. */
export function tickCombat(state: GameState, dt: number): GameState {
  const rooms = new Map(state.crew.map((c) => [c.id, roomOf(state, c)]));
  const damage = new Map<string, number>();

  // melee: everyone standing still fights the nearest living opponent in the same room
  let crew = state.crew.map((c): CrewMember => {
    if (!alive(c)) return c;
    const room = rooms.get(c.id);
    const foes = room && !c.path.length
      ? state.crew.filter((o) => alive(o) && isEnemy(o) !== isEnemy(c) && rooms.get(o.id) === room)
      : [];
    if (!foes.length) return c.fight ? { ...c, fight: undefined } : c;
    const near = foes.reduce((a, b) => (Math.hypot(b.pos[0] - c.pos[0], b.pos[1] - c.pos[1]) < Math.hypot(a.pos[0] - c.pos[0], a.pos[1] - c.pos[1]) ? b : a));
    const prev = c.fight?.target === near.id ? c.fight : { target: near.id, cooldown: COMBAT.attack_interval_s * 0.5, hits: c.fight?.hits ?? 0 };
    let cooldown = prev.cooldown - dt;
    let hits = prev.hits;
    if (cooldown <= 0) {
      cooldown += COMBAT.attack_interval_s;
      hits += 1;
      const dmg = c.look.build === 'tank' ? COMBAT.hit_damage.tank : COMBAT.hit_damage.normal;
      damage.set(near.id, (damage.get(near.id) ?? 0) + dmg);
    }
    const heading = Math.atan2(near.pos[1] - c.pos[1], near.pos[0] - c.pos[0]);
    return { ...c, heading, idle: 0, fight: { target: near.id, cooldown, hits } };
  });

  // damage, deaths, removal after the death animation
  crew = crew
    .map((c): CrewMember => {
      if (c.dying !== undefined) return { ...c, dying: c.dying - dt };
      const d = damage.get(c.id);
      if (!d) return c;
      const hp = Math.max(0, c.hp - d);
      return hp > 0 ? { ...c, hp } : { ...c, hp: 0, dying: COMBAT.death_s, fight: undefined, path: [], pathEnd: undefined, dest: c.node };
    })
    .filter((c) => c.dying === undefined || c.dying > 0);

  let next: GameState = { ...state, crew };
  if (next.selectedCrewId && !crew.some((c) => c.id === next.selectedCrewId && alive(c))) next = { ...next, selectedCrewId: null };

  // systems: boarders wreck the room they stand in, crew repair it when no boarder is there
  const sysDamage = { ...state.systemDamage };
  const systemRooms = new Set(state.ship.rooms.filter((r) => r.system && r.kind !== 'balcony').map((r) => r.id));
  for (const c of crew) {
    const room = roomOf(next, c);
    if (!room || !systemRooms.has(room) || !alive(c) || c.path.length || c.fight) continue;
    const enemyHere = crew.some((o) => alive(o) && isEnemy(o) && roomOf(next, o) === room);
    if (isEnemy(c)) sysDamage[room] = Math.min(SYSTEM_MAX_DAMAGE, (sysDamage[room] ?? 0) + COMBAT.boarder_damage_per_s * dt);
    else if (!enemyHere && (sysDamage[room] ?? 0) > 0) sysDamage[room] = Math.max(0, sysDamage[room]! - COMBAT.repair_per_s * dt);
  }
  for (const k of Object.keys(sysDamage)) if (sysDamage[k] === 0) delete sysDamage[k];
  next = { ...next, systemDamage: sysDamage };

  // boarders with nothing to do head for the nearest system that is not wrecked yet
  for (const c of next.crew) {
    if (!isEnemy(c) || !alive(c) || c.path.length || c.fight) continue;
    const room = roomOf(next, c);
    if (room && systemRooms.has(room) && (next.systemDamage[room] ?? 0) < SYSTEM_MAX_DAMAGE) continue; // busy wrecking
    const target = nearestSystemTile(next, c, systemRooms);
    if (target) next = moveTo(next, c.id, target) ?? next;
  }

  // idle timers (moods): standing around with nothing to do
  next = {
    ...next,
    crew: next.crew.map((c) => {
      const busy = c.path.length > 0 || !!c.fight || c.dying !== undefined;
      const idle = busy ? 0 : (c.idle ?? 0) + dt;
      return idle === c.idle ? c : { ...c, idle };
    }),
  };
  return next;
}

/** A free-ish deck tile in the nearest (by walking) system room that is not wrecked yet. */
function nearestSystemTile(state: GameState, c: CrewMember, systemRooms: Set<string>): Point | null {
  const nav = navOf(state.ship);
  let best: { cost: number; p: Point } | null = null;
  state.ship.tiles.forEach((t, i) => {
    if (t.machinery || !t.room || !systemRooms.has(t.room) || (state.systemDamage[t.room] ?? 0) >= SYSTEM_MAX_DAMAGE) return;
    const id = `t${i}`;
    if (!nav.nodes.has(id) || id === c.node) return;
    const way = findPath(nav, c.node, id);
    if (!way) return;
    let cost = 0;
    for (let k = 1; k < way.points.length; k++) cost += Math.hypot(way.points[k]![0] - way.points[k - 1]![0], way.points[k]![1] - way.points[k - 1]![1]);
    if (!best || cost < best.cost) best = { cost, p: t.center };
  });
  return (best as { cost: number; p: Point } | null)?.p ?? null;
}

/** Fighters' blow counters – the renderer turns a changed counter into a punch animation + sound. */
export function isFighting(c: CrewMember): boolean {
  return !!c.fight && alive(c);
}
