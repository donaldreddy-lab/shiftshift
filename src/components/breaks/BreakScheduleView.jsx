import React, { useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Clock, ArrowLeftRight,
  Pencil, Save, FileDown, X, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";
import { exportBreaksPdf } from "@/utils/exportBreaksPdf";

const STATUS_OPTIONS = [
  { value: "covered", label: "Covered" },
  { value: "self-managed", label: "Self-managed" },
  { value: "flagged", label: "Flagged" },
];

function fmt(min) {
  let m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return String(h).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
}

function timeToMinutes(t) {
  const [h, m] = String(t || "").split(":").map((x) => parseInt(x, 10));
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

export default function BreakScheduleView({ schedule, onSaved }) {
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState([]);
  const [saving, setSaving] = useState(false);

  const breaks = editing ? draft : schedule.breaks || [];
  const filtered = useMemo(() => {
    const rows = editing ? breaks : [...breaks].sort((a, b) => (a.start_minutes ?? 0) - (b.start_minutes ?? 0));
    if (filter === "flagged") return rows.filter((b) => b.status === "flagged");
    if (filter === "covered") return rows.filter((b) => b.status === "covered" || b.status === "self-managed");
    return rows;
  }, [breaks, filter, editing]);

  const startEdit = () => {
    setDraft(schedule.breaks?.map((b) => ({ ...b })) || []);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft([]);
  };

  const updateRow = (i, patch) => {
    setDraft((d) => {
      const next = d.slice();
      next[i] = { ...next[i], ...patch };
      const row = next[i];
      if (patch.start != null) row.start_minutes = timeToMinutes(patch.start);
      if (patch.end != null) {
        row.end_minutes = timeToMinutes(patch.end);
        if (row.start_minutes != null && row.end_minutes != null) {
          let end = row.end_minutes;
          if (end <= row.start_minutes) end += 1440;
          row.duration = end - row.start_minutes;
          row.end_minutes = end;
          row.end = fmt(end);
        }
      }
      if (patch.start != null && row.start_minutes != null) row.start = fmt(row.start_minutes);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated = await base44.entities.BreakSchedule.update(schedule.id, { breaks: draft });
      const merged = { ...schedule, breaks: draft };
      if (onSaved) onSaved(merged);
      setEditing(false);
      setDraft([]);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-5 py-4 border-b border-border">
        <h2 className="font-heading font-semibold text-base mr-auto">
          Breaks list — {schedule.schedule_date}
        </h2>
        {editing ? (
          <div className="flex items-center gap-2">
            <button
              onClick={cancelEdit}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/70 disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={startEdit}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/70"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
            <button
              onClick={() => exportBreaksPdf(schedule)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <FileDown className="w-3.5 h-3.5" /> Export PDF
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-border bg-muted/10">
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
            {filtered.map((b, i) => {
              const idx = draft.findIndex((d) => d === b);
              const realIdx = idx >= 0 ? idx : draft.findIndex((d) => d.start === b.start && d.team_member === b.team_member);
              if (editing) {
                return (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-5 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <input
                          type="time"
                          value={fmt(b.start_minutes)}
                          onChange={(e) => updateRow(realIdx, { start: e.target.value })}
                          className="w-[88px] h-8 rounded-md border border-input bg-transparent px-1.5 text-xs"
                        />
                        <span className="text-muted-foreground">–</span>
                        <input
                          type="time"
                          value={fmt(((b.end_minutes % 1440) + 1440) % 1440)}
                          onChange={(e) => updateRow(realIdx, { end: e.target.value })}
                          className="w-[88px] h-8 rounded-md border border-input bg-transparent px-1.5 text-xs"
                        />
                      </div>
                    </td>
                    <td className="px-5 py-2 text-muted-foreground text-xs">{b.duration}m</td>
                    <td className="px-5 py-2 font-medium">{b.team_member}</td>
                    <td className="px-5 py-2">
                      <span className="inline-flex px-2 py-0.5 rounded-md bg-muted text-xs">{b.area || "—"}</span>
                    </td>
                    <td className="px-5 py-2">
                      <input
                        type="text"
                        value={b.cover || ""}
                        placeholder="—"
                        onChange={(e) => updateRow(realIdx, { cover: e.target.value })}
                        className="w-full max-w-[140px] h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                      />
                    </td>
                    <td className="px-5 py-2">
                      <select
                        value={b.status}
                        onChange={(e) => updateRow(realIdx, { status: e.target.value })}
                        className="h-8 rounded-md border border-input bg-transparent px-1.5 text-xs"
                      >
                        {STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              }
              return (
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
                      <span className="inline-flex items-center gap-1.5 text-emerald-600 text-xs font-medium" title={b.flag_reason}>
                        <CheckCircle2 className="w-3.5 h-3.5" /> Covered
                      </span>
                    ) : b.status === "self-managed" ? (
                      <span className="inline-flex items-center gap-1.5 text-sky-600 text-xs font-medium" title={b.flag_reason}>
                        <CheckCircle2 className="w-3.5 h-3.5" /> Self-managed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-amber-600 text-xs font-medium" title={b.flag_reason}>
                        <AlertTriangle className="w-3.5 h-3.5" /> Flagged
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
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