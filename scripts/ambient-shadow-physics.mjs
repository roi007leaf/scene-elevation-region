export function ambientShadowInfluence(source, { visualElevation = 0, supportElevation = 0, localElevationDelta = null } = {}) {
  const radial = _radialInfluence(source);
  const vertical = _verticalInfluence(source, { visualElevation, supportElevation, localElevationDelta });
  const influence = {
    alphaMultiplier: radial.alphaMultiplier * vertical.alphaMultiplier,
    lengthMultiplier: radial.lengthMultiplier * vertical.lengthMultiplier,
    blurMultiplier: radial.blurMultiplier * vertical.blurMultiplier
  };
  const progress = _ambientProgress(source);
  return progress >= 1 ? influence : {
    alphaMultiplier: _lerp(1, influence.alphaMultiplier, progress),
    lengthMultiplier: _lerp(1, influence.lengthMultiplier, progress),
    blurMultiplier: _lerp(1, influence.blurMultiplier, progress)
  };
}

function _radialInfluence(source) {
  const radius = Number(source?.radius);
  const distance = Number(source?.distance);
  if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(distance)) {
    return { alphaMultiplier: 1, lengthMultiplier: 1, blurMultiplier: 1 };
  }
  const edgeProgress = _clamp(distance / radius, 0, 1);
  const centerStrength = 1 - edgeProgress;
  const brightness = _brightnessInfluence(source, distance, radius);
  return {
    alphaMultiplier: (0.38 + centerStrength * 0.62) * brightness.alphaMultiplier,
    lengthMultiplier: (0.48 + centerStrength * 0.72) * brightness.lengthMultiplier,
    blurMultiplier: (1 + edgeProgress * 0.55) * brightness.blurMultiplier
  };
}

function _brightnessInfluence(source, distance, radius) {
  const brightRadius = Math.max(0, Number(source?.brightRadius) || 0);
  const dimRadius = Math.max(brightRadius, Number(source?.dimRadius) || radius);
  if (brightRadius <= 0 || distance <= brightRadius) {
    return { alphaMultiplier: 1, lengthMultiplier: 1, blurMultiplier: 1 };
  }
  const dimProgress = _clamp((distance - brightRadius) / Math.max(1, dimRadius - brightRadius), 0, 1);
  return {
    alphaMultiplier: 1 - dimProgress * 0.45,
    lengthMultiplier: 1 - dimProgress * 0.3,
    blurMultiplier: 1 + dimProgress * 0.35
  };
}

function _verticalInfluence(source, { visualElevation, supportElevation, localElevationDelta }) {
  const lightElevation = Number(source?.elevation);
  if (!Number.isFinite(lightElevation)) return { alphaMultiplier: 1, lengthMultiplier: 1, blurMultiplier: 1 };
  const support = _finiteNumber(supportElevation, 0);
  const visual = _finiteNumber(visualElevation, support);
  const height = Math.max(0.1, Math.abs(_finiteNumber(localElevationDelta, visual - support)));
  const lightAboveSupport = lightElevation - support;
  if (lightAboveSupport <= 0) {
    return { alphaMultiplier: 1.05, lengthMultiplier: 1.65, blurMultiplier: 1.08 };
  }
  const ratio = height / Math.max(0.25, lightAboveSupport);
  return {
    alphaMultiplier: _clamp(0.72 + ratio * 0.24, 0.58, 1.06),
    lengthMultiplier: _clamp(0.35 + ratio * 1.15, 0.35, 1.65),
    blurMultiplier: _clamp(1.18 - ratio * 0.2, 0.88, 1.18)
  };
}

function _clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function _ambientProgress(source) {
  const progress = Number(source?.ambientProgress);
  return Number.isFinite(progress) ? _clamp(progress, 0, 1) : 1;
}

function _lerp(start, end, progress) {
  return start + (end - start) * progress;
}

function _finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
