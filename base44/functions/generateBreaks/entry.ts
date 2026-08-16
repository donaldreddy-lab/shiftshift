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
// Areas that must always have at least one person present — breaks need a cover
const ALWAYS_COVERED = new Set(["People Greeter", "Nursery Register", "Nursery Greeter", "Toolshop Register", "Register", "Info Desk", "Cafe", "Hire Shop"]);
// Areas that manage their own break cover internally — no cover assignment needed,
// and their staff are NOT pulled to cover other areas' breaks.
const SELF_MANAGED = new Set(["Online Fulfilment", "Click and Collect", "Reception"]);

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

function placeBreaks(shiftStart, shiftEnd, durations) {
  const windowStart = shiftStart + 120;
  const windowEnd = shiftEnd - 90;
  const breaks = [];
  if (durations.length === 0) return breaks;
  if (windowEnd <= windowStart) {
    // not enough room; place what we can starting at shiftStart+120
    let cursor = Math.max(shiftStart + 120, shiftStart);
    for (const d of durations) {
      if (cursor + d > shiftEnd - 30) break;
      breaks.push({ start: cursor, end: cursor + d, duration: d });
      cursor += d + 15;
    }
    return breaks;
  }
  const totalBreak = durations.reduce((a, b) => a + b, 0);
  const available = windowEnd - windowStart - totalBreak;
  const gap = Math.max(5, Math.floor(available / (durations.length + 1)));
  let cursor = windowStart + gap;
  for (const d of durations) {
    breaks.push({ start: cursor, end: cursor + d, duration: d });
    cursor += d + gap;
  }
  return breaks;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
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

    // Generate breaks
    const allBreaks = [];
    for (const shift of shifts) {
      const durations = getBreakDurations(shift.shift_minutes);
      const placed = placeBreaks(shift.start_minutes, shift.end_minutes, durations);
      for (const b of placed) {
        allBreaks.push({
          team_member: shift.name,
          area: shift.area,
          start_minutes: b.start,
          end_minutes: b.end,
          start: minutesToTime(b.start),
          end: minutesToTime(b.end),
          duration: b.duration,
          cover: "",
          cover_area: "",
          status: "unassigned",
          flag_reason: ""
        });
      }
    }

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
        // self-managed areas (Reception, Fulfilment, Click & Collect) cannot
        // be pulled to cover other areas' breaks — they manage their own.
        if (SELF_MANAGED.has(shift.area)) continue;
        // must be working for the whole break
        if (shift.start_minutes > brk.start_minutes || shift.end_minutes < brk.end_minutes) continue;
        // must not be on their own break at this time
        const onBreak = allBreaks.some(o => o.team_member === shift.name && overlaps(brk.start_minutes, brk.end_minutes, o.start_minutes, o.end_minutes));
        if (onBreak) continue;
        // must not already be covering another break at this time
        const alreadyCovering = allBreaks.some(o => o.cover === shift.name && overlaps(brk.start_minutes, brk.end_minutes, o.start_minutes, o.end_minutes));
        if (alreadyCovering) continue;
        // don't pull someone out of an always-covered area if they're the only
        // person staffing it during this break (would leave that area empty)
        if (ALWAYS_COVERED.has(shift.area)) {
          const othersInArea = shifts.filter(s => s.name !== shift.name && s.area === shift.area && s.start_minutes <= brk.start_minutes && s.end_minutes >= brk.end_minutes && !allBreaks.some(o => o.team_member === s.name && overlaps(brk.start_minutes, brk.end_minutes, o.start_minutes, o.end_minutes)));
          if (othersInArea.length === 0) continue;
        }
        // qualification checks
        const coverMember = byName[normName(shift.name)];
        if (coverMember) {
          if (REQUIRES_18.has(brk.area) && !coverMember.is_18_plus) continue;
          if (REQUIRES_TRAINING.has(brk.area) && !(coverMember.trained_areas || []).includes(brk.area)) continue;
        }
        const trained = coverMember ? (coverMember.trained_areas || []).includes(brk.area) : false;
        candidates.push({ shift, member: coverMember, trained });
      }
      if (candidates.length > 0) {
        // Concentrate covers onto 1–2 dedicated people for the day: prefer a
        // trained candidate, then the candidate already covering the most breaks
        // (so the same floater keeps covering), as long as they're free.
        candidates.sort((a, b) => {
          if (a.trained !== b.trained) return a.trained ? -1 : 1;
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
        // determine why
        let reason = "No available cover — swap required";
        const eligibleWorking = shifts.filter(s => s.name !== brk.team_member && s.start_minutes <= brk.start_minutes && s.end_minutes >= brk.end_minutes);
        if (eligibleWorking.length === 0) {
          reason = "Nobody else is working for the full break window — swap required";
        } else if (REQUIRES_18.has(brk.area)) {
          reason = "No 18+ cover available for " + brk.area + " — swap required";
        } else if (REQUIRES_TRAINING.has(brk.area) || ALWAYS_COVERED.has(brk.area)) {
          reason = "No cover available for " + brk.area + " — must stay staffed, swap required";
        } else {
          reason = "All eligible staff are on break or already covering — overlap may be needed";
        }
        brk.status = "flagged";
        brk.flag_reason = reason;
      }
    }

    // Detect overlaps among covers (same person covering overlapping breaks is already prevented; check area coverage gaps)
    const overlapFlags = [];
    // flag any time two breaks in the same area overlap with no extra cover - informational
    // (kept lightweight: overlaps in cover assignment already prevented)

    const covered = allBreaks.filter(b => b.status === "covered").length;
    const flagged = allBreaks.filter(b => b.status === "flagged").length;
    const selfManaged = allBreaks.filter(b => b.status === "self-managed").length;

    // Save schedule
    const schedule = await base44.asServiceRole.entities.BreakSchedule.create({
      schedule_date: scheduleDate,
      status: flagged > 0 ? "flagged" : "generated",
      shifts,
      breaks: allBreaks,
      summary: {
        total_staff: shifts.length,
        total_breaks: allBreaks.length,
        covered,
        flagged,
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
        flagged,
        self_managed: selfManaged,
        new_members: newMembers
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}