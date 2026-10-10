// Ship Upgrades rules: buy system levels and reactor bars with scrap. Pure functions (engine-neutral);
// the screen is src/ui/upgrades.ts, the numbers live in src/data/upgrades.json.
// Flow: queue levels/bars (pending, nothing paid yet) -> CONFIRM installs them step by step and pays the scrap.
import DATA from '../data/upgrades.json';
import SYSTEMS from '../data/systems.json';
import type { RunState } from './run';

export type SystemKind = 'main' | 'sub';

export interface UpgradeSystem {
  id: string;
  name: string;
  type: SystemKind;
  max: number;
  buyMax: number; // highest level you can buy (above = only by manning the console)
  start: number;
  cost: number[]; // cost[L - 1] = scrap to reach level L
  effects: string[]; // effects[L - 1] = what level L does
  note: string;
}

export interface ReactorData {
  start: number;
  max: number;
  groupSize: number;
  groupCosts: number[];
}

const NAMES = SYSTEMS as Record<string, { name: string }>;

export const UPGRADE_SYSTEMS: UpgradeSystem[] = DATA.systems.map((s) => ({
  id: s.id,
  name: NAMES[s.id]?.name ?? s.id.toUpperCase(),
  type: s.type as SystemKind,
  max: s.max,
  buyMax: s.buy_max,
  start: s.start,
  cost: s.cost,
  effects: s.effects,
  note: s.note,
}));

export const REACTOR: ReactorData = {
  start: DATA.reactor.start,
  max: DATA.reactor.max,
  groupSize: DATA.reactor.group_size,
  groupCosts: DATA.reactor.group_costs,
};

export const STARTING_SCRAP: number = DATA.starting_scrap;

export function systemById(id: string): UpgradeSystem {
  const s = UPGRADE_SYSTEMS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown upgrade system ${id}`);
  return s;
}

/** Queued (not yet paid) upgrades: extra levels per system id + extra reactor bars. */
export interface Pending {
  systems: Record<string, number>;
  reactor: number;
}

export const emptyPending = (): Pending => ({ systems: {}, reactor: 0 });

/** Why a purchase was refused (ACCESS DENIED). */
export type DenyCode = 'max' | 'manned' | 'scrap' | 'none';
export interface Deny {
  code: DenyCode;
  target: string; // system id, 'reactor' or 'confirm'
  name: string;
  need?: number;
  have?: number;
  level?: number; // manned-only level
}

export type QueueResult = { ok: true; pending: Pending } | { ok: false; deny: Deny };

/** Installed level: the run's value, or the data start level when the run has none yet. */
export function effectiveLevel(run: RunState, id: string): number {
  const v = run.systems[id];
  return typeof v === 'number' && v > 0 ? v : systemById(id).start;
}

/** Installed level of a ship room's system, or null when it is not an upgradeable system (e.g. reactor, airlock). */
export function levelOrNull(run: RunState, id: string): number | null {
  return UPGRADE_SYSTEMS.some((x) => x.id === id) ? effectiveLevel(run, id) : null;
}

/** Installed reactor bars (0 in the run = not set yet -> data start). */
export function effectiveReactor(run: RunState): number {
  return run.reactor > 0 ? run.reactor : REACTOR.start;
}

export const pendingOf = (p: Pending, id: string): number => p.systems[id] ?? 0;

/** Scrap for system level L (L = 1…max). */
export function levelCost(sys: UpgradeSystem, level: number): number {
  return sys.cost[level - 1] ?? 0;
}

/** Scrap for reactor bar n (1-based). */
export function reactorBarCost(n: number): number {
  const g = Math.min(REACTOR.groupCosts.length - 1, Math.max(0, Math.floor((n - 1) / REACTOR.groupSize)));
  return REACTOR.groupCosts[g] ?? 0;
}

/** Total scrap of everything queued. */
export function pendingCost(run: RunState, p: Pending): number {
  let total = 0;
  for (const sys of UPGRADE_SYSTEMS) {
    const lv = effectiveLevel(run, sys.id);
    for (let k = 1; k <= pendingOf(p, sys.id); k++) total += levelCost(sys, lv + k);
  }
  const r = effectiveReactor(run);
  for (let k = 1; k <= p.reactor; k++) total += reactorBarCost(r + k);
  return total;
}

/** Number of queued levels + bars. */
export function pendingCount(p: Pending): number {
  return Object.values(p.systems).reduce((a, b) => a + b, 0) + p.reactor;
}

/** Scrap still free after paying for the queue. */
export function availableScrap(run: RunState, p: Pending): number {
  return run.scrap - pendingCost(run, p);
}

/** Why the next level of this system cannot be queued, or null if it can. */
export function canQueueLevel(run: RunState, p: Pending, id: string): Deny | null {
  const sys = systemById(id);
  const tot = effectiveLevel(run, id) + pendingOf(p, id);
  if (tot >= sys.max) return { code: 'max', target: id, name: sys.name };
  if (tot >= sys.buyMax) return { code: 'manned', target: id, name: sys.name, level: sys.max };
  const need = levelCost(sys, tot + 1);
  const have = availableScrap(run, p);
  if (need > have) return { code: 'scrap', target: id, name: sys.name, need, have };
  return null;
}

export function queueLevel(run: RunState, p: Pending, id: string): QueueResult {
  const deny = canQueueLevel(run, p, id);
  if (deny) return { ok: false, deny };
  return { ok: true, pending: { ...p, systems: { ...p.systems, [id]: pendingOf(p, id) + 1 } } };
}

/** Removes one queued level (installed levels are never removed). */
export function removeLevel(p: Pending, id: string): Pending {
  const n = pendingOf(p, id);
  if (n <= 0) return p;
  const systems = { ...p.systems };
  if (n === 1) delete systems[id];
  else systems[id] = n - 1;
  return { ...p, systems };
}

export function canQueueBar(run: RunState, p: Pending): Deny | null {
  const tot = effectiveReactor(run) + p.reactor;
  if (tot >= REACTOR.max) return { code: 'max', target: 'reactor', name: 'REACTOR' };
  const need = reactorBarCost(tot + 1);
  const have = availableScrap(run, p);
  if (need > have) return { code: 'scrap', target: 'reactor', name: 'REACTOR', need, have };
  return null;
}

export function queueBar(run: RunState, p: Pending): QueueResult {
  const deny = canQueueBar(run, p);
  if (deny) return { ok: false, deny };
  return { ok: true, pending: { ...p, reactor: p.reactor + 1 } };
}

export function removeBar(p: Pending): Pending {
  return p.reactor > 0 ? { ...p, reactor: p.reactor - 1 } : p;
}

export function undoAll(): Pending {
  return emptyPending();
}

/** Run with every system / reactor value filled in (start levels where the run had none). */
export function withDefaults(run: RunState): RunState {
  const systems = { ...run.systems };
  for (const sys of UPGRADE_SYSTEMS) systems[sys.id] = effectiveLevel(run, sys.id);
  return { ...run, systems, reactor: effectiveReactor(run) };
}

/**
 * One install step (the screen shows one per tick): every system with queued levels gets +1 level,
 * the reactor +1 bar; the scrap is paid. Returns what was installed in this step.
 */
export function installStep(run: RunState, p: Pending): { run: RunState; pending: Pending; installed: string[]; paid: number } {
  const r = withDefaults(run);
  const systems = { ...r.systems };
  let pending = p;
  let paid = 0;
  const installed: string[] = [];
  for (const sys of UPGRADE_SYSTEMS) {
    if (pendingOf(pending, sys.id) <= 0) continue;
    const next = (systems[sys.id] ?? sys.start) + 1;
    systems[sys.id] = next;
    paid += levelCost(sys, next);
    pending = removeLevel(pending, sys.id);
    installed.push(sys.id);
  }
  let reactor = r.reactor;
  if (pending.reactor > 0) {
    reactor += 1;
    paid += reactorBarCost(reactor);
    pending = removeBar(pending);
    installed.push('reactor');
  }
  return { run: { ...r, systems, reactor, scrap: r.scrap - paid }, pending, installed, paid };
}

/** CONFIRM: installs everything queued at once (same result as repeating installStep). */
export function confirmUpgrades(run: RunState, p: Pending): { ok: true; run: RunState; paid: number } | { ok: false; deny: Deny } {
  if (pendingCount(p) === 0) return { ok: false, deny: { code: 'none', target: 'confirm', name: '' } };
  let cur = run;
  let pend = p;
  let paid = 0;
  while (pendingCount(pend) > 0) {
    const s = installStep(cur, pend);
    cur = s.run;
    pend = s.pending;
    paid += s.paid;
  }
  return { ok: true, run: cur, paid };
}

/** ACCESS DENIED texts. */
export function denyText(d: Deny): { title: string; text: string } {
  switch (d.code) {
    case 'scrap':
      return { title: 'INSUFFICIENT SCRAP', text: `NEED ${d.need} · AVAILABLE ${d.have}. REMOVE QUEUED UPGRADES OR EARN MORE SCRAP.` };
    case 'max':
      return { title: 'MAX LEVEL REACHED', text: `${d.name} CANNOT BE UPGRADED FURTHER.` };
    case 'manned':
      return { title: 'CANNOT BE PURCHASED', text: `${d.name} LVL ${d.level} IS ONLY REACHED BY MANNING THE CONSOLE.` };
    default:
      return { title: 'NO UPGRADES QUEUED', text: 'TAP BUY ON A SYSTEM OR +1 BAR ON THE REACTOR FIRST.' };
  }
}

export type RowState = 'owned' | 'pend' | 'next' | 'future';
export interface LevelRow {
  level: string;
  effect: string;
  cost: string;
  state: RowState;
}

/** Level table of the details panel for a system. */
export function systemRows(run: RunState, p: Pending, id: string): LevelRow[] {
  const sys = systemById(id);
  const lv = effectiveLevel(run, id);
  const tot = lv + pendingOf(p, id);
  const rows: LevelRow[] = [];
  for (let L = 1; L <= sys.max; L++) {
    let state: RowState;
    let cost: string;
    if (L <= lv) [state, cost] = ['owned', 'INSTALLED'];
    else if (L <= tot) [state, cost] = ['pend', `QUEUED · ${levelCost(sys, L)}`];
    else if (L > sys.buyMax) [state, cost] = [L === tot + 1 ? 'next' : 'future', 'MANNED ONLY'];
    else if (L === tot + 1) [state, cost] = ['next', `NEXT · ${levelCost(sys, L)} SCRAP`];
    else [state, cost] = ['future', `${levelCost(sys, L)} SCRAP`];
    rows.push({ level: `LVL ${L}`, effect: sys.effects[L - 1] ?? '', cost, state });
  }
  return rows;
}

/** Level table of the details panel for the reactor (one row per bar group). */
export function reactorRows(run: RunState, p: Pending): LevelRow[] {
  const lv = effectiveReactor(run);
  const tot = lv + p.reactor;
  return REACTOR.groupCosts.map((price, g) => {
    const a = g * REACTOR.groupSize + 1;
    const b = a + REACTOR.groupSize - 1;
    let state: RowState;
    if (tot >= b) state = lv >= b ? 'owned' : 'pend';
    else if (tot + 1 >= a) state = 'next';
    else state = 'future';
    return { level: `${a}–${b}`, effect: `BARS ${a} TO ${b}`, cost: `${price} SCRAP / BAR`, state };
  });
}
