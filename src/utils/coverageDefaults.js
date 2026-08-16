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

// Build a per-day COVERAGE map from saved settings + defaults for a given
// day-of-week (0=Sun..6=Sat). Windows (start/end) stay from defaults; only the
// minimum is overridable per day.
export function resolveCoverage(settings, dow) {
  const map = {};
  for (const [area, def] of Object.entries(DEFAULT_COVERAGE)) {
    const rec = settings && settings.find((s) => s.area === area);
    let min = def.min;
    if (rec && Array.isArray(rec.days) && rec.days[dow] && typeof rec.days[dow].min === "number") {
      min = rec.days[dow].min;
    }
    map[area] = { start: def.start, end: def.end, min };
  }
  return map;
}