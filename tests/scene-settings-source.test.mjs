import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../scripts/scene-settings.mjs", import.meta.url), "utf8");

test("scene settings exposes sun movement only for Sun at edge shadows", () => {
  assert.match(source, /data-sun-movement-mode/);
  assert.match(source, /function _sunMovementModeField/);
  assert.match(source, /function _syncSunMovementModeVisibility/);
  assert.match(source, /SHADOW_MODES\.SUN_AT_EDGE/);
});

test("scene settings resyncs sun movement visibility on render, change, preset, and populate", () => {
  const calls = source.match(/_syncSunMovementModeVisibility\(form\)/g) ?? [];
  assert.ok(calls.length >= 4);
});
