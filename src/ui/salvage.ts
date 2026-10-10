// Salvage reward screen: starts on the terminal boot screen (POWER ON + OPTIONS: line-up, drop type, own pick per slot).
// POWER ON: the CRT boots, loot counters run up, three item cards (turrets from SENTINELS, crew equipment from RAIDERS)
// are revealed one by one (rarer = bigger build-up), the player secures one or scraps all three, the screen powers off
// and the REBOOT screen offers BACK TO GAME. Look + timing from the owner's mockup Reward_r6.
// Rules (offer, pick, scrap all) live in src/core/salvage.ts.
import DATA from '../data/turrets.json';
import EQ from '../data/equipment.json';
import {
  CLASS_INFO,
  effectText,
  itemCat,
  itemIds,
  itemName,
  itemTypeText,
  LINEUPS,
  makeOffer,
  normalizeSlots,
  pick,
  RARITIES,
  scrapAll,
  scrapAllValue,
  TAIL_INFO,
  type DropKind,
  type Equipment,
  type OfferSettings,
  type SalvageItem,
  type SalvageOffer,
  type SlotPick,
  type Turret,
} from '../core/salvage';
import { loadRun, saveRun } from './runStore';
import { mountBootScreen } from './terminal';
import { SalvageSfx } from './salvageSfx';

// ---------- icons (24×24, stroke only) ----------
const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 `;
const ICONS: Record<string, string> = {
  damage: circle(12, 12, 8) + 'M12 1 V7 M12 17 V23 M1 12 H7 M17 12 H23 M12 11.5 V12.5',
  energy: 'M13 2 L4 14 H11 L10 22 L20 9 H13 Z',
  charge: circle(12, 14, 8) + 'M12 14 V9.5 M12 14 L15 16 M9 2 H15 M12 2 V6 M18.5 6.5 L20.5 4.5',
  ammo: 'M9 21 V10 C9 6 10.5 3.5 12 3 C13.5 3.5 15 6 15 10 V21 Z M9 17 H15',
  charges: 'M3 21 L15 9 M11 7 H17 V13 M15 9 L21 3',
  scrap: circle(12, 12, 3.5) + 'M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22 M4.9 4.9 L7 7 M17 17 L19.1 19.1 M4.9 19.1 L7 17 M17 7 L19.1 4.9',
  turret: 'M3 21 H21 M6 21 L8 16 H16 L18 21 M8 16 V10 H15 V16 M15 12 H22 M10 10 V8 H13 V10',
  CANNON: 'M3 10 H7 V15 H3 Z M7 11 H20 M7 14 H20 M20 10 V15 M22 12.5 H21',
  MULTISHOT: 'M3 10 H7 V15 H3 Z M7 12.5 L21 5 M7 12.5 H21 M7 12.5 L21 20',
  BEAM: 'M3 9 V16 M3 12.5 H21 M6 10.5 H19 M6 14.5 H19',
  LANCE: 'M3 21 L17 7 M12 5 H19 V12 M17 7 L21 3',
  MISSILE: 'M4 20 L8 16 M15 4 C18 4 20 6 20 9 L12 17 L7 12 Z M7 12 L4 13 L5 15 M12 17 L11 20 L9 19',
  ION: 'M7 7 H17 V17 H7 Z M9 4 V7 M12 4 V7 M15 4 V7 M9 17 V20 M12 17 V20 M15 17 V20 M4 9 H7 M4 12 H7 M4 15 H7 M17 9 H20 M17 12 H20 M17 15 H20 M3 21 L21 3',
  fire: 'M12 22 C7 22 5 18 6 14 C7 11 10 10 10 5 C14 7 17 11 16 15 C17 14 18 13 18 12 C20 17 17 22 12 22 Z',
  stun: 'M12 3 L14 9 H20 L15 13 L17 20 L12 16 L7 20 L9 13 L4 9 H10 Z',
  crew: circle(12, 7, 3.5) + 'M5 21 C5 15 19 15 19 21',
  breach: 'M4 4 L10 10 L7 13 L13 19 L11 22 M15 3 L13 8 M21 10 L16 12',
  rad: 'M12 12 L7.5 4.2 A9 9 0 0 1 16.5 4.2 Z M12 12 L21 12 A9 9 0 0 1 16.5 19.8 Z M12 12 L7.5 19.8 A9 9 0 0 1 3 12 Z',
  dot: circle(12, 12, 3),
  // equipment (icons.js of the mockup)
  hp: 'M12 20 C5 14.5 3 11.5 3 8.5 A4.5 4.5 0 0 1 12 6.5 A4.5 4.5 0 0 1 21 8.5 C21 11.5 19 14.5 12 20 Z',
  cooldown: circle(12, 14, 8) + 'M12 14 V9.5 M12 14 L15 16 M9 2 H15 M12 2 V6',
  uses: 'M4 7 H8 V17 H4 Z M10 7 H14 V17 H10 Z M16 7 H20 V17 H16 Z',
  passive: 'M12 12 C9.5 8 4 8 4 12 C4 16 9.5 16 12 12 C14.5 8 20 8 20 12 C20 16 14.5 16 12 12 Z',
  weapon: 'M3 8 H20 V12 H12 L11 18 H7 L8 12 H3 Z M14 12 V14',
  head: 'M5 16 V11 A7 7 0 0 1 19 11 V16 Z M5 16 H19 M8 11 H16 V13 H8 Z',
  body: 'M8 3 L12 6 L16 3 L20 7 L18 10 L17 9 V21 H7 V9 L6 10 L4 7 Z',
  tool: 'M15 3 A5 5 0 0 0 21 9 L18 9 L15 6 Z M15 6 L4 17 L7 20 L18 9',
  MELEE: 'M14 3 H21 V10 L9 22 L2 15 Z M5 18 L3 20 M7 12 L12 17',
  SIDEARM: 'M3 8 H20 V12 H12 L11 18 H7 L8 12 H3 Z',
  RIFLE: 'M1 11 H5 L7 9 H20 V11 H23 V13 H14 L12 16 H9 L10 13 H4 L1 15 Z',
  HEAVY: 'M2 8 H15 V15 H2 Z M15 9 H22 M15 11.5 H22 M15 14 H22 M5 15 V19 H9 V15',
  BLUNT: 'M4 21 L12 13 M9 7 L13 3 L21 11 L17 15 Z',
  PIERCING: 'M3 21 L21 3 M14 3 H21 V10',
  SLASHING: 'M4 19 L13 4 M9 21 L18 6 M14 22 L21 10',
  'HEAVY ARMOR': 'M12 3 L19 6 V11 C19 16 16 19 12 21 C8 19 5 16 5 11 V6 Z M12 7 V17 M8 10 H16',
  HEADWEAR: 'M5 16 V11 A7 7 0 0 1 19 11 V16 Z M5 16 H19',
  res: 'M12 3 L19 6 V11 C19 16 16 19 12 21 C8 19 5 16 5 11 V6 Z',
  weak: 'M12 3 L19 6 V11 C19 16 16 19 12 21 C8 19 5 16 5 11 V6 Z M13 6 L10 12 L14 13 L11 19',
  immune: 'M12 3 L19 6 V11 C19 16 16 19 12 21 C8 19 5 16 5 11 V6 Z M9 12 L11 14 L15 9',
  dpsdown: 'M12 3 L19 6 V11 C19 16 16 19 12 21 C8 19 5 16 5 11 V6 Z M9 11 L12 14 L15 11',
  fireimm: 'M12 3 L19 6 V11 C19 16 16 19 12 21 C8 19 5 16 5 11 V6 Z M12 16 C10 16 9 14.5 9.5 13 C10 11.5 11.5 11 11.5 9 C13.5 10 14.5 12 14 14 C14 15 13.5 16 12 16 Z',
  heal: 'M10 4 H14 V10 H20 V14 H14 V20 H10 V14 H4 V10 H10 Z',
  sabotage: 'M15 3 A5 5 0 0 0 21 9 L18 9 L15 6 Z M15 6 L4 17 L7 20 L18 9 M3 3 L9 9',
  move: 'M5 6 L11 12 L5 18 M12 6 L18 12 L12 18',
  slow: 'M6 9 L12 15 L18 9',
  door: 'M6 21 V3 H18 V21 M3 21 H21 M15 12 V13',
  explode: 'M12 2 L13.5 8 L19 5 L16 10.5 L22 12 L16 13.5 L19 19 L13.5 16 L12 22 L10.5 16 L5 19 L8 13.5 L2 12 L8 10.5 L5 5 L10.5 8 Z',
  splash: circle(12, 12, 2) + circle(12, 12, 6) + circle(12, 12, 10),
  big: circle(12, 12, 8) + 'M12 1 V7 M12 17 V23 M1 12 H7 M17 12 H23',
  stealth: 'M2 12 C5 7 9 5 12 5 C15 5 19 7 22 12 C19 17 15 19 12 19 C9 19 5 17 2 12 Z M3 3 L21 21',
  teleport: 'M4 12 H20 M15 7 L20 12 L15 17 M4 7 V17',
};
// keys whose drawing is the same as another one (icons.js)
const SAME: Record<string, string> = {
  THERMAL: 'fire', ENERGY: 'energy', CLOTHING: 'body', 'LIGHT ARMOR': 'res', HELMET: 'head', ACTIVE: 'cooldown', PASSIVE: 'passive',
  CONSUMABLE: 'uses', firekill: 'fire', stunkill: 'stun', stunroom: 'stun', healself: 'heal', healroom: 'heal', healpow: 'heal',
  repair: 'tool', ionkill: 'energy', typebonus: 'big', roomdmg: 'explode', heal_kill: 'hp', room: 'damage', pierce: 'PIERCING',
};
for (const [k, v] of Object.entries(SAME)) ICONS[k] = ICONS[v]!;
ICONS.radclear = ICONS.rad + ' M3 3 L21 21';
const icon = (key: string, size: number, sw = 1.8) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[key] ?? ICONS.dot}"/></svg>`;
const SCRAP_TILE_ICON = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="3.5"/><path d="M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22 M4.9 4.9 L7 7 M17 17 L19.1 19.1 M4.9 19.1 L7 17 M17 7 L19.1 4.9"/></svg>`;
const AMMO_TILE_ICON = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M7 21 V10 C7 6 8.5 3.5 9.5 3 C10.5 3.5 12 6 12 10 V21 Z"/><path d="M7 17 H12"/><path d="M14 21 V12 C14 9 15 7 16 6.5 C17 7 18 9 18 12 V21 Z"/><path d="M14 18 H18"/></svg>`;

type Drawing = [string, Record<string, string | number>][];
const DRAWINGS = { ...(DATA.drawings as unknown as Record<string, Drawing>), ...(EQ.drawings as unknown as Record<string, Drawing>) };
function holoSvg(img: string): string {
  const parts = (DRAWINGS[img] ?? []).map(
    ([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`,
  );
  return `<svg class="holo" viewBox="0 0 320 170" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">${parts.join('')}</svg>`;
}

// ---------- text helpers ----------
const KEEP = new Set(['HP', 'DPS', 'ION', 'DMG']);
const SMALL = new Set(['TO', 'OF', 'ON', 'IN', 'VS', 'WITH', 'ALL', 'AND']);
/** Title Case like the mockup: abbreviations stay, small words lower case, unit S -> s. */
function tc(s: string): string {
  return s
    .split(' ')
    .map((w, i) => {
      const core = w.replace(/[^A-Z]/g, '');
      if (!core || KEEP.has(core)) return w;
      if (w === 'S') return 's';
      if (i > 0 && SMALL.has(w)) return w.toLowerCase();
      return w.charAt(0) + w.slice(1).toLowerCase();
    })
    .join(' ');
}
const GLYPH = '#%&@$/\\<>01=+*';
function scramble(txt: string, f: number): string {
  const n = Math.round(txt.length * f);
  let out = txt.slice(0, n);
  for (let k = n; k < txt.length; k++) out += txt[k] === ' ' ? ' ' : GLYPH[Math.floor(Math.random() * GLYPH.length)];
  return out;
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const STAT_INFO = {
  energy: 'Reactor energy bars this turret needs while it is powered.',
  charge: 'Seconds the turret needs to charge before it fires the next volley.',
  ammo: 'Ammunition used for every volley. Without ammo this turret cannot fire.',
  charges: 'Shots per jump. Lances start every battle pre-charged and recharge only between jumps.',
  value: 'What you get when you scrap or sell it.',
  turret: 'Ship weapon. Goes into a weapons bay of your ship and runs on reactor energy.',
};
const SLOT_ICON: Record<string, string> = { HEAD: 'head', BODY: 'body', TOOL: 'tool', WEAPON: 'weapon' };

/** Main stat row of an equipment card: weapon DPS, apparel HP, tool cooldown / passive / uses (mockup Rev. 6). */
function equipMain(e: Equipment): { ic: string; label: string; value: string; info: string } {
  if (e.cat === 'APPAREL')
    return e.hp
      ? { ic: 'hp', label: 'HP', value: `+${e.hp}`, info: "Extra max HP while worn, added to the crew member's own HP." }
      : { ic: 'hp', label: 'HP', value: 'No Extra HP', info: 'Gives no extra HP: worn for its special effects.' };
  if (e.cat === 'TOOL') {
    if (e.cls === 'ACTIVE') return { ic: 'cooldown', label: 'Cooldown', value: `${e.cd}s`, info: 'Seconds until the tool can be used again.' };
    if (e.cls === 'PASSIVE') return { ic: 'passive', label: 'Passive', value: 'Always Active', info: 'Works on its own as long as it is carried.' };
    return { ic: 'uses', label: 'Uses', value: String(e.uses), info: 'How often it can be used before it is gone.' };
  }
  return {
    ic: 'damage',
    label: 'DPS',
    value: String(e.dps),
    info: "Damage per second with this weapon in combat aboard a ship. It REPLACES the crew member's bare-handed damage, it is not added to it.",
  };
}

function damageInfo(t: Turret): string {
  if (t.ion)
    return 'Per projectile: locks that many energy bars of the hit system for 5 s each (stacks); the system cannot be powered or manned. No hull damage. Blocked by shields: removes 1 layer and ionizes the SHIELD system instead – the tool to break shields.';
  if (t.dmg === 0) return 'Deals no damage: this turret works only through its special effects.';
  if (t.cls === 'BEAM') return 'Per room the beam cuts through (× rooms): takes this much off the hull AND damages the system in that room.';
  return 'Per projectile (× projectiles): takes this much off the hull AND damages the system in the room it hits.';
}


// ---------- boot-screen settings (remembered per browser) ----------
const KEYS = { drop: 'adw.salvage.drop', lineup: 'adw.salvage.lineup', slots: 'adw.salvage.slots.' };
const lsGet = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const lsSet = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* not remembered */
  }
};

interface Settings {
  kind: DropKind;
  lineup: string;
  /** Own pick per slot for each drop type (null = follow the line-up). */
  slots: Record<DropKind, SlotPick[] | null>;
}

function loadSettings(): Settings {
  const lu = lsGet(KEYS.lineup);
  const lineup = LINEUPS.some((l) => l.id === lu) ? lu! : LINEUPS[0]!.id;
  const own = (kind: DropKind): SlotPick[] | null => {
    try {
      const raw = lsGet(KEYS.slots + kind);
      return raw ? normalizeSlots(kind, JSON.parse(raw), lineup) : null;
    } catch {
      return null;
    }
  };
  return { kind: lsGet(KEYS.drop) === 'equip' ? 'equip' : 'turret', lineup, slots: { turret: own('turret'), equip: own('equip') } };
}

function saveSettings(s: Settings): void {
  lsSet(KEYS.drop, s.kind);
  lsSet(KEYS.lineup, s.lineup);
  for (const k of ['turret', 'equip'] as DropKind[]) lsSet(KEYS.slots + k, s.slots[k] ? JSON.stringify(s.slots[k]) : null);
}

const DROPS: [DropKind, string][] = [
  ['turret', 'SENTINELS → TURRETS'],
  ['equip', 'RAIDERS → EQUIPMENT'],
];
const RAR_LETTER = ['C', 'U', 'R', 'E', 'L'];
const EQUIP_CATS = ['WEAPON', 'APPAREL', 'TOOL'];

// ---------- the screen ----------
interface ChipDef {
  word: string;
  ic?: string;
  info: string;
  rar?: boolean;
}

interface CardRefs {
  t: SalvageItem;
  slot: HTMLElement;
  wait: HTMLElement;
  card: HTMLElement | null;
  name: HTMLElement | null;
  sub: HTMLElement[];
  pips: HTMLElement[];
  holo: HTMLElement | null;
  rows: HTMLElement[]; // in fill order (stats, then effects); footer separately
  foot: HTMLElement[];
  ready: boolean;
  shown: boolean;
}

type Phase = 'live' | 'confirm' | 'off';

export interface SalvageOptions {
  /** Fixed seed (URL ?seed=…): POWER ON always builds this random turret offer, the line-up options are ignored. */
  seed?: number;
  /** Called after the screen has powered off (default: the REBOOT screen with BACK TO GAME). */
  onDone?: () => void;
}

/** Sub line under the name: rarity · class (· weapon type) · Turret / Tool – each word explains itself on hover / tap. */
function chipsOf(t: SalvageItem): ChipDef[] {
  const R = t.rarity;
  const rWord = tc(RARITIES[R - 1]!.name);
  const out: ChipDef[] = [
    { word: rWord, rar: true, info: `${rWord} rarity (${R} of 5 stripes). Higher rarity = the same item with extra perks: more shots, more damage or another effect.` },
    { word: tc(t.cls), ic: t.cls, info: CLASS_INFO[t.cls] ?? '' },
  ];
  if (t.kind === 'turret') out.push({ word: 'Turret', ic: 'turret', info: STAT_INFO.turret });
  else {
    if (t.cls2) out.push({ word: tc(t.cls2), ic: t.cls2, info: CLASS_INFO[t.cls2] ?? '' });
    if (t.tail) out.push({ word: tc(t.tail), ic: 'tool', info: TAIL_INFO[t.tail] ?? '' });
  }
  return out;
}

export function mountSalvage(host: HTMLElement, opts: SalvageOptions = {}): void {
  const sfx = new SalvageSfx();
  const root = document.createElement('div');
  root.id = 'game';
  root.className = 'sv-root';
  root.innerHTML = `
  <div class="sv-scroll"></div>
  <div class="sv-glass" aria-hidden="true">
    <div class="sv-roll"></div>
    <svg class="sv-grain" width="100%" height="100%" aria-hidden="true">
      <defs>
        <filter id="svGrain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="7" result="n"></feTurbulence>
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 .8  0 0 0 0 .85  0 0 0 0 .8  0 0 0 1.6 -1.18"></feColorMatrix>
        </filter>
        <filter id="svDust" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency=".006" numOctaves="3" seed="3" result="m"></feTurbulence>
          <feColorMatrix in="m" type="matrix" values="0 0 0 0 .75  0 0 0 0 .8  0 0 0 0 .75  0 0 0 1.2 -.62"></feColorMatrix>
        </filter>
      </defs>
      <rect width="100%" height="100%" filter="url(#svGrain)" opacity=".35"></rect>
      <rect width="100%" height="100%" filter="url(#svDust)" opacity=".12"></rect>
    </svg>
    <div class="sv-glare"></div>
    <div class="sv-rim"></div>
  </div>`;
  host.appendChild(root);
  const scroller = root.querySelector<HTMLElement>('.sv-scroll')!;

  // ----- input (shared by every boot of the screen) -----
  const input = { lastPointer: 'mouse', userTouched: false };
  root.addEventListener('pointerdown', (e) => {
    input.lastPointer = e.pointerType || 'mouse';
    if (e.pointerType !== 'mouse') input.userTouched = true;
    void sfx.unlock();
  });
  root.addEventListener('keydown', () => {
    input.lastPointer = 'keyboard';
    void sfx.unlock();
  });
  scroller.addEventListener('wheel', () => (input.userTouched = true), { passive: true });

  // ----- boot screen: POWER ON / REBOOT + OPTIONS; line-up, drop type and slot pickers go into `extra` -----
  let st = loadSettings();
  let busy = false;
  const boot = mountBootScreen(root, root, () => power(), (on) => sfx.setOn(on));
  const bootEl = boot.extra.closest<HTMLElement>('.boot-screen')!;
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'sv-back';
  back.textContent = '[ BACK TO GAME ]';
  back.hidden = true;
  back.addEventListener('click', () => (location.href = '/?play'));
  bootEl.querySelector('[data-ref="power"]')!.after(back);
  const extra = boot.extra;

  const currentSlots = (): SlotPick[] => normalizeSlots(st.kind, st.slots[st.kind], st.lineup);
  const offerSettings = (): OfferSettings => ({ kind: st.kind, lineup: st.lineup, slots: st.slots[st.kind] });
  const update = (patch: Partial<Settings>) => {
    st = { ...st, ...patch };
    saveSettings(st);
    renderOptions();
  };
  const setSlot = (n: number, id: string | null, r: number | null) => {
    const sl = currentSlots().map((s) => [s[0], s[1]] as SlotPick);
    if (id) sl[n]![0] = id;
    if (r) sl[n]![1] = r as SlotPick[1];
    update({ slots: { ...st.slots, [st.kind]: sl } });
  };

  function slotList(n: number, id: string, r: number): string {
    const kind = st.kind;
    const cur = itemCat(kind, id);
    const cats =
      kind === 'equip'
        ? `<div class="sv-cats">${EQUIP_CATS.map((c) => `<button type="button" class="sv-opt sm${c === cur ? ' on' : ''}" data-slot="${n}" data-cat="${c}">${c}</button>`).join('')}</div>`
        : '';
    const rows = itemIds(kind)
      .filter((k) => kind !== 'equip' || itemCat(kind, k) === cur)
      .map(
        (k) =>
          `<button type="button" class="sv-pick${k === id ? ' on' : ''}" data-slot="${n}" data-item="${k}"><span>${esc(itemName(kind, k))}</span><span class="t">${esc(itemTypeText(kind, k))}</span></button>`,
      )
      .join('');
    const rar = RARITIES.map(
      (q, i) =>
        `<button type="button" class="sv-rar${i + 1 === r ? ' on' : ''}" style="--q:${q.color}" data-slot="${n}" data-rar="${i + 1}" title="${q.name}" aria-label="${q.name}">${RAR_LETTER[i]}</button>`,
    ).join('');
    return `<div class="sv-slotlist" style="--rc:${RARITIES[r - 1]!.color}"><span class="sv-slotcap">SLOT ${n + 1}</span>${cats}${rows}<div class="sv-rars">${rar}</div></div>`;
  }

  function renderOptions(): void {
    const own = !!st.slots[st.kind];
    extra.innerHTML = `
      ${opts.seed !== undefined ? `<div class="sv-opt-note">SEED ${opts.seed} IN THE ADDRESS: RANDOM TURRETS, CHOICES BELOW ARE IGNORED</div>` : ''}
      <div class="sv-opt-row">${LINEUPS.map((l) => `<button type="button" class="sv-opt${!own && st.lineup === l.id ? ' on' : ''}" data-lineup="${l.id}">${l.name}</button>`).join('')}</div>
      <div class="sv-opt-row">${DROPS.map(([k, label]) => `<button type="button" class="sv-opt${st.kind === k ? ' on' : ''}" data-drop="${k}">${label}</button>`).join('')}</div>
      <span class="sv-opt-cap">${st.kind === 'equip' ? 'ITEMS' : 'TURRETS'}</span>
      <div class="sv-slots">${currentSlots()
        .map(([id, r], n) => slotList(n, id, r))
        .join('')}</div>`;
  }
  extra.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b) return;
    const d = b.dataset;
    if (d.lineup) update({ lineup: d.lineup, slots: { ...st.slots, [st.kind]: null } });
    else if (d.drop) update({ kind: d.drop === 'equip' ? 'equip' : 'turret' });
    else if (d.slot !== undefined) {
      const n = Number(d.slot);
      if (d.cat) {
        if (d.cat !== itemCat(st.kind, currentSlots()[n]![0])) setSlot(n, itemIds(st.kind).find((k) => itemCat(st.kind, k) === d.cat) ?? null, null);
      } else if (d.item) setSlot(n, d.item, null);
      else if (d.rar) setSlot(n, null, Number(d.rar));
    }
  });
  renderOptions();

  function power(): void {
    if (busy) return;
    busy = true;
    const offer = opts.seed !== undefined ? makeOffer(opts.seed) : makeOffer(Math.floor(Math.random() * 2 ** 31), offerSettings());
    boot.hide();
    bootEl.classList.remove('sv-fadein');
    back.hidden = true;
    void sfx.unlock().then(() => runScreen(offer, finished));
  }

  function finished(): void {
    busy = false;
    if (opts.onDone) return opts.onDone();
    void bootEl.offsetWidth;
    bootEl.classList.add('sv-fadein');
    back.hidden = false;
    boot.show('REBOOT');
    bootEl.scrollTop = 0;
  }

  /** One boot of the reward screen: reveal → pick / scrap all → CRT off → `onOff`. */
  function runScreen(offer: SalvageOffer, onOff: () => void): void {
    const sum = scrapAllValue(offer);
    const eq = offer.kind === 'equip';
    const nounLc = eq ? 'items' : 'turrets';
    input.userTouched = false;
    const screen = document.createElement('div');
    screen.className = 'sv-screen crt';
    screen.innerHTML = `
    <div class="sv-wrap">
      <div class="sv-top bt2" style="animation-delay:.12s">
        <div class="sv-flavor">
          <span class="sv-h g bt" style="animation-delay:.2s">&gt; ${eq ? 'RAIDER VESSEL DESTROYED' : 'SENTINEL VESSEL DESTROYED'}</span>
          <span class="sv-sub bt2" style="animation-delay:.3s">Congratulations, Captain. Salvage recovered:</span>
        </div>
        <div class="sv-loot">
          <div class="sv-tilebox bt" style="animation-delay:.34s">
            <div class="sv-tile" data-ref="stile">${SCRAP_TILE_ICON}<span class="sv-num g"><span data-ref="snum">+0</span></span><span class="sv-lbl">Scrap</span></div>
          </div>
          <div class="sv-tilebox bt2" style="animation-delay:.4s">
            <div class="sv-tile" data-ref="atile">${AMMO_TILE_ICON}<span class="sv-num am g"><span data-ref="anum">+0</span></span><span class="sv-lbl">Ammunition</span></div>
          </div>
        </div>
      </div>
      <div class="sv-pickline">
        <span class="sv-h g bt2" style="animation-delay:1.2s">&gt; ${eq ? 'ARMORY CACHE RECOVERED. PICK ONE OF THREE ITEMS.' : 'WRECK BREAKING APART. PICK ONE OF THREE TURRETS.'}</span>
        <button type="button" class="sv-scrapall" data-ref="scrapall" style="visibility:hidden" tabindex="-1">${SCRAP_TILE_ICON}<span>Scrap all ${nounLc} → +${sum} Scrap</span></button>
      </div>
      <div class="sv-grid" data-ref="grid"></div>
    </div>`;
    scroller.scrollTop = 0;
    scroller.appendChild(screen);
    root.classList.add('sv-lit');
    const $ = <T extends HTMLElement = HTMLElement>(ref: string) => screen.querySelector<T>(`[data-ref="${ref}"]`)!;
    const grid = $('grid');
    const scrapBtn = $<HTMLButtonElement>('scrapall');
    const stile = $('stile');
    const atile = $('atile');
    const snum = $('snum');
    const anum = $('anum');
    const narrow = () => window.innerWidth < 1100;

    // ----- state -----
    let phase: Phase = 'live';
    let allDone = false;
    let armed: number | null = null;
    let sTick = 0;
    let aTick = 0;
    let timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    const stopSeq = () => {
      timers.forEach(clearTimeout);
      timers = [];
    };

    const cards: CardRefs[] = offer.items.map((t) => {
      const slot = document.createElement('div');
      slot.className = 'sv-slot';
      slot.style.setProperty('--r', RARITIES[t.rarity - 1]!.color);
      const wait = document.createElement('div');
      wait.className = 'sv-wait';
      wait.innerHTML = `<span>&gt; INCOMING SIGNAL</span><span class="blink">_</span>`;
      slot.appendChild(wait);
      grid.appendChild(slot);
      return { t, slot, wait, card: null, name: null, sub: [], pips: [], holo: null, rows: [], foot: [], ready: false, shown: false };
    });
    // ----- loot counters -----
    const setNum = (el: HTMLElement, v: number, tick: number) => {
      el.textContent = `+${v}`;
      el.className = tick % 2 ? 'cntA' : 'cntB';
    };
    const flashTile = (el: HTMLElement, tick: number) => {
      el.classList.remove('tileA', 'tileB', 'lock');
      el.classList.add(tick % 2 ? 'tileA' : 'tileB');
    };
    const floatUp = (tile: HTMLElement, text: string) => {
      const f = document.createElement('span');
      f.className = 'floatup';
      f.textContent = text;
      tile.parentElement!.appendChild(f);
      window.setTimeout(() => f.remove(), 900);
    };
    let countersDone = false;
    const finishCounters = (withFx: boolean) => {
      if (countersDone) return;
      countersDone = true;
      snum.textContent = `+${offer.scrap}`;
      anum.textContent = `+${offer.ammo}`;
      for (const tile of [stile, atile]) {
        tile.classList.remove('tileA', 'tileB');
        tile.classList.add('lock');
      }
      if (withFx) {
        floatUp(stile, `+${offer.scrap} Scrap`);
        floatUp(atile, `+${offer.ammo} Ammunition`);
      }
    };

    // ----- tooltips -----
    const tip = document.createElement('div');
    tip.className = 'sv-tip';
    const showTip = (el: HTMLElement, docked: boolean) => {
      const title = el.dataset.tipTitle ?? '';
      tip.innerHTML = `<b class="g">${esc(title)}</b><br>${esc(el.dataset.info ?? '')}`;
      screen.querySelectorAll('.tipon').forEach((x) => x.classList.remove('tipon'));
      if (docked) {
        tip.className = 'sv-tip dock';
        root.appendChild(tip);
      } else {
        tip.className = `sv-tip ${el.classList.contains('sv-row') ? 'up' : 'dn'}`;
        el.appendChild(tip);
      }
      if (el.classList.contains('sv-row')) el.classList.add('tipon');
    };
    const hideTip = () => {
      tip.remove();
      screen.querySelectorAll('.tipon').forEach((x) => x.classList.remove('tipon'));
    };

    // ----- card building -----
    const row = (ic: string, label: string, value: string, info: string, cls = '') =>
      `<div class="sv-row sv-info ${cls}" data-info="${esc(info)}" data-tip-title="${esc(label)}">${icon(ic, 20)}<span class="l">${esc(label)}</span><span class="v">${esc(value)}</span></div>`;

    const subParts = (t: SalvageItem) => chipsOf(t).map((c) => c.word);

    function buildCard(c: CardRefs, i: number): void {
      const t = c.t;
      const R = t.rarity;
      const chips = chipsOf(t);
      const stats: string[] = [];
      const foot: string[] = [];
      if (t.kind === 'turret') {
        stats.push(
          row(t.ion ? 'ION' : 'damage', t.ion ? 'ION Damage' : 'Damage', t.dmg ? `${t.dmg}×${t.proj}` : 'No damage', damageInfo(t), t.ion ? 'ion' : ''),
          row('energy', 'Energy', String(t.energy), STAT_INFO.energy),
          row('charge', 'Charge', `${t.charge}s`, STAT_INFO.charge),
        );
        if (t.cls === 'MISSILE') stats.push(row('ammo', 'Ammo', String(t.ammo), STAT_INFO.ammo));
        if (t.cls === 'LANCE') stats.push(row('charges', 'Charges', String(t.charges), STAT_INFO.charges));
      } else {
        const m = equipMain(t);
        stats.push(row(m.ic, m.label, m.value, m.info));
        foot.push(row(SLOT_ICON[t.slot] ?? 'weapon', 'Slot', tc(t.slot), `Equips in the ${t.slot} slot of a crew member. Cannot be changed during combat.`, 'ft'));
      }
      foot.push(row('scrap', 'Value', String(t.sell), STAT_INFO.value, 'ft'));
      const fx = t.fx.map((e) => {
        const x = effectText(e);
        return row(e[0], tc(x.name), tc(x.value), x.info, 'fx');
      });
      const chipHtml = chips
        .map((ch) =>
          ch.rar
            ? `<div class="sv-chip rar sv-info" data-tip-title="${esc(ch.word)}" data-info="${esc(ch.info)}"><span>${esc(ch.word)}</span></div>`
            : `<div class="sv-chip sv-info" data-tip-title="${esc(ch.word)}" data-info="${esc(ch.info)}">${icon(ch.ic!, 18)}<span>${esc(ch.word)}</span></div>`,
        )
        .join('');
      const subText = chips.map((ch) => ch.word).join(' ');
      const shell = document.createElement('div');
      shell.className = 'sv-shell shellon';
      shell.innerHTML = `
        <div class="sv-card${R >= 4 ? ' hi' : ''}" role="button" tabindex="0" aria-label="Secure ${esc(tc(t.name))}, ${esc(subText.toLowerCase())}">
          <div class="sv-head">
            <div class="sv-head-l">
              <span class="sv-name">${esc(scramble(tc(t.name), 0))}</span>
              <div class="sv-subl">${chipHtml}</div>
            </div>
            <div class="sv-pips" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
          </div>
          <div class="sv-holo">
            <div class="noise"></div>
            <div class="scanin">${holoSvg(t.img)}</div>
            <div class="scanline"></div>
          </div>
          <div class="sv-rows">${stats.join('')}</div>
          ${fx.length ? `<div class="sv-rows fxr">${fx.join('')}</div>` : ''}
          <div class="sv-rows foot">${foot.join('')}</div>
          <span class="sv-confirm">▶ TAP AGAIN TO SECURE</span>
        </div>`;
      c.wait.remove();
      c.slot.appendChild(shell);
      c.card = shell.querySelector<HTMLElement>('.sv-card')!;
      c.name = shell.querySelector<HTMLElement>('.sv-name')!;
      c.sub = [...shell.querySelectorAll<HTMLElement>('.sv-chip > span')];
      c.sub.forEach((s) => (s.textContent = scramble(s.textContent ?? '', 0)));
      c.pips = [...shell.querySelectorAll<HTMLElement>('.sv-pips i')];
      c.holo = shell.querySelector<HTMLElement>('.sv-holo')!;
      c.rows = [...shell.querySelectorAll<HTMLElement>('.sv-rows:not(.foot) .sv-row')];
      c.foot = [...shell.querySelectorAll<HTMLElement>('.sv-rows.foot .sv-row')];
      c.shown = true;
      const card = c.card;
      card.addEventListener('mouseenter', () => {
        if (input.lastPointer === 'mouse') setHover(i);
      });
      card.addEventListener('mouseleave', () => {
        if (input.lastPointer === 'mouse' && armed === i) setHover(null);
      });
      card.addEventListener('focus', () => {
        if (input.lastPointer === 'keyboard') setHover(i);
      });
      card.addEventListener('blur', () => {
        if (input.lastPointer === 'keyboard' && armed === i) setHover(null);
      });
      card.addEventListener('click', (e) => onCardClick(i, e));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          doPick(i);
        }
      });
      for (const el of card.querySelectorAll<HTMLElement>('.sv-info')) {
        el.addEventListener('mouseenter', () => {
          if (input.lastPointer === 'mouse' && infoReady(c, el)) showTip(el, false);
        });
        el.addEventListener('mouseleave', () => {
          if (input.lastPointer === 'mouse') hideTip();
        });
      }
    }
    const infoReady = (c: CardRefs, el: HTMLElement) => c.ready && el.classList.contains('sv-row') ? el.classList.contains('on') : c.ready;

    function setDecode(c: CardRefs, f: number): void {
      if (!c.name) return;
      c.name.textContent = f >= 1 ? tc(c.t.name) : scramble(tc(c.t.name), f);
      const parts = subParts(c.t);
      c.sub.forEach((s, k) => (s.textContent = f >= 1 ? parts[k]! : scramble(parts[k]!, f * 0.8)));
    }
    function setPips(c: CardRefs, n: number, pop: boolean): void {
      c.pips.forEach((p, k) => {
        p.classList.toggle('on', k < n);
        p.classList.toggle('rpop', pop && k === n - 1);
      });
    }
    function setFill(c: CardRefs, f: number): void {
      c.rows.forEach((r, j) => r.classList.toggle('on', f > j));
      c.foot.forEach((r) => r.classList.toggle('on', f >= 8));
    }
    function endScan(c: CardRefs): void {
      if (!c.holo) return;
      c.holo.querySelector('.noise')?.remove();
      c.holo.querySelector('.scanline')?.remove();
    }
    function rareRay(c: CardRefs): void {
      if (!c.holo || !c.card) return;
      const ray = document.createElement('div');
      ray.className = 'ray';
      c.holo.appendChild(ray);
      c.card.classList.remove('rare');
      void c.card.offsetWidth;
      c.card.classList.add('rare');
      window.setTimeout(() => ray.remove(), 900);
    }
    function burst(c: CardRefs): void {
      const R = c.t.rarity;
      const wrap = document.createElement('div');
      wrap.className = 'sv-fxwrap';
      wrap.innerHTML = `<div class="bloom"></div><div class="${R === 5 ? 'tear5' : 'tear4'}"></div>`;
      c.slot.appendChild(wrap);
      window.setTimeout(() => wrap.remove(), 1100);
      if (R === 5) {
        grid.classList.add('quake');
        window.setTimeout(() => grid.classList.remove('quake'), 450);
        const fl = document.createElement('div');
        fl.className = 'sv-flash';
        fl.style.background = `repeating-linear-gradient(0deg, rgba(255,255,255,.12) 0 1px, transparent 1px 3px), color-mix(in srgb, ${RARITIES[4]!.color} 28%, transparent)`;
        root.appendChild(fl);
        window.setTimeout(() => fl.remove(), 760);
      }
    }
    const follow = (c: CardRefs) => {
      if (narrow() && !input.userTouched) c.slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    // ----- reveal timeline (mockup timing) -----
    function runSeq(): void {
      sfx.play('boot');
      const SN = 14;
      const A = offer.ammo;
      const s0 = 500;
      const span = 600;
      const ammoAt = Array.from({ length: A }, (_, k) => Math.round(((k + 1) * span) / A));
      for (let k = 1; k <= SN; k++) {
        const tk = Math.round((k * span) / SN);
        const clash = ammoAt.some((x) => Math.abs(x - tk) < 30);
        at(s0 + tk, () => {
          sTick++;
          setNum(snum, Math.round((offer.scrap * k) / SN), sTick);
          flashTile(stile, sTick);
          if (!clash) sfx.play('coin', k);
        });
      }
      ammoAt.forEach((x, k) =>
        at(s0 + x, () => {
          aTick++;
          setNum(anum, k + 1, aTick);
          flashTile(atile, aTick);
          sfx.play('shell', k + 1);
        }),
      );
      const cDone = s0 + span + 80;
      at(cDone, () => {
        finishCounters(true);
        sfx.play('lock');
      });
      let cur = cDone + 120;
      cards.forEach((c, i) => {
        const R = c.t.rarity;
        const build = R === 5 ? 800 : R === 4 ? 450 : 0;
        if (build)
          at(cur, () => {
            c.wait.classList.add(R === 5 ? 'charge5' : 'charge4');
            c.wait.firstElementChild!.textContent = R === 5 ? '> !! ANOMALOUS SIGNAL !!' : '> STRONG SIGNAL DETECTED';
            sfx.play('charge', R, build / 1000);
            follow(c);
          });
        const b = cur + build;
        at(b, () => {
          buildCard(c, i);
          follow(c);
          if (R >= 4) {
            burst(c);
            sfx.play('burst', R);
          } else sfx.play('scan');
        });
        at(b + 300, () => {
          c.ready = true;
          c.card?.classList.add('ready');
        });
        for (let d = 1; d <= 6; d++) at(b + d * 40, () => setDecode(c, d / 6));
        at(b + 260, () => endScan(c));
        const pip = R >= 4 ? 110 : 90;
        for (let r = 1; r <= R; r++)
          at(b + 240 + r * pip, () => {
            setPips(c, r, true);
            sfx.play(r === R ? 'plimp' : 'stripe', r, R);
          });
        for (let f = 1; f <= 8; f++) at(b + 260 + f * 22, () => setFill(c, f));
        if (R >= 3)
          at(b + 300 + R * pip, () => {
            rareRay(c);
            sfx.play('fanfare', R);
          });
        cur = b + 380 + (R === 5 ? 700 : R === 4 ? 420 : R === 3 ? 120 : 0);
      });
      at(cur, setAllDone);
      at(cur + 150, finale);
    }

    function setAllDone(): void {
      if (!allDone && phase === 'live') showScrapBtn(true);
      allDone = true;
    }

    /** The scrap-all button keeps its place while hidden (no layout jump on phones). */
    function showScrapBtn(on: boolean): void {
      scrapBtn.style.visibility = on ? 'visible' : 'hidden';
      scrapBtn.tabIndex = on ? 0 : -1;
      scrapBtn.classList.toggle('bt', on);
    }

    /** Jump to the end state of the reveal (tap on empty space, or before a pick). */
    function finishAll(): void {
      stopSeq();
      finishCounters(false);
      cards.forEach((c, i) => {
        if (!c.shown) buildCard(c, i);
        endScan(c);
        c.holo?.classList.add('done');
        setDecode(c, 1);
        setPips(c, c.t.rarity, false);
        setFill(c, 8);
        c.ready = true;
        c.card?.classList.add('ready');
      });
      root.querySelectorAll('.sv-fxwrap, .sv-flash').forEach((x) => x.remove());
      grid.classList.remove('quake');
      setAllDone();
    }

    function finale(): void {
      if (phase !== 'live') return;
      sfx.play('finale');
      cards.forEach((c, i) => {
        c.slot.style.animationDelay = `${(i * 0.09).toFixed(2)}s`;
        c.slot.classList.remove('fpulse');
        void c.slot.offsetWidth;
        c.slot.classList.add('fpulse');
        const wrap = document.createElement('div');
        wrap.className = 'sv-fxwrap';
        wrap.innerHTML = `<div class="fband" style="animation-delay:${(i * 0.09).toFixed(2)}s"></div>`;
        c.slot.appendChild(wrap);
        window.setTimeout(() => {
          wrap.remove();
          c.slot.classList.remove('fpulse');
        }, 1000);
      });
    }

    function setHover(i: number | null): void {
      if (phase !== 'live') return;
      armed = i !== null && cards[i]?.ready ? i : null;
      cards.forEach((c, k) => {
        c.card?.classList.toggle('hov', k === armed);
        c.card?.classList.toggle('armed', k === armed && input.lastPointer !== 'mouse' && input.lastPointer !== 'keyboard');
      });
    }

    function onCardClick(i: number, e: MouseEvent): void {
      e.stopPropagation();
      const c = cards[i]!;
      if (phase !== 'live' || !c.ready) return;
      const info = (e.target as HTMLElement).closest<HTMLElement>('.sv-info');
      if (input.lastPointer === 'mouse' || input.lastPointer === 'keyboard' || e.detail === 0) {
        // mouse / keyboard: like the mockup – one click secures, info words never pick
        if (!info) doPick(i);
        return;
      }
      // touch: first tap arms the card (and explains a tapped stat), the next tap secures it
      if (info) {
        showTip(info, true);
        if (armed !== i) {
          setHover(i);
          sfx.play('arm');
        }
        return;
      }
      hideTip();
      if (armed === i) doPick(i);
      else {
        setHover(i);
        sfx.play('arm');
      }
    }

    function powerOff(offAt: number, darkAt: number): void {
      window.setTimeout(() => {
        phase = 'off';
        screen.classList.add('off');
        root.classList.remove('sv-lit');
        sfx.play('off');
      }, offAt);
      window.setTimeout(() => {
        const dot = document.createElement('div');
        dot.className = 'sv-afterglow';
        root.appendChild(dot);
        window.setTimeout(() => dot.remove(), 700);
        stopSeq();
        hideTip();
        screen.remove();
        onOff();
      }, darkAt);
    }

    function doPick(i: number): void {
      if (phase !== 'live' || !cards[i]?.ready) return;
      finishAll();
      hideTip();
      phase = 'confirm';
      showScrapBtn(false);
      saveRun(pick(loadRun(), offer, i));
      cards.forEach((c, k) => {
        const card = c.card!;
        card.classList.remove('rare', 'armed', 'hov');
        card.classList.add(k === i ? 'sel' : 'drop');
        if (k === i) {
          card.classList.add('pick');
          const st = document.createElement('div');
          st.className = 'sv-stamp';
          st.innerHTML = '<span class="g">SECURED</span>';
          card.appendChild(st);
        }
      });
      sfx.play('select');
      powerOff(260, 760);
    }

    function doScrapAll(): void {
      if (phase !== 'live' || !allDone) return;
      stopSeq();
      hideTip();
      phase = 'confirm';
      showScrapBtn(false);
      if (narrow()) scroller.scrollTo({ top: 0, behavior: 'smooth' });
      saveRun(scrapAll(loadRun(), offer));
      cards.forEach((c) => {
        c.card?.classList.remove('rare', 'armed', 'hov');
        c.card?.classList.add('drop');
      });
      sfx.play('select');
      const n = 6;
      for (let k = 1; k <= n; k++)
        window.setTimeout(() => {
          sTick++;
          setNum(snum, offer.scrap + Math.round((sum * k) / n), sTick);
          flashTile(stile, sTick);
          sfx.play('coin', 8 + k);
        }, k * 40);
      powerOff(420, 920);
    }

    // ----- input -----
    scrapBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      doScrapAll();
    });
    screen.addEventListener('click', (e) => {
      // tap on empty space: skip the rest of the reveal, let go of an armed card, close the info chip
      if ((e.target as HTMLElement).closest('button, .sv-card')) return;
      hideTip();
      if (phase !== 'live') return;
      if (!allDone) {
        finishAll();
        finale();
      } else setHover(null);
    });

    runSeq();
  }
}
