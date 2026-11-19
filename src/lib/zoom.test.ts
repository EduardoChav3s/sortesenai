import { placeZoom, zoomWidth } from './zoom';

const view = { width: 1280, height: 800 };

test('a small album card opens about 1.7 times its size', () => {
  expect(zoomWidth({ left: 300, top: 300, width: 143, height: 200 }, view)).toBeCloseTo(243.1);
});

test('the bigger copy is between 240 and 320 px wide', () => {
  expect(zoomWidth({ left: 0, top: 0, width: 120, height: 168 }, view)).toBe(240);
  expect(zoomWidth({ left: 0, top: 0, width: 220, height: 308 }, view)).toBe(320);
});

test('on a short screen the copy is narrower, so it still fits in the height', () => {
  expect(zoomWidth({ left: 0, top: 0, width: 176, height: 246.4 }, { width: 1280, height: 400 })).toBeCloseTo((400 - 24) / 1.4);
});

test('a card that is already big, or has no size yet, is not zoomed', () => {
  expect(zoomWidth({ left: 0, top: 0, width: 280, height: 392 }, view)).toBeNull();
  expect(zoomWidth({ left: 0, top: 0, width: 0, height: 0 }, view)).toBeNull();
});

test('the copy sits centered on the card, so it grows out of it', () => {
  const z = placeZoom({ left: 300, top: 300, width: 143, height: 200 }, view, { width: 243, height: 340 });
  expect(z.left + 243 / 2).toBeCloseTo(371.5);
  expect(z.top + 340 / 2).toBeCloseTo(400);
  expect(z.dx).toBeCloseTo(0);
  expect(z.dy).toBeCloseTo(0);
  expect(z.scale).toBeCloseTo(143 / 243);
});

test('near the edge of the screen the copy stays inside, and still grows out of the card', () => {
  const card = { left: 4, top: 700, width: 143, height: 200 }; // bottom left, half below the fold
  const z = placeZoom(card, view, { width: 243, height: 340 });
  expect(z.left).toBe(12);
  expect(z.top + 340).toBeCloseTo(788);
  expect(z.left + 243 / 2 + z.dx).toBeCloseTo(card.left + card.width / 2);
  expect(z.top + 340 / 2 + z.dy).toBeCloseTo(card.top + card.height / 2);
});

test('a tall copy, with a long joke, is moved up until all of it is on screen', () => {
  const card = { left: 400, top: 560, width: 143, height: 200 };
  const z = placeZoom(card, view, { width: 243, height: 620 });
  expect(z.top).toBeGreaterThanOrEqual(12);
  expect(z.top + 620).toBeLessThanOrEqual(788);
  expect(z.top + 620 / 2 + z.dy).toBeCloseTo(card.top + card.height / 2);
});
