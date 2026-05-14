import test from "node:test";
import assert from "node:assert/strict";
import {
  SUN_MOVEMENT_MODES,
  sunMovementModeValue,
  sunTimeStateFromCalendarDate,
  sunTimeStateFromWorldTime,
  sunTimeCadenceBucket,
  sunEdgePointForTime,
  sunShadowSourceForTime,
  SUN_SHADOW_SOURCE_TYPES
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

test("uses ambient light as the shadow source at night", () => {
  const source = sunShadowSourceForTime(geo, sunTimeStateFromWorldTime(20 * 3600), {
    ambientPoint: { x: 600, y: 400 }
  });

  assert.equal(source.type, SUN_SHADOW_SOURCE_TYPES.AMBIENT_LIGHT);
  assert.deepEqual(source.point, { x: 600, y: 400 });
});

test("blends from sunset edge to ambient light during twilight", () => {
  const source = sunShadowSourceForTime(geo, sunTimeStateFromWorldTime(18 * 3600 + 30 * 60), {
    ambientPoint: { x: 600, y: 400 },
    transitionSeconds: 3600
  });

  assert.equal(source.type, SUN_SHADOW_SOURCE_TYPES.TRANSITION);
  assert.deepEqual(source.point, { x: 800, y: 325 });
});

test("defaults twilight transitions to one configured hour", () => {
  const source = sunShadowSourceForTime(geo, sunTimeStateFromWorldTime(18 * 3600 + 30 * 60), {
    ambientPoint: { x: 600, y: 400 }
  });

  assert.equal(source.type, SUN_SHADOW_SOURCE_TYPES.TRANSITION);
  assert.deepEqual(source.point, { x: 800, y: 325 });
});

test("falls back to the sun edge source after sunset when no ambient light applies", () => {
  const source = sunShadowSourceForTime(geo, sunTimeStateFromWorldTime(20 * 3600), {
    storedPoint: { x: 111, y: 222 }
  });

  assert.equal(source.type, SUN_SHADOW_SOURCE_TYPES.SUN_EDGE);
  assert.deepEqual(source.point, { x: 1000, y: 250 });
});
