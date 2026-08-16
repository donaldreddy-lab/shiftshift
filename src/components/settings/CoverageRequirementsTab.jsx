import React, { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, ShieldCheck, Eraser } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import {
  DEFAULT_COVERAGE,
  DAY_NAMES,
  businessHours,
  defaultWindows,
} from "@/utils/coverageDefaults";

const AREAS = Object.keys(DEFAULT_COVERAGE);
const BOX = 44;
const LABEL_W = 92;

// Literal class strings so Tailwind keeps them.
const LEVEL_BG = {
  0: "bg-muted",
  1: "bg-blue-500",
  2: "bg-amber-500",
  3: "bg-red-500",
};
const LEVEL_TEXT = {
  0: "text-muted-foreground",
  1: "text-white",
  2: "text-white",
  3: "text-white",
};

function fmtHour(min) {
  return String(Math.floor(min / 60));
}
function fmtHM(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

// Windows -> one min per 1-hour slot (takes the requirement at the slot midpoint).
function slotsFromWindows(windows, bhStart, bhEnd) {
  const out = [];
  for (let t = bhStart; t < bhEnd; t += 60) {
    const mid = t + 30;
    let min = 0;
    for (const w of windows || []) {
      if (w.start <= mid && mid < w.end) min = Math.max(min, w.min);
    }
    out.push(min);
  }
  return out;
}

// 1-hour slots -> merged adjacent windows with equal min.
function windowsFromSlots(slots, bhStart) {
  const out = [];
  let i = 0;
  while (i < slots.length) {
    if (slots[i] === 0) {
      i++;
      continue;
    }
    const min = slots[i];
    const start = bhStart + i * 60;
    let j = i;
    while (j < slots.length && slots[j] === min) j++;
    out.push({ start, end: bhStart + j * 60, min });
    i = j;
  }
  return out;
}

function normalizeDay(area, dow, dayEntry) {
  if (dayEntry && Array.isArray(dayEntry.windows)) {
    const w = dayEntry.windows.filter(
      (x) =>
        typeof x.start === "number" &&
        typeof x.end === "number" &&
        typeof x.min === "number" &&
        x.end > x.start
    );
    if (w.length) return { windows: w };
  }
  if (dayEntry && typeof dayEntry.min === "number") {
    const def = defaultWindows(area, dow)[0];
    if (def) return { windows: [{ ...def, min: dayEntry.min }] };
  }
  return { windows: defaultWindows(area, dow) };
}

function normalizeAllDays(area, days) {
  const out = [];
  for (let dow = 0; dow < 7; dow++) {
    out.push(normalizeDay(area, dow, Array.isArray(days) ? days[dow] : null));
  }
  return out;
}

export default function CoverageRequirementsTab() {
  const [records, setRecords] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [dow, setDow] = useState(new Date().getDay());
  const [level, setLevel] = useState(1);
  const timers = useRef({});

  const load = async () => {
    try {
      const list = await base44.entities.CoverageSetting.list("-updated_date", 200);
      const map = {};
      for (const area of AREAS) {
        const rec = list.find((r) => r.area === area);
        map[area] = rec
          ? { id: rec.id, days: normalizeAllDays(area, rec.days) }
          : { id: null, days: normalizeAllDays(area, null) };
      }
      setRecords(map);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const saveArea = useCallback(async (area) => {
    setRecords((r) => {
      const rec = r[area];
      if (!rec) return r;
      (async () => {
        setSaving((s) => ({ ...s, [area]: true }));
        try {
          const days = rec.days.map((d) => ({ windows: d.windows }));
          let result;
          if (rec.id) {
            result = await base44.entities.CoverageSetting.update(rec.id, { days });
          } else {
            result = await base44.entities.CoverageSetting.create({ area, days });
          }
          setRecords((rr) => ({
            ...rr,
            [area]: {
              id: result.id || rec.id,
              days: normalizeAllDays(area, result.days || days),
            },
          }));
        } catch (e) {
          console.error(e);
        } finally {
          setSaving((s) => ({ ...s, [area]: false }));
        }
      })();
      return r;
    });
  }, []);

  const scheduleSave = useCallback(
    (area) => {
      if (timers.current[area]) clearTimeout(timers.current[area]);
      timers.current[area] = setTimeout(() => saveArea(area), 600);
    },
    [saveArea]
  );

  const paint = (area, slotIdx) => {
    setRecords((r) => {
      const cur = r[area];
      if (!cur) return r;
      const [bhStart, bhEnd] = businessHours(dow);
      const slots = slotsFromWindows(cur.days[dow].windows, bhStart, bhEnd);
      slots[slotIdx] = level;
      const windows = windowsFromSlots(slots, bhStart);
      const days = cur.days.map((d, i) => (i === dow ? { windows } : d));
      return { ...r, [area]: { ...cur, days } };
    });
    scheduleSave(area);
  };

  const resetArea = (area) => {
    setRecords((r) => {
      const cur = r[area];
      if (!cur) return r;
      const days = cur.days.map((d, i) => ({ windows: defaultWindows(area, i) }));
      return { ...r, [area]: { ...cur, days } };
    });
    scheduleSave(area);
  };

  const [bhStart, bhEnd] = businessHours(dow);
  const hours = [];
  for (let t = bhStart; t < bhEnd; t += 60) hours.push(t);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h2 className="font-heading font-semibold text-base">Minimum coverage requirements</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pick how many staff you need, then tap the hour blocks that must keep that many on the floor. Applies to break generation and the Gantt chart.
          </p>
        </div>
      </div>

      {/* Day selector */}
      <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
        {DAY_NAMES.map((d, i) => (
          <button
            key={i}
            onClick={() => setDow(i)}
            className={cn(
              "px-3 min-h-[36px] rounded-lg text-xs font-medium whitespace-nowrap",
              i === dow ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
            )}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="text-xs text-muted-foreground">
        Business hours {DAY_NAMES[dow]}: {fmtHM(bhStart)}–{fmtHM(bhEnd)}
      </div>

      {/* Level selector — choose how many, then paint the hour blocks */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground">Required staff:</span>
        {[1, 2, 3].map((l) => (
          <button
            key={l}
            onClick={() => setLevel(l)}
            className={cn(
              "w-10 h-10 rounded-lg text-sm font-semibold",
              level === l
                ? cn(LEVEL_BG[l], LEVEL_TEXT[l], "ring-2 ring-ring")
                : "bg-muted text-muted-foreground"
            )}
          >
            {l}
          </button>
        ))}
        <button
          onClick={() => setLevel(0)}
          className={cn(
            "inline-flex items-center gap-1 px-3 h-10 rounded-lg text-xs font-medium",
            level === 0 ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          <Eraser className="w-3.5 h-3.5" /> Clear
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <div style={{ minWidth: LABEL_W + hours.length * BOX }}>
              {/* hour ruler */}
              <div className="flex items-center border-b border-border bg-muted/30">
                <div
                  style={{ width: LABEL_W }}
                  className="sticky left-0 bg-muted/30 z-10 px-2 py-1.5 text-[10px] font-medium text-muted-foreground"
                >
                  Area
                </div>
                {hours.map((h) => (
                  <div
                    key={h}
                    style={{ width: BOX }}
                    className="text-[10px] text-muted-foreground text-center py-1.5"
                  >
                    {fmtHour(h)}
                  </div>
                ))}
              </div>

              {AREAS.map((area) => {
                const rec = records[area];
                if (!rec) return null;
                const slots = slotsFromWindows(rec.days[dow].windows, bhStart, bhEnd);
                return (
                  <div key={area} className="flex items-stretch border-b border-border last:border-b-0">
                    <div
                      style={{ width: LABEL_W }}
                      className="sticky left-0 bg-card z-10 px-2 py-1.5 flex items-center justify-between gap-1"
                    >
                      <span className="text-[11px] font-medium leading-tight truncate">{area}</span>
                      {saving[area] ? (
                        <Loader2 className="w-3 h-3 animate-spin text-muted-foreground shrink-0" />
                      ) : (
                        <button
                          onClick={() => resetArea(area)}
                          className="text-[9px] text-muted-foreground hover:text-foreground shrink-0"
                        >
                          reset
                        </button>
                      )}
                    </div>
                    <div className="flex">
                      {slots.map((min, i) => (
                        <button
                          key={i}
                          onClick={() => paint(area, i)}
                          style={{ width: BOX, height: 40 }}
                          className={cn(
                            "border border-border text-xs font-semibold flex items-center justify-center transition-colors",
                            LEVEL_BG[Math.min(3, min)] || "bg-muted",
                            LEVEL_TEXT[Math.min(3, min)] || "text-muted-foreground"
                          )}
                          title={`${fmtHour(bhStart + i * 60)}:00 — ${min || "no requirement"}`}
                        >
                          {min || ""}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        {[1, 2, 3].map((l) => (
          <span key={l} className="inline-flex items-center gap-1.5">
            <span className={cn("w-3 h-3 rounded-sm", LEVEL_BG[l])} /> {l} staff
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-muted" /> no requirement
        </span>
      </div>
    </div>
  );
}