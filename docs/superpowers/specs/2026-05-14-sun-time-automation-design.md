# Sun Time Automation Design

## Context

The module already supports a `Sun at edge` shadow mode. In that mode, shadows use `sunEdgePoint`, a per-scene point clamped to the scene boundary, and GMs can drag a sun handle while the Elevation select tool is active.

The new feature adds optional automatic sun movement relative to in-world time. It must support both Foundry world time and Simple Calendar Reborn without making either module a hard dependency.

Reference APIs:

- Simple Calendar Reborn exposes `SimpleCalendar.Hooks.DateTimeChange`, emitted when the current date/time changes, including when game world time changes.
- Its hook payload includes `date.hour`, `date.minute`, `date.second`, plus `date.sunrise`, `date.midday`, and `date.sunset`.
- Simple Calendar Reborn documents game-world-time integration modes where calendar time may follow, control, or ignore Foundry world time.
- Foundry v14 exposes the `updateWorldTime` hook when official world time changes.

References:

- https://simplecalendarreborn.net/docs/developing-with-sc/api/namespaces/SimpleCalendar.Hooks/
- https://simplecalendarreborn.net/docs/developing-with-sc/api/enums/SimpleCalendar.api.GameWorldTimeIntegrations/
- https://foundryvtt.com/api/functions/hookEvents.updateWorldTime.html

## Goals

- Preserve existing manual `Sun at edge` behavior.
- Add a GM-configurable automatic sun movement cadence.
- Allow a world default and per-scene override, matching existing scene visual settings.
- Prefer Simple Calendar Reborn time data when available.
- Fall back to Foundry world time when Simple Calendar Reborn is absent or unavailable.
- Keep render refreshes bounded by the selected cadence.

## Non-Goals

- No astronomical latitude, seasonal solar elevation, moonlight, or weather simulation.
- No dependency declaration on Simple Calendar Reborn.
- No automatic change to shadow mode; automation only matters when the effective shadow mode is `Sun at edge`.

## User-Facing Settings

Add a new scene setting key, backed by a world default:

- `Manual`: use the stored draggable `sunEdgePoint` exactly as today.
- `Every minute`: update the computed sun point whenever the in-world minute changes.
- `Every 10 minutes`: update at ten-minute boundaries.
- `Every hour`: update at hour boundaries.
- `Sunrise / noon / sunset`: update only when the current phase crosses one of the three anchor points.

The scene settings dialog should include this control near `Shadow Type` and `Shadow Length`, because it only affects `Sun at edge` shadows.

## Sun Path

Automatic sun movement computes a scene-edge point from the current day progress:

- Sunrise maps to the left edge midpoint.
- Noon maps to the top edge midpoint.
- Sunset maps to the right edge midpoint.
- Between sunrise and noon, interpolate along the scene boundary from left midpoint to top midpoint.
- Between noon and sunset, interpolate along the scene boundary from top midpoint to right midpoint.
- Before sunrise, hold at the sunrise point.
- After sunset, hold at the sunset point.

This keeps the visual model simple, predictable, and map-agnostic while still making shadows shift naturally across the playable day.

## Time Sources

Use this source order:

1. Simple Calendar Reborn if `globalThis.SimpleCalendar?.api` is available and can provide a current timestamp/date or hook payload.
2. Foundry world time via `game.time.worldTime`.

For Simple Calendar Reborn:

- Listen to `SimpleCalendar.Hooks.DateTimeChange` when available.
- Also listen to the literal hook name `simple-calendar-date-time-change` as a compatibility fallback.
- Use the hook payload directly when present.
- Prefer `date.sunrise`, `date.midday`, and `date.sunset` when they are valid timestamps.
- Fall back to the date's local `hour`, `minute`, and `second` with a 24-hour day when anchor timestamps are unavailable.

For Foundry world time:

- Listen to Foundry's `updateWorldTime` hook.
- Treat `game.time.worldTime` as seconds elapsed.
- Convert it to seconds within a 24-hour day.
- Use default anchors of 06:00 sunrise, 12:00 noon, and 18:00 sunset.

## Cadence

The cadence setting controls refresh frequency, not position math. The computed sun point can be exact for the current time, but renderer updates should only fire when the cadence bucket changes.

Suggested bucket keys:

- Minute: day index plus hour/minute.
- Ten minutes: day index plus hour plus `Math.floor(minute / 10)`.
- Hour: day index plus hour.
- Sunrise/noon/sunset: day index plus phase: `beforeSunrise`, `sunriseToNoon`, `noonToSunset`, `afterSunset`, with refreshes when crossing sunrise, noon, or sunset.

The module should store the last observed bucket in memory. It should not write computed sun positions to scene flags.

## Manual Override

When automation is active, the sun handle may display the computed point. If the GM drags the handle, the scene should switch the sun movement setting back to `Manual` and then save the dragged point. This matches user intent and avoids a draggable control that appears to fight the automation.

## Architecture

Add a small focused controller module, for example `scripts/sun-time-controller.mjs`.

Responsibilities:

- Register time hooks during module initialization or ready.
- Determine whether the current scene uses automatic sun movement.
- Read current time data from Simple Calendar Reborn or Foundry world time.
- Compute cadence bucket and scene-edge sun point.
- Invalidate scene setting cache only for transient computed values.
- Trigger `RegionElevationRenderer.instance.update()` when the cadence bucket changes.

Extend config helpers:

- Add `SUN_MOVEMENT_MODE` or similarly named setting key.
- Add constants for movement modes.
- Add a helper to normalize movement mode values.
- Include the setting in default scene settings, world visual settings, scene form reads, and localization.

Renderer behavior:

- `_sunShadowState` should read a resolved sun point helper rather than only the stored `sunEdgePoint`.
- The helper should return the transient computed automatic point when automation is active and valid, otherwise the stored manual point.

Controls behavior:

- `_sunEdgePoint()` should use the same resolved sun point helper so the handle displays the current computed point.
- Drag start/commit for the sun handle should switch the scene's sun movement mode to `Manual` before saving the dragged `sunEdgePoint`.

## Error Handling

- If Simple Calendar Reborn exists but throws or returns incomplete data, fall back to Foundry world time.
- If no scene is active, do nothing.
- If the effective shadow mode is not `Sun at edge`, do not force renderer updates for sun automation.
- If automation cannot compute a valid point, use the stored manual `sunEdgePoint`.

## Testing

Unit-test pure helpers where possible:

- Normalize cadence mode values.
- Extract seconds-of-day from Simple Calendar Reborn hook payloads.
- Compute day anchors from Simple Calendar Reborn sunrise/noon/sunset timestamps.
- Compute cadence buckets for minute, ten-minute, hour, and sunrise/noon/sunset modes.
- Map sunrise/noon/sunset progress to the expected left/top/right scene-edge points.

Manual Foundry verification:

- With no calendar module, advance world time and confirm shadows update at the selected cadence.
- With Simple Calendar Reborn active, advance time through its controls and confirm the hook updates shadows.
- Dragging the sun handle while automation is active switches that scene to `Manual` and preserves the dragged point.
- Scene override differs from world default and survives reload.
