// Shared coverage defaults + per-day resolver. Mirrors the backend config in
// base44/functions/generateBreaks/entry.ts — keep the two in sync.

export const DEFAULT_COVERAGE = {
  "People Greeter": { start: 0, end: 1440, min: 1 },
  Register: { start: 540, end: 1200, min: 1 },
  "Toolshop Register": { start: 0, end: 1440, min: 1 },
  "Nursery Register": { start: 540, end: 1020, min: 1 },
  "Nursery Greeter": { start: 540, end: 1020, min: 1 },
  "Info Desk": { start: 0, end: 1440, min: 1 },
  "Front End Support": { start: 0, end: 1440, min: 1 },
  Cafe: { start: 465, end: 1005, min: 1 },
};

export const EQUIV = {
  "Info Desk": "Front End Support",
  "Front End Support": "Info Desk",
};

export const SELF_MANAGED = new Set(["Online Fulfilment", "Click and Collect", "Reception"]);

// JS getDay(): 0=Sun .. 6=Sat
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Business hours: Mon–Fri 6:00–21:00, Sat–Sun 7:00–19:00 (minutes from midnight)
export function businessHours(dow) {
  const weekend = dow === 0 || dow === 6;
  return weekend ? [420, 1140] : [360, 1260];
}

// Default coverage windows for an area on a given day: the area's default span
// clamped to business hours, at its default minimum.
export function defaultWindows(area, dow) {
  const def = DEFAULT_COVERAGE[area];
  if (!def) return [];
  const [bhStart, bhEnd] = businessHours(dow);
  const start = Math.max(def.start, bhStart);
  const end = Math.min(def.end, bhEnd);
  if (start >= end) return [];
  return [{ start, end, min: def.min }];
}

// Per-day, per-area coverage windows for a given day-of-week (0=Sun..6=Sat).
// Returns { [area]: [{ start, end, min }, ...] }. Windows are taken from saved
// settings when present, otherwise fall back to defaults. Supports the legacy
// single-min shape ({ days[i].min }) by promoting it to one default-span window.
export function resolveCoverage(settings, dow) {
  const map = {};
  for (const area of Object.keys(DEFAULT_COVERAGE)) {
    let windows = defaultWindows(area, dow);
    const rec = settings && settings.find((s) => s.area === area);
    if (rec && Array.isArray(rec.days) && rec.days[dow]) {
      const dayEntry = rec.days[dow];
      let w = null;
      if (Array.isArray(dayEntry.windows)) {
        w = dayEntry.windows.filter(
          (x) =>
            typeof x.start === "number" &&
            typeof x.end === "number" &&
            typeof x.min === "number" &&
            x.end > x.start
        );
      } else if (typeof dayEntry.min === "number") {
        const def = defaultWindows(area, dow)[0];
        if (def) w = [{ ...def, min: dayEntry.min }];
      }
      if (w && w.length) windows = w;
    }
    map[area] = windows;
  }
  return map;
}