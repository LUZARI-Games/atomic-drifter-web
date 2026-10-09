// Ship Upgrades screen – see src/ui/upgrades.ts
import './ui/styles.css';
import './ui/upgrades.css';
import { applyGreyscale, greyscaleItem, mountMenu, toggleFullscreen } from './ui/menu';
import { mountUpgrades } from './ui/upgrades';

mountUpgrades(document.getElementById('screen')!);
mountMenu(document.getElementById('hud')!, 'SHIP UPGRADES', [
  { label: 'GAME', href: '/' },
  { label: 'NEW RUN', href: '/new-run/' },
  greyscaleItem(),
  ...(document.fullscreenEnabled ? [{ label: 'FULLSCREEN', onClick: () => void toggleFullscreen() }] : []),
]);
applyGreyscale();
