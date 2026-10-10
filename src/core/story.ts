// Run premise (src/data/story.json): the start crew of a faction, its opening dialog, and the once-per-run flag.
import STORY from '../data/story.json';
import NEW_RUN from '../data/new_run.json';
import type { Roster } from './crewdb';
import type { RunState } from './run';

export interface Start {
  home: string;
  crew: string[]; // crew database ids on board besides the captain
  dialog: string; // src/data/dialogs.json id
}

/** Faction the player's start crew belongs to (later: depends on the start ship). */
export const START_FACTION: string = STORY.start_faction;
/** "P.A.U.S.E. – PROMETHEUS ATOMIC UNIVERSAL STASIS ENGINE" */
export const PAUSE_NAME = `${STORY.pause.short} – ${STORY.pause.long.toUpperCase()}`;

/** The start of a faction (falls back to the default start faction). */
export function startOf(faction: string = START_FACTION): Start {
  const all = STORY.starts as Record<string, Start>;
  return all[faction] ?? all[START_FACTION]!;
}

/** Extra crew from modifiers like EXTRA RECRUIT (`effect.crew`). */
export function extraCrew(run: RunState): number {
  const mods = NEW_RUN.modifiers as { id: string; effect: { crew?: number } }[];
  return run.modifiers.reduce((n, id) => n + (mods.find((m) => m.id === id)?.effect.crew ?? 0), 0);
}

/**
 * Who is on board at the start: the captain + the start's named crew (those the database has), plus extra recruits
 * from the rest of the roster. Returns the roster to pick from (named crew only, recruits after them) and the count.
 */
export function startRoster(roster: Roster, run: RunState, faction: string = START_FACTION): { roster: Roster; count: number } {
  const named = startOf(faction).crew.map((id) => roster.crew.find((c) => c.id === id)).filter((c) => !!c);
  const rest = roster.crew.filter((c) => !named.includes(c));
  const extra = Math.min(extraCrew(run), rest.length);
  const own = named.length ? named : rest.slice(0, 2);
  const recruits = rest.filter((c) => !own.includes(c)).slice(0, extra);
  return { roster: { ...roster, crew: [...own, ...recruits] }, count: 1 + own.length + recruits.length };
}

/** The opening dialog shows once per run, on its first start. */
export const needsIntro = (run: RunState): boolean => !run.briefed;
export const markBriefed = (run: RunState): RunState => ({ ...run, briefed: true });
