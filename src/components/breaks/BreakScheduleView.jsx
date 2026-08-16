import React, { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";

function fmt(min) {
  let m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return String(h).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
}

export default function BreakScheduleView({ schedule }) {
  const [filter, setFilter] = useState("all");

  const breaks = schedule.breaks || [];
  const filtered = useMemo(() => {
    const sorted = [...breaks].sort((a, b) => a.start_minutes - b.start_minutes);
    if (filter === "flagged") return sorted.filter((b) => b.status === "flagged");
    if (filter === "covered") return sorted.filter((b) => b.status === "covered");
    return sorted;
  }, [breaks, filter]);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-5 py-4 border-b border-border">
        <h2 className="font-heading font-semibold text-base mr-auto">Breaks list — {schedule.schedule_date}</h2>
        {[
          { id: "all", label: "All" },
          { id: "flagged", label: "Flagged" },
          { id: "covered", label: "Covered" },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              filter === f.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/20">
              <th className="px-5 py-3 font-medium">Time</th>
              <th className="px-5 py-3 font-medium">Dur</th>
              <th className="px-5 py-3 font-medium">Team member</th>
              <th className="px-5 py-3 font-medium">Area</th>
              <th className="px-5 py-3 font-medium">Cover</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground text-sm">No breaks to show.</td>
              </tr>
            )}
            {filtered.map((b, i) => (
              <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                <td className="px-5 py-3 whitespace-nowrap font-mono text-xs">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    {fmt(b.start_minutes)} – {fmt(b.end_minutes)}
                  </div>
                </td>
                <td className="px-5 py-3 text-muted-foreground">{b.duration}m</td>
                <td className="px-5 py-3 font-medium">{b.team_member}</td>
                <td className="px-5 py-3">
                  <span className="inline-flex px-2 py-0.5 rounded-md bg-muted text-xs">{b.area || "—"}</span>
                </td>
                <td className="px-5 py-3">
                  {b.cover ? (
                    <div className="flex items-center gap-1.5">
                      <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>{b.cover}</span>
                      {b.cover_area && <span className="text-xs text-muted-foreground">({b.cover_area})</span>}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  {b.status === "covered" ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-600 text-xs font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Covered
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-amber-600 text-xs font-medium" title={b.flag_reason}>
                      <AlertTriangle className="w-3.5 h-3.5" /> Flagged
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.some((b) => b.status === "flagged") && (
        <div className="px-5 py-4 border-t border-border bg-amber-50/50">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="space-y-1.5">
              {filtered.filter((b) => b.status === "flagged").map((b, i) => (
                <p key={i} className="text-xs text-amber-800">
                  <span className="font-medium">{b.team_member}</span> ({fmt(b.start_minutes)}–{fmt(b.end_minutes)}, {b.area}): {b.flag_reason}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}