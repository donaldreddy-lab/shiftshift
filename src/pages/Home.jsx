import React, { useState, useEffect } from "react";
import { Info, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Layout from "@/components/Layout";
import UploadRoster from "@/components/breaks/UploadRoster";
import SummaryCards from "@/components/breaks/SummaryCards";
import BreakScheduleView from "@/components/breaks/BreakScheduleView";

export default function Home() {
  const [schedule, setSchedule] = useState(null);

  useEffect(() => {
    base44.entities.BreakSchedule.list('-created_date', 1)
      .then((list) => { if (list.length > 0) setSchedule(list[0]); })
      .catch(() => {});
  }, []);

  return (
    <Layout>
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
    </Layout>
  );
}