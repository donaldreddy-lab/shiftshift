import { base44 } from "@/api/base44Client";

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

export async function exportBreaksPdf(schedule) {
  const { jsPDF } = await import("jspdf");
  const shifts = (schedule.shifts || [])
    .slice()
    .sort((a, b) => (a.start_minutes ?? 0) - (b.start_minutes ?? 0));
  if (!shifts.length) return;
  const date = schedule.schedule_date || "";

  // Resolve each staff member's extension (employee id) for the EXT column.
  const extMap = {};
  try {
    const members = await base44.entities.TeamMember.list("-updated_date", 500);
    for (const m of members) extMap[normName(m.name)] = m.employee_id || "";
  } catch (e) {
    /* EXT column left blank */
  }

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 28;
  const usableW = pageW - margin * 2;
  const cols = [
    { key: "area", label: "DEPT", w: 150 },
    { key: "name", label: "TEAM MEMBER", w: 150 },
    { key: "start", label: "START", w: 65 },
    { key: "end", label: "END", w: 65 },
    { key: "ext", label: "EXT", w: usableW - 150 - 150 - 65 - 65 },
  ];

  const bannerH = 24;
  const headerH = 20;
  const rowH = 19;

  const drawHeader = (y) => {
    doc.setFillColor(...TEAL);
    doc.rect(margin, y, usableW, headerH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(255, 255, 255);
    let x = margin;
    for (const c of cols) {
      doc.text(c.label, x + 6, y + headerH - 7);
      x += c.w;
    }
    return y + headerH;
  };

  const drawBanner = (y) => {
    doc.setFillColor(...TEAL);
    doc.rect(margin, y, usableW, bannerH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text("SUPPORT", pageW / 2, y + bannerH - 7, { align: "center" });
    return y + bannerH;
  };

  // Optional date subtitle above the table.
  let y = margin + 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(date ? "Shift Roster — " + date : "Shift Roster", margin, y);
  y += 8;

  const tableTop = y;
  y = drawBanner(y);
  y = drawHeader(y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);

  shifts.forEach((s, i) => {
    if (y + rowH > pageH - margin) {
      // bottom border of previous page
      doc.setDrawColor(...GRID);
      doc.setLineWidth(0.5);
      doc.line(margin, y, margin + usableW, y);
      doc.addPage();
      y = margin;
      y = drawHeader(y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
    }
    const bg = i % 2 === 0 ? [255, 255, 255] : ROW_ALT;
    doc.setFillColor(...bg);
    doc.rect(margin, y, usableW, rowH, "F");

    const vals = {
      area: s.area || "",
      name: s.name || "",
      start: s.start || "",
      end: s.end || "",
      ext: extMap[normName(s.name)] || "",
    };
    let x = margin;
    for (const c of cols) {
      doc.text(String(vals[c.key] ?? ""), x + 6, y + rowH - 6);
      x += c.w;
    }
    // row separator
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
    if (vx < margin + usableW - 0.1) {
      doc.line(vx, tableTop, vx, y);
    }
  }
  // banner / header divider
  doc.line(margin, tableTop + bannerH, margin + usableW, tableTop + bannerH);

  doc.save(`shift-roster${date ? "-" + date : ""}.pdf`);
}