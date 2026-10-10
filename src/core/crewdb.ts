// Crew database (characters, factions, portraits) – edited on the website (/crew-db/), stored on the server, read by
// the game at start. Pure rules: record validation shared by server + page, and the roster the game draws crew from.
// Engine-neutral: plain data in, plain data out.
import COMBAT from '../data/combat.json';
import SEED from '../data/crew_db_seed.json';

export type Side = 'crew' | 'enemy';
export type Build = 'normal' | 'tank';

export interface CharacterRecord {
  name: string;
  side: Side;
  faction: string | null;
  build: Build;
  sex: 'male' | 'female';
  hp: number | null; // null = default from combat.json (by side + build)
  hit: number; // damage per blow
  portrait: string | null; // portrait id
  attrs: { name: string; value: string }[]; // free attributes
  notes: string;
}
export interface FactionRecord {
  name: string;
  color: string; // #rrggbb
  notes: string;
}
export interface PortraitRecord {
  file: string; // image URL: /portraits/<id>.webp (built in) or /api/portrait-img/<id> (uploaded)
}
export interface CrewDb {
  characters: Record<string, CharacterRecord>;
  factions: Record<string, FactionRecord>;
  portraits: Record<string, PortraitRecord>;
}
export type Collection = 'characters' | 'factions' | 'portraits';
export const COLLECTIONS: Collection[] = ['characters', 'factions', 'portraits'];

/** Record ids: lower-case letters, digits and _ (1–60 chars). */
export const isId = (id: unknown): id is string => typeof id === 'string' && /^[a-z0-9_]{1,60}$/.test(id);
/** A readable name -> record id ("Iron Mall Citizen" -> "iron_mall_citizen"). */
export const toId = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'new';

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown, lo: number, hi: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : null;
};

/** Clean one record of a collection (unknown fields dropped, values clamped); null if it is unusable. */
export function cleanRecord(collection: Collection, raw: unknown): CharacterRecord | FactionRecord | PortraitRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (collection === 'characters') {
    const name = str(r.name, 40).toUpperCase();
    if (!name) return null;
    const attrs = Array.isArray(r.attrs)
      ? r.attrs.slice(0, 30).map((a) => ({ name: str((a as Record<string, unknown>)?.name, 30).toUpperCase(), value: str((a as Record<string, unknown>)?.value, 60) })).filter((a) => a.name)
      : [];
    return {
      name,
      side: r.side === 'enemy' ? 'enemy' : 'crew',
      faction: isId(r.faction) ? r.faction : null,
      build: r.build === 'tank' ? 'tank' : 'normal',
      sex: r.sex === 'female' ? 'female' : 'male',
      hp: num(r.hp, 1, 999),
      hit: num(r.hit, 0, 99) ?? COMBAT.hit_damage,
      portrait: isId(r.portrait) ? r.portrait : null,
      attrs,
      notes: str(r.notes, 1000),
    };
  }
  if (collection === 'factions') {
    const name = str(r.name, 40).toUpperCase();
    if (!name) return null;
    const color = typeof r.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.color) ? r.color.toLowerCase() : '#86902a';
    return { name, color, notes: str(r.notes, 1000) };
  }
  const file = str(r.file, 200);
  return /^\/(portraits\/[a-z0-9_]+\.webp|api\/portrait-img\/[a-z0-9_]+)$/.test(file) ? { file } : null;
}

/** A whole database from untrusted JSON (bad records are skipped). */
export function parseCrewDb(raw: unknown): CrewDb {
  const db: CrewDb = { characters: {}, factions: {}, portraits: {} };
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  for (const col of COLLECTIONS) {
    const recs = src[col];
    if (!recs || typeof recs !== 'object') continue;
    for (const [id, rec] of Object.entries(recs as Record<string, unknown>)) {
      const clean = isId(id) ? cleanRecord(col, rec) : null;
      if (clean) (db[col] as Record<string, unknown>)[id] = clean;
    }
  }
  return db;
}

/** The database the game ships with (used until the live one answers). */
export const SEED_DB: CrewDb = parseCrewDb(SEED);

/** Default HP by side + build (combat.json), unless the record sets its own. */
export function characterHp(c: Pick<CharacterRecord, 'side' | 'build' | 'hp'>): number {
  return c.hp ?? COMBAT.hp[c.side][c.build];
}

/** One character as the game uses it. */
export interface RosterEntry {
  id: string;
  name: string;
  side: Side;
  faction: string | null;
  build: Build;
  sex: 'male' | 'female';
  hp: number;
  hit: number;
  portrait: string | null;
}
export interface Roster {
  captain: RosterEntry | null; // the character with the captain portrait, if any
  crew: RosterEntry[]; // own crew (without the captain)
  enemies: RosterEntry[];
  portraits: Record<string, string>; // portrait id -> image URL
}

/** Turn the database into the roster the game picks its crew and boarders from. */
export function rosterFrom(db: CrewDb, captainPortrait = 'power_armor'): Roster {
  const all = Object.entries(db.characters)
    .map(([id, c]): RosterEntry => ({ id, name: c.name, side: c.side, faction: c.faction, build: c.build, sex: c.sex, hp: characterHp(c), hit: c.hit, portrait: c.portrait && db.portraits[c.portrait] ? c.portrait : null }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const captain = all.find((c) => c.side === 'crew' && c.portrait === captainPortrait) ?? null;
  return {
    captain,
    crew: all.filter((c) => c.side === 'crew' && c !== captain),
    enemies: all.filter((c) => c.side === 'enemy'),
    portraits: Object.fromEntries(Object.entries(db.portraits).map(([id, p]) => [id, p.file])),
  };
}
