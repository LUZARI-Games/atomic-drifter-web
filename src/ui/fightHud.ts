// Ship fight HUD: the P.A.U.S.E. button (bottom centre, also SPACE) and one short hint line above it – what to do
// next, incoming fire (clear the red room!), victory. Time stopped: the game turns grey-green with a frame.
import { foeBeaten, foeThreat } from '../core/foe';
import { inFight, togglePause } from '../core/pause';
import { PAUSE_NAME } from '../core/story';
import type { Store } from '../core/store';
import type { GameState } from '../core/types';
import { anyActive } from '../core/weapons';

export function mountFightHud(root: HTMLElement, store: Store<GameState>, play: (id: string) => void): void {
  const el = document.createElement('div');
  el.className = 'fight-hud';
  el.innerHTML = `<p class="fh-hint" hidden></p><button class="fh-pause" type="button" hidden title="${PAUSE_NAME}">[ P.A.U.S.E. ]</button>`;
  root.appendChild(el);
  const hint = el.querySelector<HTMLElement>('.fh-hint')!;
  const btn = el.querySelector<HTMLButtonElement>('.fh-pause')!;
  const frame = document.createElement('div');
  frame.className = 'pause-frame';
  frame.hidden = true;
  root.appendChild(frame);
  const toggle = () => {
    const before = !!store.get().paused;
    store.update(togglePause);
    const now = !!store.get().paused;
    if (now !== before) play(now ? 'pause_on' : 'pause_off');
  };
  btn.addEventListener('click', toggle);
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' && !(e.target instanceof HTMLInputElement) && !document.querySelector('.dlg')) {
      e.preventDefault();
      toggle();
    }
  });
  let wonAt = 0;
  let last = '';
  store.subscribe((s) => {
    const paused = !!s.paused;
    const fight = inFight(s);
    if (s.foe && foeBeaten(s.foe) && !wonAt) wonAt = performance.now();
    if (!s.foe || !foeBeaten(s.foe)) wonAt = s.foe ? 0 : wonAt;
    const threat = foeThreat(s);
    let text = '';
    let tone = '';
    if (paused) [text, tone] = ['TIME STOPPED – GIVE ORDERS, THEN RESUME', 'amber'];
    else if (threat && s.foe?.ai.phase === 'aim') [text, tone] = ['INCOMING! GET YOUR CREW OUT OF THE RED ROOM', 'red'];
    else if (s.foe && !foeBeaten(s.foe) && !anyActive(s)) [text, tone] = ['TAP A GUN, THEN AN ENEMY ROOM', ''];
    else if (s.foe && !foeBeaten(s.foe) && !s.weapons?.target) [text, tone] = ['TAP AN ENEMY ROOM TO OPEN FIRE', ''];
    else if (wonAt && performance.now() - wonAt < 5000) [text, tone] = ['SENTINEL SHIP DISABLED', ''];
    const key = `${paused}|${fight}|${text}|${tone}`;
    if (key === last) return;
    last = key;
    btn.hidden = !fight && !paused;
    btn.classList.toggle('on', paused);
    btn.textContent = paused ? '[ RESUME ]' : '[ P.A.U.S.E. ]';
    hint.hidden = !text;
    hint.textContent = text;
    hint.className = `fh-hint ${tone}`;
    frame.hidden = !paused;
    document.getElementById('game')?.classList.toggle('paused', paused);
  });
}
