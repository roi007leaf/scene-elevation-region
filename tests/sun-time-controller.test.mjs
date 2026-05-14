import test from "node:test";
import assert from "node:assert/strict";

Math.clamp ??= ((value, min, max) => Math.min(max, Math.max(min, value)));
globalThis.foundry = {
  utils: {
    deepClone: value => JSON.parse(JSON.stringify(value ?? {})),
    getProperty: (object, path) => String(path).split(".").reduce((value, key) => value?.[key], object),
    mergeObject: (target, source) => ({ ...(target ?? {}), ...(source ?? {}) })
  }
};
globalThis.game = {
  settings: { get: () => { throw new Error("unset setting"); } },
  time: { worldTime: 20 * 3600 }
};
globalThis.canvas = {
  dimensions: { sceneRect: { x: 0, y: 0, width: 1000, height: 500 }, size: 100 },
  grid: { size: 100 },
  darknessLevel: 0.85,
  lighting: { placeables: [] },
  scene: null
};

const { MODULE_ID, SCENE_SETTING_KEYS, SCENE_SETTINGS_FLAG, ELEVATION_PRESETS, SHADOW_MODES, SUN_MOVEMENT_MODES } = await import("../scripts/config.mjs");
const { SUN_SHADOW_SOURCE_TYPES } = await import("../scripts/sun-time.mjs");
const { sunTimeController } = await import("../scripts/sun-time-controller.mjs");

test("resolves automatic night shadows from the nearest active ambient light", () => {
  const sceneSettings = {
    [SCENE_SETTING_KEYS.PRESET]: ELEVATION_PRESETS.CUSTOM,
    [SCENE_SETTING_KEYS.SHADOW_MODE]: SHADOW_MODES.SUN_AT_EDGE,
    [SCENE_SETTING_KEYS.SUN_MOVEMENT_MODE]: SUN_MOVEMENT_MODES.MINUTE
  };
  const scene = {
    getFlag: (moduleId, flag) => moduleId === MODULE_ID && flag === SCENE_SETTINGS_FLAG ? sceneSettings : {}
  };
  canvas.scene = scene;
  canvas.lighting.placeables = [
    { document: { id: "far", x: 400, y: 100, config: { darkness: { min: 0.6, max: 1 } } }, source: { shape: { radius: 500 } } },
    { document: { id: "near", x: 120, y: 100, config: { darkness: { min: 0.6, max: 1 } } }, source: { shape: { radius: 100 } } }
  ];

  sunTimeController.clear(scene);
  sunTimeController.refresh(null, { force: true });
  const source = sunTimeController.resolvedShadowSource(scene, { x: 0, y: 0, width: 1000, height: 500 }, { x: 100, y: 100 }, { x: 500, y: 0 });

  assert.equal(source.type, SUN_SHADOW_SOURCE_TYPES.AMBIENT_LIGHT);
  assert.deepEqual(source.point, { x: 120, y: 100 });
});

test("sunrise noon sunset cadence switches to ambient immediately at sunset", () => {
  game.time.worldTime = 18 * 3600;
  const sceneSettings = {
    [SCENE_SETTING_KEYS.PRESET]: ELEVATION_PRESETS.CUSTOM,
    [SCENE_SETTING_KEYS.SHADOW_MODE]: SHADOW_MODES.SUN_AT_EDGE,
    [SCENE_SETTING_KEYS.SUN_MOVEMENT_MODE]: SUN_MOVEMENT_MODES.SUNRISE_NOON_SUNSET
  };
  const scene = {
    getFlag: (moduleId, flag) => moduleId === MODULE_ID && flag === SCENE_SETTINGS_FLAG ? sceneSettings : {}
  };
  canvas.scene = scene;
  canvas.lighting.placeables = [
    { document: { id: "moon", x: 120, y: 100, config: { darkness: { min: 0.6, max: 1 } } }, source: { shape: { radius: 100 } } }
  ];

  sunTimeController.clear(scene);
  sunTimeController.refresh(null, { force: true });
  const source = sunTimeController.resolvedShadowSource(scene, { x: 0, y: 0, width: 1000, height: 500 }, { x: 100, y: 100 }, { x: 500, y: 0 });

  assert.equal(source.type, SUN_SHADOW_SOURCE_TYPES.AMBIENT_LIGHT);
  assert.deepEqual(source.point, { x: 120, y: 100 });
});

test("coalesces ambient light refresh hooks into one frame refresh", () => {
  const queuedFrames = [];
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = callback => {
    queuedFrames.push(callback);
    return queuedFrames.length;
  };
  globalThis.cancelAnimationFrame = () => {};
  try {
    let refreshCount = 0;
    sunTimeController.register({ onRefresh: () => { refreshCount += 1; } });
    game.time.worldTime = 20 * 3600;
    const sceneSettings = {
      [SCENE_SETTING_KEYS.PRESET]: ELEVATION_PRESETS.CUSTOM,
      [SCENE_SETTING_KEYS.SHADOW_MODE]: SHADOW_MODES.SUN_AT_EDGE,
      [SCENE_SETTING_KEYS.SUN_MOVEMENT_MODE]: SUN_MOVEMENT_MODES.MINUTE
    };
    const scene = {
      getFlag: (moduleId, flag) => moduleId === MODULE_ID && flag === SCENE_SETTINGS_FLAG ? sceneSettings : {}
    };
    canvas.scene = scene;
    sunTimeController.clear(scene);
    sunTimeController.refresh(null, { force: true });
    refreshCount = 0;

    const light = { document: { parent: scene } };
    sunTimeController.refreshAmbientLight(light);
    sunTimeController.refreshAmbientLight(light);
    sunTimeController.refreshAmbientLight(light);

    assert.equal(refreshCount, 0);
    assert.equal(queuedFrames.length, 1);
    queuedFrames.shift()();
    assert.equal(refreshCount, 1);
  } finally {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  }
});

test("resolves ambient source for bounds overlapping a light even when the center is outside", () => {
  game.time.worldTime = 20 * 3600;
  const sceneSettings = {
    [SCENE_SETTING_KEYS.PRESET]: ELEVATION_PRESETS.CUSTOM,
    [SCENE_SETTING_KEYS.SHADOW_MODE]: SHADOW_MODES.SUN_AT_EDGE,
    [SCENE_SETTING_KEYS.SUN_MOVEMENT_MODE]: SUN_MOVEMENT_MODES.MINUTE
  };
  const scene = {
    getFlag: (moduleId, flag) => moduleId === MODULE_ID && flag === SCENE_SETTINGS_FLAG ? sceneSettings : {}
  };
  canvas.scene = scene;
  canvas.lighting.placeables = [
    { document: { id: "edge", x: 180, y: 100, config: { darkness: { min: 0.6, max: 1 } } }, source: { shape: { radius: 40 } } }
  ];

  sunTimeController.clear(scene);
  sunTimeController.refresh(null, { force: true });
  const source = sunTimeController.resolvedShadowSource(scene, { x: 0, y: 0, width: 300, height: 200 }, {
    minX: 50,
    minY: 50,
    maxX: 150,
    maxY: 150,
    width: 100,
    height: 100,
    center: { x: 100, y: 100 }
  }, { x: 500, y: 0 });

  assert.equal(source.type, SUN_SHADOW_SOURCE_TYPES.AMBIENT_LIGHT);
  assert.equal(source.radius, 40);
  assert.equal(source.distance, 80);
});
