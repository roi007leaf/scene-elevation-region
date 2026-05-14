export function ambientLightSourceForPoint(point, lights, { darkness = null, coverageRadius = 0 } = {}) {
  const target = _point(point);
  if (!target) return null;
  const targetRadius = Math.max(0, _finiteNumber(coverageRadius, 0));
  let best = null;
  for (const light of _asArray(lights)) {
    const source = ambientLightSourceData(light, { darkness });
    if (!source) continue;
    const distance = Math.hypot(target.x - source.x, target.y - source.y);
    if (Number.isFinite(source.radius) && distance > source.radius + targetRadius) continue;
    if (!best || distance < best.distance) best = { ...source, distance };
  }
  return best;
}

export function ambientLightSourceData(light, { darkness = null } = {}) {
  if (!light || typeof light !== "object") return null;
  const source = light.source ?? light.lightSource ?? {};
  const document = light.document ?? light.object?.document ?? source.object?.document ?? light;
  const config = document.config ?? document.data?.config ?? light.config ?? light.data?.config ?? source.data?.config ?? {};
  if (_disabled(light) || _disabled(document) || _disabled(config) || source.active === false || source.disabled === true) return null;
  if (!_withinDarknessRange(config, darkness)) return null;
  const center = _point(light.center) ?? _point(source) ?? _point(document) ?? _point(light);
  if (!center) return null;
  const radius = _sourceRadius(light, source, config);
  if (radius !== Infinity && radius <= 0) return null;
  return {
    id: String(document.id ?? document._id ?? light.id ?? ""),
    x: center.x,
    y: center.y,
    radius
  };
}

function _asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value.values === "function") return Array.from(value.values());
  if (typeof value[Symbol.iterator] === "function") return Array.from(value);
  return [];
}

function _point(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function _disabled(value) {
  return value?.hidden === true || value?.disabled === true || value?.visible === false || value?.destroyed === true;
}

function _withinDarknessRange(config, darkness) {
  const level = Number(darkness);
  if (!Number.isFinite(level)) return true;
  const range = config?.darkness ?? config?.darknessRange;
  if (!range || typeof range !== "object") return true;
  const min = _finiteNumber(range.min, 0);
  const max = _finiteNumber(range.max, 1);
  return level >= min && level <= max;
}

function _sourceRadius(light, source, config) {
  const radius = _maxFinite(
    source.shape?.radius,
    source.radius,
    source.data?.radius,
    light.radius,
    light.dimRadius,
    light.brightRadius
  );
  if (radius > 0) return radius;
  const configured = _maxFinite(config.dim, config.bright, config.radius);
  return configured > 0 ? Infinity : 0;
}

function _maxFinite(...values) {
  let best = 0;
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > best) best = number;
  }
  return best;
}

function _finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
