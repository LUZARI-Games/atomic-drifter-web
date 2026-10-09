import { describe, expect, it } from 'vitest';
import { defaultRun } from './run';
import { effectText, makeOffer, makeTurret, pick, rng, rollRarity, scrapAll, scrapAllValue, seedFrom, sellValue, TURRET_IDS } from './salvage';

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
      expect(o.turrets).toHaveLength(3);
      expect(new Set(o.turrets.map((t) => t.id)).size).toBe(3);
      const r = o.turrets.map((t) => t.rarity);
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
    expect(next.turrets).toEqual(['beam', offer.turrets[1]!.id]);
    expect(run.turrets).toEqual(['beam']); // pure
    expect(() => pick(run, offer, 3)).toThrow();
  });

  it('scrap all adds loot + all sell values, no turret', () => {
    const run = { ...defaultRun(), scrap: 0, ammo: 0, ammoMax: 10, turrets: [] };
    const offer = makeOffer(9);
    const next = scrapAll(run, offer);
    expect(scrapAllValue(offer)).toBe(offer.turrets.reduce((s, t) => s + t.sell, 0));
    expect(next.scrap).toBe(offer.scrap + scrapAllValue(offer));
    expect(next.ammo).toBe(offer.ammo);
    expect(next.turrets).toEqual([]);
  });
});
