// Salvage reward after a won battle: loot (scrap + ammunition) and a pick of one of three items – or scrap all three.
// SENTINELS drop ship turrets (turrets.json), RAIDERS drop crew equipment (equipment.json); never mixed in one reward.
// Pure rules (engine-neutral, seeded): the Salvage screen (src/ui/salvage.ts) only shows and forwards taps.
import DATA from '../data/turrets.json';
import EQ from '../data/equipment.json';
import type { RunState } from './run';

export type Rarity = 1 | 2 | 3 | 4 | 5;
/** [effect key, n?, x?] – e.g. ['fire', 20], ['immune', 'RADIATION'], ['typebonus', 1, 'RIFLE'], ['slow']. */
export type Effect = [string, ...(string | number)[]];
/** 'turret' = SENTINELS drop ship turrets, 'equip' = RAIDERS drop crew equipment. */
export type DropKind = 'turret' | 'equip';

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

interface EquipDef {
  name: string;
  cat?: 'APPAREL' | 'TOOL'; // default WEAPON
  slot?: 'HEAD' | 'BODY';
  wtype?: string;
  dtype?: string;
  atype?: string;
  ttype?: string;
  img: string;
  dps?: number;
  hp?: number;
  cd?: number;
  uses?: number;
  fx: (string | number)[][];
  perks: Record<string, Record<string, unknown>>;
}

/** One turret at one rarity (all perks up to that rarity applied). */
export interface Turret {
  kind: 'turret';
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

/** One crew equipment item at one rarity: a crew WEAPON, APPAREL (HEAD / BODY) or a TOOL. */
export interface Equipment {
  kind: 'equip';
  id: string;
  rarity: Rarity;
  name: string;
  cat: 'WEAPON' | 'APPAREL' | 'TOOL';
  slot: 'WEAPON' | 'HEAD' | 'BODY' | 'TOOL'; // crew slot it goes into
  cls: string; // weapon: damage type · apparel: armour type · tool: ACTIVE / PASSIVE / CONSUMABLE
  cls2: string; // weapon: weapon type (MELEE …), else ''
  tail: string; // 'TOOL' for tools, else ''
  img: string;
  dps: number; // weapons: damage per second (replaces bare hands)
  hp: number; // apparel: extra max HP
  cd: number; // active tools: cooldown in s
  uses: number; // consumables
  fx: Effect[];
  sell: number;
}

export type SalvageItem = Turret | Equipment;

export interface SalvageOffer {
  seed: number;
  kind: DropKind;
  scrap: number;
  ammo: number;
  /** 3 different items. Random offers are sorted by rarity (rarest last = biggest reveal at the end); test line-ups keep slot order. */
  items: SalvageItem[];
}

/** One slot of a test line-up: [item id, rarity]. */
export type SlotPick = [string, Rarity];

/** Boot-screen settings for the next offer. */
export interface OfferSettings {
  kind?: DropKind;
  /** Line-up id (`LINEUPS`): fixed items + rarities. */
  lineup?: string;
  /** Own pick per slot (overrides the line-up). */
  slots?: SlotPick[] | null;
}

const DEFS = DATA.turrets as unknown as Record<string, TurretDef>;
const EDEFS = EQ.items as unknown as Record<string, EquipDef>;
export const TURRET_IDS = Object.keys(DEFS);
export const EQUIP_IDS = Object.keys(EDEFS);
export const RARITIES = DATA.rarities;
export const LINEUPS: { id: string; name: string }[] = DATA.lineups;
/** Hover texts for turret classes and equipment types (damage / weapon / apparel / tool types). */
export const CLASS_INFO = { ...(DATA.classes as Record<string, string>), ...(EQ.classes as Record<string, string>) };
export const TAIL_INFO = EQ.tails as Record<string, string>;
const PRESETS: Record<DropKind, Record<string, SlotPick[]>> = {
  turret: DATA.presets as unknown as Record<string, SlotPick[]>,
  equip: EQ.presets as unknown as Record<string, SlotPick[]>,
};

export function itemIds(kind: DropKind): string[] {
  return kind === 'equip' ? EQUIP_IDS : TURRET_IDS;
}

export function itemName(kind: DropKind, id: string): string {
  return (kind === 'equip' ? EDEFS[id]?.name : DEFS[id]?.name) ?? id.toUpperCase();
}

/** Category of an equipment item (WEAPON / APPAREL / TOOL); turrets: 'TURRET'. */
export function itemCat(kind: DropKind, id: string): string {
  return kind === 'equip' ? (EDEFS[id]?.cat ?? 'WEAPON') : 'TURRET';
}

/** Short type text for pickers: turret class, weapon 'SLASHING MELEE', apparel slot 'BODY', tool type 'ACTIVE'. */
export function itemTypeText(kind: DropKind, id: string): string {
  if (kind === 'turret') return DEFS[id]?.cls ?? '';
  const d = EDEFS[id];
  if (!d) return '';
  return d.dtype ? `${d.dtype} ${d.wtype}` : d.atype ? (d.slot ?? '') : (d.ttype ?? '');
}

export function sellValue(r: Rarity): number {
  return RARITIES[r - 1]!.sell;
}

export function makeTurret(id: string, rarity: Rarity): Turret {
  const d = DEFS[id];
  if (!d) throw new Error(`unknown turret ${id}`);
  const t: Turret = {
    kind: 'turret',
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
    fx: d.fx.map(toEffect),
    sell: sellValue(rarity),
  };
  applyPerks(t, d.perks, rarity);
  return t;
}

const toEffect = (e: (string | number)[]): Effect => [String(e[0]), ...e.slice(1)];

/** Perks 2..r on top of the base item: fx are appended, other keys replace. */
function applyPerks(item: SalvageItem, perks: Record<string, Record<string, unknown> | undefined>, rarity: Rarity): void {
  for (let k = 2; k <= rarity; k++) {
    const p = perks[String(k)];
    if (!p) continue;
    for (const [key, v] of Object.entries(p)) {
      if (key === 'fx') item.fx = item.fx.concat((v as (string | number)[][]).map(toEffect));
      else (item as unknown as Record<string, unknown>)[key] = v;
    }
  }
}

export function makeEquip(id: string, rarity: Rarity): Equipment {
  const d = EDEFS[id];
  if (!d) throw new Error(`unknown equipment ${id}`);
  const cat = d.cat ?? 'WEAPON';
  const e: Equipment = {
    kind: 'equip',
    id,
    rarity,
    name: d.name,
    cat,
    slot: cat === 'APPAREL' ? (d.slot ?? 'BODY') : cat,
    cls: (cat === 'WEAPON' ? d.dtype : cat === 'APPAREL' ? d.atype : d.ttype) ?? '',
    cls2: cat === 'WEAPON' ? (d.wtype ?? '') : '',
    tail: cat === 'TOOL' ? 'TOOL' : '',
    img: d.img,
    dps: d.dps ?? 0,
    hp: d.hp ?? 0,
    cd: d.cd ?? 0,
    uses: d.uses ?? 0,
    fx: d.fx.map(toEffect),
    sell: sellValue(rarity),
  };
  applyPerks(e, d.perks, rarity);
  return e;
}

export function makeItem(kind: DropKind, id: string, rarity: Rarity): SalvageItem {
  return kind === 'equip' ? makeEquip(id, rarity) : makeTurret(id, rarity);
}

/**
 * Effect label split into name + value, e.g. fire 20 -> { name: 'FIRE', value: '20 %', info: '20 % chance …' },
 * res PIERCING -> { name: 'RESIST PIERCING', value: '' }. Labels that end in a number (+ unit) are split there.
 */
export function effectText(e: Effect): { name: string; value: string; info: string } {
  const [k, n, x] = e;
  const def = (DATA.effects as Record<string, { name: string; unit: string; info: string }>)[k];
  if (def) return { name: def.name, value: `${n} ${def.unit}`, info: def.info.replace('{n}', String(n)) };
  const eq = (EQ.effects as Record<string, { label: string; info: string }>)[k];
  if (!eq) return { name: k.toUpperCase(), value: n === undefined ? '' : String(n), info: '' };
  const fill = (t: string) =>
    t
      .replace(/\{n\}/g, String(n ?? ''))
      .replace(/\{x\}/g, String(x ?? ''))
      .replace(/\{n_lc\}/g, String(n ?? '').toLowerCase())
      .replace(/\{x_lc\}/g, String(x ?? '').toLowerCase());
  const label = fill(eq.label);
  const m = /^(.*?)\s([+−-]?\d+(?:\.\d+)?(?:\s?(?:%|S|HP))?)$/.exec(label);
  return { name: m ? m[1]! : label, value: m ? m[2]! : '', info: fill(eq.info) };
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

/** The fixed three of a line-up (unknown line-up -> the first one). */
export function presetSlots(kind: DropKind, lineup: string): SlotPick[] {
  const P = PRESETS[kind];
  return (P[lineup] ?? P[LINEUPS[0]!.id]!).map((s) => [s[0], s[1]] as SlotPick);
}

/** Saved slot picks -> 3 valid picks; anything unknown / broken falls back to that slot of the line-up. */
export function normalizeSlots(kind: DropKind, slots: unknown, lineup: string): SlotPick[] {
  const base = presetSlots(kind, lineup);
  const ids = itemIds(kind);
  return base.map((b, i) => {
    const s = Array.isArray(slots) ? (slots[i] as unknown) : null;
    if (!Array.isArray(s)) return b;
    const id = ids.includes(s[0] as string) ? (s[0] as string) : b[0];
    const r = Number(s[1]);
    return [id, (Number.isInteger(r) && r >= 1 && r <= 5 ? r : b[1]) as Rarity];
  });
}

/**
 * The reward. `makeOffer(seed)` = random turrets (seeded). With settings: `kind` picks turrets or equipment; own `slots`
 * (or else the `lineup`) fix the three items + rarities in slot order; without both the items are random of that kind.
 * Loot always comes from the seed.
 */
export function makeOffer(seed: number, settings?: OfferSettings): SalvageOffer {
  const rand = rng(seed);
  const kind: DropKind = settings?.kind === 'equip' ? 'equip' : 'turret';
  const L = DATA.loot;
  const steps = Math.floor((L.scrap_max - L.scrap_min) / L.scrap_step);
  const scrap = L.scrap_min + Math.floor(rand() * (steps + 1)) * L.scrap_step;
  const ammo = L.ammo_min + Math.floor(rand() * (L.ammo_max - L.ammo_min + 1));
  const fixed = settings?.slots
    ? normalizeSlots(kind, settings.slots, settings.lineup ?? LINEUPS[0]!.id)
    : settings?.lineup
      ? presetSlots(kind, settings.lineup)
      : null;
  if (fixed) return { seed, kind, scrap, ammo, items: fixed.map(([id, r]) => makeItem(kind, id, r)) };
  const ids = itemIds(kind).slice();
  const items: SalvageItem[] = [];
  for (let i = 0; i < 3 && ids.length; i++) {
    const id = ids.splice(Math.floor(rand() * ids.length), 1)[0]!;
    items.push(makeItem(kind, id, rollRarity(rand)));
  }
  items.sort((a, b) => a.rarity - b.rarity);
  return { seed, kind, scrap, ammo, items };
}

/** Id stored in the run for a picked item: turret id, or `equip:<id>` (run.ts has no equipment list yet). */
export function runItemId(item: SalvageItem): string {
  return item.kind === 'equip' ? `equip:${item.id}` : item.id;
}

function addLoot(run: RunState, offer: SalvageOffer, extraScrap = 0): RunState {
  return {
    ...run,
    scrap: run.scrap + offer.scrap + extraScrap,
    ammo: Math.max(run.ammo, Math.min(run.ammoMax, run.ammo + offer.ammo)),
  };
}

/**
 * Take item `index`: loot is added (ammo capped at ammoMax) and the item joins the run.
 * Equipment is kept as `equip:<id>` in run.turrets for now (see runItemId).
 */
export function pick(run: RunState, offer: SalvageOffer, index: number): RunState {
  const t = offer.items[index];
  if (!t) throw new Error(`no item at ${index}`);
  return { ...addLoot(run, offer), turrets: [...run.turrets, runItemId(t)] };
}

export function scrapAllValue(offer: SalvageOffer): number {
  return offer.items.reduce((s, t) => s + t.sell, 0);
}

/** Scrap all three items: loot + the sell value of every item. */
export function scrapAll(run: RunState, offer: SalvageOffer): RunState {
  return addLoot(run, offer, scrapAllValue(offer));
}
