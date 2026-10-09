// Engine-neutral data types.
import type { ShipStatus } from './status';
import type { CrewLook } from './crew';
// Ships use the planner's Godot export format "atomic-drifter-ship-godot" v1 unchanged:
// meters, bow = -Z, starboard = +X, origin = ship centre. Points are [x, z].

export type Point = [number, number];

/** Where crew stands to use a system: centre of that floor tile + unit direction [x, z] to the machinery it faces. */
export interface ShipConsole {
  tile: Point;
  facing: Point;
}

export interface ShipRoom {
  id: string;
  kind: 'system' | 'room' | 'balcony';
  system: string | null;
  label: string;
  color: string | null;
  /** Optional (newer planner exports): the system's console spot. */
  console?: ShipConsole | null;
}

export interface ShipTile {
  room: string | null;
  shape: string; // full | nw | ne | se | sw
  machinery: boolean;
  center: Point;
  polygon: Point[];
}

export interface ShipWall {
  kind: 'interior' | 'hull' | 'railing';
  a: Point;
  b: Point;
}

export interface ShipDoor {
  kind: 'door' | 'airlock';
  center: Point;
  axis: 'x' | 'z';
  width: number;
  rooms: (string | null)[];
}

/** A vehicle docked outside at a balcony railing (planner export). 1 tile = 1 seat. */
export interface ShipVehicle {
  type: string; // bike | sidecar | car
  seats: number;
  tiles: { center: Point; polygon: Point[] }[];
  /** Edges crew can leave through; an exit lying on a railing is the dock. */
  exits: { a: Point; b: Point }[];
  /** Edges crew cannot pass inside the vehicle (car: front and back row are walled apart). */
  walls?: { a: Point; b: Point }[];
}

export interface Ship {
  format: 'atomic-drifter-ship-godot';
  version: number;
  name: string;
  tile_size: number;
  /** Optional: wall height from the planner export (meters). */
  wall_height?: number;
  rooms: ShipRoom[];
  tiles: ShipTile[];
  walls: ShipWall[];
  doors: ShipDoor[];
  /** Optional (newer planner exports). */
  vehicles?: ShipVehicle[];
}

/** A crew member on board. Positions in ship meters; `node` = spot reached last, `dest` = spot walking to. */
export interface CrewMember {
  id: string;
  name: string;
  look: CrewLook;
  node: string;
  dest: string;
  pos: Point;
  path: Point[]; // points still to walk through (doors, dock, then the final spot)
  pathEnd?: Point;
  heading: number; // walking direction in ship space: atan2(dz, dx)
  walked: number; // meters walked in total (drives the walk cycle)
  moved?: number; // meters walked on the current way (speeds up after the start)
  hp: number;
  hpMax: number;
  captain?: boolean; // the player's own character (first, big portrait)
  portrait?: string; // portrait id (src/data/portraits.json)
}

export interface GameState {
  ship: Ship;
  selectedRoomId: string | null;
  /** Indices into ship.doors that are open. */
  openDoors: number[];
  crew: CrewMember[];
  selectedCrewId: string | null;
  /** Hull, shields, evasion, ammo, scrap (HUD). */
  status: ShipStatus;
}
