// System ids + colour coding, shared with the Ship Interior Planner (same colours as its SYS table).
import SYSTEMS from '../data/systems.json';
import type { ShipRoom } from './types';

/** Fallback for unknown systems (planner uses its pale ink colour there). */
export const UNKNOWN_SYSTEM_COLOR = '#E8ECEE';

/** Normalise planner system ids: "MedBay", "med_bay", "Engines" … -> "medbay", "engine". */
export function systemId(system: string | null): string {
  const id = String(system ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const alias: Record<string, string> = {
    engines: 'engine', piloting: 'cockpit', helm: 'cockpit', weapon: 'weapons', shield: 'shields',
    sensors: 'sensor', door: 'doors', medical: 'medbay', teleporter: 'crewteleporter', drone: 'drones',
  };
  return alias[id] ?? id;
}

/** Colour of a system room as "#RRGGBB": the room's own colour from the export wins, else the planner's system colour. */
export function systemColor(room: Pick<ShipRoom, 'system' | 'color'> | undefined): string {
  if (room?.color) return room.color;
  const sys = (SYSTEMS as Record<string, { color: string }>)[systemId(room?.system ?? null)];
  return sys?.color ?? UNKNOWN_SYSTEM_COLOR;
}
