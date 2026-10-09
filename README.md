# Atomic Drifter Web

2D browser prototype of **Atomic Drifter** – Phaser 4 + TypeScript + HTML/CSS overlay.
Live (after setup): https://adw.luzari-games.com

## Run & build
```bash
npm install
npm run dev        # dev server (open the shown URL, also on your phone in the same Wi-Fi)
npm test           # unit tests
npm run build      # typecheck + build to dist/
```

## Project structure
- `src/core/` – game rules (no Phaser) → portable to Godot/Unreal
- `src/data/` – game content as JSON
- `src/render/` – Phaser scenes (drawing only)
- `src/ui/` – HTML/CSS interface
- `docs/handoffs/` – task specs

## Cloudflare setup (one time, works from the phone)
1. Open **dash.cloudflare.com** → **Workers & Pages** → **Create** → **Import a repository**
   (if asked, connect GitHub and allow access to `atomic-drifter-web`).
2. Select **LUZARI-Games / atomic-drifter-web** and enter:
   - Project name: `atomic-drifter-web`
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
   - Leave everything else as is → **Create and deploy**.
3. Wait for the green "Success". You get a link like `atomic-drifter-web.<name>.workers.dev` – open it on your phone.
4. Own domain: in the project → **Settings** → **Domains & Routes** → **Add** → **Custom domain** →
   `adw.luzari-games.com` → **Add domain**. Works after a few minutes, HTTPS included.
   Your main website `luzari-games.com` is not touched.

From then on, every push to `main` deploys automatically.
