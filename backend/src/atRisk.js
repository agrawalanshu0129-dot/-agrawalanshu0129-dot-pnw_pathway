function daysUntil(dueDateInput) {
  const due = dueDateInput instanceof Date ? new Date(dueDateInput) : new Date(dueDateInput + "T00:00:00Z");
  const now = new Date();
  due.setUTCHours(0, 0, 0, 0);
  now.setUTCHours(0, 0, 0, 0);
  const ms = due.getTime() - now.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function isOpen(status) {
  return status === "not_started" || status === "in_progress" || status === "returned";
}

function computeRisk(checklistItems) {
  let overdueCount = 0;
  let visaCriticalNear = false;
  let nearestDueDays = Infinity;

  for (const item of checklistItems) {
    if (!isOpen(item.status)) continue;
    const days = daysUntil(item.due_date);
    nearestDueDays = Math.min(nearestDueDays, days);
    if (days < 0) overdueCount += 1;
    if (item.visa_critical && days <= 7) visaCriticalNear = true;
  }

  const atRisk = overdueCount >= 2 || visaCriticalNear;
  const reasons = [];
  if (overdueCount >= 2) reasons.push(`${overdueCount} items overdue`);
  if (visaCriticalNear) reasons.push("visa-critical item due within 7 days");

  return {
    atRisk,
    overdueCount,
    reasons,
    nearestDueDays: nearestDueDays === Infinity ? null : nearestDueDays,
  };
}

module.exports = { computeRisk, daysUntil };
