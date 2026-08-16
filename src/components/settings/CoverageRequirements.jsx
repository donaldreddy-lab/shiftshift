import React, { useState, useEffect } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { DEFAULT_COVERAGE, DAY_NAMES } from "@/utils/coverageDefaults";

const AREAS = Object.keys(DEFAULT_COVERAGE);

function defaultDays(area) {
  return Array.from({ length: 7 }, () => ({ min: DEFAULT_COVERAGE[area].min }));
}
function normalizeDays(area, days) {
  const arr = defaultDays(area);
  if (Array.isArray(days)) {
    for (let i = 0; i < 7; i++) {
      if (days[i] && typeof days[i].min === "number") arr[i] = { min: days[i].min };
    }
  }
  return arr;
}

export default function CoverageRequirements() {
  const [records, setRecords] = useState({}); // area -> { id, days }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({}); // area -> boolean

  const load = async () => {
    try {
      const list = await base44.entities.CoverageSetting.list("-updated_date", 200);
      const map = {};
      for (const area of AREAS) {
        const rec = list.find((r) => r.area === area);
        map[area] = rec
          ? { id: rec.id, days: normalizeDays(area, rec.days) }
          : { id: null, days: defaultDays(area) };
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

  const update = (area, dow, value) => {
    const v = Math.max(0, Math.min(9, Number(value) || 0));
    setRecords((r) => {
      const cur = r[area];
      if (!cur) return r;
      return {
        ...r,
        [area]: { ...cur, days: cur.days.map((d, i) => (i === dow ? { min: v } : d)) },
      };
    });
  };

  const save = async (area) => {
    const rec = records[area];
    if (!rec) return;
    setSaving((s) => ({ ...s, [area]: true }));
    try {
      if (rec.id) {
        const updated = await base44.entities.CoverageSetting.update(rec.id, { days: rec.days });
        setRecords((r) => ({ ...r, [area]: { id: rec.id, days: normalizeDays(area, updated.days) } }));
      } else {
        const created = await base44.entities.CoverageSetting.create({ area, days: rec.days });
        setRecords((r) => ({ ...r, [area]: { id: created.id, days: normalizeDays(area, created.days) } }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving((s) => ({ ...s, [area]: false }));
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-4 h-4 text-primary" />
        </div>
        <div className="mr-auto">
          <h2 className="font-heading font-semibold text-base">Coverage requirements</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Set the minimum staff on the floor per area, per day. Applies to break generation and the Gantt chart.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {AREAS.map((area) => {
            const rec = records[area];
            if (!rec) return null;
            const isSaving = saving[area];
            return (
              <div key={area} className="rounded-xl border border-border bg-background/60 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium truncate">{area}</span>
                  {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {rec.days.map((d, dow) => (
                    <label key={dow} className="flex flex-col items-center gap-1">
                      <span className="text-[9px] font-medium text-muted-foreground">{DAY_NAMES[dow]}</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={9}
                        value={d.min}
                        onChange={(e) => update(area, dow, e.target.value)}
                        onBlur={() => save(area)}
                        className="w-full h-9 min-h-[36px] text-center text-sm rounded-md border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}