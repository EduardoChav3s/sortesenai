// The bigger copy of a card shown while the mouse is over it: how wide it is and where it goes.
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}
/** dx, dy and scale move the copy back onto the card, so it can grow out of it. */
export interface ZoomBox {
  left: number;
  top: number;
  dx: number;
  dy: number;
  scale: number;
}
type View = { width: number; height: number };

export const ZOOM_EDGE = 12; // never closer than this to the edge of the screen
const GROW = 1.7;
const MIN_WIDTH = 240;
const MAX_WIDTH = 320;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** About 1.7 times the card (240 to 320 px), narrower on a short screen. Null when the card is already about that big. */
export function zoomWidth(card: Box, view: View): number | null {
  if (card.width <= 0 || card.height <= 0) return null;
  const ratio = card.height / card.width;
  const width = Math.min(Math.max(card.width * GROW, MIN_WIDTH), MAX_WIDTH, view.width - 2 * ZOOM_EDGE, (view.height - 2 * ZOOM_EDGE) / ratio);
  return width < card.width * 1.2 ? null : width;
}

/** Centered on the card and kept inside the screen; a copy made taller by a long joke moves up until all of it shows. */
export function placeZoom(card: Box, view: View, copy: { width: number; height: number }): ZoomBox {
  const cx = card.left + card.width / 2;
  const cy = card.top + card.height / 2;
  const left = clamp(cx - copy.width / 2, ZOOM_EDGE, view.width - ZOOM_EDGE - copy.width);
  const top = Math.max(ZOOM_EDGE, Math.min(cy - copy.height / 2, view.height - ZOOM_EDGE - copy.height));
  return { left, top, dx: cx - (left + copy.width / 2), dy: cy - (top + copy.height / 2), scale: card.width / copy.width };
}
