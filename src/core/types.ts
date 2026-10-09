// Engine-neutral data types.
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
}

export interface GameState {
  ship: Ship;
  selectedRoomId: string | null;
}
