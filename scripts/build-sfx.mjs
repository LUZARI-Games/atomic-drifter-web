// Lists the owner's own sound files (public/sfx/<sound id>.ogg|mp3|wav) in public/sfx/index.json.
// The game plays such a file instead of its synthesized placeholder (src/ui/sfxFiles.ts). Runs before dev/build.
import { readdirSync, writeFileSync } from 'node:fs';
const dir = new URL('../public/sfx/', import.meta.url);
const files = readdirSync(dir).filter((f) => /^[a-z0-9_]+\.(ogg|mp3|wav)$/.test(f)).sort();
writeFileSync(new URL('index.json', dir), JSON.stringify({ files }, null, 1) + '\n');
console.log(`sfx: ${files.length} own sound file(s)`);
