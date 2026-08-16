function fmt(min) {
  let m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return String(h).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
}

import { EQUIV, SELF_MANAGED, resolveCoverage } from "./coverageDefaults";
import { memberColor, initials, hexToRgb } from "./memberColor";

const STATUS_RGB = {
  covered: [16, 185, 129],
  "self-managed": [14, 165, 233],
  unassigned: [245, 158, 11],
  flagged: [220, 38, 38],
};

function areaPresent(shifts, breaks, area, t) {
  const areas = new Set([area, EQUIV[area]]);
  let count = 0;
  for (const s of shifts) {
    if (!areas.has(s.area)) continue;
    if (s.start_minutes > t || s.end_minutes <= t) continue;
    const onBreak = (breaks || []).some(
      (b) => b.team_member === s.name && b.start_minutes <= t && b.end_minutes > t
    );
    if (!onBreak) count++;
  }
  return count;
}

export async function exportGanttPdf(schedule, coverage) {
  const { jsPDF } = await import("jspdf");
  const dow = schedule.schedule_date ? new Date(schedule.schedule_date + "T00:00:00").getDay() : new Date().getDay();
  coverage = coverage || resolveCoverage([], dow);
  const shifts = schedule.shifts || [];
  const breaks = schedule.breaks || [];
  if (!shifts.length) return;
  const date = schedule.schedule_date || "";

  const starts = shifts.map((s) => s.start_minutes);
  const ends = shifts.map((s) => s.end_minutes);
  const t0 = Math.floor(Math.min(...starts) / 60) * 60;
  const t1 = Math.ceil(Math.max(...ends) / 60) * 60;

  const byArea = {};
  shifts.forEach((s) => (byArea[s.area] ||= []).push(s));
  const breaksByName = {};
  breaks.forEach((b) => (breaksByName[b.team_member] ||= []).push(b));

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 24;
  const labelW = 92;
  const usableW = pageW - margin * 2 - labelW;
  const pxPerMin = usableW / (t1 - t0);
  const X = (m) => margin + labelW + (m - t0) * pxPerMin;

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(17, 24, 39);
  doc.text("Coverage Gantt" + (date ? " — " + date : ""), margin, margin + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("Shifts, breaks and on-floor coverage by area", margin, margin + 18);

  // Hour ruler
  let rulerY = margin + 28;
  for (let h = t0; h <= t1; h += 60) {
    const x = X(h);
    doc.setDrawColor(226, 232, 240);
    doc.line(x, rulerY, x, rulerY + 4);
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(7);
    doc.text(fmt(h), x - 6, rulerY + 13);
  }

  let y = rulerY + 20;
  const rowH = 15;
  const areaHdrH = 13;
  const maxBottom = pageH - margin - 12;

  const drawRulerContinuation = (yy) => {
    for (let h = t0; h <= t1; h += 60) {
      const x = X(h);
      doc.setDrawColor(226, 232, 240);
      doc.line(x, yy, x, yy + 3);
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(7);
      doc.text(fmt(h), x - 6, yy + 11);
    }
    return yy + 16;
  };

  // Shift rows grouped by area
  for (const [area, staff] of Object.entries(byArea)) {
    if (y + areaHdrH + staff.length * rowH > maxBottom) {
      doc.addPage();
      y = margin + 6;
      y = drawRulerContinuation(y);
    }
    // area header
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, pageW - margin * 2, areaHdrH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text((SELF_MANAGED.has(area) ? area + "  ·  self-managed" : area).toUpperCase(), margin + 4, y + 9);
    y += areaHdrH;

    for (const s of staff) {
      if (y + rowH > maxBottom) {
        doc.addPage();
        y = margin + 6;
        y = drawRulerContinuation(y);
      }
      const pm = s.start_minutes >= 720;
      // name label
      doc.setFillColor(...hexToRgb(memberColor(s.name)));
      doc.circle(margin + 5, y + 7, 2.4, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(17, 24, 39);
      doc.text(String(s.name || ""), margin + 12, y + 10);
      // shift bar
      const sx = X(s.start_minutes);
      const ex = X(s.end_minutes);
      doc.setFillColor(...(pm ? [253, 231, 211] : [238, 242, 247]));
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(sx, y + 2, ex - sx, rowH - 4, 2, 2, "FD");
      // start/end ticks
      doc.setDrawColor(148, 163, 184);
      doc.line(sx, y, sx, y + rowH);
      doc.line(ex, y, ex, y + rowH);
      // break blocks
      const sBreaks = (breaksByName[s.name] || []).sort((a, b) => a.start_minutes - b.start_minutes);
      sBreaks.forEach((b) => {
        const bx = X(b.start_minutes);
        const bw = Math.max(3, X(b.end_minutes) - X(b.start_minutes));
        const hasCover = b.cover && b.cover.trim();
        const rgb = hasCover ? hexToRgb(memberColor(b.cover)) : (STATUS_RGB[b.status] || [148, 163, 184]);
        doc.setFillColor(...rgb);
        doc.roundedRect(bx, y + 2, bw, rowH - 4, 1.5, 1.5, "F");
        if (hasCover && bw >= 26) {
          doc.setTextColor(255, 255, 255);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(6.5);
          doc.text(initials(b.cover), bx + bw / 2, y + rowH / 2 + 1, { align: "center" });
        }
      });
      y += rowH;
    }
  }

  // Coverage lanes
  y += 8;
  if (y + 30 > maxBottom) {
    doc.addPage();
    y = margin + 6;
    y = drawRulerContinuation(y);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(17, 24, 39);
  doc.text("On-floor coverage  (dashed line = minimum)", margin, y + 6);
  y += 14;

  const covAreas = Object.keys(coverage).filter((a) => byArea[a] || byArea[EQUIV[a]]);
  const laneH = 42;
  const step = 15;

  for (const area of covAreas) {
    if (y + laneH + 14 > maxBottom) {
      doc.addPage();
      y = margin + 6;
      y = drawRulerContinuation(y);
    }
    const areas = new Set([area, EQUIV[area]]);
    const windows = coverage[area] || [];
    const minAt = (t) => {
      let m = 0;
      for (const w of windows) if (t >= w.start && t < w.end) m = Math.max(m, w.min);
      return m;
    };
    const pts = [];
    let maxC = 1;
    for (let t = t0; t < t1; t += step) {
      const c = areaPresent(shifts, breaks, area, t);
      const req = minAt(t + step / 2);
      const rostered = shifts.some((s) => areas.has(s.area) && s.start_minutes <= t && s.end_minutes > t);
      pts.push({ t, c, req, rostered });
      if (c > maxC) maxC = c;
      if (req > maxC) maxC = req;
    }
    const maxReq = pts.reduce((mx, p) => Math.max(mx, p.req), 0);
    const top = y + 4;
    const baseY = y + laneH;
    const span = laneH - 8;
    const yFor = (c) => baseY - (c / Math.max(2, maxC)) * span;

    // hour grid
    for (let h = t0; h <= t1; h += 60) {
      doc.setDrawColor(241, 245, 249);
      doc.line(X(h), top, X(h), baseY);
    }
    // gap shading (count below the slot's required min while area is rostered/open)
    pts.forEach((p) => {
      if (p.c < p.req && p.rostered) {
        const gx = X(p.t);
        const gw = X(p.t + step) - gx;
        doc.setFillColor(254, 202, 202);
        doc.rect(gx, yFor(p.req), gw, baseY - yFor(p.req), "F");
      }
    });
    // per-slot bars (on-floor count)
    pts.forEach((p) => {
      const gx = X(p.t);
      const gw = X(p.t + step) - gx;
      const ch = baseY - yFor(p.c);
      doc.setFillColor(...(p.c < p.req && p.rostered ? [254, 202, 202] : [219, 234, 254]));
      doc.rect(gx, baseY - ch, gw, ch, "F");
    });
    // required-min line (stepped — varies by time window)
    doc.setDrawColor(239, 68, 68);
    doc.setLineDashPattern([3, 2], 0);
    pts.forEach((p, i) => {
      const x1 = X(p.t), x2 = X(p.t + step), yy = yFor(p.req);
      doc.line(x1, yy, x2, yy);
      if (i < pts.length - 1) doc.line(x2, yy, x2, yFor(pts[i + 1].req));
    });
    doc.setLineDashPattern([], 0);
    // coverage step line
    doc.setDrawColor(37, 99, 235);
    doc.setLineWidth(1.2);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      doc.line(X(a.t), yFor(a.c), X(b.t), yFor(a.c));
      doc.line(X(b.t), yFor(a.c), X(b.t), yFor(b.c));
    }
    doc.setLineWidth(0.5);
    // baseline
    doc.setDrawColor(203, 213, 225);
    doc.line(X(t0), baseY, X(t1), baseY);
    // label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(17, 24, 39);
    doc.text(area, margin + 2, top + 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`min up to ${maxReq}`, margin + 2, top + 18);

    // gap count badge
    const gapCount = pts.filter((p) => p.c < p.req && p.rostered).length;
    if (gapCount > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(220, 38, 38);
      doc.text(`${gapCount * step}m below min`, X(t1) - 60, top + 9);
    }

    y = baseY + 6;
  }

  // Footer
  doc.setTextColor(150, 150, 150);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Generated by ShiftShift", margin, pageH - 10);

  doc.save(`coverage-gantt${date ? "-" + date : ""}.pdf`);
}