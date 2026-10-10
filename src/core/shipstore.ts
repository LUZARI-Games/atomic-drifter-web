// Ships stored on the website server (planner "SAVE TO SERVER"), shared by the web game and the Godot project.
// The stored file is the planner's Godot export unchanged; the id comes from the ship name.
import { toId } from './crewdb';
import { parseShip } from './ship';

export const MAX_SHIP_BYTES = 512 * 1024;

export interface StoredShipMeta {
  id: string;
  name: string;
  updated: string; // ISO time
}

/** Server id for a ship name ("Iron Maiden II" -> "iron_maiden_ii"). */
export const shipIdOf = (name: string): string => toId(name || 'ship');

/** null if the export is fine to store, else the reason (a 'ship is broken' message for the planner). */
export function shipStoreProblem(text: string): string | null {
  if (text.length > MAX_SHIP_BYTES) return 'ship file bigger than 512 KB';
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return 'not JSON';
  }
  const { ship, problems } = parseShip(raw);
  return ship ? null : problems.join(' · ') || 'not a planner ship export';
}
