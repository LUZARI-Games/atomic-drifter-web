// Builds public/planner/index.html from planner/source.html (the untouched Ship Interior Planner artifact)
// by injecting the website bridge as the first script. Runs automatically before `npm run dev` and `npm run build`.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'planner/source.html');
const out = resolve(root, 'public/planner/index.html');

let html = readFileSync(src, 'utf8');
const tag = '<script src="./bridge.js"></script>';
const head = html.match(/<head[^>]*>/i);
if (!head) throw new Error('planner/source.html has no <head> – is it the full planner HTML?');
if (!html.includes('id="gdBtn"')) console.warn('[planner] warning: no Godot export button (#gdBtn) – TEST IN GAME will not work');

const at = head.index + head[0].length;
html = html.slice(0, at) + tag + html.slice(at);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`[planner] built public/planner/index.html (${Math.round(html.length / 1024)} KB)`);
