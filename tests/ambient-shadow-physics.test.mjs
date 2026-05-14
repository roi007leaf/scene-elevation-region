import test from "node:test";
import assert from "node:assert/strict";
import { ambientShadowInfluence } from "../scripts/ambient-shadow-physics.mjs";

test("high ambient lights cast shorter shadows from stacked region height", () => {
  const low = ambientShadowInfluence({ x: 0, y: 0, radius: 200, distance: 50, elevation: 5 }, {
    supportElevation: 5,
    visualElevation: 10,
    localElevationDelta: 5
  });
  const high = ambientShadowInfluence({ x: 0, y: 0, radius: 200, distance: 50, elevation: 25 }, {
    supportElevation: 5,
    visualElevation: 10,
    localElevationDelta: 5
  });

  assert.ok(low.lengthMultiplier > high.lengthMultiplier);
  assert.ok(high.lengthMultiplier < 1);
});

test("dim radius softens and weakens ambient shadows beyond bright radius", () => {
  const bright = ambientShadowInfluence({ radius: 120, brightRadius: 60, dimRadius: 120, distance: 30 });
  const dim = ambientShadowInfluence({ radius: 120, brightRadius: 60, dimRadius: 120, distance: 100 });

  assert.ok(dim.alphaMultiplier < bright.alphaMultiplier);
  assert.ok(dim.lengthMultiplier < bright.lengthMultiplier);
  assert.ok(dim.blurMultiplier > bright.blurMultiplier);
});
