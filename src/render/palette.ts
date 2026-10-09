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
  floor: 0x4b4a3f, // deck plates
  floorSeam: 0x3a3a31, // plate seams
  machinery: 0x5b4532, // rusty machine blocks
  machineryDark: 0x3d2e22,
  wall: 0x1b1c17, // wall body
  wallTop: 0x77735c, // light catching the wall top
  door: 0x7a6d48, // brass/olive door slab
  airlock: 0x8f5a24, // rust-orange outer hatch
  hazard: 0x1b1c17, // hazard stripe on airlocks
  label: 0xb4aa86, // stencil paint on the floor
  select: 0xe6d98a, // selection outline (pale lamp yellow)
} as const;

export const FONT_FAMILY = '"Share Tech Mono", monospace';
export const FONT_SIZES = { large: 24, medium: 18, small: 15 } as const;

/** Logical game resolution (16:9). Phaser scales this to fit the screen. */
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
