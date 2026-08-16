import React, { useMemo, useState } from "react";
import { ChevronDown, Clock, Users, AlertTriangle } from "lucide-react";

// Mirrors the backend coverage config so the chart reflects the same rules.
const COVERAGE = {
  "People Greeter": { min: 1 },
  Register: { min: 1 },
  "Toolshop Register": { min: 1 },
  "Nursery Register": { min: 1 },
  "Nursery Greeter": { min: 1 },
  "Info Desk": { min: 1 },
  "Front End Support": { min: 1 },
  Cafe: { min: 1 },
};
const EQUIV = {
  "Info Desk": "Front End Support",
  "Front End Support": "Info Desk",
};
const SELF_MANAGED = new Set(["Online Fulfilment", "Click and Collect", "Reception"]);

const STATUS_COLOR = {
  covered: "#10b981",
  "self-managed": "#0ea5e9",
  unassigned: "#f59e0b",
  flagged: "#dc2626",
};

function fmt(min) {
  let m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return String(h).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
}

// On-floor count for an area at minute t (15-min slot centred at t).
// Info Desk ↔ Front End Support count toward each other.
function areaPresent(shifts, breaks, area, t) {
  const areas = new Set([area, EQUIV[area]]);
  let count = 0;
  for (const s of shifts) {
    if (!areas.has(s.area)) continue;
    if (s.start_minutes > t || s.end_minutes <= t) continue;
    const onBreak = (breaks || []).some(
      (b) => b.team_member === s.name && b.start_minutes <= t && b.end_minutes > t
    );
    if (!onBreak) count++;
  }
  return count;
}

export default function CoverageGantt({ schedule }) {
  const [open, setOpen] = useState(false);

  const { shifts, breaks, t0, t1, hours, pxPerMin, timelineW, byArea } = useMemo(() => {
    const shifts = schedule.shifts || [];
    const breaks = schedule.breaks || [];
    if (!shifts.length) return { shifts, breaks, t0: 0, t1: 0, hours: [], pxPerMin: 0.7, timelineW: 0, byArea: {} };
    const starts = shifts.map((s) => s.start_minutes);
    const ends = shifts.map((s) => s.end_minutes);
    const t0 = Math.floor(Math.min(...starts) / 60) * 60;
    const t1 = Math.ceil(Math.max(...ends) / 60) * 60;
    const pxPerMin = 0.7;
    const timelineW = (t1 - t0) * pxPerMin;
    const hours = [];
    for (let h = t0; h <= t1; h += 60) hours.push(h);
    const byArea = {};
    shifts.forEach((s) => (byArea[s.area] ||= []).push(s));
    return { shifts, breaks, t0, t1, hours, pxPerMin, timelineW, byArea };
  }, [schedule]);

  const labelW = 92;
  const rowH = 26;
  const gapRowH = 22;

  // Coverage lanes for areas that are coverage-required and have staff.
  const coverageAreas = Object.keys(COVERAGE).filter((a) => byArea[a] || byArea[EQUIV[a]]);

  // Precompute coverage step data per area (15-min resolution).
  const coverageData = useMemo(() => {
    const step = 15;
    return coverageAreas.map((area) => {
      const min = COVERAGE[area].min;
      const pts = [];
      let maxC = min;
      for (let t = t0; t < t1; t += step) {
        const c = areaPresent(shifts, breaks, area, t);
        pts.push({ t, c });
        if (c > maxC) maxC = c;
      }
      const gaps = pts.filter((p) => p.c < min);
      return { area, min, pts, gaps, maxC };
    });
  }, [coverageAreas, shifts, breaks, t0, t1]);

  if (!shifts.length) return null;

  const X = (min) => ((min - t0) * pxPerMin);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 md:px-5 py-4 text-left"
      >
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Clock className="w-4 h-4 text-primary" />
        </div>
        <div className="mr-auto">
          <h2 className="font-heading font-semibold text-base">Coverage Gantt</h2>
          <p className="text-xs text-muted-foreground">Shift spans, breaks and on-floor coverage over the day.</p>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-border">
          <div className="overflow-x-auto">
            <div style={{ width: labelW + timelineW + 16, minWidth: "100%" }} className="p-3">
              {/* Hour ruler */}
              <div className="relative" style={{ height: 18, marginLeft: labelW }}>
                {hours.map((h, i) => (
                  <div key={h} className="absolute top-0" style={{ left: X(h) }}>
                    <div className="w-px h-2 bg-border" />
                    <span className="text-[9px] text-muted-foreground -translate-x-1/2 absolute top-2 whitespace-nowrap">
                      {fmt(h)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Shift rows grouped by area */}
              {Object.entries(byArea).map(([area, staff]) => (
                <div key={area} className="mt-1">
                  <div
                    className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center"
                    style={{ height: gapRowH }}
                  >
                    <div style={{ width: labelW }} className="pr-2 truncate">
                      {SELF_MANAGED.has(area) ? `${area} · self` : area}
                    </div>
                    <div className="flex-1 border-t border-dashed border-border" />
                  </div>
                  {staff.map((s) => {
                    const pm = s.start_minutes >= 720;
                    const sBreaks = (breaks || []).filter((b) => b.team_member === s.name);
                    return (
                      <div key={s.name} className="relative flex items-center" style={{ height: rowH }}>
                        <div style={{ width: labelW }} className="pr-2 truncate text-xs font-medium truncate">
                          {s.name}
                        </div>
                        <div className="relative" style={{ width: timelineW, height: rowH }}>
                          {/* shift bar */}
                          <div
                            className="absolute rounded-md"
                            style={{
                              left: X(s.start_minutes),
                              width: X(s.end_minutes) - X(s.start_minutes),
                              top: 3,
                              height: rowH - 6,
                              background: pm ? "#fde7d3" : "#eef2f7",
                              border: "1px solid #e2e8f0",
                            }}
                          />
                          {/* break blocks */}
                          {sBreaks.map((b, i) => {
                            const color = STATUS_COLOR[b.status] || "#94a3b8";
                            return (
                              <div
                                key={i}
                                className="absolute rounded-sm"
                                style={{
                                  left: X(b.start_minutes),
                                  width: Math.max(6, X(b.end_minutes) - X(b.start_minutes)),
                                  top: 3,
                                  height: rowH - 6,
                                  background: color,
                                  opacity: 0.92,
                                }}
                                title={`${fmt(b.start_minutes)}–${fmt(b.end_minutes)} (${b.duration}m) ${
                                  b.cover ? "→ " + b.cover : b.status
                                }`}
                              />
                            );
                          })}
                          {/* start/end ticks */}
                          <div className="absolute w-px bg-slate-400" style={{ left: X(s.start_minutes), top: 0, height: rowH }} />
                          <div className="absolute w-px bg-slate-400" style={{ left: X(s.end_minutes), top: 0, height: rowH }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Coverage lanes */}
              <div className="mt-4 pt-3 border-t border-border">
                <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold">
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  On-floor coverage (dashed = minimum)
                </div>
                {coverageData.map(({ area, min, pts, gaps, maxC }) => {
                  const H = 46;
                  const topPad = 6;
                  const yFor = (c) => H - topPad - (c / Math.max(2, maxC)) * (H - topPad - 4);
                  const step = 15;
                  const path = pts
                    .map((p, i) => `${i === 0 ? "M" : "L"} ${X(p.t).toFixed(1)} ${yFor(p.c).toFixed(1)}`)
                    .join(" ");
                  const lastX = X(pts[pts.length - 1].t + step);
                  const filled = `${path} L ${lastX} ${H - topPad} L ${X(pts[0].t)} ${H - topPad} Z`;
                  return (
                    <div key={area} className="relative flex items-center mb-2" style={{ height: H + 14 }}>
                      <div style={{ width: labelW }} className="pr-2">
                        <div className="text-[11px] font-medium leading-tight truncate">{area}</div>
                        <div className="text-[9px] text-muted-foreground">min {min}</div>
                      </div>
                      <div className="relative" style={{ width: timelineW, height: H }}>
                        <svg width={timelineW} height={H} className="block">
                          {/* hour grid */}
                          {hours.map((h) => (
                            <line key={h} x1={X(h)} x2={X(h)} y1={0} y2={H} stroke="#f1f5f9" strokeWidth={1} />
                          ))}
                          {/* gap regions */}
                          {gaps.map((g, i) => (
                            <rect
                              key={i}
                              x={X(g.t)}
                              y={yFor(min)}
                              width={X(g.t + step) - X(g.t)}
                              height={H - topPad - yFor(min)}
                              fill="#fecaca"
                              opacity={0.5}
                            />
                          ))}
                          {/* filled area */}
                          <path d={filled} fill="#dbeafe" opacity={0.6} />
                          {/* min line */}
                          <line
                            x1={0}
                            x2={timelineW}
                            y1={yFor(min)}
                            y2={yFor(min)}
                            stroke="#ef4444"
                            strokeWidth={1}
                            strokeDasharray="4 3"
                          />
                          {/* coverage line */}
                          <path d={path} fill="none" stroke="#2563eb" strokeWidth={1.5} />
                        </svg>
                        {gaps.length > 0 && (
                          <div className="absolute top-0 right-0 flex items-center gap-1 text-[9px] text-red-600 font-medium">
                            <AlertTriangle className="w-3 h-3" /> {gaps.length} gap{gaps.length > 1 ? "s" : ""}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] text-muted-foreground">
                {[
                  ["Covered", STATUS_COLOR.covered],
                  ["Self-managed", STATUS_COLOR["self-managed"]],
                  ["Pull from floor", STATUS_COLOR.unassigned],
                  ["Gap below min", "#fecaca"],
                ].map(([l, c]) => (
                  <span key={l} className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} /> {l}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}