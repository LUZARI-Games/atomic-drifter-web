// Crew moods while standing around (no fight, not walking): bored when alone with nothing to do, chatting with
// someone of the same origin (the one not operating a system tells a story, the other listens), wary of crew from a
// different origin in the same room. Pure function of the state – the renderer turns it into animations.
import COMBAT from '../data/combat.json';
import { roomOf } from './combat';
import { atDesk, moveTo, navOf } from './crewmove';
import type { CrewMember, GameState } from './types';

export type Mood =
  | { kind: 'bored'; sit: number } // sit: 0 standing … 1 sitting on the floor
  | { kind: 'chat'; role: 'teller' | 'listener'; partner: string }
  | { kind: 'wary'; other: string };

const calm = (c: CrewMember) => c.side !== 'enemy' && c.dying === undefined && c.ko === undefined && !c.fight && !c.path.length;

/** Mood of every own crew member that has one (id -> mood). */
export function moods(state: GameState): Map<string, Mood> {
  const out = new Map<string, Mood>();
  const enemyRooms = new Set(state.crew.filter((c) => c.side === 'enemy' && c.dying === undefined).map((c) => roomOf(state, c)));
  const byRoom = new Map<string, CrewMember[]>();
  for (const c of state.crew) {
    if (!calm(c)) continue;
    const room = roomOf(state, c);
    if (!room || enemyRooms.has(room)) continue; // no small talk while boarders are around
    byRoom.set(room, [...(byRoom.get(room) ?? []), c]);
  }
  const dist = (a: CrewMember, b: CrewMember) => Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]);
  for (const group of byRoom.values()) {
    for (const c of group) {
      const others = group.filter((o) => o.id !== c.id);
      const kin = others.filter((o) => o.look.origin === c.look.origin);
      if (kin.length) {
        const partner = kin.reduce((a, b) => (dist(b, c) < dist(a, c) ? b : a));
        // the one NOT operating a system tells the story; if neither / both do, the lower id tells
        const me = atDesk(state.ship, c);
        const them = atDesk(state.ship, partner);
        const teller = me === them ? c.id < partner.id : !me;
        out.set(c.id, { kind: 'chat', role: teller ? 'teller' : 'listener', partner: partner.id });
        continue;
      }
      if (others.length) {
        const other = others.reduce((a, b) => (dist(b, c) < dist(a, c) ? b : a));
        out.set(c.id, { kind: 'wary', other: other.id });
        continue;
      }
      const idle = c.idle ?? 0;
      if (!atDesk(state.ship, c) && idle >= COMBAT.bored_after_s) {
        const sit = Math.min(1, Math.max(0, (idle - COMBAT.sit_after_s) / 1.2));
        out.set(c.id, { kind: 'bored', sit });
      }
    }
  }
  return out;
}

/**
 * Distrust keeps distance: when two wary crew members stand on the same tile, the one who is not operating a
 * system walks to the tile of the room farthest from the other (once they have stood there a moment).
 */
export function keepDistance(state: GameState): GameState {
  let s = state;
  const m = moods(state);
  const nav = navOf(state.ship);
  for (const [id, mood] of m) {
    if (mood.kind !== 'wary') continue;
    const c = s.crew.find((x) => x.id === id)!;
    const other = s.crew.find((x) => x.id === mood.other);
    if (!other || other.node !== c.node || (c.idle ?? 0) < 1.5 || atDesk(s.ship, c)) continue;
    if (!atDesk(s.ship, other) && c.id < other.id) continue; // only one of the two moves
    const room = roomOf(s, c);
    let best: { d: number; p: [number, number] } | null = null;
    s.ship.tiles.forEach((t, i) => {
      if (t.room !== room || t.machinery || !nav.nodes.has(`t${i}`) || `t${i}` === c.node) return;
      const d = Math.hypot(t.center[0] - other.pos[0], t.center[1] - other.pos[1]);
      if (!best || d > best.d) best = { d, p: t.center as [number, number] };
    });
    const target = best as { d: number; p: [number, number] } | null;
    if (target) s = moveTo(s, id, target.p) ?? s;
  }
  return s;
}
