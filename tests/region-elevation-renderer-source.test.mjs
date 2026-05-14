import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../scripts/region-elevation-renderer.mjs", import.meta.url), "utf8");

test("sun-at-edge shadows resolve automatic ambient sources through the controller", () => {
  assert.ok(
    /resolvedShadowSource\(canvas\?\.scene,\s*geo,\s*bounds\.center,/.test(source),
    "renderer should ask the sun-time controller for a per-region shadow source"
  );
  assert.ok(
    /SUN_SHADOW_SOURCE_TYPES\.AMBIENT_LIGHT/.test(source),
    "renderer should keep ambient light source points inside the scene instead of clamping them to the edge"
  );
});
