import test from "node:test";
import assert from "node:assert/strict";
import { clipPathsToCircle } from "../scripts/ambient-shadow-geometry.mjs";

const square = Object.freeze([
  Object.freeze([
    Object.freeze({ x: 0, y: 0 }),
    Object.freeze({ x: 100, y: 0 }),
    Object.freeze({ x: 100, y: 100 }),
    Object.freeze({ x: 0, y: 100 })
  ])
]);

test("keeps paths fully inside the ambient light radius unchanged", () => {
  const clipped = clipPathsToCircle(square, { x: 50, y: 50, radius: 100 }, { segments: 16 });

  assert.deepEqual(clipped, square);
});

test("clips paths to the ambient light radius for partial lit regions", () => {
  const clipped = clipPathsToCircle(square, { x: 0, y: 50, radius: 55 }, { segments: 24 });

  assert.ok(clipped.length >= 1);
  assert.ok(clipped[0].length >= 3);
  assert.ok(_pathArea(clipped[0]) < _pathArea(square[0]));
  for (const point of clipped[0]) {
    assert.ok(Math.hypot(point.x - 0, point.y - 50) <= 55.0001);
  }
});

test("returns no paths when the region is outside the ambient light radius", () => {
  const clipped = clipPathsToCircle(square, { x: 300, y: 300, radius: 25 }, { segments: 16 });

  assert.deepEqual(clipped, []);
});

function _pathArea(path) {
  let area = 0;
  for (let index = 0; index < path.length; index++) {
    const current = path[index];
    const next = path[(index + 1) % path.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) / 2;
}
