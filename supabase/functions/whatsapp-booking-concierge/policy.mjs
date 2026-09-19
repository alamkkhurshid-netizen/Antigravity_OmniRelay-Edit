export function bookingMenu(welcomeMessage, patientName = "") {
  const greeting = patientName ? `Welcome back, ${patientName}.` : welcomeMessage;
  const repeat = patientName ? "\n4. Repeat my last appointment" : "";
  return `${greeting}\n\n1. Choose appointment (Recommended)\n2. My bookings\n3. Last visit / prescription${repeat}\n5. Doctor directory & brochure\n6. Clinic timings & location\n7. Speak to front desk\n9. Human assistance\n\nUse the menu below. Type MENU anytime to restart.`;
}

export function nextSevenDates(now = Date.now()) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now + (index + 1) * 86_400_000);
    return date.toISOString().slice(0, 10);
  });
}

export function isRepeatableAppointment(appointment) {
  return Boolean(appointment?.service?.id && appointment?.location?.id && appointment?.resource?.id);
}

export function relationshipForChoice(input) {
  return ["self", "child", "parent", "spouse", "relative"][Number(String(input).trim()) - 1] ?? null;
}

export function isResetCommand(input) {
  return ["menu", "start", "hi", "hello", "book"].includes(String(input).trim().toLowerCase());
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
