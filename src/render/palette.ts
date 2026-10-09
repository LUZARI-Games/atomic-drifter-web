// Design tokens for the renderer (numbers for Phaser). Keep in sync with src/ui/styles.css.
export const COLORS = {
  bg: 0x030806,
  green: 0x1aff80,
  greenDim: 0x0d6b3a,
  amber: 0xffb43a,
  red: 0xff4a3a,
} as const;

/**
 * World look (the ship itself) – NOT the terminal UI look.
 * Flat top-down like FTL / Void War, grimdark, desaturated Fallout 3 tones:
 * olive-grey steel, rust, dirty concrete, dim sickly-yellow light.
 */
export const WORLD = {
  hull: 0x2e2f29, // outer hull plating
  hullEdge: 0x55533f, // rim light on the hull silhouette
  floor: 0x9a9a90, // deck plates: light, well-lit concrete grey (Vault-like interior) so crew stand out
  floorSeam: 0x7e7e75, // plate seams
  machinery: 0x5b4532, // rusty machine blocks
  machineryDark: 0x3d2e22,
  wall: 0x1b1c17, // wall body
  wallTop: 0x77735c, // light catching the wall top
  door: 0x7a6d48, // brass/olive door slab
  airlock: 0x8f5a24, // rust-orange outer hatch
  hazard: 0x1b1c17, // hazard stripe on airlocks
  label: 0xb4aa86, // worn light paint (key caps, raider spikes)
  stencil: 0x45453f, // dark stencil paint on the light floor (room names)
  innerWall: 0x77828a, // interior half walls: painted steel, blue-grey like Vault walls
  innerWallTop: 0xc4cbcc, // bright top edge of the walls
  select: 0xe6d98a, // selection outline (pale lamp yellow)
  console: 0x5a5a4b, // console desk (worn steel)
  consoleKeys: 0x24251f, // keyboard plate
  consoleKey: 0xb4aa86, // key caps (same worn paint as the floor stencils)
  grate: 0x5f5f57, // balcony floor: open steel grating
  grateLine: 0x3c3c35,
  underside: 0x22231d, // edge / underside of a balcony platform
  hazard2: 0xb08a2e, // faded yellow of hazard stripes at a dock
} as const;

/** Vehicles docked at balconies: patched-up pre-war machines in rust and olive drab. */
export const VEHICLE = {
  rust: 0x6e4a2e,
  rustLight: 0x8a5e3a,
  olive: 0x4f5236,
  oliveLight: 0x666a46,
  tyre: 0x171713,
  chrome: 0x8a8672,
  seat: 0x2c2219,
  glass: 0x1e2523,
} as const;

/**
 * Flight over the wasteland (wasteland.ts), Fallout 3 mood: a dirty yellow-grey fog sea hides the ground,
 * grey concrete high-rises and rusty towers poke out of it, muted cloud decks drift between them and the ship.
 * Everything stays darker / greyer than the ship so the ship always reads first.
 */
export const WASTE = {
  fog: 0x2b2a22, // the fog sea (screen background)
  fogLight: 0x4a4636, // fog swirls around the tower feet
  towerFront: 0x45443c, // concrete facing the viewer
  towerSide: 0x34332d, // concrete in shade
  towerTop: 0x55534a, // broken roofs
  window: 0x15140f,
  steel: 0x4c4a40, // pylons, antennas, water tower legs
  tank: 0x4f4232, // rusty water tank
  cloudLow: 0x6d6650, // lower cloud deck (dusty yellow-brown)
  cloudHigh: 0x8c866d, // upper cloud deck (paler)
  wind: 0xd8d0b0, // wind streaks
} as const;

/**
 * Planner system colour -> world paint: same hue as in the Ship Planner, but faded, dirty and dark
 * (mixed into rusty olive) so it sits in the grimdark Fallout 3 look instead of glowing like neon.
 */
export function worldPaint(hex: string): number {
  const c = parseInt(hex.replace('#', ''), 16);
  const base = 0x4a4234; // grimy olive-brown the paint is mixed into
  const mix = (sh: number) => {
    const v = (c >> sh) & 0xff;
    const b = (base >> sh) & 0xff;
    return Math.round((v * PAINT_STRENGTH + b * (1 - PAINT_STRENGTH)) * 0.92);
  };
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}
const PAINT_STRENGTH = 0.42; // 1 = raw planner neon, 0 = no colour at all

export const FONT_FAMILY = '"Share Tech Mono", monospace';
export const FONT_SIZES = { large: 24, medium: 18, small: 15 } as const;
