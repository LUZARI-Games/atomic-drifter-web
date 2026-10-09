// Flight over the wasteland (Fallout 3 mood). The airship never moves – everything else slides past it against the
// flight direction (the bow), so it looks like it flies. Classic parallax: every layer has a depth factor `k`
// (1 = the ship's own plane). It is drawn at k × the ship's zoom and moves k × as fast on screen:
// far below = small and slow, just under the ship = bigger and faster, above the ship = biggest and fastest.
//
//   WastelandScene (under the ship), far → near:
//     fog sea (no visible ground) → ruined high-rises / water towers / pylons poking out of it → 2 cloud decks
//   HazeScene (over the ship): cloud shadows sliding over the ship → wind streaks flying past
//
// Cloud layers are tileable black-and-white noise textures, generated once at start and tinted (no image files).
// Buildings belong to the fog layer (same k) – they stand in it, so they move exactly with it.
import Phaser from 'phaser';
import { makeView, project, unprojectFloor, type Vec2, type Vec3 } from '../core/projection';
import { WASTE } from './palette';

/** What the wasteland needs from the ship scene each frame. */
export interface ShipOnScreen {
  /** Screen position of the ship centre, camera zoom relative to the fitted view, px per meter of the ship. */
  screen(): { x: number; y: number; zoom: number };
}

/** Ground speed of the airship in m/s, measured in the ship's own plane (k = 1). */
const FLIGHT_SPEED = 3.2;
/**
 * true = physically right parallax: far layers slower, near layers faster.
 * false = reversed (the lowest layer fastest, the layers near the ship slower).
 */
const FAR_IS_SLOWER = true;
const SHIP_PX_PER_M = 40; // must match ShipScene

/** Depth factors (1 = the ship). */
const K = { fog: 0.22, deckLow: 0.38, deckHigh: 0.62, shadow: 1.7, wind: 2.4 } as const;
const speedOf = (k: number) => (FAR_IS_SLOWER ? k : 1 / (k * 4));

const VIEW = makeView(60, 45);
/** Screen direction the bow points to (unit vector) – the world moves the opposite way. */
const BOW: Vec2 = (() => {
  const [x, y] = project(VIEW, [1, 0, 0]);
  const l = Math.hypot(x, y);
  return [x / l, y / l];
})();

/** Tiny deterministic random per cell: same cell -> same tower, forever. */
function rng(ix: number, iy: number, seed: number): () => number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) >>> 0;
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  };
}

/**
 * Tileable value noise as a white texture whose ALPHA is the cloud density (tint it in the scene).
 * `cells` = lattice size of the coarsest octave (smaller = bigger clouds), `lo..hi` = density -> alpha ramp.
 */
function makeCloudTexture(scene: Phaser.Scene, key: string, seed: number, cells: number, lo: number, hi: number, size = 256): void {
  if (scene.textures.exists(key)) return;
  const octaves = 4;
  const lattices = Array.from({ length: octaves }, (_, o) => {
    const n = cells << o;
    const r = rng(seed, o, 7);
    return { n, v: Array.from({ length: n * n }, () => r()) };
  });
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const sample = (lat: { n: number; v: number[] }, x: number, y: number) => {
    const fx = (x / size) * lat.n;
    const fy = (y / size) * lat.n;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = smooth(fx - x0);
    const ty = smooth(fy - y0);
    const at = (ix: number, iy: number) => lat.v[((iy % lat.n) + lat.n) % lat.n * lat.n + ((ix % lat.n) + lat.n) % lat.n]!;
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
    return a + (b - a) * ty;
  };
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let n = 0;
      let amp = 0.5;
      let sum = 0;
      for (const lat of lattices) {
        n += sample(lat, x, y) * amp;
        sum += amp;
        amp *= 0.5;
      }
      n /= sum;
      const a = Math.min(1, Math.max(0, (n - lo) / (hi - lo)));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(smooth(a) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  scene.textures.addCanvas(key, canvas);
}

/** A tinted, repeating cloud texture that fills the screen and drifts with its depth factor. */
class CloudDeck {
  readonly sprite: Phaser.GameObjects.TileSprite;
  constructor(
    scene: Phaser.Scene,
    key: string,
    private readonly k: number,
    private readonly texScale: number, // texture px -> screen px at fitted zoom
    tint: number,
    alpha: number,
    private readonly drift: Vec2 = [0, 0], // extra own wind drift (screen px/s at k)
  ) {
    const { width, height } = scene.scale;
    this.sprite = scene.add.tileSprite(0, 0, width, height, key).setOrigin(0).setTint(tint).setAlpha(alpha);
  }

  update(t: number, ship: { x: number; y: number; zoom: number }, w: number, h: number): void {
    const s = this.texScale * ship.zoom;
    this.sprite.setSize(w, h);
    this.sprite.setTileScale(s, s * VIEW.sin); // squashed like the floor in the 60° view
    const moved = t * FLIGHT_SPEED * SHIP_PX_PER_M * ship.zoom * speedOf(this.k);
    // the world moves against the bow; dragging the view moves near layers more than far ones
    const ox = -BOW[0] * moved + this.drift[0] * t + (ship.x - w / 2) * this.k;
    const oy = -BOW[1] * moved + this.drift[1] * t + (ship.y - h / 2) * this.k;
    this.sprite.tilePositionX = -ox / s;
    this.sprite.tilePositionY = -oy / (s * VIEW.sin);
  }
}

export class WastelandScene extends Phaser.Scene {
  private towers!: Phaser.GameObjects.Graphics;
  private fogLow!: CloudDeck;
  private decks: CloudDeck[] = [];

  constructor(private readonly getShip: () => ShipOnScreen | null) {
    super({ key: 'wasteland', active: true });
  }

  create(): void {
    makeCloudTexture(this, 'fog', 11, 3, 0.25, 0.85);
    makeCloudTexture(this, 'deck_low', 23, 4, 0.56, 0.82);
    makeCloudTexture(this, 'deck_high', 37, 3, 0.6, 0.85);
    this.cameras.main.setBackgroundColor(WASTE.fog);
    this.towers = this.add.graphics();
    // fog swirling around the tower feet (same depth as the towers), then two cloud decks between fog and ship
    this.fogLow = new CloudDeck(this, 'fog', K.fog, 1.6, WASTE.fogLight, 0.35);
    this.decks = [
      new CloudDeck(this, 'deck_low', K.deckLow, 2.2, WASTE.cloudLow, 0.4, [6, -3]),
      new CloudDeck(this, 'deck_high', K.deckHigh, 3.4, WASTE.cloudHigh, 0.32, [10, -5]),
    ];
  }

  override update(time: number): void {
    const { width: w, height: h } = this.scale;
    const ship = this.getShip()?.screen() ?? { x: w / 2, y: h / 2, zoom: 1 };
    const t = time / 1000;
    this.drawTowers(t, ship, w, h);
    this.fogLow.update(t, ship, w, h);
    for (const d of this.decks) d.update(t, ship, w, h);
  }

  /** Ruined high-rises, water towers and pylons sticking out of the fog sea (fog layer, depth K.fog). */
  private drawTowers(t: number, ship: { x: number; y: number; zoom: number }, w: number, h: number): void {
    const g = this.towers;
    g.clear();
    const k = K.fog;
    const scale = SHIP_PX_PER_M * k * ship.zoom; // px per meter on this layer
    const offset = t * FLIGHT_SPEED * speedOf(k) / k; // meters this layer has slid (screen speed / scale)
    const ax = w / 2 + (ship.x - w / 2) * k;
    const ay = h / 2 + (ship.y - h / 2) * k;
    const S = ([x, y, z]: Vec3) => {
      const [sx, sy] = project(VIEW, [x - offset, y, z]);
      return new Phaser.Math.Vector2(ax + sx * scale, ay + sy * scale);
    };
    // visible cells: towers are tall, so look further "down" the screen
    const corners = [[0, 0], [w, 0], [0, h + 60 * scale], [w, h + 60 * scale]].map(([px, py]) =>
      unprojectFloor(VIEW, [(px! - ax) / scale, (py! - ay) / scale]),
    );
    const CELL = 28;
    const xs = corners.map((c) => c[0] + offset);
    const ys = corners.map((c) => c[1]);
    const cells: [number, number][] = [];
    for (let ix = Math.floor(Math.min(...xs) / CELL) - 1; ix <= Math.ceil(Math.max(...xs) / CELL) + 1; ix++)
      for (let iy = Math.floor(Math.min(...ys) / CELL) - 1; iy <= Math.ceil(Math.max(...ys) / CELL) + 1; iy++) cells.push([ix, iy]);
    cells.sort((a, b) => a[0] + a[1] - (b[0] + b[1])); // far first

    const FOG_TOP = 18; // meters: everything below is hidden in the fog sea
    for (const [ix, iy] of cells) {
      const r = rng(ix, iy, 5);
      const kind = r();
      const x = ix * CELL + r() * CELL * 0.7;
      const y = iy * CELL + r() * CELL * 0.7;
      if (kind < 0.36) this.highRise(S, x, y, FOG_TOP, r);
      else if (kind < 0.44) this.waterTower(S, x, y, FOG_TOP, r);
      else if (kind < 0.54) this.pylon(S, x, y, FOG_TOP, scale);
    }
  }

  /** Fill a vertical face from the fog line up to `top`, fading from fog colour into `col` (looks like rising out of it). */
  private fadedFace(S: (p: Vec3) => Phaser.Math.Vector2, a: Vec2, b: Vec2, z0: number, topA: number, topB: number, col: number): void {
    const g = this.towers;
    const bands = 5;
    for (let i = 0; i < bands; i++) {
      const f0 = i / bands;
      const f1 = (i + 1) / bands;
      const za0 = z0 + (topA - z0) * f0, za1 = z0 + (topA - z0) * f1;
      const zb0 = z0 + (topB - z0) * f0, zb1 = z0 + (topB - z0) * f1;
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(WASTE.fog), Phaser.Display.Color.ValueToColor(col), bands, i + 1,
      );
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillPoints([S([a[0], a[1], za0]), S([b[0], b[1], zb0]), S([b[0], b[1], zb1]), S([a[0], a[1], za1])], true);
    }
  }

  private highRise(S: (p: Vec3) => Phaser.Math.Vector2, x: number, y: number, fog: number, r: () => number): void {
    const g = this.towers;
    const w = 8 + r() * 8;
    const d = 8 + r() * 8;
    const top = fog + 8 + r() * 26;
    const tA = top - r() * 6, tB = top, tC = top - r() * 9; // broken, uneven top
    // visible faces in this view: +x (towards the bow) and +y (towards the viewer)
    this.fadedFace(S, [x + w, y], [x + w, y + d], fog, tA, tB, WASTE.towerSide);
    this.fadedFace(S, [x, y + d], [x + w, y + d], fog, tC, tB, WASTE.towerFront);
    // roof (broken: missing corner)
    g.fillStyle(WASTE.towerTop, 1);
    g.fillPoints([S([x, y, tC]), S([x + w * 0.6, y, tA]), S([x + w, y + d * 0.4, tA]), S([x + w, y + d, tB]), S([x, y + d, tC])], true);
    // dark window rows on the upper (fog-free) part
    g.fillStyle(WASTE.window, 0.9);
    for (let z = fog + 4; z < Math.min(tA, tB, tC) - 2; z += 4) {
      for (let u = 0.12; u < 0.88; u += 0.19) {
        if (r() < 0.25) continue; // some windows boarded / collapsed
        g.fillPoints([S([x + w * u, y + d, z]), S([x + w * (u + 0.09), y + d, z]), S([x + w * (u + 0.09), y + d, z + 1.8]), S([x + w * u, y + d, z + 1.8])], true);
        g.fillPoints([S([x + w, y + d * u, z]), S([x + w, y + d * (u + 0.09), z]), S([x + w, y + d * (u + 0.09), z + 1.8]), S([x + w, y + d * u, z + 1.8])], true);
      }
    }
    // antenna / rebar on top
    if (r() < 0.5) {
      const p = S([x + w * 0.4, y + d * 0.5, tB]);
      const q = S([x + w * 0.4, y + d * 0.5, tB + 6]);
      g.lineStyle(1.5, WASTE.steel, 1);
      g.lineBetween(p.x, p.y, q.x, q.y);
    }
  }

  private waterTower(S: (p: Vec3) => Phaser.Math.Vector2, x: number, y: number, fog: number, r: () => number): void {
    const g = this.towers;
    const top = fog + 10 + r() * 6;
    g.lineStyle(2, WASTE.steel, 1);
    for (const [dx, dy] of [[-2, -2], [2, -2], [2, 2], [-2, 2]] as const) {
      const p = S([x + dx, y + dy, fog]);
      const q = S([x + dx * 0.6, y + dy * 0.6, top - 4]);
      g.lineBetween(p.x, p.y, q.x, q.y);
    }
    // tank: a short drum (side as a band, then the lid)
    const ring = (z: number, rad: number) => Array.from({ length: 16 }, (_, i) => S([x + Math.cos((i / 16) * Math.PI * 2) * rad, y + Math.sin((i / 16) * Math.PI * 2) * rad, z]));
    const lower = ring(top - 4, 3.6);
    const upper = ring(top, 3.6);
    g.fillStyle(WASTE.tank, 1);
    g.fillPoints([...lower.slice(0, 9), ...upper.slice(0, 9).reverse()], true);
    g.fillStyle(WASTE.towerTop, 1);
    g.fillPoints(ring(top + 1.2, 3.8), true);
  }

  private pylon(S: (p: Vec3) => Phaser.Math.Vector2, x: number, y: number, fog: number, scale: number): void {
    const g = this.towers;
    const top = fog + 14;
    const lw = Math.max(1, scale * 0.25);
    g.lineStyle(lw, WASTE.steel, 1);
    const legs: [number, number][] = [[-2, -2], [2, -2], [2, 2], [-2, 2]];
    const at = (dx: number, dy: number, z: number) => {
      const k = 1 - ((z - fog) / (top - fog)) * 0.7;
      return S([x + dx * k, y + dy * k, z]);
    };
    for (const [dx, dy] of legs) { const p = at(dx, dy, fog); const q = at(dx, dy, top); g.lineBetween(p.x, p.y, q.x, q.y); }
    for (const z of [fog + 5, fog + 10]) {
      for (let i = 0; i < 4; i++) { const p = at(...legs[i]!, z); const q = at(...legs[(i + 1) % 4]!, z); g.lineBetween(p.x, p.y, q.x, q.y); }
    }
    const a = S([x, y - 6, top - 1]);
    const b = S([x, y + 6, top - 1]);
    g.lineBetween(a.x, a.y, b.x, b.y);
  }
}

/** Over the ship: cloud shadows sliding across it, and wind streaks flying past in the flight direction. */
export class HazeScene extends Phaser.Scene {
  private shadow!: CloudDeck;
  private wind!: Phaser.GameObjects.Graphics;
  private streaks: { x: number; y: number; len: number; speed: number; alpha: number }[] = [];

  constructor(private readonly getShip: () => ShipOnScreen | null) {
    super({ key: 'haze', active: true });
  }

  create(): void {
    makeCloudTexture(this, 'cloud_shadow', 51, 2, 0.5, 0.75);
    this.shadow = new CloudDeck(this, 'cloud_shadow', K.shadow, 6, 0x000000, 0.2);
    this.wind = this.add.graphics();
    const r = rng(9, 9, 9);
    this.streaks = Array.from({ length: 34 }, () => ({ x: r(), y: r(), len: 14 + r() * 36, speed: 0.7 + r() * 0.6, alpha: 0.08 + r() * 0.16 }));
  }

  override update(time: number, delta: number): void {
    const { width: w, height: h } = this.scale;
    const ship = this.getShip()?.screen() ?? { x: w / 2, y: h / 2, zoom: 1 };
    this.shadow.update(time / 1000, ship, w, h);

    // wind streaks: fast, thin, against the bow; wrap around the screen
    const g = this.wind;
    g.clear();
    const v = FLIGHT_SPEED * SHIP_PX_PER_M * speedOf(K.wind) * (delta / 1000);
    const span = w + h;
    for (const s of this.streaks) {
      s.x -= (BOW[0] * v * s.speed) / span;
      s.y -= (BOW[1] * v * s.speed) / span;
      if (s.x < -0.1) s.x += 1.2;
      if (s.y < -0.1) s.y += 1.2;
      const x = s.x * span - h * 0.1;
      const y = s.y * span - w * 0.1;
      if (x < -60 || y < -60 || x > w + 60 || y > h + 60) continue;
      g.lineStyle(1.5, WASTE.wind, s.alpha);
      g.lineBetween(x, y, x + BOW[0] * s.len, y + BOW[1] * s.len);
    }
  }
}
