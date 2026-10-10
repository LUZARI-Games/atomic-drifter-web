import { describe, expect, it } from 'vitest';
import { defaultRun, type RunState } from './run';
import {
  levelOrNull,
  REACTOR,
  UPGRADE_SYSTEMS,
  availableScrap,
  confirmUpgrades,
  denyText,
  effectiveLevel,
  effectiveReactor,
  emptyPending,
  installStep,
  pendingCost,
  pendingCount,
  queueBar,
  queueLevel,
  reactorBarCost,
  reactorRows,
  removeBar,
  removeLevel,
  systemRows,
  undoAll,
  type Pending,
} from './upgrades';
import SYSTEMS from '../data/systems.json';

const run = (over: Partial<RunState> = {}): RunState => ({ ...defaultRun(), scrap: 250, ...over });

function q(r: RunState, p: Pending, id: string): Pending {
  const res = queueLevel(r, p, id);
  if (!res.ok) throw new Error(res.deny.code);
  return res.pending;
}

describe('upgrades data', () => {
  it('ids match systems.json and arrays fit max', () => {
    for (const s of UPGRADE_SYSTEMS) {
      expect(Object.keys(SYSTEMS)).toContain(s.id);
      expect(s.cost.length).toBe(s.max);
      expect(s.effects.length).toBe(s.max);
      expect(s.buyMax).toBeLessThanOrEqual(s.max);
    }
    expect(REACTOR.groupCosts.length * REACTOR.groupSize).toBe(REACTOR.max);
  });
});

describe('upgrades rules', () => {
  it('effective level: run value or data start', () => {
    expect(effectiveLevel(run(), 'engine')).toBe(2);
    expect(effectiveLevel(run({ systems: { engine: 5 } }), 'engine')).toBe(5);
    expect(effectiveReactor(run())).toBe(20);
    expect(effectiveReactor(run({ reactor: 22 }))).toBe(22);
  });

  it('queues a level and counts its cost', () => {
    const r = run();
    const p = q(r, emptyPending(), 'engine'); // engine 2 -> 3 costs 15
    expect(p.systems.engine).toBe(1);
    expect(pendingCost(r, p)).toBe(15);
    const p2 = q(r, p, 'engine'); // 3 -> 4 costs 30
    expect(pendingCost(r, p2)).toBe(45);
    expect(availableScrap(r, p2)).toBe(205);
  });

  it('refuses beyond max', () => {
    const res = queueLevel(run({ systems: { engine: 8 } }), emptyPending(), 'engine');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.deny.code).toBe('max');
  });

  it('refuses manning-only levels', () => {
    const res = queueLevel(run({ systems: { doors: 3 } }), emptyPending(), 'doors');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.deny.code).toBe('manned');
      expect(denyText(res.deny).text).toBe('DOORS LVL 4 IS ONLY REACHED BY MANNING THE CONSOLE.');
    }
  });

  it('refuses when scrap (incl. already queued) is short', () => {
    const r = run({ scrap: 150 });
    const p = q(r, emptyPending(), 'shields'); // 2 -> 3 costs 20 (index: cost[2])
    expect(pendingCost(r, p)).toBe(20);
    const p2 = q(r, p, 'medbay'); // 1 -> 2 costs 35
    const p3 = q(r, p2, 'medbay'); // 2 -> 3 costs 45 -> 100 queued, 50 left
    const res = queueLevel(r, p3, 'crewteleporter'); // 1 -> 2 costs 30 ok
    expect(res.ok).toBe(true);
    const r2 = run({ scrap: 120 });
    const res2 = queueLevel(r2, p3, 'crewteleporter'); // 20 left < 30
    expect(res2.ok).toBe(false);
    if (!res2.ok) expect(res2.deny).toMatchObject({ code: 'scrap', need: 30, have: 20 });
  });

  it('removes only queued levels', () => {
    const r = run();
    const p = q(r, emptyPending(), 'weapons');
    expect(removeLevel(p, 'weapons')).toEqual(emptyPending());
    expect(removeLevel(emptyPending(), 'weapons')).toEqual(emptyPending());
  });

  it('reactor bars: group prices, max, scrap', () => {
    expect([1, 5, 6, 10, 11, 16, 21, 25].map(reactorBarCost)).toEqual([30, 30, 20, 20, 25, 30, 35, 35]);
    const r = run({ scrap: 80 });
    let p = emptyPending();
    for (let i = 0; i < 2; i++) {
      const res = queueBar(r, p);
      expect(res.ok).toBe(true);
      if (res.ok) p = res.pending;
    }
    expect(pendingCost(r, p)).toBe(70);
    const res = queueBar(r, p);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.deny.code).toBe('scrap');
    expect(removeBar(p).reactor).toBe(1);
    const full = queueBar(run({ reactor: 25 }), emptyPending());
    expect(!full.ok && full.deny.code).toBe('max');
  });

  it('undo all clears the queue', () => {
    expect(pendingCount(undoAll())).toBe(0);
  });

  it('confirm pays and raises levels; empty confirm is denied', () => {
    const r = run();
    let p = q(r, emptyPending(), 'engine');
    p = q(r, p, 'engine');
    p = q(r, p, 'cockpit');
    const b = queueBar(r, p);
    if (b.ok) p = b.pending;
    const total = pendingCost(r, p);
    const res = confirmUpgrades(r, p);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.paid).toBe(total);
      expect(res.run.scrap).toBe(250 - total);
      expect(res.run.systems.engine).toBe(4);
      expect(res.run.systems.cockpit).toBe(2);
      expect(res.run.systems.shields).toBe(2);
      expect(res.run.reactor).toBe(21);
    }
    const none = confirmUpgrades(r, emptyPending());
    expect(!none.ok && none.deny.code).toBe('none');
  });

  it('install step installs one level per queued system', () => {
    const r = run();
    let p = q(r, emptyPending(), 'engine');
    p = q(r, p, 'engine');
    p = q(r, p, 'drones');
    const s = installStep(r, p);
    expect(s.installed).toEqual(['engine', 'drones']);
    expect(s.run.systems.engine).toBe(3);
    expect(s.pending.systems).toEqual({ engine: 1 });
    expect(s.paid).toBe(15 + 30);
  });

  it('detail rows show installed / queued / next / manned', () => {
    const r = run({ systems: { doors: 2 } });
    const p = q(r, emptyPending(), 'doors');
    const rows = systemRows(r, p, 'doors');
    expect(rows.map((x) => x.state)).toEqual(['owned', 'owned', 'pend', 'next']);
    expect(rows[3]?.cost).toBe('MANNED ONLY');
    expect(systemRows(run(), emptyPending(), 'engine')[2]?.cost).toBe('NEXT · 15 SCRAP');
    expect(reactorRows(run(), emptyPending()).map((x) => x.state)).toEqual(['owned', 'owned', 'owned', 'owned', 'next']);
  });
});

describe('levelOrNull', () => {
  it('gives the level of upgradeable systems and null for others (reactor, unknown) instead of throwing', () => {
    const run = defaultRun();
    expect(levelOrNull(run, 'weapons')).toBeGreaterThan(0);
    expect(levelOrNull(run, 'reactor')).toBeNull();
    expect(levelOrNull(run, 'nonsense')).toBeNull();
  });
});
