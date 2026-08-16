import React, { useMemo, useState, useEffect } from "react";
import { ChevronDown, Clock, Users, AlertTriangle, FileDown, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { exportGanttPdf } from "@/utils/exportGanttPdf";
import { EQUIV, SELF_MANAGED, resolveCoverage } from "@/utils/coverageDefaults";
import { memberColor, initials } from "@/utils/memberColor";

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
  const [exporting, setExporting] = useState(false);
  const [coverage, setCoverage] = useState(() => resolveCoverage([], new Date().getDay()));

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await base44.entities.CoverageSetting.list("-updated_date", 200);
        const dow = schedule.schedule_date
          ? new Date(schedule.schedule_date + "T00:00:00").getDay()
          : new Date().getDay();
        if (alive) setCoverage(resolveCoverage(list, dow));
      } catch (e) {
        // fall back to defaults
      }
    })();
    return () => { alive = false; };
  }, [schedule.schedule_date]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportGanttPdf(schedule, coverage);
    } finally {
      setExporting(false);
    }
  };

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
  const coverageAreas = Object.keys(coverage).filter((a) => byArea[a] || byArea[EQUIV[a]]);

  // Precompute coverage step data per area (15-min resolution).
  const coverageData = useMemo(() => {
    const step = 15;
    return coverageAreas.map((area) => {
      const areas = new Set([area, EQUIV[area]]);
      const windows = coverage[area] || [];
      const minAt = (t) => {
        let m = 0;
        for (const w of windows) if (t >= w.start && t < w.end) m = Math.max(m, w.min);
        return m;
      };
      const pts = [];
      let maxC = 1;
      for (let t = t0; t < t1; t += step) {
        const c = areaPresent(shifts, breaks, area, t);
        const req = minAt(t + step / 2);
        // only count as a gap when the area is actually rostered (open) at t —
        // a closed area (no one on shift) is not a coverage gap.
        const rostered = shifts.some((s) => areas.has(s.area) && s.start_minutes <= t && s.end_minutes > t);
        pts.push({ t, c, req, rostered });
        if (c > maxC) maxC = c;
        if (req > maxC) maxC = req;
      }
      const gaps = pts.filter((p) => p.c < p.req && p.rostered);
      const maxReq = pts.reduce((mx, p) => Math.max(mx, p.req), 0);
      return { area, pts, gaps, maxC, maxReq };
    });
  }, [coverageAreas, coverage, shifts, breaks, t0, t1]);

  if (!shifts.length) return null;

  const X = (min) => ((min - t0) * pxPerMin);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="w-full flex items-center gap-2 px-4 md:px-5 py-4">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-left flex-1 min-w-0"
        >
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4 text-primary" />
          </div>
          <div className="mr-auto min-w-0">
            <h2 className="font-heading font-semibold text-base">Coverage Gantt</h2>
            <p className="text-xs text-muted-foreground">Shift spans, breaks and on-floor coverage over the day.</p>
          </div>
        </button>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 px-2.5 min-h-[36px] rounded-lg text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/70 disabled:opacity-50 mr-1"
        >
          {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
          PDF
        </button>
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-muted/70"
          aria-label="Toggle gantt"
        >
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

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
                        <div style={{ width: labelW }} className="pr-2 flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full shrink-0 ring-1 ring-black/10"
                            style={{ background: memberColor(s.name), opacity: 0.35 }}
                          />
                          <span className="truncate text-xs font-medium">{s.name}</span>
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
                            const hasCover = b.cover && b.cover.trim();
                            const color = hasCover ? memberColor(b.cover) : (STATUS_COLOR[b.status] || "#94a3b8");
                            const bw = Math.max(6, X(b.end_minutes) - X(b.start_minutes));
                            return (
                              <div
                                key={i}
                                className={`absolute rounded-sm flex items-center justify-center ${
                                  hasCover
                                    ? "ring-[3px] ring-white shadow-md"
                                    : "ring-1 ring-black/5"
                                }`}
                                style={{
                                  left: X(b.start_minutes),
                                  width: bw,
                                  top: 3,
                                  height: rowH - 6,
                                  background: color,
                                  opacity: hasCover ? 1 : 0.5,
                                  zIndex: hasCover ? 3 : 1,
                                  boxShadow: hasCover
                                    ? `0 0 0 1.5px ${color}, 0 2px 4px rgba(0,0,0,0.18)`
                                    : "none",
                                }}
                                title={`${fmt(b.start_minutes)}–${fmt(b.end_minutes)} (${b.duration}m) ${
                                  hasCover ? "→ " + b.cover : b.status
                                }`}
                              >
                                {hasCover && bw >= 18 && (
                                  <span className="text-[10px] font-extrabold text-white truncate px-1 leading-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)] tracking-tight">
                                    {initials(b.cover)}
                                  </span>
                                )}
                              </div>
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
                {coverageData.map(({ area, pts, gaps, maxC, maxReq }) => {
                  const H = 46;
                  const topPad = 6;
                  const yFor = (c) => H - topPad - (c / Math.max(2, maxC)) * (H - topPad - 4);
                  const step = 15;
                  const covPath = pts
                    .map((p, i) => `${i === 0 ? "M" : "L"} ${X(p.t).toFixed(1)} ${yFor(p.c).toFixed(1)}`)
                    .join(" ");
                  let minPath = "";
                  pts.forEach((p, i) => {
                    const x1 = X(p.t).toFixed(1);
                    const x2 = X(p.t + step).toFixed(1);
                    const y = yFor(p.req).toFixed(1);
                    minPath += `${i === 0 ? "M" : "L"} ${x1} ${y} L ${x2} ${y} `;
                  });
                  const lastX = X(pts[pts.length - 1].t + step);
                  const filled = `${covPath} L ${lastX.toFixed(1)} ${(H - topPad).toFixed(1)} L ${X(pts[0].t).toFixed(1)} ${(H - topPad).toFixed(1)} Z`;
                  return (
                    <div key={area} className="relative flex items-center mb-2" style={{ height: H + 14 }}>
                      <div style={{ width: labelW }} className="pr-2">
                        <div className="text-[11px] font-medium leading-tight truncate">{area}</div>
                        <div className="text-[9px] text-muted-foreground">min up to {maxReq}</div>
                      </div>
                      <div className="relative" style={{ width: timelineW, height: H }}>
                        <svg width={timelineW} height={H} className="block">
                          {/* hour grid */}
                          {hours.map((h) => (
                            <line key={h} x1={X(h)} x2={X(h)} y1={0} y2={H} stroke="#f1f5f9" strokeWidth={1} />
                          ))}
                          {/* gap regions — below the required min for that slot */}
                          {gaps.map((g, i) => (
                            <rect
                              key={i}
                              x={X(g.t)}
                              y={yFor(g.req)}
                              width={X(g.t + step) - X(g.t)}
                              height={H - topPad - yFor(g.req)}
                              fill="#fecaca"
                              opacity={0.5}
                            />
                          ))}
                          {/* filled area */}
                          <path d={filled} fill="#dbeafe" opacity={0.6} />
                          {/* required-min line (stepped — varies by time window) */}
                          <path d={minPath} fill="none" stroke="#ef4444" strokeWidth={1} strokeDasharray="4 3" />
                          {/* coverage line */}
                          <path d={covPath} fill="none" stroke="#2563eb" strokeWidth={1.5} />
                        </svg>
                        {gaps.length > 0 && (
                          <div className="absolute top-0 right-0 flex items-center gap-1 text-[9px] text-red-600 font-medium">
                            <AlertTriangle className="w-3 h-3" /> {gaps.length * step}m below min
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
                  ["Covered (cover's colour)", "#6366f1"],
                  ["Self-managed", STATUS_COLOR["self-managed"]],
                  ["Pull from floor", STATUS_COLOR.unassigned],
                  ["Gap below min", "#fecaca"],
                ].map(([l, c]) => (
                  <span key={l} className="inline-flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-sm ring-[2px] ring-white shadow-sm"
                      style={{ background: c, boxShadow: `0 0 0 1.5px ${c}` }}
                    />{" "}
                    {l}
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