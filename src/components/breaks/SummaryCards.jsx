import React from "react";
import { Users, Coffee, ShieldCheck, AlertTriangle } from "lucide-react";

export default function SummaryCards({ summary }) {
  const cards = [
    { label: "Staff on shift", value: summary.total_staff ?? 0, icon: Users, tone: "default" },
    { label: "Total breaks", value: summary.total_breaks ?? 0, icon: Coffee, tone: "default" },
    { label: "Covered", value: summary.covered ?? 0, icon: ShieldCheck, tone: "good" },
    { label: "Flagged", value: summary.flagged ?? 0, icon: AlertTriangle, tone: "warn" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div key={c.label} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{c.label}</span>
              <Icon className={`w-4 h-4 ${c.tone === "warn" ? "text-amber-500" : c.tone === "good" ? "text-emerald-500" : "text-muted-foreground"}`} />
            </div>
            <p className="mt-2 font-heading text-2xl font-semibold tracking-tight">{c.value}</p>
          </div>
        );
      })}
    </div>
  );
}