// Boarding combat, FTL-like: enemies (side 'enemy') and crew standing in the same room fight in melee automatically.
// Boarders walk to systems and wreck them while nobody stops them; crew repair damaged systems when the room is clear.
// Pure functions (state, dt) => state – engine-neutral.
import COMBAT from '../data/combat.json';
import LAB from '../data/crew_lab.json';
import PORTRAITS from '../data/portraits.json';
import { CREW_LOOKS, parseCrewLook, type CrewLook } from './crew';
import { atDesk, consoleOf, freeTileNear, maxHp, moveTo, navOf, tileSpot } from './crewmove';
import { findPath, nodeAt } from './nav';
import { systemId } from './systems';
import type { CrewMember, GameState, Point } from './types';


const isEnemy = (c: CrewMember) => c.side === 'enemy';
const alive = (c: CrewMember) => c.dying === undefined && c.ko === undefined && c.hp > 0;

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
  // crew database enemies (website) when there are any, else a random hostile look + enemy portrait
  const entry = state.roster?.enemies.length ? state.roster.enemies[Math.floor(r() * state.roster.enemies.length)]! : null;
  const pickBase = bases[Math.floor(r() * bases.length)]!;
  const base: CrewLook = entry
    ? { ...pickBase, build: entry.build, origin: entry.faction && entry.faction in CREW_LOOKS.origins ? (entry.faction as CrewLook['origin']) : pickBase.origin }
    : pickBase;
  const face = entry ? { id: entry.portrait ?? undefined, name: entry.name, sex: entry.sex } : faces[Math.floor(r() * faces.length)];
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
  const hp = entry ? entry.hp : maxHp(look, 'enemy');
  const member: CrewMember = {
    id, name: look.name, look, node, dest: node, pos: nav.nodes.get(node)!.pos, path: [], heading: r() * Math.PI * 2,
    walked: 0, hp, hpMax: hp, hit: entry?.hit, side: 'enemy', portrait: face?.id, idle: 0,
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

/** A med bay room that is not wrecked (heals own crew). */
export function isMedbay(state: GameState, room: string): boolean {
  const r = state.ship.rooms.find((x) => x.id === room);
  return !!r?.system && systemId(r.system) === 'medbay' && (state.systemDamage[room] ?? 0) < systemBars(state, room);
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

  // 2. melee, FTL-style: everyone standing still at their spot hits the NEAREST opponent standing still in the same
  //    room – from their own tile (pairs share a tile, extras fight from where they stand). Walkers are left alone.
  const damage = new Map<string, number>();
  const ready = (c: CrewMember) => standingStill(c) && c.node.startsWith('t') && at(c, tileSpot(next, c.id, c.node));
  const dist = (a: CrewMember, b: CrewMember) => Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]);
  let crew = next.crew.map((c): CrewMember => {
    if (!ready(c)) return c.fight ? { ...c, fight: undefined } : c;
    const room = roomOf(next, c);
    const foes = next.crew.filter((o) => isEnemy(o) !== isEnemy(c) && standingStill(o) && roomOf(next, o) === room);
    if (!room || !foes.length) return c.fight ? { ...c, fight: undefined } : c;
    // keep hitting the current target while it is still there, else the nearest
    const foe = foes.find((o) => o.id === c.fight?.target) ?? foes.reduce((x, y) => (dist(y, c) < dist(x, c) ? y : x));
    const prev = c.fight?.target === foe.id ? c.fight : { target: foe.id, cooldown: COMBAT.attack_interval_s * 0.5, hits: c.fight?.hits ?? 0 };
    let cooldown = prev.cooldown - dt;
    let hits = prev.hits;
    if (cooldown <= 0) {
      cooldown += COMBAT.attack_interval_s;
      hits += 1;
      damage.set(foe.id, (damage.get(foe.id) ?? 0) + (c.hit ?? COMBAT.hit_damage));
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
      if (hp > 0) return { ...c, hp };
      const down = { ...c, hp: 0, fight: undefined, path: [], pathEnd: undefined, dest: c.node, idle: 0, heal: undefined };
      // own crew are knocked out (lie there, wake up after the fight); enemies die and are removed
      return isEnemy(c) ? { ...down, dying: COMBAT.death_s } : { ...down, ko: 0 };
    })
    .filter((c) => c.dying === undefined || c.dying > 0);
  next = { ...next, crew };
  if (next.selectedCrewId && !crew.some((c) => c.id === next.selectedCrewId && alive(c))) next = { ...next, selectedCrewId: null };

  // 3b. knocked-out crew wake up once no enemy is left on board (with a share of their HP)
  const enemiesLeft = crew.some((c) => isEnemy(c) && alive(c));
  crew = crew.map((c) => {
    if (c.ko === undefined) return c;
    if (enemiesLeft) return c.ko === 0 ? c : { ...c, ko: 0 };
    const ko = c.ko + dt;
    return ko < COMBAT.ko_wake_after_s ? { ...c, ko } : { ...c, ko: undefined, hp: Math.max(1, Math.ceil(c.hpMax * COMBAT.ko_wake_share)), idle: 0 };
  });
  next = { ...next, crew };

  // 3c. med bay: own crew standing in a working med bay get medbay_heal_per_s HP once per second until full
  next = { ...next, crew: next.crew.map((c) => {
    const room = roomOf(next, c);
    const heals = !isEnemy(c) && standingStill(c) && c.hp < c.hpMax && !!room && isMedbay(next, room);
    if (!heals) return c.heal === undefined ? c : { ...c, heal: undefined };
    const t = (c.heal ?? 0) + dt;
    return t < 1 ? { ...c, heal: t } : { ...c, heal: t - 1, hp: Math.min(c.hpMax, c.hp + COMBAT.medbay_heal_per_s) };
  }) };

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

  // 5. pairing: crew and enemies in one room pair up on one tile (crew screen-left, enemy screen-right corner).
  next = pairUp(next);

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

/**
 * Opponents in one room pair up 1:1 on a shared tile. The console tile is served first (an operator stays and the
 * enemy comes to them; a free console tile becomes the meeting point); otherwise the enemy walks onto the crew
 * member's tile. When one side has more people, the extras stay alone on their own tiles (and fight from there).
 * Someone already on the way counts by their destination, so nobody is sent twice.
 */
export function pairUp(state: GameState): GameState {
  let next = state;
  const nav = navOf(next.ship);
  const inRoom = (c: CrewMember, room: string) => alive(c) && c.dest.startsWith('t') && next.ship.tiles[Number(c.dest.slice(1))]?.room === room;
  const paired = (c: CrewMember) => next.crew.some((o) => alive(o) && isEnemy(o) !== isEnemy(c) && o.dest === c.dest);
  const rooms = new Set(next.crew.filter((c) => isEnemy(c) && alive(c)).map((c) => roomOf(next, c)).filter((r): r is string => !!r));
  for (const room of rooms) {
    const consoleTile = next.ship.rooms.find((r) => r.id === room)?.console?.tile;
    const consoleNode = consoleTile ? nodeAt(next.ship, nav, consoleTile) : null;
    for (let guard = 0; guard < 16; guard++) {
      const free = next.crew.filter((c) => inRoom(c, room) && standingStill(c) && !paired(c));
      const crew = free.filter((c) => !isEnemy(c));
      const foes = free.filter(isEnemy);
      if (!crew.length || !foes.length) break;
      // console first, then the closest pair
      let best: { c: CrewMember; e: CrewMember; score: number } | null = null;
      for (const c of crew) for (const e of foes) {
        const onConsole = c.dest === consoleNode || e.dest === consoleNode;
        const score = Math.hypot(c.pos[0] - e.pos[0], c.pos[1] - e.pos[1]) - (onConsole ? 1000 : 0);
        if (!best || score < best.score) best = { c, e, score };
      }
      const { c, e } = best!;
      const consoleFree = !!consoleNode && !next.crew.some((o) => o.id !== c.id && o.id !== e.id && alive(o) && o.dest === consoleNode);
      const meet = e.dest === consoleNode ? e.dest : c.dest === consoleNode || !consoleFree ? c.dest : consoleNode!;
      const go = (s: GameState, m: CrewMember) => (m.dest === meet ? s : moveTo(s, m.id, nav.nodes.get(meet)!.pos) ?? s);
      const after = go(go(next, c), e);
      // could not meet (unreachable / taken): stop pairing this room for now – they fight from where they are
      if (after.crew.find((x) => x.id === c.id)!.dest !== meet || after.crew.find((x) => x.id === e.id)!.dest !== meet) break;
      next = after;
    }
  }
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
