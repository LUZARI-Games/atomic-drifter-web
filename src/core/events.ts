// Game events read from two consecutive states (for sounds now, later for logs / UI): who got knocked out, which
// system was wrecked, when boarders arrived … Pure and engine-neutral; the ids match src/data/sounds.json.
import { systemBars } from './combat';
import type { Mood } from './mood';
import { navOf } from './crewmove';
import { nodeAt } from './nav';
import type { CrewMember, GameState, Point } from './types';

const isEnemy = (c: CrewMember) => c.side === 'enemy';
const fighting = (c: CrewMember) => isEnemy(c) && c.dying === undefined && c.hp > 0;

/** Event ids that happened between `prev` and `next` (each at most once per call). */
export function stateEvents(prev: GameState, next: GameState): string[] {
  const out = new Set<string>();
  const before = new Map(prev.crew.map((c) => [c.id, c]));
  const foesBefore = prev.crew.filter(fighting).length;
  const foesNow = next.crew.filter(fighting).length;
  if (next.crew.some((c) => isEnemy(c) && !before.has(c.id))) out.add('boarder_alarm');
  if (foesBefore > 0 && foesNow === 0) out.add('fight_won');
  for (const c of next.crew) {
    const b = before.get(c.id);
    if (!b) continue;
    if (b.ko === undefined && c.ko !== undefined) out.add('crew_ko');
    if (b.ko !== undefined && c.ko === undefined) out.add('crew_wake');
    const inCar = (n: string) => n.startsWith('v');
    if (!inCar(b.node) && inCar(c.node)) out.add('vehicle_enter');
    if (inCar(b.node) && !inCar(c.node)) out.add('vehicle_exit');
  }
  for (const [room, dmg] of Object.entries(next.systemDamage)) {
    const was = prev.systemDamage[room] ?? 0;
    const bars = systemBars(next, room);
    if (bars && dmg >= bars && was < bars) out.add('system_wrecked');
  }
  for (const [room, was] of Object.entries(prev.systemDamage)) if (was > 0 && !next.systemDamage[room]) out.add('system_repaired');
  return [...out];
}

/** Mood sounds: a crew member who just started chatting (teller), turned wary or sat down bored. */
export function moodEvents(prev: Map<string, Mood>, next: Map<string, Mood>): string[] {
  const out = new Set<string>();
  for (const [id, m] of next) {
    const p = prev.get(id);
    if (m.kind === 'chat' && m.role === 'teller' && p?.kind !== 'chat') out.add('mood_chat');
    if (m.kind === 'wary' && p?.kind !== 'wary') out.add('mood_wary');
    if (m.kind === 'bored' && m.sit >= 1 && !(p?.kind === 'bored' && p.sit >= 1)) out.add('mood_bored');
  }
  return [...out];
}

/**
 * A tap that tried to send the selected crew member into another room and was refused (room full / unreachable):
 * same person still selected, destination unchanged.
 */
export function orderRefused(prev: GameState, next: GameState, p: Point): boolean {
  const id = prev.selectedCrewId;
  if (!id || next.selectedCrewId !== id) return false;
  const before = prev.crew.find((c) => c.id === id);
  const after = next.crew.find((c) => c.id === id);
  if (!before || !after || after.dest !== before.dest) return false;
  const node = nodeAt(prev.ship, navOf(prev.ship), p);
  if (!node) return false;
  const roomOfNode = (n: string) => (n.startsWith('t') ? prev.ship.tiles[Number(n.slice(1))]?.room ?? null : n);
  return roomOfNode(node) !== roomOfNode(before.dest);
}
