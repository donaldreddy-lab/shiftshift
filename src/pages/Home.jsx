import React, { useState, useEffect } from "react";
import { Info, Sparkles, RefreshCw, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import UploadRoster from "@/components/breaks/UploadRoster";
import SummaryCards from "@/components/breaks/SummaryCards";
import BreakScheduleView from "@/components/breaks/BreakScheduleView";
import CoverageGantt from "@/components/breaks/CoverageGantt";
import PullToRefresh from "@/components/breaks/PullToRefresh";

export default function Home() {
  const [schedule, setSchedule] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");

  const loadSchedule = async () => {
    const list = await base44.entities.BreakSchedule.list("-created_date", 1);
    if (list.length > 0) setSchedule(list[0]);
  };

  // Re-run generation using the current roster but the latest TeamMember
  // settings (training / age). Updates the existing schedule in place.
  const refreshWithSettings = async () => {
    if (!schedule) return;
    setRefreshing(true);
    setRefreshError("");
    try {
      const roster = (schedule.shifts || []).map((s) => ({
        name: s.name,
        start_time: s.start,
        end_time: s.end,
        area: s.area,
      }));
      const res = await base44.functions.invoke("generateBreaks", {
        roster,
        schedule_date: schedule.schedule_date,
        schedule_id: schedule.id,
      });
      setSchedule(res.data);
    } catch (e) {
      setRefreshError(e.response?.data?.error || e.message || "Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadSchedule().catch(() => {});
  }, []);

  return (
    <PullToRefresh onRefresh={loadSchedule}>
      <div className="max-w-5xl mx-auto px-5 md:px-8 py-6 md:py-8 space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Daily Breaks Generator</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload the team location spreadsheet and the app builds the full breaks list with cover assignments.
          </p>
        </div>

        <UploadRoster onGenerated={setSchedule} />

        {schedule && (
          <>
            <SummaryCards summary={schedule.summary} />

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={refreshWithSettings}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {refreshing ? "Refreshing…" : "Refresh with updated settings"}
              </button>
              <span className="text-xs text-muted-foreground">
                Re-generates covers using the latest team member training & age settings.
              </span>
            </div>
            {refreshError && <p className="text-sm text-destructive">{refreshError}</p>}

            <CoverageGantt schedule={schedule} />

            {schedule.summary?.new_members?.length > 0 && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50/60 px-5 py-4">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-blue-900">New team members detected</p>
                    <p className="text-xs text-blue-700 mt-0.5">
                      {schedule.summary.new_members.join(", ")} — head to Settings to confirm their age and tick the areas they're trained on.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <BreakScheduleView schedule={schedule} onSaved={setSchedule} />
          </>
        )}

        {!schedule && (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Your generated breaks list will appear here once you upload a roster — with cover assignments, training checks, and any conflicts flagged.
            </p>
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}