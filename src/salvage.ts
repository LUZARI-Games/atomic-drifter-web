// Salvage screen – see src/ui/salvage.ts (rules: src/core/salvage.ts). Opens on the boot screen (POWER ON + OPTIONS).
import './ui/styles.css';
import './ui/salvage.css';
import { seedFrom } from './core/salvage';
import { applyGreyscale, greyscaleItem, mountMenu, toggleFullscreen } from './ui/menu';
import { mountSalvage } from './ui/salvage';

const param = new URLSearchParams(location.search).get('seed');
const withSeed = (seed: string | null) => {
  const u = new URL(location.href);
  if (seed === null) u.searchParams.delete('seed');
  else u.searchParams.set('seed', seed);
  location.href = u.toString();
};

// ?seed=… = a fixed random turret offer (to reproduce one); without it POWER ON uses the boot-screen choices
mountSalvage(document.getElementById('screen')!, { seed: param ? seedFrom(param) : undefined });
mountMenu(document.getElementById('hud')!, 'SALVAGE', [
  { label: 'GAME', href: '/' },
  { label: 'RANDOM SALVAGE', onClick: () => withSeed(String(Math.floor(Math.random() * 2 ** 31))) },
  ...(param ? [{ label: 'USE OPTIONS', onClick: () => withSeed(null) }] : []),
  greyscaleItem(),
  { label: 'FULLSCREEN', onClick: () => void toggleFullscreen() },
]);
applyGreyscale();
