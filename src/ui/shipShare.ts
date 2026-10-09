// COPY SHIP / SAVE SHIP FILE: hand the current ship to Claude (paste it in the chat or attach the file), so bugs can be
// checked on exactly this ship. Copies the planner export as it was loaded (TEST IN GAME), else the demo ship.
import type { MenuItem } from './menu';
import { rawShipText } from './shipSource';

function flash(text: string): void {
  const el = document.createElement('div');
  el.className = 'chip toast';
  el.textContent = text;
  document.getElementById('hud')!.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

/** Clipboard blocked: show the text in a box, already selected, so it can be copied by hand. */
function showText(text: string): void {
  const box = document.createElement('div');
  box.className = 'share-box';
  box.innerHTML = '<textarea readonly></textarea><button class="btn" type="button">[ CLOSE ]</button>';
  const area = box.querySelector('textarea')!;
  area.value = text;
  box.querySelector('button')!.addEventListener('click', () => box.remove());
  document.getElementById('hud')!.appendChild(box);
  area.focus();
  area.select();
}

export function shipShareItems(): MenuItem[] {
  return [
    {
      label: 'COPY SHIP',
      onClick: () => {
        const text = rawShipText();
        navigator.clipboard?.writeText(text).then(() => flash('SHIP COPIED // PASTE IT IN THE CHAT'), () => showText(text)) ?? showText(text);
      },
    },
    {
      label: 'SAVE SHIP FILE',
      onClick: () => {
        const text = rawShipText();
        let name = 'ship';
        try {
          name = String((JSON.parse(text) as { name?: string }).name || 'ship').toLowerCase().replace(/[^a-z0-9]+/g, '_');
        } catch {
          /* keep "ship" */
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        a.download = `${name}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        flash('SHIP FILE SAVED // ATTACH IT IN THE CHAT');
      },
    },
  ];
}
