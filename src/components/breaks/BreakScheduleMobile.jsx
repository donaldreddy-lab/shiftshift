import React from "react";
import BreakCell from "./BreakCell";
import { PEACH } from "./breakUtils";

export default function BreakScheduleMobile({ shifts, breaks, overlapMap, editing, onUpdateBreak }) {
  const breaksByName = {};
  for (const b of breaks) (breaksByName[b.team_member] ||= []).push(b);
  for (const k in breaksByName) {
    breaksByName[k].sort((a, b) => (a.start_minutes ?? 0) - (b.start_minutes ?? 0));
  }

  const maxBreaks = Math.max(1, ...shifts.map((s) => (breaksByName[s.name] || []).length));

  const sorted = [...shifts].sort((a, b) => {
    const aStart = (breaksByName[a.name] || []).reduce((m, x) => Math.min(m, x.start_minutes ?? Infinity), Infinity);
    const bStart = (breaksByName[b.name] || []).reduce((m, x) => Math.min(m, x.start_minutes ?? Infinity), Infinity);
    return aStart - bStart;
  });

  return (
    <div className="space-y-3">
      {sorted.map((s, idx) => {
        const bs = breaksByName[s.name] || [];
        const pm = s.start_minutes >= 720;
        return (
          <div
            key={idx}
            className="rounded-2xl border border-border bg-card p-4 shadow-sm"
            style={{ background: pm ? PEACH : undefined }}
          >
            <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-black/10">
              <div>
                <p className="font-semibold text-sm text-black">{s.name}</p>
                <p className="text-[11px] text-black/60">{s.area}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-black">
                  {s.start}–{s.end}
                </p>
                <p className="text-[11px] text-black/50">
                  {bs.length} break{bs.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {Array.from({ length: maxBreaks }).map((_, i) => {
                const b = bs[i];
                const ov = b ? overlapMap.get(b) || 1 : 0;
                return (
                  <div
                    key={i}
                    className="rounded-lg p-2.5"
                    style={{
                      background: b ? (ov >= 3 ? "#fecaca" : ov === 2 ? "#fde68a" : "#f8fafc") : "transparent",
                      boxShadow: ov >= 2 ? `inset 0 0 0 2px ${ov >= 3 ? "#dc2626" : "#f59e0b"}` : undefined,
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-[10px] font-bold text-black/40 w-12 shrink-0 pt-1.5">B{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <BreakCell
                          b={b}
                          editing={editing}
                          overlap={ov}
                          onUpdate={(patch) => b && onUpdateBreak(b._idx, patch)}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}