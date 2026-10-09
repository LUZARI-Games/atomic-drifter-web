// Touch camera for full-screen scenes: one finger drags the view, two fingers pinch-zoom, mouse wheel zooms.
// A short touch without movement counts as a tap and is passed on (world coordinates).
import Phaser from 'phaser';

export interface PanZoomOptions {
  /** World area that holds the content; the view fits it on start and never drifts away from it. */
  bounds: () => Phaser.Geom.Rectangle;
  onTap?: (worldX: number, worldY: number) => void;
  /** Screen px kept free around the content when fitted. */
  margin?: number;
  /** 'all' fits the whole content; 'width' fills the screen width and starts at the top (lists). */
  fit?: 'all' | 'width';
}

const TAP_SLOP = 10; // px a finger may wander and still count as a tap
const MAX_ZOOM_FACTOR = 8; // how far you can zoom in, relative to the fitted view

export function attachPanZoom(scene: Phaser.Scene, opts: PanZoomOptions): void {
  const cam = scene.cameras.main;
  const margin = opts.margin ?? 16;
  const touches = new Map<number, { x: number; y: number; sx: number; sy: number }>();
  let fitZoom = 1;
  let moved = false;
  let multi = false;
  let pinch: { dist: number; zoom: number; world: Phaser.Math.Vector2 } | null = null;

  // screen point (sx, sy) shows world point (wx, wy)
  const pin = (wx: number, wy: number, sx: number, sy: number) => {
    cam.centerOn(wx + (cam.width / 2 - sx) / cam.zoom, wy + (cam.height / 2 - sy) / cam.zoom);
    clamp();
  };
  const toWorld = (sx: number, sy: number) =>
    new Phaser.Math.Vector2(cam.scrollX + cam.width / 2 + (sx - cam.width / 2) / cam.zoom, cam.scrollY + cam.height / 2 + (sy - cam.height / 2) / cam.zoom);
  const clamp = () => {
    const b = opts.bounds();
    const cx = Phaser.Math.Clamp(cam.scrollX + cam.width / 2, b.x, b.right);
    const cy = Phaser.Math.Clamp(cam.scrollY + cam.height / 2, b.y, b.bottom);
    cam.centerOn(cx, cy);
  };
  const setZoom = (z: number) => cam.setZoom(Phaser.Math.Clamp(z, fitZoom * 0.6, fitZoom * MAX_ZOOM_FACTOR));

  const fit = () => {
    const b = opts.bounds();
    const zw = (cam.width - 2 * margin) / b.width;
    const zh = (cam.height - 2 * margin) / b.height;
    fitZoom = Math.max(0.05, opts.fit === 'width' ? zw : Math.min(zw, zh));
    cam.setZoom(fitZoom);
    const viewH = cam.height / fitZoom;
    cam.centerOn(b.centerX, opts.fit === 'width' && viewH < b.height ? b.y - margin / fitZoom + viewH / 2 : b.centerY);
  };

  scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
    if (touches.size === 0) {
      moved = false;
      multi = false;
    }
    touches.set(p.id, { x: p.x, y: p.y, sx: p.x, sy: p.y });
    if (touches.size >= 2) {
      multi = true;
      pinch = null;
    }
  });

  scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
    const t = touches.get(p.id);
    if (!t || !p.isDown) return;
    if (Math.hypot(p.x - t.sx, p.y - t.sy) > TAP_SLOP) moved = true;
    const prev = { x: t.x, y: t.y };
    t.x = p.x;
    t.y = p.y;

    if (touches.size >= 2) {
      const [a, b] = [...touches.values()];
      const dist = Math.max(1, Math.hypot(a!.x - b!.x, a!.y - b!.y));
      const mx = (a!.x + b!.x) / 2;
      const my = (a!.y + b!.y) / 2;
      if (!pinch) pinch = { dist, zoom: cam.zoom, world: toWorld(mx, my) };
      setZoom((pinch.zoom * dist) / pinch.dist);
      pin(pinch.world.x, pinch.world.y, mx, my);
    } else if (moved) {
      cam.scrollX -= (p.x - prev.x) / cam.zoom;
      cam.scrollY -= (p.y - prev.y) / cam.zoom;
      clamp();
    }
  });

  const release = (p: Phaser.Input.Pointer) => {
    if (!touches.delete(p.id)) return;
    pinch = null;
    if (touches.size > 0) {
      // keep dragging smoothly with the remaining finger
      for (const t of touches.values()) Object.assign(t, { sx: t.x, sy: t.y });
      return;
    }
    if (!moved && !multi && !p.wasCanceled && opts.onTap) {
      const w = toWorld(p.x, p.y);
      opts.onTap(w.x, w.y);
    }
  };
  scene.input.on('pointerup', release);
  scene.input.on('pointerupoutside', release);

  scene.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
    const w = toWorld(p.x, p.y);
    setZoom(cam.zoom * Math.exp(-dy * 0.0015));
    pin(w.x, w.y, p.x, p.y);
  });

  fit();
  scene.scale.on(Phaser.Scale.Events.RESIZE, () => {
    cam.setSize(scene.scale.width, scene.scale.height);
    fit();
  });
}
