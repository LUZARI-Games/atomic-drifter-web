// Boarding combat, FTL-like: enemies (side 'enemy') and crew standing in the same room fight in melee automatically.
// Boarders walk to systems and wreck them while nobody stops them; crew repair damaged systems when the room is clear.
// Pure functions (state, dt) => state – engine-neutral.
import COMBAT from '../data/combat.json';
import LAB from '../data/crew_lab.json';
import PORTRAITS from '../data/portraits.json';
import { CREW_LOOKS, parseCrewLook, type CrewLook } from './crew';
import { atDesk, consoleOf, freeTileNear, maxHp, moveTo, navOf, tileSpot } from './crewmove';
import { findPath, nodeAt } from './nav';
import type { CrewMember, GameState, Point } from './types';


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
  // one enemy per tile: else the nearest free tile of that room; then onto its spot (centre / corner / desk)
  const placed = { ...state, crew: [...state.crew, member] };
  const free = freeTileNear(placed, id, node);
  if (!free) return state;
  const at = { ...placed, crew: placed.crew.map((m) => (m.id === id ? { ...m, node: free, dest: free } : m)) };
  return { ...at, crew: at.crew.map((m) => (m.id === id ? { ...m, pos: tileSpot(at, id, free) } : m)) };
}

/** Enemies placed in the planner (ship.crew with side 'enemy'). */
export function spawnShipEnemies(state: GameState): GameState {
  let s = state;
  (state.ship.crew ?? []).forEach((c, i) => {
    if (c.side === 'enemy') s = spawnEnemy(s, c.tile, 1000 + i * 7919);
  });
  return s;
}

/** Health bars of a system room (= its power level); 0 for rooms without a system. */
export function systemBars(state: GameState, room: string): number {
  const r = state.ship.rooms.find((x) => x.id === room);
  if (!r?.system || r.kind === 'balcony') return 0;
  return state.systemBars[room] ?? COMBAT.default_system_bars;
}

const at = (c: CrewMember, p: Point) => Math.hypot(c.pos[0] - p[0], c.pos[1] - p[1]) < 0.06;
const standingStill = (c: CrewMember) => alive(c) && !c.path.length;

/**
 * What someone is doing to a system right now: an enemy standing alone at a console sabotages it (until wrecked),
 * own crew at the desk repair it while no enemy stands in that room. null = nothing.
 */
export function workOf(state: GameState, c: CrewMember): 'sabotage' | 'repair' | null {
  if (!standingStill(c) || c.fight || !c.node.startsWith('t')) return null;
  const room = roomOf(state, c);
  if (!room || !consoleOf(state.ship, c.node) || !atDesk(state.ship, c)) return null;
  const bars = systemBars(state, room);
  if (!bars) return null;
  const dmg = state.systemDamage[room] ?? 0;
  if (isEnemy(c)) return dmg < bars ? 'sabotage' : null;
  const enemyHere = state.crew.some((o) => isEnemy(o) && alive(o) && roomOf(state, o) === room);
  return dmg > 0 && !enemyHere ? 'repair' : null;
}

/** One combat / AI step: spots, melee blows, deaths, engaging, sabotage + repair, boarders' targets, idle timers. */
export function tickCombat(state: GameState, dt: number): GameState {
  let next = state;

  // 1. everyone standing on a deck tile moves to their spot (centre / desk / corner facing an opponent)
  next = {
    ...next,
    crew: next.crew.map((c) => {
      if (!standingStill(c) || !c.node.startsWith('t')) return c;
      const spot = tileSpot(next, c.id, c.node);
      if (!at(c, spot)) return { ...c, path: [spot], pathEnd: spot, dest: c.node };
      // at a desk (operating / sabotaging / repairing): face the machine
      const desk = consoleOf(next.ship, c.node);
      if (desk && atDesk(next.ship, c)) {
        const heading = Math.atan2(desk[1], desk[0]);
        return c.heading === heading ? c : { ...c, heading };
      }
      return c;
    }),
  };

  // 2. melee: only between opponents standing still on the SAME tile, each in their corner (walkers are left alone)
  const damage = new Map<string, number>();
  let crew = next.crew.map((c): CrewMember => {
    if (!standingStill(c)) return c.fight ? { ...c, fight: undefined } : c;
    const foe = next.crew.find((o) => standingStill(o) && isEnemy(o) !== isEnemy(c) && o.node === c.node);
    const ready = foe && at(c, tileSpot(next, c.id, c.node)) && at(foe, tileSpot(next, foe.id, foe.node));
    if (!foe || !ready) return c.fight ? { ...c, fight: undefined } : c;
    const prev = c.fight?.target === foe.id ? c.fight : { target: foe.id, cooldown: COMBAT.attack_interval_s * 0.5, hits: c.fight?.hits ?? 0 };
    let cooldown = prev.cooldown - dt;
    let hits = prev.hits;
    if (cooldown <= 0) {
      cooldown += COMBAT.attack_interval_s;
      hits += 1;
      damage.set(foe.id, (damage.get(foe.id) ?? 0) + (c.look.build === 'tank' ? COMBAT.hit_damage.tank : COMBAT.hit_damage.normal));
    }
    const heading = Math.atan2(foe.pos[1] - c.pos[1], foe.pos[0] - c.pos[0]);
    return { ...c, heading, idle: 0, fight: { target: foe.id, cooldown, hits } };
  });

  // 3. damage, deaths, removal after the death animation
  crew = crew
    .map((c): CrewMember => {
      if (c.dying !== undefined) return { ...c, dying: c.dying - dt };
      const d = damage.get(c.id);
      if (!d) return c;
      const hp = Math.max(0, c.hp - d);
      return hp > 0 ? { ...c, hp } : { ...c, hp: 0, dying: COMBAT.death_s, fight: undefined, path: [], pathEnd: undefined, dest: c.node };
    })
    .filter((c) => c.dying === undefined || c.dying > 0);
  next = { ...next, crew };
  if (next.selectedCrewId && !crew.some((c) => c.id === next.selectedCrewId && alive(c))) next = { ...next, selectedCrewId: null };

  // 4. sabotage / repair at the consoles (seconds per health bar from combat.json)
  const sysDamage = { ...next.systemDamage };
  for (const c of next.crew) {
    const work = workOf(next, c);
    if (!work) continue;
    const room = roomOf(next, c)!;
    const bars = systemBars(next, room);
    if (work === 'sabotage') sysDamage[room] = Math.min(bars, (sysDamage[room] ?? 0) + dt / COMBAT.sabotage_s_per_bar);
    else sysDamage[room] = Math.max(0, (sysDamage[room] ?? 0) - dt / COMBAT.repair_s_per_bar);
  }
  for (const k of Object.keys(sysDamage)) if (sysDamage[k] === 0) delete sysDamage[k];
  next = { ...next, systemDamage: sysDamage };

  // 5. engaging: idle people walk onto a tile in their room where an opponent stands alone
  for (const c of next.crew) {
    const fresh = next.crew.find((x) => x.id === c.id)!;
    if (!standingStill(fresh) || fresh.fight || !fresh.node.startsWith('t')) continue;
    if (!isEnemy(fresh) && atDesk(next.ship, fresh)) continue; // operators stay at their console
    if (isEnemy(fresh) && workOf(next, fresh) === 'sabotage' && !next.crew.some((o) => !isEnemy(o) && alive(o) && roomOf(next, o) === roomOf(next, fresh) && !o.path.length)) continue;
    const room = roomOf(next, fresh);
    const lonely = next.crew.filter((o) => standingStill(o) && isEnemy(o) !== isEnemy(fresh) && roomOf(next, o) === room && o.node !== fresh.node
      && !next.crew.some((m) => m.id !== o.id && alive(m) && isEnemy(m) === isEnemy(fresh) && m.dest === o.node));
    if (!lonely.length) continue;
    const near = lonely.reduce((a, b) => (Math.hypot(b.pos[0] - fresh.pos[0], b.pos[1] - fresh.pos[1]) < Math.hypot(a.pos[0] - fresh.pos[0], a.pos[1] - fresh.pos[1]) ? b : a));
    next = moveTo(next, fresh.id, navOf(next.ship).nodes.get(near.node)!.pos) ?? next;
  }

  // 6. boarders with nothing to do head for the console of the nearest system that is not wrecked yet
  for (const c of next.crew) {
    const fresh = next.crew.find((x) => x.id === c.id)!;
    if (!isEnemy(fresh) || !standingStill(fresh) || fresh.fight || workOf(next, fresh)) continue;
    // crew in the room come first: stay and fight (they walk over / it steps into its corner)
    if (next.crew.some((o) => !isEnemy(o) && alive(o) && roomOf(next, o) === roomOf(next, fresh))) continue;
    const target = nearestConsole(next, fresh);
    if (target) next = moveTo(next, fresh.id, target) ?? next;
  }

  // 7. idle timers (moods): standing around with nothing to do
  next = {
    ...next,
    crew: next.crew.map((c) => {
      const busy = c.path.length > 0 || !!c.fight || c.dying !== undefined || !!workOf(next, c);
      const idle = busy ? 0 : (c.idle ?? 0) + dt;
      return idle === c.idle ? c : { ...c, idle };
    }),
  };
  return next;
}

/** Console tile (centre) of the nearest system by walking that is not wrecked and has no other boarder on it. */
function nearestConsole(state: GameState, c: CrewMember): Point | null {
  const nav = navOf(state.ship);
  let best: { cost: number; p: Point } | null = null;
  for (const r of state.ship.rooms) {
    if (!r.console || (state.systemDamage[r.id] ?? 0) >= systemBars(state, r.id) || !systemBars(state, r.id)) continue;
    const node = [...nav.nodes.values()].find((n) => n.vehicle === null && Math.hypot(n.pos[0] - r.console!.tile[0], n.pos[1] - r.console!.tile[1]) < 0.01);
    if (!node || state.crew.some((o) => o.id !== c.id && isEnemy(o) && alive(o) && o.dest === node.id)) continue;
    const way = findPath(nav, c.node, node.id);
    if (!way) continue;
    let cost = 0;
    for (let k = 1; k < way.points.length; k++) cost += Math.hypot(way.points[k]![0] - way.points[k - 1]![0], way.points[k]![1] - way.points[k - 1]![1]);
    if (!best || cost < best.cost) best = { cost, p: node.pos };
  }
  return (best as { cost: number; p: Point } | null)?.p ?? null;
}

/** Fighters' blow counters – the renderer turns a changed counter into a punch animation + sound. */
export function isFighting(c: CrewMember): boolean {
  return !!c.fight && alive(c);
}
