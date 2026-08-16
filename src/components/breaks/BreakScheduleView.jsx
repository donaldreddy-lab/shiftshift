import React, { useState } from "react";
import {
  AlertTriangle, CheckCircle2, ArrowLeftRight,
  Pencil, Save, FileDown, X, Loader2,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { exportBreaksPdf } from "@/utils/exportBreaksPdf";

const STATUS_OPTIONS = [
  { value: "covered", label: "Covered" },
  { value: "self-managed", label: "Self-managed" },
  { value: "flagged", label: "Flagged" },
];

const PEACH = "#fcebd8";
const HEADER_BG = "#d9d9d9";
const SUBHEADER_BG = "#f2f2f2";
const GRID = "#595959";
const BREAK_BG = ["#dbeafe", "#dcfce7", "#ede9fe"]; // break 1, 2, 3

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

function BreakCell({ b, editing, onUpdate }) {
  if (!b) {
    return <span className="text-black/30">—</span>;
  }
  if (editing) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <input
            type="time"
            value={fmt(b.start_minutes)}
            onChange={(e) => onUpdate({ start: e.target.value })}
            className="w-[78px] h-7 rounded border border-black/20 bg-white px-1 text-[11px]"
          />
          <span className="text-black/40">@</span>
          <input
            type="number"
            min="5"
            step="5"
            value={b.duration}
            onChange={(e) => onUpdate({ duration: e.target.value })}
            className="w-[52px] h-7 rounded border border-black/20 bg-white px-1 text-[11px]"
          />
          <span className="text-black/40 text-[11px]">m</span>
        </div>
        <input
          type="text"
          value={b.cover || ""}
          placeholder="cover"
          onChange={(e) => onUpdate({ cover: e.target.value })}
          className="w-full h-7 rounded border border-black/20 bg-white px-1.5 text-[11px]"
        />
        <select
          value={b.status}
          onChange={(e) => onUpdate({ status: e.target.value })}
          className="h-7 rounded border border-black/20 bg-white px-1 text-[11px]"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    );
  }
  const time = fmt(b.start_minutes);
  const len = `${b.duration}m`;
  let coverLine;
  if (b.status === "self-managed") {
    coverLine = <span className="text-[11px] text-sky-700 font-medium">Self-managed</span>;
  } else if (b.cover) {
    coverLine = (
      <span className="text-[11px] text-black/70 flex items-center gap-1">
        <ArrowLeftRight className="w-3 h-3" /> {b.cover}
      </span>
    );
  } else if (b.status === "flagged") {
    coverLine = (
      <span className="text-[11px] text-amber-700 font-medium flex items-center gap-1" title={b.flag_reason}>
        <AlertTriangle className="w-3 h-3" /> Swap needed
      </span>
    );
  } else {
    coverLine = <span className="text-[11px] text-black/40">No cover</span>;
  }
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[12px] font-semibold text-black">{time}</span>
      <span className="text-[11px] text-black/50">({len})</span>
      {coverLine}
    </div>
  );
}

export default function BreakScheduleView({ schedule, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState([]);
  const [saving, setSaving] = useState(false);

  const breaks = editing ? draft : schedule.breaks || [];
  const shifts = schedule.shifts || [];

  // group breaks per team member, sorted by start
  const breaksByName = {};
  for (const b of breaks) {
    (breaksByName[b.team_member] ||= []).push(b);
  }
  for (const k in breaksByName) {
    breaksByName[k].sort((a, b) => (a.start_minutes ?? 0) - (b.start_minutes ?? 0));
  }

  const maxBreaks = Math.max(1, ...shifts.map((s) => (breaksByName[s.name] || []).length));
  const breakCols = Array.from({ length: maxBreaks }, (_, i) => i);

  const startEdit = () => {
    setDraft((schedule.breaks || []).map((b, i) => ({ ...b, _idx: i })));
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setDraft([]);
  };
  const updateBreak = (idx, patch) => {
    setDraft((d) =>
      d.map((b) => {
        if (b._idx !== idx) return b;
        const nb = { ...b, ...patch };
        if (patch.start != null) {
          nb.start_minutes = timeToMinutes(patch.start);
          nb.start = fmt(nb.start_minutes);
        }
        if (patch.duration != null) nb.duration = Number(patch.duration);
        if (nb.start_minutes != null && nb.duration != null) {
          nb.end_minutes = nb.start_minutes + nb.duration;
          nb.end = fmt(nb.end_minutes);
        }
        return nb;
      })
    );
  };
  const save = async () => {
    setSaving(true);
    try {
      const payload = draft.map(({ _idx, ...rest }) => rest);
      await base44.entities.BreakSchedule.update(schedule.id, { breaks: payload });
      const merged = { ...schedule, breaks: payload };
      if (onSaved) onSaved(merged);
      setEditing(false);
      setDraft([]);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const flaggedBreaks = breaks.filter((b) => b.status === "flagged");

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-5 py-4 border-b border-border">
        <h2 className="font-heading font-semibold text-base mr-auto">
          Break list — {schedule.schedule_date}
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

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th
                colSpan={4 + maxBreaks}
                style={{ background: HEADER_BG, color: "#000", borderColor: GRID }}
                className="text-center font-bold tracking-wide py-2.5 border"
              >
                SUPPORT
              </th>
            </tr>
            <tr style={{ background: SUBHEADER_BG }}>
              <th className="font-bold text-black border px-3 py-2 text-left" style={{ borderColor: GRID }}>DEPT</th>
              <th className="font-bold text-black border px-3 py-2 text-left" style={{ borderColor: GRID }}>TEAM MEMBER</th>
              <th className="font-bold text-black border px-3 py-2 text-left" style={{ borderColor: GRID }}>START</th>
              <th className="font-bold text-black border px-3 py-2 text-left" style={{ borderColor: GRID }}>END</th>
              {breakCols.map((i) => (
                <th
                  key={i}
                  className="font-bold text-black border px-3 py-2 text-center"
                  style={{ borderColor: GRID, background: BREAK_BG[i % BREAK_BG.length] }}
                >
                  BREAK {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shifts.map((s, idx) => {
              const bs = breaksByName[s.name] || [];
              const pm = s.start_minutes >= 720; // afternoon/evening shift → peach highlight
              const rowBg = pm ? PEACH : "#ffffff";
              return (
                <tr key={idx} style={{ background: rowBg }}>
                  <td className="font-semibold text-black border px-3 py-2 align-top" style={{ borderColor: GRID }}>{s.area}</td>
                  <td className="font-semibold text-black border px-3 py-2 align-top" style={{ borderColor: GRID }}>{s.name}</td>
                  <td className="text-black border px-3 py-2 align-top" style={{ borderColor: GRID }}>{s.start}</td>
                  <td className="text-black border px-3 py-2 align-top" style={{ borderColor: GRID }}>{s.end}</td>
                  {breakCols.map((i) => {
                    const b = bs[i];
                    return (
                      <td
                        key={i}
                        className="border px-3 py-2 align-top"
                        style={{ borderColor: GRID, background: BREAK_BG[i % BREAK_BG.length] }}
                      >
                        <BreakCell
                          b={b}
                          editing={editing}
                          onUpdate={(patch) => b && updateBreak(b._idx, patch)}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {flaggedBreaks.length > 0 && (
        <div className="px-5 py-4 border-t border-border bg-amber-50/60">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="space-y-1.5">
              {flaggedBreaks.map((b, i) => (
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