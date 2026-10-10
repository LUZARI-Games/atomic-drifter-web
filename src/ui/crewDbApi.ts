// Talks to the website's crew database (worker/index.ts, /api/*). The game and the /crew-db/ page use it.
import { parseCrewDb, SEED_DB, type Collection, type CrewDb } from '../core/crewdb';

/** The live database; null if the server does not answer within `timeoutMs` (e.g. `npm run dev` without the worker). */
export async function fetchCrewDb(timeoutMs = 2500): Promise<CrewDb | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch('/api/db', { signal: ctl.signal, cache: 'no-store' });
    if (!res.ok) return null;
    return parseCrewDb(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Live database, else the one shipped with the game. */
export async function loadCrewDb(): Promise<{ db: CrewDb; live: boolean }> {
  const live = await fetchCrewDb();
  return live ? { db: live, live: true } : { db: SEED_DB, live: false };
}

async function call(method: string, path: string, body?: BodyInit, type = 'application/json'): Promise<void> {
  const res = await fetch(path, { method, body, headers: body ? { 'content-type': type } : undefined });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch {
      /* keep the status */
    }
    throw new Error(msg);
  }
}

export const saveRecord = (col: Collection, id: string, record: unknown) => call('PUT', `/api/db/${col}/${id}`, JSON.stringify(record));
export const deleteRecord = (col: Collection, id: string) => call('DELETE', `/api/db/${col}/${id}`);
export const uploadPortrait = (id: string, file: Blob) => call('POST', `/api/portraits/${id}`, file, file.type);
