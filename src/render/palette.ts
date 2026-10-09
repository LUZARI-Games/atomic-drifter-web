// Design tokens for the renderer (numbers for Phaser). Keep in sync with src/ui/styles.css.
export const COLORS = {
  bg: 0x030806,
  green: 0x1aff80,
  greenDim: 0x0d6b3a,
  amber: 0xffb43a,
  red: 0xff4a3a,
} as const;

export const FONT_FAMILY = '"Share Tech Mono", monospace';
export const FONT_SIZES = { large: 24, medium: 18, small: 15 } as const;

/** Logical game resolution (16:9). Phaser scales this to fit the screen. */
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
