// Ship layout types. Pure data – no engine imports.

export type RoomId = string;

export interface RoomDef {
  id: RoomId;
  name: string;
  /** Grid cell of the room's top-left corner. */
  col: number;
  row: number;
  /** Size in grid cells. */
  cols: number;
  rows: number;
}

export interface ShipDef {
  id: string;
  name: string;
  grid: { cols: number; rows: number };
  rooms: RoomDef[];
}

export function findRoom(ship: ShipDef, id: RoomId | null): RoomDef | undefined {
  return id === null ? undefined : ship.rooms.find((r) => r.id === id);
}
