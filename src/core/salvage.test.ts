import { describe, expect, it } from 'vitest';
import { defaultRun } from './run';
import {
  CLASS_INFO,
  EQUIP_IDS,
  effectText,
  itemTypeText,
  LINEUPS,
  makeEquip,
  makeOffer,
  makeTurret,
  normalizeSlots,
  pick,
  presetSlots,
  rng,
  rollRarity,
  scrapAll,
  scrapAllValue,
  seedFrom,
  sellValue,
  TURRET_IDS,
} from './salvage';

describe('salvage', () => {
  it('has the 8 mockup turrets', () => {
    expect(TURRET_IDS).toEqual(['storm', 'pulse', 'beam', 'ion', 'scatter', 'sabre', 'lance', 'mortar']);
  });

  it('rarity applies perks 2..r: fx are appended, other stats replaced', () => {
    expect(makeTurret('storm', 1)).toMatchObject({ proj: 2, fx: [], sell: 10 });
    expect(makeTurret('storm', 3)).toMatchObject({ proj: 3, fx: [['fire', 20]], sell: 25 });
    expect(makeTurret('storm', 5)).toMatchObject({ proj: 4, fx: [['fire', 20], ['breach', 20]], sell: 60 });
    expect(makeTurret('sabre', 2)).toMatchObject({ ammo: 1, fx: [['crew', 30], ['fire', 25]] });
    expect(makeTurret('lance', 4)).toMatchObject({ charges: 4, dmg: 3, cls: 'LANCE' });
    expect(makeTurret('ion', 1).ion).toBe(true);
    // the data itself is never changed by building a turret
    expect(makeTurret('storm', 1).fx).toEqual([]);
  });

  it('sell values per rarity', () => {
    expect([1, 2, 3, 4, 5].map((r) => sellValue(r as 1))).toEqual([10, 15, 25, 40, 60]);
  });

  it('effect texts split into name + value', () => {
    expect(effectText(['fire', 20])).toMatchObject({ name: 'FIRE', value: '20 %' });
    expect(effectText(['stun', 5])).toMatchObject({ name: 'STUN', value: '5 s' });
    expect(effectText(['crew', 15]).info).toContain('15 HP');
  });

  it('same seed -> same offer; 3 different turrets sorted by rarity; loot in range', () => {
    for (let s = 1; s < 200; s++) {
      const o = makeOffer(s);
      expect(makeOffer(s)).toEqual(o);
      expect(o.items).toHaveLength(3);
      expect(new Set(o.items.map((t) => t.id)).size).toBe(3);
      const r = o.items.map((t) => t.rarity);
      expect([...r].sort()).toEqual(r);
      expect(o.scrap).toBeGreaterThanOrEqual(50);
      expect(o.scrap).toBeLessThanOrEqual(90);
      expect(o.scrap % 5).toBe(0);
      expect(o.ammo).toBeGreaterThanOrEqual(1);
      expect(o.ammo).toBeLessThanOrEqual(3);
    }
  });

  it('rarity is weighted towards common', () => {
    const rand = rng(42);
    const n = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 5000; i++) n[rollRarity(rand)]!++;
    expect(n[1]).toBeGreaterThan(n[2]!);
    expect(n[2]).toBeGreaterThan(n[3]!);
    expect(n[3]).toBeGreaterThan(n[4]!);
    expect(n[4]).toBeGreaterThan(n[5]!);
    expect(n[5]).toBeGreaterThan(0);
  });

  it('seed text -> number', () => {
    expect(seedFrom('123')).toBe(123);
    expect(seedFrom('abc')).toBe(seedFrom('abc'));
    expect(seedFrom('abc')).not.toBe(seedFrom('abd'));
  });

  it('pick adds loot (ammo capped) and the turret id', () => {
    const run = { ...defaultRun(), scrap: 100, ammo: 9, ammoMax: 10, turrets: ['beam'] };
    const offer = makeOffer(7);
    const next = pick(run, offer, 1);
    expect(next.scrap).toBe(100 + offer.scrap);
    expect(next.ammo).toBe(10);
    expect(next.turrets).toEqual(['beam', offer.items[1]!.id]);
    expect(run.turrets).toEqual(['beam']); // pure
    expect(() => pick(run, offer, 3)).toThrow();
  });

  it('has the 26 mockup equipment items (weapons, apparel, tools)', () => {
    expect(EQUIP_IDS).toHaveLength(26);
    expect(EQUIP_IDS.slice(0, 3)).toEqual(['knife', 'pistol', 'rifle']);
    expect(EQUIP_IDS).toContain('powerhelm');
    expect(EQUIP_IDS).toContain('grenade');
  });

  it('equipment: categories, slots, types and perks per rarity', () => {
    expect(makeEquip('knife', 1)).toMatchObject({ kind: 'equip', cat: 'WEAPON', slot: 'WEAPON', cls: 'SLASHING', cls2: 'MELEE', tail: '', dps: 2, fx: [] });
    expect(makeEquip('knife', 5)).toMatchObject({ dps: 4, fx: [['heal', 5], ['move', 25]], sell: 60 });
    expect(makeEquip('power', 3)).toMatchObject({ cat: 'APPAREL', slot: 'BODY', cls: 'HEAVY ARMOR', hp: 30, fx: [['res', 'PIERCING'], ['res', 'BLUNT'], ['immune', 'RADIATION']] });
    expect(makeEquip('gasmask', 1)).toMatchObject({ slot: 'HEAD', cls: 'HEADWEAR', hp: 0 });
    expect(makeEquip('stealth', 4)).toMatchObject({ cat: 'TOOL', slot: 'TOOL', cls: 'ACTIVE', tail: 'TOOL', cd: 20 });
    expect(makeEquip('stimpak', 5)).toMatchObject({ cls: 'CONSUMABLE', uses: 5, fx: [['healself', 30], ['radclear']] });
    expect(makeEquip('toolbox', 3)).toMatchObject({ cls: 'PASSIVE', fx: [['repair', 50], ['sabotage', 25]] });
    expect(() => makeEquip('nope', 1)).toThrow();
    expect(itemTypeText('equip', 'maul')).toBe('BLUNT MELEE');
    expect(itemTypeText('equip', 'helmet')).toBe('HEAD');
    expect(itemTypeText('equip', 'telepad')).toBe('ACTIVE');
    expect(itemTypeText('turret', 'beam')).toBe('BEAM');
    for (const id of EQUIP_IDS) {
      const e = makeEquip(id, 5);
      expect(CLASS_INFO[e.cls], `${id} ${e.cls}`).toBeTruthy();
      if (e.cls2) expect(CLASS_INFO[e.cls2]).toBeTruthy();
      for (const f of e.fx) expect(effectText(f).info, `${id} ${f[0]}`).not.toBe('');
    }
  });

  it('equipment effect texts: filled in, split where the label ends in a number', () => {
    expect(effectText(['heal', 5])).toEqual({ name: 'KILLS HEAL', value: '5 HP', info: 'Every kill restores 5 HP to the crew member.' });
    expect(effectText(['immune', 'TOXIC GAS'])).toEqual({ name: 'IMMUNE: TOXIC GAS', value: '', info: 'Not affected by toxic gas at all.' });
    expect(effectText(['typebonus', 1, 'RIFLE'])).toMatchObject({ name: '+1 DPS WITH RIFLES', info: 'The wearer deals 1 more DPS with rifle weapons.' });
    expect(effectText(['stealth', 8])).toMatchObject({ name: 'INVISIBLE', value: '8 S' });
    expect(effectText(['healpow', 50])).toMatchObject({ name: 'HEALING', value: '+50 %' });
    expect(effectText(['slow'])).toMatchObject({ name: 'SLOWS ENEMIES', value: '' });
  });

  it('line-ups: mockup presets per drop type, kept in slot order', () => {
    expect(LINEUPS.map((l) => l.id)).toEqual(['cur', 'ure', 'rel']);
    expect(presetSlots('turret', 'rel')).toEqual([['storm', 3], ['lance', 4], ['mortar', 5]]);
    expect(presetSlots('equip', 'cur')).toEqual([['pistol', 1], ['leather', 2], ['stimpak', 3]]);
    expect(presetSlots('equip', 'nope')).toEqual(presetSlots('equip', 'cur'));
    const o = makeOffer(5, { kind: 'equip', lineup: 'ure' });
    expect(o.kind).toBe('equip');
    expect(o.items.map((i) => [i.id, i.rarity])).toEqual([['carbine', 2], ['helmet', 3], ['stealth', 4]]);
    // loot still comes from the seed
    expect([o.scrap, o.ammo]).toEqual([makeOffer(5).scrap, makeOffer(5).ammo]);
    expect(makeOffer(5, { lineup: 'cur' }).items.map((i) => i.id)).toEqual(['storm', 'pulse', 'sabre']);
  });

  it('own slot picks override the line-up; broken picks fall back per slot', () => {
    const o = makeOffer(1, { kind: 'turret', lineup: 'cur', slots: [['mortar', 5], ['ion', 1], ['beam', 2]] });
    expect(o.items.map((i) => [i.id, i.rarity])).toEqual([['mortar', 5], ['ion', 1], ['beam', 2]]);
    expect(normalizeSlots('equip', [['knife', 9], ['nope', 2], null], 'rel')).toEqual([['knife', 3], ['power', 2], ['telepad', 5]]);
    expect(normalizeSlots('turret', 'garbage', 'ure')).toEqual(presetSlots('turret', 'ure'));
  });

  it('random equipment offer: 3 different items sorted by rarity', () => {
    for (let s = 1; s < 50; s++) {
      const o = makeOffer(s, { kind: 'equip' });
      expect(o.items.every((i) => i.kind === 'equip')).toBe(true);
      expect(new Set(o.items.map((i) => i.id)).size).toBe(3);
      const r = o.items.map((i) => i.rarity);
      expect([...r].sort()).toEqual(r);
    }
  });

  it('picking equipment stores equip:<id> in the run', () => {
    const run = { ...defaultRun(), turrets: ['beam'] };
    const offer = makeOffer(3, { kind: 'equip', lineup: 'cur' });
    expect(pick(run, offer, 2).turrets).toEqual(['beam', 'equip:stimpak']);
    expect(scrapAllValue(offer)).toBe(10 + 15 + 25);
  });

  it('scrap all adds loot + all sell values, no turret', () => {
    const run = { ...defaultRun(), scrap: 0, ammo: 0, ammoMax: 10, turrets: [] };
    const offer = makeOffer(9);
    const next = scrapAll(run, offer);
    expect(scrapAllValue(offer)).toBe(offer.items.reduce((s, t) => s + t.sell, 0));
    expect(next.scrap).toBe(offer.scrap + scrapAllValue(offer));
    expect(next.ammo).toBe(offer.ammo);
    expect(next.turrets).toEqual([]);
  });
});
