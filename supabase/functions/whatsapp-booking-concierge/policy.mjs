export function bookingMenu(welcomeMessage, patientName = "", clinicName = "") {
  let greeting;
  if (patientName) {
    greeting = clinicName ? `Welcome back to ${clinicName}, ${patientName}.` : `Welcome back, ${patientName}.`;
  } else if (clinicName && (!welcomeMessage || welcomeMessage.startsWith("Welcome."))) {
    greeting = `Welcome to ${clinicName}. I can help with your clinic visit, appointments, or contact details.`;
  } else {
    greeting = welcomeMessage;
  }
  const repeat = patientName ? "\n4. Repeat my last appointment" : "";
  return `${greeting}\n\n1. Choose appointment (Recommended)\n2. My bookings\n3. Last visit / prescription${repeat}\n5. Doctor directory & brochure\n6. Clinic timings & location\n7. Speak to front desk\n9. Human assistance\n\nUse the menu below. Type MENU anytime to restart.`;
}

export function nextSevenDates(now = Date.now()) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now + (index + 1) * 86_400_000);
    return date.toISOString().slice(0, 10);
  });
}

export function nextWorkingDates(activeWeekdays, count = 7, timeZone = "Asia/Kolkata", now = new Date()) {
  const weekdaysSet = activeWeekdays instanceof Set
    ? activeWeekdays
    : new Set(activeWeekdays ? [...activeWeekdays].map(Number) : []);
  const dates = [];

  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const todayIso = formatter.format(now);

  const addDays = (baseIso, days) => {
    const [y, m, d] = baseIso.split("-").map(Number);
    const utcDate = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
    return utcDate.toISOString().slice(0, 10);
  };

  if (!weekdaysSet || weekdaysSet.size === 0) {
    for (let i = 1; i <= count; i++) {
      dates.push(addDays(todayIso, i));
    }
    return dates;
  }

  for (let offset = 1; offset <= 45 && dates.length < count; offset++) {
    const candidateIso = addDays(todayIso, offset);
    const [y, m, d] = candidateIso.split("-").map(Number);
    const utcDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const weekday = utcDate.getUTCDay();
    if (weekdaysSet.has(weekday)) {
      dates.push(candidateIso);
    }
  }

  return dates;
}

export function matchDateChoice(inbound, dates, timeZone = "Asia/Kolkata") {
  if (!Array.isArray(dates) || !dates.length) return null;
  const trimmed = String(inbound ?? "").trim().toLowerCase();
  
  // 1. Direct 1-based index (e.g. "1", "2")
  const idx = Number(trimmed.match(/^\s*(\d+)\s*$/)?.[1] ?? 0) - 1;
  if (idx >= 0 && idx < dates.length) return dates[idx];

  // 2. Direct ISO match
  for (const d of dates) {
    if (d === trimmed) return d;
  }

  // 3. Match day-of-month and month or weekday
  for (const d of dates) {
    const dateObj = new Date(`${d}T12:00:00Z`);
    const day = dateObj.getUTCDate();
    const shortMonth = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone }).format(dateObj).toLowerCase();
    const longMonth = new Intl.DateTimeFormat("en-IN", { month: "long", timeZone }).format(dateObj).toLowerCase();
    const weekdayShort = new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone }).format(dateObj).toLowerCase();
    const weekdayLong = new Intl.DateTimeFormat("en-IN", { weekday: "long", timeZone }).format(dateObj).toLowerCase();

    // Ensure day matches as a distinct word (e.g. "25", not "20" from "2026")
    const dayRegex = new RegExp(`(^|\\D)${day}(\\D|$)`);
    const hasDay = dayRegex.test(trimmed);
    const hasMonth = trimmed.includes(shortMonth) || trimmed.includes(longMonth);
    const hasWeekday = trimmed.includes(weekdayShort) || trimmed.includes(weekdayLong);

    if (hasDay && hasMonth) {
      return d;
    }
    if (hasDay && hasWeekday) {
      return d;
    }
  }

  return null;
}

export function matchDepartmentChoice(inbound, departments) {
  if (!Array.isArray(departments) || !departments.length) return null;
  const trimmed = String(inbound ?? "").trim().toLowerCase();
  const idx = Number(trimmed.match(/^\s*(\d+)/)?.[1] ?? 0) - 1;
  if (idx >= 0 && idx < departments.length) return departments[idx];

  const exact = departments.find((d) => String(d.name ?? "").toLowerCase() === trimmed);
  if (exact) return exact;

  const partial = departments.find((d) => {
    const name = String(d.name ?? "").toLowerCase();
    return name.includes(trimmed) || trimmed.includes(name);
  });
  return partial ?? null;
}

export function matchDoctorChoice(inbound, resources) {
  if (!Array.isArray(resources) || !resources.length) return null;
  const trimmed = String(inbound ?? "").trim().toLowerCase();
  const idx = Number(trimmed.match(/^\s*(\d+)/)?.[1] ?? 0) - 1;
  if (idx >= 0 && idx < resources.length) return resources[idx];

  const exact = resources.find((r) => String(r.name ?? "").toLowerCase() === trimmed);
  if (exact) return exact;

  const partial = resources.find((r) => {
    const name = String(r.name ?? "").toLowerCase();
    const pureName = name.replace(/^dr\.?\s*/i, "");
    return name.includes(trimmed) || trimmed.includes(pureName);
  });
  return partial ?? null;
}

export function isRepeatableAppointment(appointment) {
  return Boolean(appointment?.service?.id && appointment?.location?.id && appointment?.resource?.id);
}

export function relationshipForChoice(input) {
  return ["self", "child", "parent", "spouse", "relative"][Number(String(input).trim()) - 1] ?? null;
}

export function isResetCommand(input) {
  return ["menu", "start", "hi", "hello", "book", "quick", "express"].includes(String(input).trim().toLowerCase());
}

export function isStopCommand(input) {
  return ["stop", "unsubscribe", "cancel subscription", "opt out", "opt-out"].includes(String(input).trim().toLowerCase());
}

const compact = (value, limit) => String(value ?? "").trim().slice(0, limit);

export function replyButtons(body, buttons, footer = "") {
  if (!Array.isArray(buttons) || buttons.length < 1 || buttons.length > 3) return null;
  return {
    type: "button",
    body: { text: compact(body, 1024) },
    ...(footer ? { footer: { text: compact(footer, 60) } } : {}),
    action: {
      buttons: buttons.map((button) => ({
        type: "reply",
        reply: { id: compact(button.id, 256), title: compact(button.title, 20) },
      })),
    },
  };
}

export function choiceList(body, buttonText, rows, sectionTitle = "Options", footer = "") {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 10) return null;
  return {
    type: "list",
    body: { text: compact(body, 1024) },
    ...(footer ? { footer: { text: compact(footer, 60) } } : {}),
    action: {
      button: compact(buttonText, 20),
      sections: [{
        title: compact(sectionTitle, 24),
        rows: rows.map((row) => ({
          id: compact(row.id, 200),
          title: compact(row.title, 24),
          ...(row.description ? { description: compact(row.description, 72) } : {}),
        })),
      }],
    },
  };
}
