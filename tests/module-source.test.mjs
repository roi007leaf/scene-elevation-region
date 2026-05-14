import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../scripts/module.mjs", import.meta.url), "utf8");

test("sun-time visual refresh reuses renderer entries and generated textures", () => {
  const body = source.match(/function _refreshSunTimeAutomationVisuals\(\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(body, /RegionElevationRenderer\.instance\.refreshVisuals\(\{ emitVisualRefresh: false \}\)/);
  assert.doesNotMatch(body, /RegionElevationRenderer\.instance\.update\(\)/);
});
