import { base44 } from "@/api/base44Client";
import { memberColor, hexToRgb } from "@/utils/memberColor";

// Match roster names to team members the same way the backend does
// (first name + last initial, lowercased) so EXT resolves correctly.
function normName(raw) {
  const s = (raw || "").trim();
  if (!s) return "";
  if (s.includes(",")) {
    const [last, first] = s.split(",").map((x) => x.trim());
    const fn = (first.split(/\s+/)[0] || "").toLowerCase();
    const li = ((last.replace(/[^A-Za-z]/g, "") || "")[0] || "").toLowerCase();
    return fn + " " + li;
  }
  const parts = s.split(/\s+/);
  const fn = (parts[0] || "").toLowerCase();
  const li =
    parts.length > 1
      ? ((parts[parts.length - 1].replace(/[^A-Za-z]/g, "") || "")[0] || "").toLowerCase()
      : "";
  return fn + " " + li;
}

const TEAL = [73, 127, 127];
const ROW_ALT = [242, 242, 242];
const GRID = [217, 217, 217];
const PULL_RGB = [245, 158, 11];
const SELF_RGB = [14, 165, 233];

export async function exportBreaksPdf(schedule) {
  const { jsPDF } = await import("jspdf");
  const shifts = schedule.shifts || [];
  const breaks = schedule.breaks || [];
  if (!shifts.length) return;
  const date = schedule.schedule_date || "";

  // Breaks per person, sorted by start time.
  const byName = {};
  for (const b of breaks) (byName[b.team_member] ||= []).push(b);
  for (const n in byName) byName[n].sort((a, b) => (a.start_minutes ?? 0) - (b.start_minutes ?? 0));

  const maxBreaks = Math.max(1, ...shifts.map((s) => (byName[s.name] || []).length));

  // Sort rows by the first break's start time (fallback to shift start).
  const rows = shifts.slice().sort((a, b) => {
    const ab = (byName[a.name] || [])[0]?.start_minutes ?? a.start_minutes;
    const bb = (byName[b.name] || [])[0]?.start_minutes ?? b.start_minutes;
    return ab - bb;
  });

  // Resolve each staff member's extension (employee id) for the EXT column.
  const extMap = {};
  try {
    const members = await base44.entities.TeamMember.list("-updated_date", 500);
    for (const m of members) extMap[normName(m.name)] = m.employee_id || "";
  } catch (e) {
    /* EXT column left blank */
  }

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 24;
  const usableW = pageW - margin * 2;

  const fixedCols = [
    { key: "area", label: "DEPT", w: 108 },
    { key: "name", label: "TEAM MEMBER", w: 108 },
    { key: "start", label: "START", w: 48 },
    { key: "end", label: "END", w: 48 },
    { key: "ext", label: "EXT", w: 42 },
  ];
  const fixedW = fixedCols.reduce((s, c) => s + c.w, 0);
  const breakW = (usableW - fixedW) / maxBreaks;
  const breakCols = Array.from({ length: maxBreaks }, (_, i) => ({
    key: "b" + i,
    label: "BREAK " + (i + 1),
    w: breakW,
  }));
  const cols = [...fixedCols, ...breakCols];

  const bannerH = 22;
  const headerH = 18;
  const rowH = 26;

  const drawBanner = (y) => {
    doc.setFillColor(...TEAL);
    doc.rect(margin, y, usableW, bannerH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text("SUPPORT", pageW / 2, y + bannerH - 6, { align: "center" });
    return y + bannerH;
  };
  const drawHeader = (y) => {
    doc.setFillColor(...TEAL);
    doc.rect(margin, y, usableW, headerH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    let x = margin;
    for (const c of cols) {
      doc.text(c.label, x + 5, y + headerH - 5);
      x += c.w;
    }
    return y + headerH;
  };

  let y = margin + 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(date ? "Break Roster — " + date : "Break Roster", margin, y);
  y += 6;

  const tableTop = y;
  y = drawBanner(y);
  y = drawHeader(y);

  rows.forEach((s, i) => {
    if (y + rowH > pageH - margin) {
      doc.setDrawColor(...GRID);
      doc.setLineWidth(0.5);
      doc.line(margin, y, margin + usableW, y);
      doc.addPage();
      y = margin;
      y = drawHeader(y);
    }
    doc.setFillColor(...(i % 2 === 0 ? [255, 255, 255] : ROW_ALT));
    doc.rect(margin, y, usableW, rowH, "F");

    const ext = extMap[normName(s.name)] || "";
    const vals = { area: s.area || "", name: s.name || "", start: s.start || "", end: s.end || "", ext };

    // Fixed columns — single line, vertically centred.
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    let x = margin;
    for (const c of fixedCols) {
      doc.text(String(vals[c.key] ?? ""), x + 5, y + rowH / 2 + 2);
      x += c.w;
    }

    // Break columns — time on line 1, cover (with coloured dot) on line 2.
    const bs = byName[s.name] || [];
    for (let bi = 0; bi < maxBreaks; bi++) {
      const b = bs[bi];
      if (b) {
        const hasCover = b.cover && b.cover.trim();
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(0, 0, 0);
        doc.text(`${b.start}–${b.end} (${b.duration}m)`, x + 5, y + 11);

        let coverTxt;
        let rgb;
        if (hasCover) {
          rgb = hexToRgb(memberColor(b.cover));
          coverTxt = "→ " + b.cover;
        } else if (b.status === "self-managed") {
          rgb = SELF_RGB;
          coverTxt = "self-managed";
        } else {
          rgb = PULL_RGB;
          coverTxt = "pull from floor";
        }
        if (hasCover) {
          doc.setFillColor(...rgb);
          doc.circle(x + 7, y + 18, 2.6, "F");
        }
        doc.setFontSize(7);
        doc.setTextColor(...rgb);
        doc.text(coverTxt, hasCover ? x + 12 : x + 5, y + 20);
      }
      x += breakW;
    }

    doc.setDrawColor(...GRID);
    doc.setLineWidth(0.5);
    doc.line(margin, y + rowH, margin + usableW, y + rowH);
    y += rowH;
  });

  // Outer border + vertical column separators over the whole table.
  doc.setDrawColor(...GRID);
  doc.setLineWidth(0.5);
  doc.rect(margin, tableTop, usableW, y - tableTop);
  let vx = margin;
  for (const c of cols) {
    vx += c.w;
    if (vx < margin + usableW - 0.1) doc.line(vx, tableTop, vx, y);
  }
  doc.line(margin, tableTop + bannerH, margin + usableW, tableTop + bannerH);

  doc.save(`break-roster${date ? "-" + date : ""}.pdf`);
}