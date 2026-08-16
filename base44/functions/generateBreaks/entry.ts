import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import * as XLSX from 'npm:xlsx@0.18.5';

const AREAS = [
  "People Greeter", "Register", "Info Desk", "Front End Support",
  "Hire Shop", "Online Fulfilment", "Click and Collect",
  "Nursery Register", "Nursery Greeter", "BSCO", "Toolshop Register",
  "Key Holder", "Cafe", "Reception"
];
const REQUIRES_18 = new Set(["Nursery Greeter", "People Greeter"]);
const REQUIRES_TRAINING = new Set(["Info Desk", "Hire Shop", "Front End Support", "Cafe"]);
// Minimum coverage windows: each area must keep at least `min` person present
// during its window. Where 2+ staff overlap in the window, the extra person is
// spare capacity — use them to cover breaks (same area or pulled elsewhere)
// without dropping below the minimum.
const COVERAGE = {
  "People Greeter": { start: 0, end: 1440, min: 1 },
  "Register": { start: 9 * 60, end: 20 * 60, min: 1 },
  "Toolshop Register": { start: 0, end: 1440, min: 1 },
  "Nursery Register": { start: 9 * 60, end: 17 * 60, min: 1 },
  "Nursery Greeter": { start: 9 * 60, end: 17 * 60, min: 1 },
  "Info Desk": { start: 0, end: 1440, min: 1 },
  "Front End Support": { start: 0, end: 1440, min: 1 },
  "Cafe": { start: 7 * 60 + 45, end: 16 * 60 + 45, min: 1 }
};
// Areas that manage their own break cover internally — no cover assignment needed,
// and their staff are NOT pulled to cover other areas' breaks.
const SELF_MANAGED = new Set(["Online Fulfilment", "Click and Collect", "Reception"]);
// Info Desk and Front End Support are effectively the same role — staff from
// either can cover the other, and each counts toward the other's coverage.
const EQUIV = {
  "Info Desk": "Front End Support",
  "Front End Support": "Info Desk"
};
// Pool areas: self-managed (own breaks need no cover) but their staff CAN be
// pulled to cover other areas when 3+ are rostered in that area during the
// break, up to 2 covers/day each.
const POOL_AREAS = new Set(["Online Fulfilment", "Click and Collect"]);

function normalizeArea(raw) {
  if (!raw) return "";
  const s = String(raw).trim().toLowerCase();
  for (const a of AREAS) {
    if (s === a.toLowerCase()) return a;
  }
  // fuzzy contains match
  for (const a of AREAS) {
    if (s.includes(a.toLowerCase()) || a.toLowerCase().includes(s)) return a;
  }
  return raw.trim();
}

function parseTimeToMinutes(value) {
  if (value == null) return null;
  if (typeof value === "number") {
    // Excel time fraction of a day
    if (value > 0 && value < 1) return Math.round(value * 24 * 60);
    // already minutes
    if (value >= 0 && value < 24 * 60 + 1) return Math.round(value);
    return null;
  }
  const s = String(value).trim().toUpperCase();
  if (!s) return null;
  let ampm = null;
  let cleaned = s;
  if (s.includes("AM")) { ampm = "AM"; cleaned = s.replace(/AM/gi, "").trim(); }
  else if (s.includes("PM")) { ampm = "PM"; cleaned = s.replace(/PM/gi, "").trim(); }
  // handle 24h or 12h
  const parts = cleaned.split(/[:.\s]+/).filter(Boolean);
  if (parts.length < 1) return null;
  let h = parseInt(parts[0], 10);
  let m = parts[1] ? parseInt(parts[1], 10) : 0;
  if (isNaN(h)) return null;
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  if (h < 0 || h > 23) return null;
  return h * 60 + (m || 0);
}

function minutesToTime(min) {
  let m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return String(h).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
}

function getBreakDurations(shiftMinutes) {
  if (shiftMinutes < 240) return [];
  if (shiftMinutes < 300) return [15];
  if (shiftMinutes < 420) return [15, 30];
  if (shiftMinutes <= 600) return [30, 30];
  return [30, 30, 15];
}

function snapUp15(min) { return Math.ceil(min / 15) * 15; }

// Max concurrent breaks in the late window (>= threshold), counting only the
// portion of each break that falls at/after the threshold. Includes candidate.
function maxConcurrentLate(placedBreaks, start, end, threshold, includeSelf) {
  const lateStart = Math.max(start, threshold);
  const lateEnd = end;
  if (lateEnd <= lateStart) return 0;
  const events = [];
  for (const p of placedBreaks) {
    if (!includeSelf && SELF_MANAGED.has(p.area)) continue;
    const ps = Math.max(p.start_minutes, threshold);
    const pe = p.end_minutes;
    if (ps < pe && ps < lateEnd && lateStart < pe) {
      events.push([Math.max(ps, lateStart), 1]);
      events.push([Math.min(pe, lateEnd), -1]);
    }
  }
  events.push([lateStart, 1]);
  events.push([lateEnd, -1]);
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0, mx = 0;
  for (const ev of events) { cur += ev[1]; if (cur > mx) mx = cur; }
  return mx;
}

// Max concurrent breaks overlapping [start, end), optionally including
// self-managed areas. Includes the candidate slot itself in the count.
function maxConcurrent(placedBreaks, start, end, includeSelf) {
  const events = [];
  for (const p of placedBreaks) {
    if (!includeSelf && SELF_MANAGED.has(p.area)) continue;
    if (p.start_minutes < end && start < p.end_minutes) {
      events.push([p.start_minutes, 1]);
      events.push([p.end_minutes, -1]);
    }
  }
  events.push([start, 1]);
  events.push([end, -1]);
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0, mx = 0;
  for (const ev of events) { cur += ev[1]; if (cur > mx) mx = cur; }
  return mx;
}

// Place one shift's breaks into the global list, keeping at most 2 concurrent
// breaks (hard for non-self-managed areas, soft for self-managed) and a 2-hour
// gap between one person's own breaks.
function placeShiftBreaks(shift, placedBreaks, allShifts, hard, lateThreshold, deadline) {
  const durations = getBreakDurations(shift.shift_minutes);
  const winStart = shift.start_minutes + 90;
  const winEndRaw = shift.end_minutes - 60;
  const winEnd = deadline != null ? Math.min(winEndRaw, deadline) : winEndRaw;
  let prevEnd = shift.start_minutes;
  for (let i = 0; i < durations.length; i++) {
    const d = durations[i];
    const gapEarliest = Math.max(winStart, prevEnd + (i === 0 ? 0 : 120));
    // First break must start between 1.5h and 3.5h into the shift.
    const firstBreakDeadline = shift.start_minutes + 210;
    const latest = i === 0 ? Math.min(winEnd - d, firstBreakDeadline) : winEnd - d;
    const lastResortLatest = i === 0 ? Math.min(winEnd - d, firstBreakDeadline) : winEnd - d;
    const ideal = winStart + Math.round((i + 1) * (winEnd - winStart - d) / (durations.length + 1));
    let best = null;
    const trySlot = (s, allowHardBreach, requireCoverage) => {
      const e = s + d;
      if (e > winEnd + 0.001) return null;
      // never overlap this person's own breaks
      const ownOverlap = placedBreaks.some((p) => p.team_member === shift.name && p.start_minutes < e && s < p.end_minutes);
      if (ownOverlap) return null;
      // Concurrency cap (≤2 non-self-managed breaks at once) is a soft penalty
      // via mcAll in the score, not a hard reject — area coverage takes priority.
      // Late window: after lateThreshold we aim for one at a time. When the
      // late window is over-subscribed this can't always be honoured, so it's
      // a heavy soft penalty (not a hard reject) — breaks spread out and any
      // residual overlap shows as an amber/red flag for the manager.
      const mcLate = lateThreshold != null && e > lateThreshold
        ? maxConcurrentLate(placedBreaks, s, e, lateThreshold, false) : 0;
      const mcAll = maxConcurrent(placedBreaks, s, e, true);
      // For coverage areas, a break may only land when another person keeps the
      // area at its minimum during the break (use the overlap as natural cover).
      // Hard in normal passes; softened to a penalty only as a last resort.
      let coverGap = 0;
      const cov = COVERAGE[shift.area];
      if (cov) {
        const ws = Math.max(s, cov.start), we = Math.min(e, cov.end);
        if (ws < we) {
          const remaining = areaCoverageCount(allShifts, placedBreaks, shift.area, s, e, shift.name);
          if (remaining < cov.min) {
            if (requireCoverage) return null;
            coverGap = (cov.min - remaining) * 50000;
          }
        }
      }
      const score = mcLate * mcLate * 100000 + mcAll * 10000 + coverGap + Math.abs(s - ideal);
      return { start: s, end: e, duration: d, score };
    };
    // Pass 1: respect the 2-hour gap and coverage minimum (hard).
    if (gapEarliest <= latest) {
      for (let s = snapUp15(gapEarliest); s <= latest; s += 15) {
        const cand = trySlot(s, false, true);
        if (cand && (!best || cand.score < best.score)) best = cand;
      }
    }
    // Pass 2: relax the 2-hour gap — coverage minimum still hard.
    if (!best && winStart <= latest) {
      for (let s = snapUp15(winStart); s <= latest; s += 15) {
        const cand = trySlot(s, false, true);
        if (cand && (!best || cand.score < best.score)) best = cand;
      }
    }
    // Last resort: the window is genuinely over-subscribed — allow the
    // 2-overlap cap to be breached AND relax the coverage minimum to a penalty,
    // so overflow breaks still place rather than failing entirely.
    if (!best && winStart <= lastResortLatest) {
      for (let s = snapUp15(winStart); s <= lastResortLatest; s += 15) {
        const cand = trySlot(s, true, false);
        if (cand && (!best || cand.score < best.score)) best = cand;
      }
    }
    // Absolute fallback: clamp to the after-hours deadline (own-overlap only).
    if (!best) {
      let s = winStart <= lastResortLatest ? lastResortLatest : snapUp15(gapEarliest);
      if (i === 0 && s > firstBreakDeadline) s = firstBreakDeadline;
      if (deadline != null && s + d > deadline) s = Math.max(shift.start_minutes + 120, deadline - d);
      best = { start: s, end: s + d, duration: d };
    }
    placedBreaks.push({
      team_member: shift.name,
      area: shift.area,
      start_minutes: best.start,
      end_minutes: best.end,
      start: minutesToTime(best.start),
      end: minutesToTime(best.end),
      duration: best.duration
    });
    prevEnd = Math.max(prevEnd, best.end);
  }
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

// Count staff in `area` working the whole [s,e] window and not on break during
// it. `excludeName` is not counted (the person being pulled / going on break).
function areaCoverageCount(allShifts, placedBreaks, area, s, e, excludeName) {
  // Equivalent roles (Info Desk ↔ Front End Support) count toward each other's
  // coverage, so a break in one can be covered by presence in the other.
  const areas = new Set([area, EQUIV[area]]);
  let count = 0;
  for (const sh of allShifts) {
    if (sh.name === excludeName) continue;
    if (!areas.has(sh.area)) continue;
    if (sh.start_minutes > s || sh.end_minutes < e) continue;
    const onBreak = placedBreaks.some((o) => o.team_member === sh.name && overlaps(s, e, o.start_minutes, o.end_minutes));
    if (onBreak) continue;
    count++;
  }
  return count;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const fileUrl = body.file_url;
    const scheduleDate = body.schedule_date || new Date().toISOString().slice(0, 10);

    let roster;
    if (Array.isArray(body.roster) && body.roster.length > 0) {
      // Direct roster data (manual entry / testing without an uploaded file)
      roster = body.roster;
    } else {
      if (!fileUrl) return Response.json({ error: 'Either file_url or a roster array is required' }, { status: 400 });

      // Fetch and parse the roster file directly (supports .xlsx, .xls, .csv)
      const fileRes = await fetch(fileUrl);
      if (!fileRes.ok) {
        return Response.json({ error: 'Could not download the uploaded file.' }, { status: 400 });
      }
      const ab = await fileRes.arrayBuffer();
      const workbook = XLSX.read(ab, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (!rows.length) {
        return Response.json({ error: 'No rows could be read from the file. Check the spreadsheet has headers like Name, Start, End and Area.' }, { status: 400 });
      }

      // Map various column header formats to our fields
      const findKey = (row, candidates) => {
        const keys = Object.keys(row);
        for (const c of candidates) {
          const cl = c.toLowerCase();
          const hit = keys.find((k) => k.toLowerCase().trim() === cl);
          if (hit) return hit;
        }
        for (const c of candidates) {
          const cl = c.toLowerCase();
          const hit = keys.find((k) => k.toLowerCase().includes(cl));
          if (hit) return hit;
        }
        return null;
      };
      const firstRow = rows[0];
      const nameKey = findKey(firstRow, ['name', 'employee', 'staff', 'team member', 'full name']);
      const startKey = findKey(firstRow, ['start', 'start time', 'in', 'shift start', 'from', 'time in']);
      const endKey = findKey(firstRow, ['end', 'end time', 'out', 'shift end', 'to', 'time out', 'finish']);
      const areaKey = findKey(firstRow, ['area', 'location', 'department', 'zone', 'role', 'position', 'station', 'assignment']);

      if (!nameKey || !startKey || !endKey) {
        return Response.json({ error: `Could not find the expected columns. Detected — Name: ${nameKey || 'missing'}, Start: ${startKey || 'missing'}, End: ${endKey || 'missing'}, Area: ${areaKey || 'missing'}. Make sure your spreadsheet has Name, Start time, End time (and Area) headers.` }, { status: 400 });
      }

      roster = rows.map((r) => ({
        name: r[nameKey],
        start_time: r[startKey],
        end_time: r[endKey],
        area: areaKey ? r[areaKey] : ''
      }));
    }

    // Load existing team members
    const existing = await base44.asServiceRole.entities.TeamMember.list('-updated_date', 500);
    // Normalize names to "firstName lastInitial" for matching, so "Webb, Sam"
    // and "Sam W" resolve to the same team member instead of creating duplicates.
    const normName = (raw) => {
      const s = (raw || '').trim();
      if (!s) return '';
      if (s.includes(',')) {
        const [last, first] = s.split(',').map((x) => x.trim());
        const fn = (first.split(/\s+/)[0] || '');
        const li = ((last.replace(/[^A-Za-z]/g, '') || '')[0] || '').toUpperCase();
        return (fn + ' ' + li).toLowerCase();
      }
      const parts = s.split(/\s+/);
      const fn = parts[0] || '';
      const li = parts.length > 1 ? ((parts[parts.length - 1].replace(/[^A-Za-z]/g, '') || '')[0] || '').toUpperCase() : '';
      return (fn + ' ' + li).toLowerCase();
    };
    const byName = {};
    for (const m of existing) byName[normName(m.name)] = m;
    const newMembers = [];

    // Build shifts
    const shifts = [];
    for (const row of roster) {
      const name = (row.name || "").trim();
      if (!name) continue;
      const start = parseTimeToMinutes(row.start_time);
      const end = parseTimeToMinutes(row.end_time);
      if (start == null || end == null) continue;
      let endM = end;
      if (endM <= start) endM += 1440; // overnight shift
      const area = normalizeArea(row.area);
      shifts.push({
        name,
        area,
        start: minutesToTime(start),
        end: minutesToTime(endM),
        start_minutes: start,
        end_minutes: endM,
        shift_minutes: endM - start
      });
      // sync team member
      if (!byName[normName(name)]) {
        try {
          const created = await base44.asServiceRole.entities.TeamMember.create({
            name,
            employee_id: "",
            is_18_plus: false,
            trained_areas: []
          });
          byName[name.toLowerCase()] = created;
          newMembers.push(name);
        } catch (e) { /* ignore dup race */ }
      }
    }

    // Generate breaks globally: non-self-managed first (hard 2-overlap limit),
    // then self-managed (soft — tries to keep total ≤ 2 but allows more).
    // After-hours rule:
    //   Mon–Fri: after 17:00 only 1 break at a time, all breaks done by 20:15.
    //   Sat–Sun: after 16:00 only 1 break at a time, all breaks done by 18:15.
    const dow = new Date(scheduleDate + 'T00:00:00').getDay(); // 0 Sun .. 6 Sat
    const isWeekend = dow === 0 || dow === 6;
    const lateThreshold = isWeekend ? 16 * 60 : 17 * 60;
    const deadline = isWeekend ? 18 * 60 + 15 : 20 * 60 + 15;
    const placedBreaks = [];
    const orderedShifts = shifts.slice().sort((a, b) => a.start_minutes - b.start_minutes);
    for (const s of orderedShifts) if (!SELF_MANAGED.has(s.area)) placeShiftBreaks(s, placedBreaks, shifts, true, lateThreshold, deadline);
    for (const s of orderedShifts) if (SELF_MANAGED.has(s.area)) placeShiftBreaks(s, placedBreaks, shifts, false, lateThreshold, deadline);

    const allBreaks = placedBreaks.map((p) => ({
      team_member: p.team_member,
      area: p.area,
      start_minutes: p.start_minutes,
      end_minutes: p.end_minutes,
      start: p.start,
      end: p.end,
      duration: p.duration,
      cover: "",
      cover_area: "",
      status: "unassigned",
      flag_reason: ""
    }));

    // Sort breaks by start time for greedy assignment
    allBreaks.sort((a, b) => a.start_minutes - b.start_minutes);

    // Assign covers
    for (const brk of allBreaks) {
      // Self-managed areas handle their own breaks internally — no cover needed
      if (SELF_MANAGED.has(brk.area)) {
        brk.cover = "";
        brk.cover_area = "";
        brk.status = "self-managed";
        brk.flag_reason = "Self-managed area — covers own breaks";
        continue;
      }

      const member = byName[normName(brk.team_member)];
      const candidates = [];
      for (const shift of shifts) {
        if (shift.name === brk.team_member) continue;
        // Reception staff manage their own area only — never pulled to cover.
        if (shift.area === "Reception") continue;
        // Online Fulfilment / Click & Collect staff can be pulled to cover
        // other areas only when 3+ from that area are rostered across the
        // break window, and each covers at most 2 breaks/day.
        if (POOL_AREAS.has(shift.area)) {
          const areaStaff = shifts.filter(sh => sh.area === shift.area && sh.start_minutes <= brk.start_minutes && sh.end_minutes >= brk.end_minutes);
          if (areaStaff.length < 3) continue;
          const coverCount = allBreaks.filter(o => o.cover === shift.name).length;
          if (coverCount >= 2) continue;
        }
        // must be working for the whole break
        if (shift.start_minutes > brk.start_minutes || shift.end_minutes < brk.end_minutes) continue;
        // must not be on their own break at this time
        const onBreak = allBreaks.some(o => o.team_member === shift.name && overlaps(brk.start_minutes, brk.end_minutes, o.start_minutes, o.end_minutes));
        if (onBreak) continue;
        // must not already be covering another break at this time
        const alreadyCovering = allBreaks.some(o => o.cover === shift.name && overlaps(brk.start_minutes, brk.end_minutes, o.start_minutes, o.end_minutes));
        if (alreadyCovering) continue;
        // Info Desk & Front End Support are the same role — a candidate from
        // either counts as "same-area" (natural cover) for the other.
        const sameArea = shift.area === brk.area || EQUIV[shift.area] === brk.area;
        // Coverage check: a same-area candidate stays put (they ARE the cover),
        // so the area just needs its minimum once the break person leaves. A
        // cross-area candidate leaves their home area, so don't drop it below
        // its minimum there.
        const covArea = sameArea ? brk.area : shift.area;
        const cov = COVERAGE[covArea];
        if (cov) {
          const ws = Math.max(brk.start_minutes, cov.start), we = Math.min(brk.end_minutes, cov.end);
          if (ws < we) {
            const excludeName = sameArea ? brk.team_member : shift.name;
            const remaining = areaCoverageCount(shifts, allBreaks, covArea, brk.start_minutes, brk.end_minutes, excludeName);
            if (remaining < cov.min) continue;
          }
        }
        // qualification checks
        const coverMember = byName[normName(shift.name)];
        if (coverMember) {
          if (REQUIRES_18.has(brk.area) && !coverMember.is_18_plus) continue;
          // Info Desk / Front End Support are interchangeable — skip the training
          // check when covering the equivalent role.
          if (REQUIRES_TRAINING.has(brk.area) && !sameArea && !(coverMember.trained_areas || []).includes(brk.area)) continue;
        }
        const trained = coverMember ? (coverMember.trained_areas || []).includes(brk.area) : false;
        const covHome = COVERAGE[shift.area];
        const homeCount = areaCoverageCount(shifts, allBreaks, shift.area, brk.start_minutes, brk.end_minutes, null);
        const spare = sameArea ? homeCount > 1 : (!covHome || homeCount > covHome.min);
        candidates.push({ shift, member: coverMember, trained, sameArea, spare });
      }
      if (candidates.length > 0) {
        // Prefer a same-area overlap (natural cover), then a trained candidate,
        // then anyone spare in their own area, then concentrate on the person
        // already covering the most breaks.
        candidates.sort((a, b) => {
          if (a.sameArea !== b.sameArea) return a.sameArea ? -1 : 1;
          if (a.trained !== b.trained) return a.trained ? -1 : 1;
          if (a.spare !== b.spare) return a.spare ? -1 : 1;
          const aCount = allBreaks.filter(o => o.cover === a.shift.name).length;
          const bCount = allBreaks.filter(o => o.cover === b.shift.name).length;
          return bCount - aCount;
        });
        const chosen = candidates[0];
        brk.cover = chosen.shift.name;
        brk.cover_area = chosen.shift.area;
        brk.status = "covered";
        brk.flag_reason = "Swap with " + chosen.shift.name;
      } else {
        // No automatic cover — breaks are allowed to overlap, so just leave the
        // cover box empty for the manager to pull someone off the floor manually.
        brk.cover = "";
        brk.cover_area = "";
        brk.status = "unassigned";
        brk.flag_reason = "No automatic cover — pull someone off the floor";
      }
    }

    // Detect overlaps among covers (same person covering overlapping breaks is already prevented; check area coverage gaps)
    const overlapFlags = [];
    // flag any time two breaks in the same area overlap with no extra cover - informational
    // (kept lightweight: overlaps in cover assignment already prevented)

    const covered = allBreaks.filter(b => b.status === "covered").length;
    const unassigned = allBreaks.filter(b => b.status === "unassigned").length;
    const selfManaged = allBreaks.filter(b => b.status === "self-managed").length;

    // Save schedule
    const schedule = await base44.asServiceRole.entities.BreakSchedule.create({
      schedule_date: scheduleDate,
      status: "generated",
      shifts,
      breaks: allBreaks,
      summary: {
        total_staff: shifts.length,
        total_breaks: allBreaks.length,
        covered,
        unassigned,
        self_managed: selfManaged,
        new_members: newMembers
      }
    });

    return Response.json({
      schedule_id: schedule.id,
      schedule_date: scheduleDate,
      status: schedule.status,
      shifts,
      breaks: allBreaks,
      summary: {
        total_staff: shifts.length,
        total_breaks: allBreaks.length,
        covered,
        unassigned,
        self_managed: selfManaged,
        new_members: newMembers
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}