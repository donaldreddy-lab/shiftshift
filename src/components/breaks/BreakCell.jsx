import React from "react";
import { AlertTriangle, ArrowLeftRight } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { fmt, STATUS_OPTIONS } from "./breakUtils";

export default function BreakCell({ b, editing, onUpdate, overlap = 1 }) {
  if (!b) return <span className="text-black/30">—</span>;

  if (editing) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1">
          <input
            type="time"
            value={fmt(b.start_minutes)}
            onChange={(e) => onUpdate({ start: e.target.value })}
            className="w-[80px] min-h-[44px] rounded-md border border-black/20 bg-white px-1.5 text-[11px]"
          />
          <span className="text-black/40">@</span>
          <input
            type="number"
            min="5"
            step="5"
            value={b.duration}
            onChange={(e) => onUpdate({ duration: e.target.value })}
            className="w-[56px] min-h-[44px] rounded-md border border-black/20 bg-white px-1.5 text-[11px]"
          />
          <span className="text-black/40 text-[11px]">m</span>
        </div>
        <input
          type="text"
          value={b.cover || ""}
          placeholder="cover"
          onChange={(e) => onUpdate({ cover: e.target.value })}
          className="w-full min-h-[44px] rounded-md border border-black/20 bg-white px-1.5 text-[11px]"
        />
        <Select value={b.status} onValueChange={(v) => onUpdate({ status: v })}>
          <SelectTrigger className="min-h-[44px] h-auto px-2 text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="min-h-[44px]">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
  } else if (b.status === "unassigned") {
    coverLine = (
      <span className="text-[11px] text-slate-600 font-medium flex items-center gap-1" title={b.flag_reason}>
        <ArrowLeftRight className="w-3 h-3" /> Pull from floor
      </span>
    );
  } else {
    coverLine = <span className="text-[11px] text-black/40">No cover</span>;
  }

  return (
    <div className="flex flex-col leading-tight">
      {overlap >= 2 && (
        <span
          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold mb-1 ${
            overlap >= 3 ? "bg-red-600 text-white" : "bg-amber-400 text-black"
          }`}
        >
          <AlertTriangle className="w-2.5 h-2.5" /> {overlap} on at once
        </span>
      )}
      <span className="text-[12px] font-semibold text-black">{time}</span>
      <span className="text-[11px] text-black/50">({len})</span>
      {coverLine}
    </div>
  );
}