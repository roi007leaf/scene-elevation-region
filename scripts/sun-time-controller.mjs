import {
  SCENE_SETTING_KEYS,
  getSceneElevationSettings,
  setSceneElevationSettings,
  sunMovementModeValue
} from "./config.mjs";
import { ambientLightSourceForPoint } from "./ambient-light-source.mjs";
import {
  SUN_MOVEMENT_MODES,
  SUN_SHADOW_SOURCE_TYPES,
  sunEdgePointForTime,
  sunShadowSourceForTime,
  sunTimeCadenceBucket,
  sunTimeStateFromCalendarDate,
  sunTimeStateFromWorldTime
} from "./sun-time.mjs";

class SunTimeController {
  constructor() {
    this._registered = false;
    this._hookNames = new Set();
    this._sceneStates = new WeakMap();
    this._onRefresh = null;
  }

  register({ onRefresh = null } = {}) {
    this._onRefresh = typeof onRefresh === "function" ? onRefresh : null;
    if (this._registered) return;
    this._registered = true;
    this._registerHook("updateWorldTime", () => this.refresh());
    this._registerHook("simple-calendar-date-time-change", data => this.refresh(data));
    this._registerHook("updateScene", (scene, change) => this._refreshForSceneUpdate(scene, change));
    for (const hook of ["createAmbientLight", "updateAmbientLight", "deleteAmbientLight", "drawAmbientLight", "refreshAmbientLight"]) {
      this._registerHook(hook, light => this.refreshAmbientLight(light));
    }
    const simpleCalendarHook = globalThis.SimpleCalendar?.Hooks?.DateTimeChange;
    if (simpleCalendarHook) this._registerHook(simpleCalendarHook, data => this.refresh(data));
  }

  refresh(datePayload = null, { force = false } = {}) {
    const scene = canvas?.scene;
    if (!scene || !this.isAutomatic(scene)) {
      if (scene) this._sceneStates.delete(scene);
      return null;
    }
    const state = this._timeState(datePayload);
    if (!state) return null;
    const mode = this._mode(scene);
    const bucket = sunTimeCadenceBucket(mode, state);
    const previous = this._sceneStates.get(scene);
    this._sceneStates.set(scene, { state, bucket });
    if (force || bucket !== previous?.bucket) this._onRefresh?.(scene);
    return state;
  }

  clear(scene = canvas?.scene) {
    if (scene) this._sceneStates.delete(scene);
  }

  resolvedSunEdgePoint(scene, geo, storedPoint) {
    if (!scene || !geo || !this.isAutomatic(scene)) return storedPoint;
    const record = this._sceneStates.get(scene);
    const point = record?.state ? sunEdgePointForTime(geo, record.state) : null;
    return point ?? storedPoint;
  }

  resolvedShadowSource(scene, geo, targetPoint, storedPoint) {
    if (!scene || !geo || !this.isAutomatic(scene)) return _source(SUN_SHADOW_SOURCE_TYPES.SUN_EDGE, storedPoint);
    const record = this._sceneStates.get(scene);
    if (!record?.state) return _source(SUN_SHADOW_SOURCE_TYPES.SUN_EDGE, this.resolvedSunEdgePoint(scene, geo, storedPoint));
    const mode = this._mode(scene);
    return sunShadowSourceForTime(geo, record.state, {
      storedPoint,
      ambientPoint: this._ambientLightPointForTarget(scene, targetPoint),
      transitionSeconds: mode === SUN_MOVEMENT_MODES.SUNRISE_NOON_SUNSET ? 0 : null
    }) ?? _source(SUN_SHADOW_SOURCE_TYPES.SUN_EDGE, this.resolvedSunEdgePoint(scene, geo, storedPoint));
  }

  refreshAmbientLight(light = null) {
    const scene = canvas?.scene;
    if (!scene || !this.isAutomatic(scene)) return;
    const lightScene = light?.document?.parent ?? light?.parent ?? light?.scene ?? null;
    if (lightScene && lightScene !== scene) return;
    if (!this._sceneStates.has(scene)) this.refresh(null, { force: true });
    else this._onRefresh?.(scene);
  }

  isAutomatic(scene = canvas?.scene) {
    return this._mode(scene) !== SUN_MOVEMENT_MODES.MANUAL;
  }

  async switchSceneToManual(scene = canvas?.scene, settings = null) {
    if (!scene) return null;
    const current = settings ?? getSceneElevationSettings(scene);
    this._sceneStates.delete(scene);
    return setSceneElevationSettings(scene, {
      ...current,
      [SCENE_SETTING_KEYS.SUN_MOVEMENT_MODE]: SUN_MOVEMENT_MODES.MANUAL
    });
  }

  _registerHook(name, callback) {
    if (!name || this._hookNames.has(name) || !globalThis.Hooks?.on) return;
    this._hookNames.add(name);
    Hooks.on(name, callback);
  }

  _refreshForSceneUpdate(scene, change) {
    if (scene !== canvas?.scene || !this.isAutomatic(scene)) return;
    if (!change || _hasAnyProperty(change, ["darkness", "environment.darkness", "environment.darknessLevel"])) {
      if (!this._sceneStates.has(scene)) this.refresh(null, { force: true });
      else this._onRefresh?.(scene);
    }
  }

  _mode(scene = canvas?.scene) {
    if (!scene) return SUN_MOVEMENT_MODES.MANUAL;
    try {
      return sunMovementModeValue(getSceneElevationSettings(scene)[SCENE_SETTING_KEYS.SUN_MOVEMENT_MODE]);
    } catch (err) {
      return SUN_MOVEMENT_MODES.MANUAL;
    }
  }

  _timeState(datePayload = null) {
    const payloadDate = datePayload?.date ?? datePayload;
    const payloadState = sunTimeStateFromCalendarDate(payloadDate, this._simpleCalendarTimeConfiguration());
    if (payloadState) return payloadState;
    const apiState = this._simpleCalendarState();
    if (apiState) return apiState;
    return sunTimeStateFromWorldTime(game?.time?.worldTime ?? 0);
  }

  _simpleCalendarState() {
    const api = globalThis.SimpleCalendar?.api;
    if (!api) return null;
    try {
      const timeConfiguration = this._simpleCalendarTimeConfiguration();
      const timestamp = typeof api.timestamp === "function" ? api.timestamp() : null;
      const date = Number.isFinite(Number(timestamp)) && typeof api.timestampToDate === "function"
        ? api.timestampToDate(timestamp)
        : typeof api.getCurrentDate === "function"
          ? api.getCurrentDate()
          : null;
      return sunTimeStateFromCalendarDate(date, timeConfiguration);
    } catch (err) {
      return null;
    }
  }

  _simpleCalendarTimeConfiguration() {
    const api = globalThis.SimpleCalendar?.api;
    try {
      return typeof api?.getTimeConfiguration === "function" ? api.getTimeConfiguration() : null;
    } catch (err) {
      return null;
    }
  }

  _ambientLightPointForTarget(scene, targetPoint) {
    return ambientLightSourceForPoint(targetPoint, this._ambientLights(scene), {
      darkness: this._sceneDarkness(scene)
    });
  }

  _ambientLights(scene) {
    if (scene !== canvas?.scene) return _uniqueObjects(scene?.lights ?? scene?.ambientLights);
    return _uniqueObjects([
      ..._asArray(canvas?.lighting?.placeables),
      ..._asArray(canvas?.effects?.lighting?.placeables),
      ..._asArray(canvas?.effects?.lightSources)
    ]);
  }

  _sceneDarkness(scene) {
    return _firstFinite(
      canvas?.darknessLevel,
      canvas?.environment?.darknessLevel,
      canvas?.environment?.darkness,
      scene?.darkness,
      scene?.environment?.darknessLevel,
      scene?.environment?.darkness
    );
  }
}

export const sunTimeController = new SunTimeController();

function _source(type, point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { type, point: { x, y } } : null;
}

function _asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value.values === "function") return Array.from(value.values());
  if (typeof value[Symbol.iterator] === "function") return Array.from(value);
  return [];
}

function _uniqueObjects(value) {
  const seen = new Set();
  const result = [];
  for (const item of _asArray(value)) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}

function _firstFinite(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function _hasAnyProperty(object, paths) {
  return paths.some(path => _hasProperty(object, path));
}

function _hasProperty(object, path) {
  const parts = String(path).split(".");
  let current = object;
  for (const part of parts) {
    if (!current || !Object.prototype.hasOwnProperty.call(current, part)) return false;
    current = current[part];
  }
  return true;
}
