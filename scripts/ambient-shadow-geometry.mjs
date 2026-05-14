export const DEFAULT_AMBIENT_SHADOW_CLIP_SEGMENTS = 24;

export function clipPathsToCircle(paths, source, { segments = DEFAULT_AMBIENT_SHADOW_CLIP_SEGMENTS } = {}) {
  const center = _point(source);
  const radius = Number(source?.radius);
  if (!Array.isArray(paths) || !paths.length || !center) return [];
  if (!Number.isFinite(radius)) return paths;
  if (radius <= 0) return [];

  const circleBounds = {
    minX: center.x - radius,
    minY: center.y - radius,
    maxX: center.x + radius,
    maxY: center.y + radius
  };
  const clipPolygon = _circlePolygon(center, radius, segments);
  const clippedPaths = [];
  for (const path of paths) {
    if (!Array.isArray(path) || path.length < 3) continue;
    const bounds = _pathBounds(path);
    if (!bounds || !_boundsOverlap(bounds, circleBounds)) continue;
    if (path.every(point => _distanceSq(point, center) <= radius * radius + 0.0001)) {
      clippedPaths.push(path);
      continue;
    }
    const clipped = _clipPathToConvexPolygon(path, clipPolygon);
    if (clipped.length >= 3) clippedPaths.push(clipped);
  }
  return clippedPaths;
}

function _circlePolygon(center, radius, segments) {
  const count = Math.max(8, Math.min(48, Math.floor(Number(segments) || DEFAULT_AMBIENT_SHADOW_CLIP_SEGMENTS)));
  const points = [];
  for (let index = 0; index < count; index++) {
    const angle = (Math.PI * 2 * index) / count;
    points.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius
    });
  }
  return points;
}

function _clipPathToConvexPolygon(path, clipPolygon) {
  let output = path.slice();
  const orientation = Math.sign(_signedArea(clipPolygon)) || 1;
  for (let index = 0; index < clipPolygon.length; index++) {
    const clipStart = clipPolygon[index];
    const clipEnd = clipPolygon[(index + 1) % clipPolygon.length];
    const input = output;
    output = [];
    if (!input.length) break;
    let previous = input[input.length - 1];
    let previousInside = _insideHalfPlane(previous, clipStart, clipEnd, orientation);
    for (const current of input) {
      const currentInside = _insideHalfPlane(current, clipStart, clipEnd, orientation);
      if (currentInside) {
        if (!previousInside) output.push(_lineIntersection(previous, current, clipStart, clipEnd));
        output.push(current);
      } else if (previousInside) {
        output.push(_lineIntersection(previous, current, clipStart, clipEnd));
      }
      previous = current;
      previousInside = currentInside;
    }
  }
  return _dedupePath(output);
}

function _insideHalfPlane(point, start, end, orientation) {
  const cross = (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
  return cross * orientation >= -0.0001;
}

function _lineIntersection(from, to, clipStart, clipEnd) {
  const segment = { x: to.x - from.x, y: to.y - from.y };
  const clip = { x: clipEnd.x - clipStart.x, y: clipEnd.y - clipStart.y };
  const denominator = _cross(segment, clip);
  if (Math.abs(denominator) < 0.000001) return to;
  const startDelta = { x: clipStart.x - from.x, y: clipStart.y - from.y };
  const t = _cross(startDelta, clip) / denominator;
  return {
    x: from.x + segment.x * t,
    y: from.y + segment.y * t
  };
}

function _dedupePath(path) {
  const result = [];
  for (const point of path) {
    const previous = result[result.length - 1];
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 0.001) result.push(point);
  }
  if (result.length > 2 && Math.hypot(result[0].x - result[result.length - 1].x, result[0].y - result[result.length - 1].y) <= 0.001) result.pop();
  return result;
}

function _pathBounds(path) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of path) {
    minX = Math.min(minX, Number(point?.x));
    minY = Math.min(minY, Number(point?.y));
    maxX = Math.max(maxX, Number(point?.x));
    maxY = Math.max(maxY, Number(point?.y));
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

function _boundsOverlap(left, right) {
  return left.minX <= right.maxX && left.maxX >= right.minX && left.minY <= right.maxY && left.maxY >= right.minY;
}

function _distanceSq(left, right) {
  const dx = Number(left?.x) - right.x;
  const dy = Number(left?.y) - right.y;
  return dx * dx + dy * dy;
}

function _signedArea(path) {
  let area = 0;
  for (let index = 0; index < path.length; index++) {
    const current = path[index];
    const next = path[(index + 1) % path.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

function _cross(left, right) {
  return left.x * right.y - left.y * right.x;
}

function _point(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}
