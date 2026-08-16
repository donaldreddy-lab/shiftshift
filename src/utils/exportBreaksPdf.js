function fmt(min) {
  let m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return String(h).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
}

const SELF_MANAGED = new Set(["Online Fulfilment", "Click and Collect", "Reception"]);

// Count overlapping breaks at the worst moment, excluding self-managed areas
// (matches the on-screen overlap highlighting).
function maxOverlap(breaks, b) {
  if (SELF_MANAGED.has(b.area)) return 0;
  const events = [];
  for (const o of breaks) {
    if (SELF_MANAGED.has(o.area)) continue;
    if (o.start_minutes == null || o.end_minutes == null) continue;
    if (o.start_minutes < b.end_minutes && b.start_minutes < o.end_minutes) {
      events.push([Math.max(o.start_minutes, b.start_minutes), 1]);
      events.push([Math.min(o.end_minutes, b.end_minutes), -1]);
    }
  }
  events.sort((a, c) => a[0] - c[0] || a[1] - c[1]);
  let cur = 0, mx = 0;
  for (const ev of events) { cur += ev[1]; if (cur > mx) mx = cur; }
  return mx;
}

export async function exportBreaksPdf(schedule) {
  const { jsPDF } = await import("jspdf");

  const shifts = schedule.shifts || [];
  const breaks = schedule.breaks || [];
  const date = schedule.schedule_date || "";

  const byName = {};
  for (const b of breaks) (byName[b.team_member] ||= []).push(b);
  for (const k in byName) byName[k].sort((a, b) => (a.start_minutes ?? 0) - (b.start_minutes ?? 0));

  const maxBreaks = Math.max(1, ...shifts.map((s) => (byName[s.name] || []).length));

  // Sort rows by each person's first break start time (empty breaks → end of list).
  const sortedShifts = [...shifts].sort((a, b) => {
    const aStart = (byName[a.name] || []).reduce((m, x) => Math.min(m, x.start_minutes ?? Infinity), Infinity);
    const bStart = (byName[b.name] || []).reduce((m, x) => Math.min(m, x.start_minutes ?? Infinity), Infinity);
    return aStart - bStart;
  });

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 24;

  // Title block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(17, 24, 39);
  doc.text("Break Roster" + (date ? " — " + date : ""), margin, margin + 6);

  const sum = schedule.summary || {};
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  const summaryParts = [
    `Staff ${sum.total_staff ?? shifts.length}`,
    `Breaks ${sum.total_breaks ?? breaks.length}`,
    `Covered ${sum.covered ?? 0}`,
    `Pull from floor ${sum.unassigned ?? sum.flagged ?? 0}`,
    `Self-managed ${sum.self_managed ?? 0}`,
  ];
  if (sum.new_members && sum.new_members.length) summaryParts.push(`New: ${sum.new_members.join(", ")}`);
  doc.text(summaryParts.join("    "), margin, margin + 20);

  // Column layout
  const fixedW = { dept: 132, name: 118, start: 46, end: 46 };
  const fixedTotal = fixedW.dept + fixedW.name + fixedW.start + fixedW.end;
  const breakArea = pageW - margin * 2 - fixedTotal;
  const breakW = breakArea / maxBreaks;

  let x = margin;
  const cols = [
    { key: "dept", title: "DEPT", x, w: fixedW.dept },
  ]; x += fixedW.dept;
  cols.push({ key: "name", title: "TEAM MEMBER", x, w: fixedW.name }); x += fixedW.name;
  cols.push({ key: "start", title: "START", x, w: fixedW.start }); x += fixedW.start;
  cols.push({ key: "end", title: "END", x, w: fixedW.end }); x += fixedW.end;
  const breakStartX = x;
  const breakCols = [];
  for (let i = 0; i < maxBreaks; i++) {
    breakCols.push({ x: breakStartX + i * breakW, w: breakW, idx: i });
  }

  const PEACH = [250, 235, 215];
  const WHITE = [255, 255, 255];
  const HEADER_BG = [211, 211, 211];
  const SUBHEAD_BG = [245, 245, 240];
  const BREAK_HEAD = [
    [224, 242, 254],
    [220, 252, 231],
    [254, 249, 195],
  ];
  const GRID = [203, 213, 225];

  const rowH = 30;
  let y = margin + 34;

  const drawHeader = (topY) => {
    // SUPPORT banner
    doc.setFillColor(...HEADER_BG);
    doc.rect(margin, topY, pageW - margin * 2, 18, "F");
    doc.setDrawColor(...GRID);
    doc.rect(margin, topY, pageW - margin * 2, 18, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text("SUPPORT", margin + 6, topY + 12);

    // Sub-header row
    const subY = topY + 18;
    for (const c of cols) {
      doc.setFillColor(...SUBHEAD_BG);
      doc.rect(c.x, subY, c.w, 16, "F");
      doc.setDrawColor(...GRID);
      doc.rect(c.x, subY, c.w, 16, "S");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      doc.text(c.title, c.x + 4, subY + 11);
    }
    for (const bc of breakCols) {
      doc.setFillColor(...BREAK_HEAD[bc.idx % BREAK_HEAD.length]);
      doc.rect(bc.x, subY, bc.w, 16, "F");
      doc.setDrawColor(...GRID);
      doc.rect(bc.x, subY, bc.w, 16, "S");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      doc.text(`BREAK ${bc.idx + 1}`, bc.x + 4, subY + 11);
    }
    return subY + 16;
  };

  y = drawHeader(y);
  const headerBottom = y;
  const maxY = pageH - margin - 14;

  doc.setFont("helvetica", "normal");

  sortedShifts.forEach((sh, i) => {
    if (y + rowH > maxY) {
      doc.addPage();
      y = margin + 6;
      y = drawHeader(y);
    }
    const pm = sh.start_minutes >= 720;
    const bg = pm ? PEACH : WHITE;
    doc.setFillColor(...bg);
    doc.rect(margin, y, pageW - margin * 2, rowH, "F");

    // Fixed columns
    const cells = [
      { x: cols[0].x, w: cols[0].w, text: String(sh.area || ""), bold: true },
      { x: cols[1].x, w: cols[1].w, text: String(sh.name || ""), bold: true },
      { x: cols[2].x, w: cols[2].w, text: sh.start || "", bold: false },
      { x: cols[3].x, w: cols[3].w, text: sh.end || "", bold: false },
    ];
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    cells.forEach((c) => {
      doc.setFont("helvetica", c.bold ? "bold" : "normal");
      doc.text(c.text, c.x + 4, y + 12);
    });

    // Break cells
    const bs = byName[sh.name] || [];
    breakCols.forEach((bc) => {
      const b = bs[bc.idx];
      const cx = bc.x, cw = bc.w;
      let cellBg = bg;
      let borderColor = GRID;
      if (b) {
        const ov = maxOverlap(breaks, b);
        if (ov >= 3) cellBg = [254, 202, 202];
        else if (ov === 2) cellBg = [253, 230, 138];
        if (ov >= 3) borderColor = [220, 38, 38];
        else if (ov === 2) borderColor = [245, 158, 11];
      }
      doc.setFillColor(...cellBg);
      doc.rect(cx, y, cw, rowH, "F");
      doc.setDrawColor(...borderColor);
      doc.setLineWidth(b && maxOverlap(breaks, b) >= 2 ? 1.2 : 0.5);
      doc.rect(cx, y, cw, rowH, "S");
      doc.setLineWidth(0.5);

      if (b) {
        doc.setTextColor(17, 24, 39);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text(`${fmt(b.start_minutes)}–${fmt(b.end_minutes)}`, cx + 4, y + 12);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        const dur = `${b.duration}m`;
        let coverLabel, coverColor;
        if (b.status === "self-managed") { coverLabel = "self-managed"; coverColor = [2, 132, 199]; }
        else if (b.cover) { coverLabel = `→ ${b.cover}`; coverColor = [4, 120, 87]; }
        else { coverLabel = "pull from floor"; coverColor = [180, 83, 9]; }
        doc.setTextColor(...coverColor);
        doc.text(`${dur}  ${coverLabel}`, cx + 4, y + 23);
      }
    });

    // gridlines for fixed columns (drawn after fills)
    doc.setDrawColor(...GRID);
    cols.forEach((c) => doc.rect(c.x, y, c.w, rowH, "S"));
    // outer border
    doc.rect(margin, y, pageW - margin * 2, rowH, "S");

    y += rowH;
  });

  // Footer
  doc.setTextColor(150, 150, 150);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Generated by ShiftShift", margin, pageH - 10);

  // Legend
  const legY = y + 14;
  if (legY < maxY) {
    doc.setFontSize(7);
    const items = [
      { label: "Covered", color: [4, 120, 87] },
      { label: "Self-managed", color: [2, 132, 199] },
      { label: "Pull from floor", color: [180, 83, 9] },
      { label: "Overlap (2)", color: [245, 158, 11] },
      { label: "Overlap (3+)", color: [220, 38, 38] },
    ];
    let lx = margin;
    items.forEach((it) => {
      doc.setFillColor(...it.color);
      doc.rect(lx, legY - 6, 8, 8, "F");
      doc.setTextColor(80, 80, 80);
      doc.text(it.label, lx + 12, legY);
      lx += 14 + doc.getTextWidth(it.label) + 16;
    });
  }

  const fileName = `break-roster${date ? "-" + date : ""}.pdf`;
  doc.save(fileName);
}