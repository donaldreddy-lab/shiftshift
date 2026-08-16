import React, { useState } from "react";
import { Upload, FileSpreadsheet, Loader2, CalendarDays, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function UploadRoster({ onGenerated }) {
  const [file, setFile] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleGenerate = async () => {
    if (!file) { setError("Please choose a roster file first."); return; }
    setError("");
    setLoading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const res = await base44.functions.invoke("generateBreaks", {
        file_url,
        schedule_date: date,
      });
      onGenerated(res.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Something went wrong generating the schedule.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <FileSpreadsheet className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="font-heading font-semibold text-base">Upload daily location roster</h2>
          <p className="text-sm text-muted-foreground">Upload your team's Excel spreadsheet, or a clear photo / PDF of the roster, to generate the breaks list.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div>
          <Label className="text-xs text-muted-foreground">Roster file (Excel / CSV / image)</Label>
          <label className="mt-1.5 flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
            <Upload className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground truncate">
              {file ? file.name : "Choose file…"}
            </span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,image/*,.pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Schedule date</Label>
          <div className="mt-1.5 relative">
            <CalendarDays className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-destructive mt-4">{error}</p>}

      <div className="mt-5 flex justify-end">
        <Button onClick={handleGenerate} disabled={loading || !file} className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {loading ? "Generating…" : "Generate breaks"}
        </Button>
      </div>
    </div>
  );
}