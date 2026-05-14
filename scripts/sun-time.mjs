export const DAY_SECONDS = 86_400;

export const DEFAULT_TIME_CONFIGURATION = Object.freeze({
  hoursInDay: 24,
  minutesInHour: 60,
  secondsInMinute: 60
});

export const DEFAULT_SUN_ANCHORS = Object.freeze(_defaultSunAnchors(DAY_SECONDS));

export const SUN_SHADOW_SOURCE_TYPES = Object.freeze({
  SUN_EDGE: "sunEdge",
  AMBIENT_LIGHT: "ambientLight",
  TRANSITION: "transition"
});

export const SUN_MOVEMENT_MODES = Object.freeze({
  MANUAL: "manual",
  MINUTE: "minute",
  TEN_MINUTES: "tenMinutes",
  HOUR: "hour",
  SUNRISE_NOON_SUNSET: "sunriseNoonSunset"
});

export function sunMovementModeValue(value) {
  const key = String(value ?? SUN_MOVEMENT_MODES.MANUAL);
  return Object.values(SUN_MOVEMENT_MODES).includes(key) ? key : SUN_MOVEMENT_MODES.MANUAL;
}

export function sunTimeStateFromWorldTime(worldTime) {
  const timestamp = _finiteNumber(worldTime, 0);
  const dayIndex = Math.floor(timestamp / DAY_SECONDS);
  return _sunTimeState({
    dayIndex,
    secondsOfDay: _positiveModulo(timestamp, DAY_SECONDS),
    ...DEFAULT_SUN_ANCHORS,
    ...DEFAULT_TIME_CONFIGURATION,
    daySeconds: DAY_SECONDS
  });
}

export function sunTimeStateFromCalendarDate(date, timeConfiguration = null) {
  if (!date || typeof date !== "object") return null;
  const config = _timeConfiguration(timeConfiguration);
  const time = date.time && typeof date.time === "object" ? date.time : date;
  const hour = _finiteNumber(time.hour, 0);
  const minute = _finiteNumber(time.minute, 0);
  const second = _finiteNumber(time.second ?? time.seconds, 0);
  const secondsOfDay = _clampSeconds(
    hour * config.minutesInHour * config.secondsInMinute + minute * config.secondsInMinute + second,
    config.daySeconds
  );
  const anchors = _calendarAnchors(date, config.daySeconds);
  const dayIndex = anchors.dayIndex ?? _finiteNumber(date.dayIndex ?? date.dayOffset, 0);
  const defaultAnchors = _defaultSunAnchors(config.daySeconds);
  return _sunTimeState({
    dayIndex,
    secondsOfDay,
    sunrise: anchors.sunrise ?? defaultAnchors.sunrise,
    midday: anchors.midday ?? defaultAnchors.midday,
    sunset: anchors.sunset ?? defaultAnchors.sunset,
    hoursInDay: config.hoursInDay,
    minutesInHour: config.minutesInHour,
    secondsInMinute: config.secondsInMinute,
    daySeconds: config.daySeconds
  });
}

export function sunTimeCadenceBucket(mode, state) {
  const movementMode = sunMovementModeValue(mode);
  const normalized = _sunTimeState(state);
  if (!normalized || movementMode === SUN_MOVEMENT_MODES.MANUAL) return null;
  const hourSeconds = normalized.minutesInHour * normalized.secondsInMinute;
  const hour = Math.floor(normalized.secondsOfDay / hourSeconds);
  const minute = Math.floor((normalized.secondsOfDay % hourSeconds) / normalized.secondsInMinute);
  switch (movementMode) {
    case SUN_MOVEMENT_MODES.MINUTE:
      return `minute:${normalized.dayIndex}:${hour}:${minute}`;
    case SUN_MOVEMENT_MODES.TEN_MINUTES:
      return `tenMinutes:${normalized.dayIndex}:${hour}:${Math.floor(minute / 10)}`;
    case SUN_MOVEMENT_MODES.HOUR:
      return `hour:${normalized.dayIndex}:${hour}`;
    case SUN_MOVEMENT_MODES.SUNRISE_NOON_SUNSET:
      return `anchors:${normalized.dayIndex}:${sunTimePhase(normalized)}`;
    default:
      return null;
  }
}

export function sunTimePhase(state) {
  const normalized = _sunTimeState(state);
  if (!normalized) return "unknown";
  if (normalized.secondsOfDay < normalized.sunrise) return "beforeSunrise";
  if (normalized.secondsOfDay < normalized.midday) return "sunriseToNoon";
  if (normalized.secondsOfDay < normalized.sunset) return "noonToSunset";
  return "afterSunset";
}

export function sunEdgePointForTime(geo, state) {
  const normalized = _sunTimeState(state);
  if (!normalized || !geo) return null;
  const scene = _normalizedGeometry(geo);
  const sunrise = { x: scene.x, y: scene.y + scene.height / 2 };
  const noon = { x: scene.x + scene.width / 2, y: scene.y };
  const sunset = { x: scene.x + scene.width, y: scene.y + scene.height / 2 };
  if (normalized.secondsOfDay <= normalized.sunrise) return sunrise;
  if (normalized.secondsOfDay >= normalized.sunset) return sunset;
  if (normalized.secondsOfDay <= normalized.midday) {
    return _pointAlongBoundary(
      [sunrise, { x: scene.x, y: scene.y }, noon],
      _progress(normalized.secondsOfDay, normalized.sunrise, normalized.midday)
    );
  }
  return _pointAlongBoundary(
    [noon, { x: scene.x + scene.width, y: scene.y }, sunset],
    _progress(normalized.secondsOfDay, normalized.midday, normalized.sunset)
  );
}

export function sunShadowSourceForTime(geo, state, { storedPoint = null, ambientPoint = null, transitionSeconds = null } = {}) {
  const normalized = _sunTimeState(state);
  if (!normalized || !geo) return _source(SUN_SHADOW_SOURCE_TYPES.SUN_EDGE, _point(storedPoint));
  const sunPoint = sunEdgePointForTime(geo, normalized) ?? _point(storedPoint);
  const ambient = _point(ambientPoint);
  if (!ambient) return _source(SUN_SHADOW_SOURCE_TYPES.SUN_EDGE, sunPoint);
  const transition = _transitionSeconds(normalized, transitionSeconds);
  const seconds = normalized.secondsOfDay;

  if (seconds >= normalized.sunrise && seconds < normalized.sunset) {
    return _source(SUN_SHADOW_SOURCE_TYPES.SUN_EDGE, sunPoint);
  }
  if (transition <= 0) return _source(SUN_SHADOW_SOURCE_TYPES.AMBIENT_LIGHT, ambientPoint);

  if (seconds >= normalized.sunset) {
    const progress = _progress(seconds, normalized.sunset, Math.min(normalized.daySeconds - 1, normalized.sunset + transition));
    if (progress < 1) return _source(SUN_SHADOW_SOURCE_TYPES.TRANSITION, _interpolatePoint(sunPoint, ambient, progress));
    return _source(SUN_SHADOW_SOURCE_TYPES.AMBIENT_LIGHT, ambientPoint);
  }

  const dawnStart = Math.max(0, normalized.sunrise - transition);
  if (seconds >= dawnStart) {
    const progress = _progress(seconds, dawnStart, normalized.sunrise);
    if (progress > 0) return _source(SUN_SHADOW_SOURCE_TYPES.TRANSITION, _interpolatePoint(ambient, sunPoint, progress));
  }
  return _source(SUN_SHADOW_SOURCE_TYPES.AMBIENT_LIGHT, ambientPoint);
}

function _calendarAnchors(date, daySeconds) {
  const values = [date.sunrise, date.midday, date.sunset].map(value => Number(value));
  if (!values.every(Number.isFinite)) return {};
  const dayStart = Math.floor(Math.min(...values) / daySeconds) * daySeconds;
  const sunrise = _positiveModulo(values[0] - dayStart, daySeconds);
  const midday = _positiveModulo(values[1] - dayStart, daySeconds);
  const sunset = _positiveModulo(values[2] - dayStart, daySeconds);
  if (!(sunrise < midday && midday < sunset)) return {};
  return {
    dayIndex: Math.floor(dayStart / daySeconds),
    sunrise,
    midday,
    sunset
  };
}

function _sunTimeState(state) {
  if (!state || typeof state !== "object") return null;
  const config = _timeConfiguration(state);
  const defaultAnchors = _defaultSunAnchors(config.daySeconds);
  const sunrise = _clampSeconds(state.sunrise ?? defaultAnchors.sunrise, config.daySeconds);
  const midday = _clampSeconds(state.midday ?? defaultAnchors.midday, config.daySeconds);
  const sunset = _clampSeconds(state.sunset ?? defaultAnchors.sunset, config.daySeconds);
  const base = {
    dayIndex: Math.floor(_finiteNumber(state.dayIndex, 0)),
    secondsOfDay: _clampSeconds(state.secondsOfDay, config.daySeconds),
    daySeconds: config.daySeconds,
    minutesInHour: config.minutesInHour,
    secondsInMinute: config.secondsInMinute
  };
  if (!(sunrise < midday && midday < sunset)) return {
    ...base,
    ...defaultAnchors
  };
  return {
    ...base,
    sunrise,
    midday,
    sunset
  };
}

function _pointAlongBoundary(points, progress) {
  const segments = [];
  let total = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (length <= 0) continue;
    segments.push({ start, end, length });
    total += length;
  }
  let remaining = _clamp(progress, 0, 1) * total;
  for (const segment of segments) {
    if (remaining > segment.length) {
      remaining -= segment.length;
      continue;
    }
    const t = segment.length > 0 ? remaining / segment.length : 0;
    return {
      x: segment.start.x + (segment.end.x - segment.start.x) * t,
      y: segment.start.y + (segment.end.y - segment.start.y) * t
    };
  }
  return points[points.length - 1] ?? null;
}

function _progress(value, start, end) {
  const span = end - start;
  if (!Number.isFinite(span) || span <= 0) return 0;
  return _clamp((value - start) / span, 0, 1);
}

function _transitionSeconds(state, transitionSeconds) {
  const fallback = state.minutesInHour * state.secondsInMinute;
  const value = transitionSeconds == null ? fallback : _finiteNumber(transitionSeconds, fallback);
  return Math.max(0, Math.floor(value));
}

function _source(type, value) {
  const point = _point(value);
  if (!point) return null;
  const source = { type, point };
  _copyFinite(source, value, "radius");
  _copyFinite(source, value, "distance");
  _copyFinite(source, value, "brightRadius");
  _copyFinite(source, value, "dimRadius");
  _copyFinite(source, value, "elevation");
  if (value?.id) source.id = String(value.id);
  return source;
}

function _copyFinite(target, source, key) {
  const value = Number(source?.[key]);
  if (Number.isFinite(value)) target[key] = value;
}

function _point(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function _interpolatePoint(start, end, progress) {
  const t = _clamp(progress, 0, 1);
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t
  };
}

function _normalizedGeometry(geo) {
  return {
    x: _finiteNumber(geo.x, 0),
    y: _finiteNumber(geo.y, 0),
    width: Math.max(1, _finiteNumber(geo.width, 1)),
    height: Math.max(1, _finiteNumber(geo.height, 1))
  };
}

function _timeConfiguration(timeConfiguration = null) {
  const hoursInDay = Math.max(1, Math.floor(_finiteNumber(timeConfiguration?.hoursInDay, DEFAULT_TIME_CONFIGURATION.hoursInDay)));
  const minutesInHour = Math.max(1, Math.floor(_finiteNumber(timeConfiguration?.minutesInHour, DEFAULT_TIME_CONFIGURATION.minutesInHour)));
  const secondsInMinute = Math.max(1, Math.floor(_finiteNumber(timeConfiguration?.secondsInMinute, DEFAULT_TIME_CONFIGURATION.secondsInMinute)));
  const daySeconds = Math.max(1, Math.floor(_finiteNumber(timeConfiguration?.daySeconds, hoursInDay * minutesInHour * secondsInMinute)));
  return { hoursInDay, minutesInHour, secondsInMinute, daySeconds };
}

function _defaultSunAnchors(daySeconds) {
  return {
    sunrise: Math.floor(daySeconds * 0.25),
    midday: Math.floor(daySeconds * 0.5),
    sunset: Math.floor(daySeconds * 0.75)
  };
}

function _clampSeconds(value, daySeconds) {
  return _clamp(_finiteNumber(value, 0), 0, daySeconds - 1);
}

function _finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function _clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function _positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}
