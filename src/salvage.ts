// Salvage screen – see src/ui/salvage.ts (rules: src/core/salvage.ts)
import './ui/styles.css';
import './ui/salvage.css';
import { seedFrom } from './core/salvage';
import { applyGreyscale, greyscaleItem, mountMenu, toggleFullscreen } from './ui/menu';
import { mountSalvage } from './ui/salvage';

const param = new URLSearchParams(location.search).get('seed');
const seed = param ? seedFrom(param) : Math.floor(Math.random() * 2 ** 31);

mountSalvage(document.getElementById('screen')!, { seed });
mountMenu(document.getElementById('hud')!, 'SALVAGE', [
  { label: 'GAME', href: '/' },
  {
    label: 'NEW SALVAGE',
    onClick: () => {
      const u = new URL(location.href);
      u.searchParams.set('seed', String(Math.floor(Math.random() * 2 ** 31)));
      location.href = u.toString();
    },
  },
  greyscaleItem(),
  { label: 'FULLSCREEN', onClick: () => void toggleFullscreen() },
]);
applyGreyscale();
