const staleSensitiveEvents=new Set(["confirmation","reminder_24h","reminder_2h","reschedule"]);

export function shouldSuppressAppointmentLifecycle(eventType,startsAt,now=Date.now()){
  const startTime=new Date(startsAt).getTime();
  return staleSensitiveEvents.has(eventType)&&Number.isFinite(startTime)&&startTime<=now;
}
