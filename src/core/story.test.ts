import { describe, expect, it } from 'vitest';
import { rosterFrom, SEED_DB } from './crewdb';
import { generateCrew } from './crewmove';
import { answer, dialogById, eventsAhead, fillText, nameList } from './dialog';
import { defaultRun, parseRun } from './run';
import { parseShip } from './ship';
import { markBriefed, needsIntro, PAUSE_NAME, START_FACTION, startOf, startRoster } from './story';
import DEMO from '../data/demo_ship.json';

const ship = parseShip(DEMO).ship!;
const roster = rosterFrom(SEED_DB);

describe('run premise', () => {
  it('the opening shows once per run (old saves without the flag show it once too)', () => {
    const run = defaultRun();
    expect(needsIntro(run)).toBe(true);
    expect(needsIntro(markBriefed(run))).toBe(false);
    expect(needsIntro(parseRun(JSON.parse(JSON.stringify(markBriefed(run)))))).toBe(false);
    expect(needsIntro(parseRun({ shipName: 'OLD' }))).toBe(true);
    expect(PAUSE_NAME).toBe('P.A.U.S.E. – PROMETHEUS ATOMIC UNIVERSAL STASIS ENGINE');
  });

  it('Iron Mall start: the captain + Bolt, Samantha and Kaan; EXTRA RECRUIT adds one more', () => {
    const { roster: r, count } = startRoster(roster, defaultRun());
    expect(count).toBe(4);
    const crew = generateCrew(ship, count, 7, r, START_FACTION);
    expect(crew[0]!.captain).toBe(true);
    expect(crew.slice(1).map((c) => c.name).sort()).toEqual(['BOLT', 'KAAN', 'SAMANTHA']);
    expect(startRoster(roster, { ...defaultRun(), modifiers: ['extra_recruit'] }).count).toBe(5);
    expect(startOf('nobody').home).toBe('IRON MALL');
  });
});

describe('dialogs', () => {
  const d = dialogById(startOf().dialog)!;
  it('every answer leads to a node or ends; the conversation reaches its end', () => {
    for (const n of Object.values(d.nodes)) for (const o of n.options) expect(o.next === null || o.next in d.nodes).toBe(true);
    let node: string | null = d.start;
    for (let i = 0; i < 20 && node; i++) node = answer(d, node, 0);
    expect(node).toBeNull();
  });
  it('the enemy ship arrives on the way – SKIP still triggers it', () => {
    expect(eventsAhead(d, d.start)).toEqual(['foe_arrives']);
    expect(eventsAhead(d, null)).toEqual([]);
  });
  it('fills names', () => {
    expect(nameList(['BOLT', 'SAMANTHA', 'KAAN'])).toBe('Bolt, Samantha and Kaan');
    expect(fillText('{ship}, {x}', { ship: 'RUSTY' })).toBe('RUSTY, {x}');
  });
});
