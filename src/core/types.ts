// Engine-neutral data types. Mirror these 1:1 in Godot (Resource) / Unreal (DataTable row).

export interface RoomDef {
  id: string;
  name: string;
  system: string;
  /** Grid position and size in cells (not pixels). */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ShipLayout {
  id: string;
  name: string;
  gridSize: { cols: number; rows: number };
  rooms: RoomDef[];
}

export interface ShipState {
  layout: ShipLayout;
  selectedRoomId: string | null;
}
