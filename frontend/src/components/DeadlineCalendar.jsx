import { useMemo, useState } from "react";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function localMidnight(d) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function dateKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function bucketFor(item, today) {
  const due = localMidnight(new Date(item.due_date));
  const days = Math.round((due - today) / 86400000);
  if (days < 0) return "overdue";
  if (days <= 7) return "soon";
  return "ontrack";
}

const BUCKET_STYLE = {
  overdue: { fill: "var(--red-solid)", icon: "⚠", label: "Overdue" },
  soon: { fill: "var(--amber-solid)", icon: "⏳", label: "Due soon" },
  ontrack: { fill: "var(--green-solid)", icon: "✓", label: "On track" },
};

// Only items still open (not yet approved) get a date marker -- approved
// items no longer need a deadline flagged, mirroring the dashboard's
// urgency chart above it.
const isActionable = (status) => status === "not_started" || status === "in_progress" || status === "returned";

export default function DeadlineCalendar({ items }) {
  const today = useMemo(() => localMidnight(new Date()), []);
  const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedKey, setSelectedKey] = useState(null);

  const byDay = useMemo(() => {
    const map = {};
    for (const item of items) {
      if (!isActionable(item.status)) continue;
      const due = localMidnight(new Date(item.due_date));
      const key = dateKey(due.getFullYear(), due.getMonth(), due.getDate());
      const bucket = bucketFor(item, today);
      (map[key] = map[key] || []).push({ ...item, bucket });
    }
    return map;
  }, [items, today]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) {
    const d = daysInPrevMonth - startWeekday + 1 + i;
    cells.push({ y: month === 0 ? year - 1 : year, m: month === 0 ? 11 : month - 1, d, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) cells.push({ y: year, m: month, d, inMonth: true });
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const last = cells[cells.length - 1];
    const nextDate = new Date(last.y, last.m, last.d + 1);
    cells.push({ y: nextDate.getFullYear(), m: nextDate.getMonth(), d: nextDate.getDate(), inMonth: false });
    if (cells.length >= 42) break;
  }

  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());
  const selectedItems = selectedKey ? byDay[selectedKey] || [] : [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button className="secondary small" onClick={() => setViewDate(new Date(year, month - 1, 1))}>&larr;</button>
        <div style={{ fontWeight: 700 }}>{MONTH_NAMES[month]} {year}</div>
        <button className="secondary small" onClick={() => setViewDate(new Date(year, month + 1, 1))}>&rarr;</button>
      </div>

      <div className="calendar-grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="calendar-weekday">{w}</div>
        ))}
        {cells.map((c, idx) => {
          const key = dateKey(c.y, c.m, c.d);
          const dayItems = byDay[key] || [];
          const worst = dayItems.some((i) => i.bucket === "overdue")
            ? "overdue"
            : dayItems.some((i) => i.bucket === "soon")
            ? "soon"
            : dayItems.length > 0
            ? "ontrack"
            : null;
          return (
            <button
              key={idx}
              className={`calendar-day${c.inMonth ? "" : " outside"}${key === todayKey ? " today" : ""}${key === selectedKey ? " selected" : ""}`}
              onClick={() => setSelectedKey(dayItems.length > 0 ? (key === selectedKey ? null : key) : null)}
              disabled={dayItems.length === 0}
              title={dayItems.map((i) => i.title).join(", ")}
            >
              <span className="calendar-day-num">{c.d}</span>
              {worst && (
                <span className="calendar-day-badge" style={{ background: BUCKET_STYLE[worst].fill }}>
                  {dayItems.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
        {Object.entries(BUCKET_STYLE).map(([key, s]) => (
          <div key={key} className="hint" style={{ margin: 0, display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: s.fill, display: "inline-block" }} />
            {s.icon} {s.label}
          </div>
        ))}
      </div>

      {selectedKey && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            Due {new Date(selectedKey + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </div>
          {selectedItems.map((item) => (
            <div key={item.id} className="hint" style={{ margin: "0 0 6px", color: "var(--text)" }}>
              {BUCKET_STYLE[item.bucket].icon} {item.title}
              {item.visa_critical && <span className="badge visa" style={{ marginLeft: 6 }}>Visa-critical</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
