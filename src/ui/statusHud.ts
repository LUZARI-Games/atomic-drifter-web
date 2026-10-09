// Top-left HUD (FTL-like): ship status row (hull, shields, evasion | ammunition, scrap) and the crew portraits
// (captain first and bigger, then the crew; health bar, station badge). Tap a portrait to select that crew member.
// Reads core state only; selecting goes through core (selectCrew).
import { CREW_LOOKS } from '../core/crew';
import { consoleOf, selectCrew } from '../core/crewmove';
import { systemId } from '../core/systems';
import type { Store } from '../core/store';
import type { CrewMember, GameState } from '../core/types';
import PORTRAITS from '../data/portraits.json';
import SYSTEMS from '../data/systems.json';

const svg = (body: string, cls = 'ico') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
export const HUD_ICONS = {
  // airship hull: envelope + gondola
  hull: svg('<ellipse cx="12" cy="9" rx="9" ry="4.5"/><path d="M9 13.5v3h6v-3M3 9h18"/>'),
  shield: svg('<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/>'),
  evasion: svg('<path d="M4 17l5-5-5-5M11 17l5-5-5-5M18 7v10"/>'),
  ammo: svg('<path d="M9 21V10c0-3 1.5-6 3-7 1.5 1 3 4 3 7v11zM9 16h6"/>'),
  scrap: svg('<circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>'),
};

/** The owner's face portrait (public/portraits) – or a drawn stand-in (head + shoulders) when a crew member has none. */
function portraitHtml(c: CrewMember): string {
  const p = PORTRAITS.portraits.find((x) => x.id === c.portrait);
  if (p) return `<img class="face" src="${p.file}" alt="" draggable="false">`;
  return portraitSvg(c);
}

function portraitSvg(c: CrewMember): string {
  const o = CREW_LOOKS.origins[c.look.origin];
  const skin = CREW_LOOKS.skin_tones[c.look.skin] ?? '#C9A183';
  const hair = CREW_LOOKS.hair_colors[c.look.hair] ?? '#2B2118';
  const wide = c.look.build === 'tank' ? 1.18 : 1;
  return `<svg class="face" viewBox="0 0 48 48">
    <rect width="48" height="48" fill="#06140d"/>
    <path d="M${24 - 17 * wide} 48 C${24 - 17 * wide} 36 ${24 - 9 * wide} 32 24 32 C${24 + 9 * wide} 32 ${24 + 17 * wide} 36 ${24 + 17 * wide} 48Z" fill="${o.color}"/>
    <rect x="20" y="26" width="8" height="8" fill="${skin}"/>
    <circle cx="24" cy="20" r="9" fill="${skin}"/>
    <path d="M15 19 C15 10 33 10 33 19 C31 14 17 14 15 19Z" fill="${hair}"/>
  </svg>`;
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const healthClass = (share: number) => (share > 0.5 ? '' : share > 0.25 ? 'warn' : 'bad');

export function mountStatusHud(root: HTMLElement, store: Store<GameState>): void {
  const el = document.createElement('div');
  el.className = 'status-hud';
  el.innerHTML = `
    <div class="sh-row">
      <div class="pn sh-ship">
        <span class="sh-stat" title="HULL">${HUD_ICONS.hull}<span class="sh-hull" data-ref="hull"></span></span>
        <span class="sh-stat" title="SHIELDS">${HUD_ICONS.shield}<span class="sh-shield"><span class="pips" data-ref="pips"></span><span class="charge"><i data-ref="charge"></i></span></span></span>
        <span class="sh-stat g" title="EVASION">${HUD_ICONS.evasion}<b data-ref="evasion"></b></span>
      </div>
      <div class="pn sh-res">
        <span class="sh-stat g" title="AMMUNITION">${HUD_ICONS.ammo}<b data-ref="ammo"></b></span>
        <span class="sh-stat g" title="SCRAP">${HUD_ICONS.scrap}<b data-ref="scrap"></b></span>
      </div>
    </div>
    <div class="sh-crew" data-ref="crew"></div>`;
  root.appendChild(el);
  const $ = (r: string) => el.querySelector(`[data-ref="${r}"]`) as HTMLElement;
  const crewBox = $('crew');
  crewBox.addEventListener('click', (e) => {
    const card = (e.target as HTMLElement).closest('[data-crew]') as HTMLElement | null;
    if (!card) return;
    const id = card.dataset.crew!;
    store.update((s) => selectCrew(s, s.selectedCrewId === id ? null : id));
  });

  let crewKey = '';
  const render = (s: GameState) => {
    const st = s.status;
    // hull: one segment per hull point (FTL style), lit = remaining
    const hull = $('hull');
    if (hull.childElementCount !== st.hullMax) hull.innerHTML = '<i></i>'.repeat(st.hullMax);
    const low = st.hull / st.hullMax <= 0.25 ? 'bad' : st.hull / st.hullMax <= 0.5 ? 'warn' : '';
    hull.className = `sh-hull ${low}`;
    [...hull.children].forEach((seg, i) => seg.classList.toggle('on', i < st.hull));
    const pips = $('pips');
    if (pips.childElementCount !== st.shieldMax) pips.innerHTML = '<i></i>'.repeat(st.shieldMax);
    [...pips.children].forEach((p, i) => p.classList.toggle('on', i < st.shieldLayers));
    $('charge').style.width = `${Math.round(st.shieldCharge * 100)}%`;
    $('evasion').textContent = `${Math.round(st.evasion * 100)}%`;
    $('ammo').textContent = `${st.ammo}/${st.ammoMax}`;
    $('scrap').textContent = fmt(st.scrap);

    // crew: rebuild only when people / selection / health / station change
    const ordered = [...s.crew].sort((a, b) => Number(!!b.captain) - Number(!!a.captain));
    const key = JSON.stringify([s.selectedCrewId, ordered.map((c) => [c.id, c.hp, c.hpMax, stationOf(s, c)])]);
    if (key === crewKey) return;
    crewKey = key;
    crewBox.innerHTML = ordered
      .map((c) => {
        const share = c.hp / c.hpMax;
        const sys = stationOf(s, c);
        const col = sys ? (SYSTEMS as Record<string, { color: string; name: string }>)[sys]?.color : null;
        return `<button type="button" class="pn sh-face${c.captain ? ' captain' : ''}${c.id === s.selectedCrewId ? ' sel' : ''}" data-crew="${c.id}">
          ${portraitHtml(c)}
          <span class="nm">${c.name}</span>
          <span class="hp ${healthClass(share)}"><i style="width:${Math.round(share * 100)}%"></i></span>
          ${col ? `<span class="badge" style="background:${col}" title="${sys!.toUpperCase()}"></span>` : ''}
        </button>`;
      })
      .join('');
  };
  store.subscribe(render);
  render(store.get());
}

/** The system whose console this crew member is standing at (null while walking or elsewhere). */
function stationOf(s: GameState, c: CrewMember): string | null {
  if (c.path.length || !consoleOf(s.ship, c.node)) return null;
  const idx = Number(c.node.slice(1));
  const tile = s.ship.tiles[idx];
  if (!tile) return null;
  const room = s.ship.rooms.find((r) => r.id === tile.room);
  return room?.system ? systemId(room.system) : null;
}
