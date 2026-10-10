import { describe, expect, it } from 'vitest';
import COMBAT from '../data/combat.json';
import demo from '../data/demo_ship.json';
import { spawnEnemy, spawnShipEnemies } from './combat';
import { applyPatches, characterHp, cleanRecord, NO_FACTION_COLOR, parseCrewDb, PATCHES, rosterFrom, SEED_DB, toId } from './crewdb';
import { generateCrew, placedCrew } from './crewmove';
import { createGameState } from './selection';
import { parseShip } from './ship';
import type { GameState } from './types';

const ship = parseShip(demo).ship!;

describe('crew database records', () => {
  it('cleans characters: upper-case name, known values only, default hit, bad ids dropped', () => {
    const c = cleanRecord('characters', { name: ' bolt ', side: 'x', build: 'tank', faction: 'Bad Id!', hp: '33', portrait: 'bolt', attrs: [{ name: 'piloting', value: '2' }, { name: '' }], extra: 1 });
    expect(c).toEqual({ name: 'BOLT', side: 'crew', faction: null, build: 'tank', sex: 'male', hp: 33, hit: COMBAT.hit_damage, portrait: 'bolt', body: 'human', attrs: [{ name: 'PILOTING', value: '2' }], notes: '' });
    expect(cleanRecord('characters', { name: '' })).toBeNull();
  });

  it('factions keep a valid colour, portraits only site-local image paths', () => {
    expect(cleanRecord('factions', { name: 'Iron Mall', color: 'red' })).toEqual({ name: 'IRON MALL', color: '#86902a', notes: '' });
    expect(cleanRecord('portraits', { file: '/portraits/bolt.webp' })).toEqual({ file: '/portraits/bolt.webp' });
    expect(cleanRecord('portraits', { file: 'https://evil.example/x.png' })).toBeNull();
    expect(toId('Iron Mall Citizen')).toBe('iron_mall_citizen');
  });

  it('parses a whole database and skips broken records', () => {
    const db = parseCrewDb({ characters: { ok: { name: 'A' }, 'BAD ID': { name: 'B' }, empty: {} }, factions: 'nope' });
    expect(Object.keys(db.characters)).toEqual(['ok']);
    expect(db.factions).toEqual({});
  });

  it('patches: merge changes only the given fields, set creates; missing records are not merged into existence', () => {
    const base = parseCrewDb({ characters: { a: { name: 'A', build: 'tank', notes: 'keep' } } });
    const out = applyPatches(base, [{ id: 'p1', writes: [
      { op: 'merge', collection: 'characters', id: 'a', data: { faction: 'raider' } },
      { op: 'merge', collection: 'characters', id: 'ghost', data: { name: 'G' } },
      { op: 'set', collection: 'factions', id: 'subjects', data: { name: 'Subjects', color: '#7a4a8c' } },
    ] }]);
    expect(out.characters.a).toMatchObject({ faction: 'raider', build: 'tank', notes: 'keep' });
    expect(out.characters.ghost).toBeUndefined();
    expect(out.factions.subjects?.name).toBe('SUBJECTS');
  });

  it("the owner's faction pass is in the shipped data (Oswald, Clementine, Tesla Traders, Subjects)", () => {
    expect(SEED_DB.characters.super_mutant_leader).toMatchObject({ name: 'OSWALD', faction: 'subjects' });
    expect(SEED_DB.characters.female_fighter?.name).toBe('CLEMENTINE');
    expect(SEED_DB.characters.daisy?.faction).toBe('tesla_traders');
    expect(SEED_DB.characters.enemy_tank?.faction).toBe('sentinel');
    expect(SEED_DB.characters.bolt).toMatchObject({ faction: 'ironmall', build: 'tank' });
    expect(PATCHES.every((p) => p.writes.every((w) => w.op === 'set' || SEED_DB[w.collection][w.id]))).toBe(true);
  });

  it('body types: Neh + Oswald are super mutants; unknown bodies become human', () => {
    expect(SEED_DB.characters.neh?.body).toBe('super_mutant');
    expect(SEED_DB.characters.super_mutant_leader?.body).toBe('super_mutant');
    expect(SEED_DB.characters.reginald).toMatchObject({ side: 'enemy', faction: 'slaver_guild', body: 'ghoul' });
    expect(SEED_DB.characters.dr_mitchell).toMatchObject({ side: 'crew', faction: 'ironmall', body: 'ghoul' });
    expect((cleanRecord('characters', { name: 'X', body: 'robot' }) as { body: string }).body).toBe('human');
  });

  it('the roster carries the faction colour as clothes (grey without a faction) and the body', () => {
    const r = rosterFrom(SEED_DB);
    const neh = r.crew.find((c) => c.id === 'neh')!;
    expect(neh.clothes).toBe(SEED_DB.factions.subjects!.color);
    expect(neh.body).toBe('super_mutant');
    expect(rosterFrom(parseCrewDb({ characters: { a: { name: 'A' } } })).crew[0]!.clothes).toBe(NO_FACTION_COLOR);
    const crew = generateCrew(ship, 2, 7, { ...r, crew: [neh] });
    expect(crew[1]!.look).toMatchObject({ body: 'super_mutant', clothes: neh.clothes });
  });

  it('the shipped seed has characters, factions and portraits', () => {
    expect(Object.keys(SEED_DB.characters).length).toBeGreaterThan(10);
    expect(Object.keys(SEED_DB.factions).length).toBeGreaterThanOrEqual(4);
    expect(SEED_DB.characters.bolt?.build).toBe('tank');
  });
});

describe('roster for the game', () => {
  const roster = rosterFrom(SEED_DB);
  it('splits captain / crew / enemies; HP default by side + build', () => {
    expect(roster.captain?.portrait).toBe('power_armor');
    expect(roster.crew.every((c) => c.side === 'crew')).toBe(true);
    expect(roster.enemies.every((c) => c.side === 'enemy')).toBe(true);
    expect(characterHp({ side: 'enemy', build: 'tank', hp: null })).toBe(COMBAT.hp.enemy.tank);
    expect(characterHp({ side: 'crew', build: 'normal', hp: 50 })).toBe(50);
  });

  it('generateCrew takes its people from the database (captain first, names, HP, faction look)', () => {
    const crew = generateCrew(ship, 4, 7, roster);
    expect(crew[0]!.captain).toBe(true);
    expect(crew[0]!.portrait).toBe('power_armor');
    const names = new Set([...roster.crew, roster.captain!].map((c) => c.name));
    expect(crew.every((c) => names.has(c.name))).toBe(true);
    const bolt = roster.crew.find((c) => c.id === 'bolt')!;
    const one = generateCrew(ship, 2, 7, { ...roster, crew: [bolt] })[1]!;
    expect(one.hpMax).toBe(COMBAT.hp.crew.tank);
    expect(one.look.origin).toBe('ironmall');
  });

  it('boarders come from the database enemies', () => {
    let s: GameState = { ...createGameState(ship), crew: [], roster };
    s = spawnEnemy(s, [3, 1]);
    const e = s.crew[0]!;
    expect(roster.enemies.some((x) => x.name === e.name && x.hp === e.hpMax)).toBe(true);
  });
});

describe('crew placed in the planner', () => {
  const roster = rosterFrom(SEED_DB);
  const withCrew = (crew: unknown[]) => parseShip({ ...demo, crew }).ship!;

  it('placed own crew spawn on their tiles, the marked captain first; unknown ids and duplicates are skipped', () => {
    const s = withCrew([
      { side: 'crew', tile: [3, 1], id: 'chuck' },
      { side: 'crew', tile: [3, -1], id: 'daisy', captain: true },
      { side: 'crew', tile: [1, 3], id: 'nobody' },
      { side: 'crew', tile: [1, 1], id: 'chuck' },
    ]);
    const crew = placedCrew(s, roster);
    expect(crew.map((c) => c.name)).toEqual(['DAISY', 'CHUCK']);
    expect(crew[0]!.captain).toBe(true);
    expect(crew[1]!.pos).toEqual([3, 1]);
  });

  it('nobody placed -> empty (the game falls back to random crew)', () => {
    expect(placedCrew(withCrew([{ side: 'enemy', tile: [3, 1] }]), roster)).toEqual([]);
  });

  it('a chosen enemy spawns as that database character; no id = random database enemy', () => {
    const s = withCrew([{ side: 'enemy', tile: [3, 1], id: 'super_mutant_leader' }, { side: 'enemy', tile: [3, -1] }]);
    expect(s.crew?.[0]).toEqual({ side: 'enemy', tile: [3, 1], id: 'super_mutant_leader' });
    const g = spawnShipEnemies({ ...createGameState(s), crew: [], roster });
    expect(g.crew[0]!.name).toBe('OSWALD');
    expect(g.crew[0]!.hpMax).toBe(COMBAT.hp.enemy.tank);
    expect(g.crew).toHaveLength(2);
  });
});
