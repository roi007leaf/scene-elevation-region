# Sun Time Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional automatic `Sun at edge` movement driven by Simple Calendar Reborn or Foundry world time, with GM-configurable cadence.

**Architecture:** Put pure time/cadence/edge-point helpers in `scripts/sun-time.mjs`, and use a focused `SunTimeController` in `scripts/sun-time-controller.mjs` to listen to time hooks and keep computed sun state in memory. Existing config, scene settings, renderer, and controls will consume the resolved point while preserving manual dragging.

**Tech Stack:** Foundry VTT v14 ES modules, PIXI canvas globals, Node's built-in `node:test` runner for helper tests, existing module setting/scene flag helpers.

---

### Task 1: Pure Sun-Time Helpers

**Files:**
- Create: `scripts/sun-time.mjs`
- Create: `tests/sun-time.test.mjs`

- [ ] **Step 1: Write failing tests**

Create `tests/sun-time.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  SUN_MOVEMENT_MODES,
  sunMovementModeValue,
  sunTimeStateFromCalendarDate,
  sunTimeStateFromWorldTime,
  sunTimeCadenceBucket,
  sunEdgePointForTime
} from "../scripts/sun-time.mjs";

const geo = Object.freeze({ x: 0, y: 0, width: 1000, height: 500 });

test("normalizes unknown sun movement modes to manual", () => {
  assert.equal(sunMovementModeValue("hour"), SUN_MOVEMENT_MODES.HOUR);
  assert.equal(sunMovementModeValue("strange"), SUN_MOVEMENT_MODES.MANUAL);
  assert.equal(sunMovementModeValue(null), SUN_MOVEMENT_MODES.MANUAL);
});

test("extracts calendar seconds and day anchors from Simple Calendar date payload", () => {
  const state = sunTimeStateFromCalendarDate({
    hour: 9,
    minute: 30,
    second: 15,
    sunrise: 10 * 86_400 + 6 * 3600,
    midday: 10 * 86_400 + 12 * 3600,
    sunset: 10 * 86_400 + 18 * 3600
  });

  assert.deepEqual(state, {
    dayIndex: 10,
    secondsOfDay: 34_215,
    sunrise: 21_600,
    midday: 43_200,
    sunset: 64_800,
    daySeconds: 86_400,
    minutesInHour: 60,
    secondsInMinute: 60
  });
});

test("uses Simple Calendar time configuration for non-24-hour days", () => {
  const dayLength = 20 * 3600;
  const state = sunTimeStateFromCalendarDate({
    hour: 5,
    minute: 0,
    second: 0,
    sunrise: 3 * dayLength + 4 * 3600,
    midday: 3 * dayLength + 10 * 3600,
    sunset: 3 * dayLength + 16 * 3600
  }, { hoursInDay: 20, minutesInHour: 60, secondsInMinute: 60 });

  assert.deepEqual(state, {
    dayIndex: 3,
    secondsOfDay: 18_000,
    sunrise: 14_400,
    midday: 36_000,
    sunset: 57_600,
    daySeconds: 72_000,
    minutesInHour: 60,
    secondsInMinute: 60
  });
});

test("falls back to 24-hour anchors for Foundry world time", () => {
  assert.deepEqual(sunTimeStateFromWorldTime(2 * 86_400 + 13 * 3600 + 4), {
    dayIndex: 2,
    secondsOfDay: 46_804,
    sunrise: 21_600,
    midday: 43_200,
    sunset: 64_800,
    daySeconds: 86_400,
    minutesInHour: 60,
    secondsInMinute: 60
  });
});

test("computes cadence buckets", () => {
  const state = sunTimeStateFromWorldTime(86_400 + 12 * 3600 + 34 * 60 + 12);
  assert.equal(sunTimeCadenceBucket(SUN_MOVEMENT_MODES.MINUTE, state), "minute:1:12:34");
  assert.equal(sunTimeCadenceBucket(SUN_MOVEMENT_MODES.TEN_MINUTES, state), "tenMinutes:1:12:3");
  assert.equal(sunTimeCadenceBucket(SUN_MOVEMENT_MODES.HOUR, state), "hour:1:12");
  assert.equal(sunTimeCadenceBucket(SUN_MOVEMENT_MODES.SUNRISE_NOON_SUNSET, state), "anchors:1:noonToSunset");
});

test("maps sunlight progress to left top and right scene edges", () => {
  assert.deepEqual(sunEdgePointForTime(geo, sunTimeStateFromWorldTime(6 * 3600)), { x: 0, y: 250 });
  assert.deepEqual(sunEdgePointForTime(geo, sunTimeStateFromWorldTime(12 * 3600)), { x: 500, y: 0 });
  assert.deepEqual(sunEdgePointForTime(geo, sunTimeStateFromWorldTime(18 * 3600)), { x: 1000, y: 250 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/sun-time.test.mjs`

Expected: FAIL because `scripts/sun-time.mjs` does not exist.

- [ ] **Step 3: Implement pure helpers**

Create `scripts/sun-time.mjs` with exported constants and helpers for mode normalization, time extraction, bucket calculation, and edge-point interpolation.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/sun-time.test.mjs`

Expected: PASS.

### Task 2: Settings, UI, and Localization

**Files:**
- Modify: `scripts/config.mjs`
- Modify: `scripts/choices.mjs`
- Modify: `scripts/settings-registration.mjs`
- Modify: `scripts/scene-settings.mjs`
- Modify: `lang/en.json`

- [ ] **Step 1: Add setting constants**

Import `SUN_MOVEMENT_MODES` and `sunMovementModeValue` from `scripts/sun-time.mjs` in `scripts/config.mjs`. Add `SUN_MOVEMENT_MODE: "sunMovementMode"` to `SETTINGS` and `SCENE_SETTING_KEYS`.

- [ ] **Step 2: Wire defaults and world visual settings**

Set default sun movement to manual in `ELEVATION_DEFAULT_SETTINGS`, include it in `defaultSceneElevationSettings`, and read the world default there so scenes can override it independently of presets.

- [ ] **Step 3: Add choice lists**

Import `SUN_MOVEMENT_MODES` in `scripts/choices.mjs`. Add `SCENE_SETTING_KEYS.SUN_MOVEMENT_MODE` to `SCENE_SETTING_SELECT_GROUPS` and therefore world choices.

- [ ] **Step 4: Register world setting**

In `scripts/settings-registration.mjs`, add `_registerWorldChoice(SETTINGS.SUN_MOVEMENT_MODE, "SCENE_ELEVATION.Settings.SunMovementMode", "SCENE_ELEVATION.Settings.SunMovementModeHint", WORLD_SETTING_CHOICES[SETTINGS.SUN_MOVEMENT_MODE], onRendererSettingsChange);` after shadow length registration.

- [ ] **Step 5: Add scene dialog field**

In `scripts/scene-settings.mjs`, render a conditional `data-sun-movement-mode` select for `SCENE_SETTING_KEYS.SUN_MOVEMENT_MODE` after shadow length. Show it only when `Shadow Type` is `Sun at edge`, resync it on render/change/preset/defaults, and preserve/parse it in `_formSettings()` using `sunMovementModeValue`.

- [ ] **Step 6: Add English strings**

Add labels and hints for `SunMovementMode`, `SunMovementModeManual`, `SunMovementModeMinute`, `SunMovementModeTenMinutes`, `SunMovementModeHour`, and `SunMovementModeSunriseNoonSunset`.

- [ ] **Step 7: Syntax check**

Run: `node --check scripts/config.mjs && node --check scripts/choices.mjs && node --check scripts/settings-registration.mjs && node --check scripts/scene-settings.mjs`

Expected: exit 0.

### Task 3: Sun-Time Controller

**Files:**
- Create: `scripts/sun-time-controller.mjs`
- Modify: `scripts/module.mjs`

- [ ] **Step 1: Create controller**

Implement `SunTimeController` with methods:

- `register()`: attach `updateWorldTime`, `simple-calendar-date-time-change`, and `SimpleCalendar.Hooks.DateTimeChange` if available.
- `refresh(datePayload = null, { force = false } = {})`: compute state, bucket, and point for the active scene.
- `resolvedSunEdgePoint(scene, geo, storedPoint)`: return computed point when automation is active and valid, otherwise `storedPoint`.
- `isAutomatic(scene)`: true when effective sun movement mode is not manual.
- `switchSceneToManual(scene, settings)`: save scene setting back to manual for GM drag override.

- [ ] **Step 2: Wire module lifecycle**

Import the singleton controller in `scripts/module.mjs`, call `register()` during ready, call `refresh(null, { force: true })` on `canvasReady`, and clear transient state on `canvasTearDown`.

- [ ] **Step 3: Syntax check**

Run: `node --check scripts/sun-time-controller.mjs && node --check scripts/module.mjs`

Expected: exit 0.

### Task 4: Renderer and Handle Integration

**Files:**
- Modify: `scripts/region-elevation-renderer.mjs`
- Modify: `scripts/elevation-controls.mjs`

- [ ] **Step 1: Renderer uses resolved sun point**

Import `sunTimeController` into `scripts/region-elevation-renderer.mjs`. In `_sunShadowState`, call `sunTimeController.resolvedSunEdgePoint(canvas?.scene, geo, _setting(SCENE_SETTING_KEYS.SUN_EDGE_POINT))` before clamping.

- [ ] **Step 2: Sun handle displays resolved point**

Import `sunTimeController` and `SUN_MOVEMENT_MODES`/`sunMovementModeValue` as needed in `scripts/elevation-controls.mjs`. Update `_sunEdgePoint()` to resolve automatic points through the controller.

- [ ] **Step 3: Dragging switches to manual**

When committing a sun-handle drag, save `sunMovementMode: manual` together with the dragged `sunEdgePoint`. This should happen in the existing sun-handle commit path around `setSceneElevationSettings(...)`.

- [ ] **Step 4: Syntax check**

Run: `node --check scripts/region-elevation-renderer.mjs && node --check scripts/elevation-controls.mjs`

Expected: exit 0.

### Task 5: Final Verification

**Files:**
- Verify all touched files.

- [ ] **Step 1: Run helper tests**

Run: `node --test tests/sun-time.test.mjs`

Expected: PASS.

- [ ] **Step 2: Run syntax checks**

Run: `for f in scripts/*.mjs; do node --check "$f" || exit 1; done`

Expected: exit 0.

- [ ] **Step 3: Review diff**

Run: `git diff --stat && git diff -- scripts/sun-time.mjs scripts/sun-time-controller.mjs scripts/config.mjs scripts/choices.mjs scripts/settings-registration.mjs scripts/scene-settings.mjs scripts/region-elevation-renderer.mjs scripts/elevation-controls.mjs lang/en.json tests/sun-time.test.mjs`

Expected: changes match the spec, with no unrelated edits.
