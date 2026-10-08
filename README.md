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

## Deploy to Cloudflare

Deploys run from GitHub Actions (`.github/workflows/deploy.yml`):
push to `main` = live, push to any other branch = preview URL
(shown in the run summary under the repo's **Actions** tab).

One-time setup (works from a phone):
1. Cloudflare → profile icon → **Profile** → **API Tokens** → **Create Token** →
   template **Edit Cloudflare Workers** → **Use template** → Account: yours,
   Zone: All zones → **Continue to summary** → **Create Token** → copy it.
2. Copy your **Account ID**: the long code in the URL after `dash.cloudflare.com/`.
3. GitHub repo → **Settings** → **Secrets and variables** → **Actions** →
   **New repository secret** twice: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
4. GitHub → **Actions** → latest run → **Re-run all jobs** (or push a commit).
5. After the first successful `main` deploy: Cloudflare → **Workers & Pages** →
   `atomic-drifter-web` → **Settings** → **Domains & Routes** → **Add** →
   **Custom domain** → `adw.luzari-games.com`.

Never paste the API token anywhere except GitHub Secrets.

## Project layout

- `src/core/` – pure game rules and state (no Phaser)
- `src/data/` – game content as JSON
- `src/render/` – Phaser scenes that draw core state
- `src/ui/` – HTML/CSS overlay (top bar, info line, menus)

See `CLAUDE.md` for the architecture and design rules.
