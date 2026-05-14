import {
  SCENE_SETTING_KEYS,
  getSceneElevationSettings,
  setSceneElevationSettings,
  sunMovementModeValue
} from "./config.mjs";
import {
  SUN_MOVEMENT_MODES,
  sunEdgePointForTime,
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
}

export const sunTimeController = new SunTimeController();
