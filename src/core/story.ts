// Run premise (src/data/story.json): the intro log at the start of a run and the start crew's faction.
import STORY from '../data/story.json';
import NEW_RUN from '../data/new_run.json';
import type { RunState } from './run';

export interface Intro {
  home: string;
  title: string;
  lines: string[];
  button: string;
}

/** Faction the player's start crew belongs to (later: depends on the start ship). */
export const START_FACTION: string = STORY.start_faction;
/** Crew members on board at the start of a run (the rest got scattered in the ambush). */
export const START_CREW: number = STORY.start_crew;
/** "P.A.U.S.E. – PROMETHEUS ATOMIC UNIVERSAL STASIS ENGINE" */
export const PAUSE_NAME = `${STORY.pause.short} – ${STORY.pause.long.toUpperCase()}`;

/** The intro log of a start faction (falls back to the default start faction). */
export function introFor(faction: string = START_FACTION): Intro {
  const all = STORY.intros as Record<string, Intro>;
  return all[faction] ?? all[START_FACTION]!;
}

/** The intro shows once per run, on its first start. */
export const needsIntro = (run: RunState): boolean => !run.briefed;
export const markBriefed = (run: RunState): RunState => ({ ...run, briefed: true });

/** Crew on board at the start of this run: the survivors + EXTRA RECRUIT style modifiers (`effect.crew`). */
export function startCrewCount(run: RunState): number {
  const mods = NEW_RUN.modifiers as { id: string; effect: { crew?: number } }[];
  return START_CREW + run.modifiers.reduce((n, id) => n + (mods.find((m) => m.id === id)?.effect.crew ?? 0), 0);
}
