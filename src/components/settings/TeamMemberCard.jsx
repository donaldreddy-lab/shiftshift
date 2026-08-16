import React, { useState } from "react";
import { Trash2, UserPlus, Search, Loader2, Save, Phone } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const AREAS = [
  "People Greeter", "Register", "Info Desk", "Front End Support",
  "Hire Shop", "Online Fulfilment", "Click and Collect",
  "Nursery Register", "Nursery Greeter", "BSCO", "Toolshop Register",
  "Key Holder", "Cafe"
];
const REQUIRES_18 = new Set(["Nursery Greeter", "People Greeter"]);
const REQUIRES_TRAINING = new Set(["Info Desk", "Hire Shop", "Front End Support", "Cafe"]);

const STATUS_STYLES = {
  "Full Time": "bg-emerald-100 text-emerald-700",
  "Expert Full Time": "bg-emerald-200 text-emerald-800",
  "Part Time": "bg-blue-100 text-blue-700",
  "Expert Part Time": "bg-blue-200 text-blue-800",
  "Casual": "bg-purple-100 text-purple-700",
  "Expert Casual": "bg-purple-200 text-purple-800",
};

function serviceYears(start_date) {
  if (!start_date) return null;
  const ms = Date.now() - new Date(start_date).getTime();
  if (ms < 0) return 0;
  return Math.round(ms / (365.25 * 24 * 60 * 60 * 1000));
}

export default function TeamMemberCard({ member, onChange, onDelete }) {
  const [saving, setSaving] = useState(false);

  const update = async (patch) => {
    setSaving(true);
    try {
      await base44.entities.TeamMember.update(member.id, patch);
      onChange({ ...member, ...patch });
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const toggleArea = (area) => {
    const current = member.trained_areas || [];
    const next = current.includes(area) ? current.filter((a) => a !== area) : [...current, area];
    update({ trained_areas: next });
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-heading font-semibold shrink-0">
          {member.name?.charAt(0)?.toUpperCase() || "?"}
        </div>
        <div className="flex-1 min-w-0">
          <Input
            defaultValue={member.name}
            onBlur={(e) => e.target.value !== member.name && update({ name: e.target.value })}
            className="font-medium border-0 px-0 h-7 focus-visible:ring-0 focus-visible:ring-offset-0 text-base"
          />
          <Input
            defaultValue={member.employee_id || ""}
            placeholder="Employee ID / number"
            onBlur={(e) => e.target.value !== (member.employee_id || "") && update({ employee_id: e.target.value })}
            className="text-xs text-muted-foreground border-0 px-0 h-6 focus-visible:ring-0 focus-visible:ring-offset-0 mt-0.5"
          />
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {member.employment_status && (
              <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", STATUS_STYLES[member.employment_status] || "bg-muted text-muted-foreground")}>
                {member.employment_status}
              </span>
            )}
            {serviceYears(member.start_date) != null && (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                {serviceYears(member.start_date)} yr{serviceYears(member.start_date) === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          {member.phone_number && (
            <a
              href={`tel:${member.phone_number.replace(/\s+/g, "")}`}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
              title={`Call ${member.phone_number}`}
            >
              <Phone className="w-4 h-4" />
            </a>
          )}
          <button onClick={() => onDelete(member)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2.5">
        <div>
          <p className="text-sm font-medium">18 years or older</p>
          <p className="text-xs text-muted-foreground">Required for Nursery Greeter & People Greeter</p>
        </div>
        <Switch checked={!!member.is_18_plus} onCheckedChange={(v) => update({ is_18_plus: v })} />
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium text-muted-foreground mb-2">Trained areas</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {AREAS.map((area) => {
            const checked = (member.trained_areas || []).includes(area);
            const req18 = REQUIRES_18.has(area);
            const reqTrain = REQUIRES_TRAINING.has(area);
            return (
              <label
                key={area}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer text-sm transition-colors border",
                  checked ? "bg-primary/5 border-primary/30" : "bg-background border-border hover:bg-muted/40"
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleArea(area)}
                  className="w-4 h-4 rounded accent-primary"
                />
                <span className="flex-1">{area}</span>
                {req18 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">18+</span>}
                {reqTrain && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">trained</span>}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}