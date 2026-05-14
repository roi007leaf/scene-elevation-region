import test from "node:test";
import assert from "node:assert/strict";
import { ambientLightSourceForPoint } from "../scripts/ambient-light-source.mjs";

test("selects the nearest active ambient light containing the target point", () => {
  const source = ambientLightSourceForPoint({ x: 100, y: 100 }, [
    { document: { id: "far", x: 250, y: 100, config: {} }, source: { shape: { radius: 250 } } },
    { document: { id: "near", x: 120, y: 100, config: {} }, source: { shape: { radius: 60 } } }
  ]);

  assert.deepEqual(source, {
    id: "near",
    x: 120,
    y: 100,
    radius: 60,
    distance: 20
  });
});

test("ignores hidden disabled out-of-range and darkness-inactive ambient lights", () => {
  const source = ambientLightSourceForPoint({ x: 100, y: 100 }, [
    { document: { id: "hidden", x: 100, y: 100, hidden: true, config: {} }, source: { shape: { radius: 100 } } },
    { document: { id: "disabled", x: 100, y: 100, config: { disabled: true } }, source: { shape: { radius: 100 } } },
    { document: { id: "far", x: 500, y: 500, config: {} }, source: { shape: { radius: 50 } } },
    { document: { id: "day-only", x: 100, y: 100, config: { darkness: { min: 0, max: 0.3 } } }, source: { shape: { radius: 100 } } },
    { document: { id: "night", x: 140, y: 100, config: { darkness: { min: 0.6, max: 1 } } }, source: { shape: { radius: 100 } } }
  ], { darkness: 0.8 });

  assert.equal(source.id, "night");
});

test("selects an ambient light that overlaps the target bounds even when the center is outside", () => {
  const source = ambientLightSourceForPoint({ x: 100, y: 100 }, [
    { document: { id: "edge", x: 180, y: 100, config: {} }, source: { shape: { radius: 40 } } }
  ], { coverageRadius: 45 });

  assert.equal(source.id, "edge");
  assert.equal(source.distance, 80);
});

test("extracts ambient light elevation and bright dim radii when available", () => {
  const source = ambientLightSourceForPoint({ x: 100, y: 100 }, [
    { document: { id: "torch", x: 100, y: 100, elevation: 7, config: {} }, source: { brightRadius: 30, dimRadius: 90 } }
  ]);

  assert.equal(source.id, "torch");
  assert.equal(source.elevation, 7);
  assert.equal(source.brightRadius, 30);
  assert.equal(source.dimRadius, 90);
  assert.equal(source.radius, 90);
});
