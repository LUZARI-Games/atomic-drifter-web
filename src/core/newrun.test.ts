import { describe, expect, it } from 'vitest';
import { defaultRun } from './run';
import {
  NEW_RUN,
  buildRun,
  canStart,
  cleanName,
  defaultSettings,
  nextShipName,
  sanitizeName,
  selectDifficulty,
  startBlock,
  startLabel,
  toggleModifier,
} from './newrun';

const open = NEW_RUN.modifiers.filter((m) => !m.locked).map((m) => m.id);
const lockedMod = NEW_RUN.modifiers.find((m) => m.locked)!.id;

describe('new run', () => {
  it('starts with the default ship, no captain, NORMAL, no modifiers', () => {
    const s = defaultSettings();
    expect(s.shipName).toBe('SENTINEL DESERTER');
    expect(s.captainName).toBe('');
    expect(s.difficulty).toBe('normal');
    expect(s.modifiers).toEqual([]);
  });

  it('names: uppercase, max length, trimmed', () => {
    expect(sanitizeName('iron mule')).toBe('IRON MULE');
    expect(sanitizeName('x'.repeat(30))).toHaveLength(NEW_RUN.name_max_length);
    expect(cleanName('  big   bertha ')).toBe('BIG BERTHA');
  });

  it('reroll cycles through the list (first press = 2nd name)', () => {
    let s = defaultSettings();
    s = nextShipName(s);
    expect(s.shipName).toBe('VAGRANT');
    for (let i = 0; i < NEW_RUN.ship_names.length - 1; i++) s = nextShipName(s);
    expect(s.shipName).toBe('FRONTIER');
  });

  it('locked difficulties are refused', () => {
    const s = defaultSettings();
    expect(selectDifficulty(s, 'easy').settings.difficulty).toBe('easy');
    const r = selectDifficulty(s, 'hard');
    expect(r.denied).toBe('locked');
    expect(r.settings.difficulty).toBe('normal');
  });

  it('modifiers toggle, max 4, locked refused', () => {
    let s = defaultSettings();
    for (const id of open.slice(0, 4)) s = toggleModifier(s, id).settings;
    expect(s.modifiers).toHaveLength(4);
    const over = toggleModifier(s, open[4]!);
    expect(over.denied).toBe('limit');
    expect(over.settings.modifiers).toHaveLength(4);
    s = toggleModifier(s, open[0]!).settings;
    expect(s.modifiers).not.toContain(open[0]);
    expect(toggleModifier(s, lockedMod).denied).toBe('locked');
  });

  it('start needs a ship name, then a captain', () => {
    const s = defaultSettings();
    expect(startBlock({ ...s, shipName: '  ' })).toBe('no_ship_name');
    expect(startLabel({ ...s, shipName: '' })).toBe('NAME YOUR SHIP');
    expect(startBlock(s)).toBe('no_captain_name');
    expect(startLabel(s)).toBe('ENTER CAPTAIN');
    expect(canStart({ ...s, captainName: 'ahmet' })).toBe(true);
    expect(startLabel({ ...s, captainName: 'ahmet' })).toBe('[ENTER] START RUN');
  });

  it('buildRun applies names, difficulty and modifier effects', () => {
    let s = { ...defaultSettings(), captainName: ' ahmet ', difficulty: 'easy' };
    for (const id of ['reinforced_hull', 'missile_cache', 'scrap_stash', 'overcharged_reactor']) s = toggleModifier(s, id).settings;
    const run = buildRun(s);
    const d = defaultRun();
    expect(run.shipName).toBe('SENTINEL DESERTER');
    expect(run.captainName).toBe('AHMET');
    expect(run.difficulty).toBe('easy');
    expect(run.hullMax).toBe(d.hullMax + 5);
    expect(run.hull).toBe(d.hull + 5);
    expect(run.ammo).toBe(d.ammo + 5);
    expect(run.ammoMax).toBe(d.ammoMax + 5);
    expect(run.scrap).toBe(d.scrap + 50);
    expect(run.reactor).toBe(d.reactor + 2);
    expect(run.modifiers).toHaveLength(4);
  });

  it('buildRun: spare turret is owned; locked / bogus input is ignored', () => {
    const run = buildRun({ ...defaultSettings(), captainName: 'A', difficulty: 'hard', modifiers: ['spare_turret', lockedMod, 'nope'] });
    expect(run.turrets).toEqual(['spare_turret']);
    expect(run.modifiers).toEqual(['spare_turret']);
    expect(run.difficulty).toBe('normal');
  });
});
