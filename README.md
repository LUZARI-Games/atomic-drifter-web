# Atomic Drifter Web

FTL-like ship roguelite prototype in a Fallout 3 Pip-Boy terminal style.
Vite + TypeScript + Phaser 4, deployed on Cloudflare Workers (static assets).

## Run locally

```bash
npm install
npm run dev
```

Open the printed URL. Because the dev server runs with `--host`, the
"Network" URL also works on a phone in the same Wi-Fi.

## Build & check

```bash
npm run typecheck   # strict TypeScript
npm test            # unit tests (Vitest)
npm run build       # outputs to dist/
npm run preview     # serve dist/ locally
```

## Deploy to Cloudflare (from your phone)

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a repository**
   (Workers tab) → connect GitHub if asked → pick **luzari-games/atomic-drifter-web**.
2. On the setup screen enter:
   - **Project name:** `atomic-drifter-web` (must match `name` in `wrangler.jsonc`)
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`
   - **Path / root directory:** `/` (leave default)
   - Production branch: `main`

   Then tap **Create and deploy**. `wrangler.jsonc` tells Cloudflare to serve `dist/`
   with single-page-app fallback; no output-directory field is needed.
3. After the first deploy succeeds: open the Worker → **Settings** →
   **Domains & Routes** → **Add** → **Custom domain** → `adw.luzari-games.com` →
   **Add domain**. (`luzari-games.com` must be a zone in the same Cloudflare account;
   DNS and the certificate are created automatically, give it a few minutes.)

Every push to `main` redeploys automatically. Pushes to other branches get preview URLs.

## Project layout

- `src/core/` – pure game rules and state (no Phaser)
- `src/data/` – game content as JSON
- `src/render/` – Phaser scenes that draw core state
- `src/ui/` – HTML/CSS overlay (top bar, info line, menus)

See `CLAUDE.md` for the architecture and design rules.
