// Website server (Cloudflare Worker): static pages come from ./dist; /api/* goes to ONE Durable Object that keeps the
// crew database (characters, factions, portraits + uploaded portrait images). Anyone may read and write for now
// (owner's choice) – an editor password can be added later.
//
// API
//   GET    /api/db                         -> { characters, factions, portraits }
//   PUT    /api/db/<collection>/<id>       JSON record (characters | factions | portraits) -> { id, record }
//   DELETE /api/db/<collection>/<id>
//   POST   /api/portraits/<id>             image body (webp / png / jpeg, ≤ 1 MB) -> { id, record }
//   GET    /api/portrait-img/<id>          the uploaded image
import { DurableObject } from 'cloudflare:workers';
import { cleanRecord, COLLECTIONS, isId, SEED_DB, type Collection } from '../src/core/crewdb';

interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  CREW_DB: DurableObjectNamespace<CrewDb>;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const fail = (status: number, error: string) => json({ error }, status);
const IMAGE_TYPES = ['image/webp', 'image/png', 'image/jpeg'];
const MAX_IMAGE = 1024 * 1024;
const MAX_RECORD = 16 * 1024;

export class CrewDb extends DurableObject<Env> {
  /** First use: fill the database from the seed shipped with the game. */
  private async ready(): Promise<void> {
    if (await this.ctx.storage.get('seeded')) return;
    const all = new Map<string, unknown>();
    for (const col of COLLECTIONS) for (const [id, rec] of Object.entries(SEED_DB[col])) all.set(`${col}:${id}`, rec);
    const entries = [...all.entries()];
    for (let i = 0; i < entries.length; i += 100) await this.ctx.storage.put(Object.fromEntries(entries.slice(i, i + 100)));
    await this.ctx.storage.put('seeded', true);
  }

  override async fetch(req: Request): Promise<Response> {
    await this.ready();
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
    const [, what, a, b] = parts;

    if (what === 'db' && !a && req.method === 'GET') {
      const out: Record<string, Record<string, unknown>> = { characters: {}, factions: {}, portraits: {} };
      for (const col of COLLECTIONS) {
        const recs = await this.ctx.storage.list({ prefix: `${col}:` });
        for (const [key, rec] of recs) out[col]![key.slice(col.length + 1)] = rec;
      }
      return json(out);
    }

    if (what === 'db' && a && b) {
      const col = a as Collection;
      if (!COLLECTIONS.includes(col) || !isId(b)) return fail(400, 'unknown collection or bad id');
      const key = `${col}:${b}`;
      if (req.method === 'DELETE') {
        await this.ctx.storage.delete(key);
        if (col === 'portraits') await this.ctx.storage.delete(`img:${b}`);
        return json({ id: b, deleted: true });
      }
      if (req.method === 'PUT') {
        const text = await req.text();
        if (text.length > MAX_RECORD) return fail(413, 'record too big');
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          return fail(400, 'not JSON');
        }
        const record = cleanRecord(col, body);
        if (!record) return fail(400, 'record is missing required fields');
        await this.ctx.storage.put(key, record);
        return json({ id: b, record });
      }
      return fail(405, 'method not allowed');
    }

    if (what === 'portraits' && a && req.method === 'POST') {
      if (!isId(a)) return fail(400, 'bad id');
      const type = (req.headers.get('content-type') ?? '').split(';')[0]!.trim();
      if (!IMAGE_TYPES.includes(type)) return fail(415, 'only webp, png or jpeg');
      const data = await req.arrayBuffer();
      if (data.byteLength > MAX_IMAGE) return fail(413, 'image bigger than 1 MB');
      const record = { file: `/api/portrait-img/${a}` };
      await this.ctx.storage.put({ [`img:${a}`]: { type, data }, [`portraits:${a}`]: record });
      return json({ id: a, record });
    }

    if (what === 'portrait-img' && a && req.method === 'GET') {
      const img = isId(a) ? await this.ctx.storage.get<{ type: string; data: ArrayBuffer }>(`img:${a}`) : undefined;
      if (!img) return fail(404, 'no such image');
      return new Response(img.data, { headers: { 'content-type': img.type, 'cache-control': 'public, max-age=300' } });
    }

    return fail(404, 'unknown API route');
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      const stub = env.CREW_DB.get(env.CREW_DB.idFromName('main'));
      return stub.fetch(req);
    }
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
