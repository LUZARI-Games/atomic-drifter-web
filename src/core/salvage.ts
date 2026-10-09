// Salvage reward after a won battle: loot (scrap + ammunition) and a pick of one of three turrets – or scrap all three.
// Pure rules (engine-neutral, seeded): the Salvage screen (src/ui/salvage.ts) only shows and forwards taps.
import DATA from '../data/turrets.json';
import type { RunState } from './run';

export type Rarity = 1 | 2 | 3 | 4 | 5;
export type Effect = [string, number];

interface TurretDef {
  name: string;
  cls: string;
  img: string;
  ion?: boolean;
  dmg: number;
  proj: number;
  charge: number;
  energy: number;
  ammo?: number;
  charges?: number;
  fx: (string | number)[][];
  perks: Record<string, Partial<Omit<TurretDef, 'perks'>>>;
}

/** One turret at one rarity (all perks up to that rarity applied). */
export interface Turret {
  id: string;
  rarity: Rarity;
  name: string;
  cls: string;
  img: string;
  ion: boolean;
  dmg: number; // per projectile (beam: per room); ion damage when `ion`
  proj: number;
  charge: number; // seconds per volley
  energy: number;
  ammo: number; // ammunition per volley (missiles), else 0
  charges: number; // shots per jump (lances), else 0
  fx: Effect[];
  sell: number; // scrap when scrapped / sold
}

export interface SalvageOffer {
  seed: number;
  scrap: number;
  ammo: number;
  turrets: Turret[]; // 3 different turret types, sorted by rarity (rarest last = biggest reveal at the end)
}

const DEFS = DATA.turrets as unknown as Record<string, TurretDef>;
export const TURRET_IDS = Object.keys(DEFS);
export const RARITIES = DATA.rarities;
export const CLASS_INFO = DATA.classes as Record<string, string>;

export function sellValue(r: Rarity): number {
  return RARITIES[r - 1]!.sell;
}

export function makeTurret(id: string, rarity: Rarity): Turret {
  const d = DEFS[id];
  if (!d) throw new Error(`unknown turret ${id}`);
  const t: Turret = {
    id,
    rarity,
    name: d.name,
    cls: d.cls,
    img: d.img,
    ion: !!d.ion,
    dmg: d.dmg,
    proj: d.proj,
    charge: d.charge,
    energy: d.energy,
    ammo: d.ammo ?? 0,
    charges: d.charges ?? 0,
    fx: d.fx.map((e) => [String(e[0]), Number(e[1])] as Effect),
    sell: sellValue(rarity),
  };
  for (let k = 2; k <= rarity; k++) {
    const p = d.perks[String(k)];
    if (!p) continue;
    for (const [key, v] of Object.entries(p)) {
      if (key === 'fx') t.fx = t.fx.concat((v as (string | number)[][]).map((e) => [String(e[0]), Number(e[1])] as Effect));
      else (t as unknown as Record<string, unknown>)[key] = v;
    }
  }
  return t;
}

/** Effect label split into name + value, e.g. fire 20 -> { name: 'FIRE', value: '20 %', info: '20 % chance …' }. */
export function effectText(e: Effect): { name: string; value: string; info: string } {
  const [k, n] = e;
  const def = (DATA.effects as Record<string, { name: string; unit: string; info: string }>)[k];
  if (!def) return { name: k.toUpperCase(), value: String(n), info: '' };
  return { name: def.name, value: `${n} ${def.unit}`, info: def.info.replace('{n}', String(n)) };
}

/** Small seeded random generator (mulberry32): same seed -> same offer. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Any seed text (URL ?seed=…) -> number. Plain integers stay as they are. */
export function seedFrom(text: string): number {
  if (/^\d+$/.test(text)) return Number(text) >>> 0;
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function rollRarity(rand: () => number): Rarity {
  const total = RARITIES.reduce((s, r) => s + r.weight, 0);
  let x = rand() * total;
  for (let i = 0; i < RARITIES.length; i++) {
    x -= RARITIES[i]!.weight;
    if (x < 0) return (i + 1) as Rarity;
  }
  return 1;
}

export function makeOffer(seed: number): SalvageOffer {
  const rand = rng(seed);
  const L = DATA.loot;
  const steps = Math.floor((L.scrap_max - L.scrap_min) / L.scrap_step);
  const scrap = L.scrap_min + Math.floor(rand() * (steps + 1)) * L.scrap_step;
  const ammo = L.ammo_min + Math.floor(rand() * (L.ammo_max - L.ammo_min + 1));
  const ids = TURRET_IDS.slice();
  const turrets: Turret[] = [];
  for (let i = 0; i < 3 && ids.length; i++) {
    const id = ids.splice(Math.floor(rand() * ids.length), 1)[0]!;
    turrets.push(makeTurret(id, rollRarity(rand)));
  }
  turrets.sort((a, b) => a.rarity - b.rarity);
  return { seed, scrap, ammo, turrets };
}

function addLoot(run: RunState, offer: SalvageOffer, extraScrap = 0): RunState {
  return {
    ...run,
    scrap: run.scrap + offer.scrap + extraScrap,
    ammo: Math.max(run.ammo, Math.min(run.ammoMax, run.ammo + offer.ammo)),
  };
}

/** Take turret `index`: loot is added (ammo capped at ammoMax) and the turret id joins the run. */
export function pick(run: RunState, offer: SalvageOffer, index: number): RunState {
  const t = offer.turrets[index];
  if (!t) throw new Error(`no turret at ${index}`);
  return { ...addLoot(run, offer), turrets: [...run.turrets, t.id] };
}

export function scrapAllValue(offer: SalvageOffer): number {
  return offer.turrets.reduce((s, t) => s + t.sell, 0);
}

/** Scrap all three turrets: loot + the sell value of every turret. */
export function scrapAll(run: RunState, offer: SalvageOffer): RunState {
  return addLoot(run, offer, scrapAllValue(offer));
}
