import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";

function daysUntil(dueDateStr) {
  const due = new Date(dueDateStr);
  const now = new Date();
  due.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.round((due - now) / 86400000);
}

const isActionable = (status) => status === "not_started" || status === "in_progress" || status === "returned";

// Urgency bucket for items that still need the student's action. Items
// already submitted/approved carry no urgency (they're waiting on staff or
// finished), so they sit outside this chart entirely and only count toward
// the completion figure below.
function bucketFor(item) {
  const days = daysUntil(item.due_date);
  if (days < 0) return "overdue";
  if (days <= 7) return "soon";
  return "ontrack";
}

const BUCKET = {
  overdue: { label: "Overdue", color: "var(--red)", fill: "var(--red-solid)", icon: "⚠" },
  soon: { label: "Due soon", color: "var(--amber)", fill: "var(--amber-solid)", icon: "⏳" },
  ontrack: { label: "On track", color: "var(--green)", fill: "var(--green-solid)", icon: "✓" },
};

export default function StudentDashboardPage() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.myChecklist(token).then(setData).catch((err) => setError(err.message));
  }, [token]);

  async function exportCalendar() {
    try {
      await api.downloadMyCalendar(token);
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <div className="container"><div className="error-box">{error}</div></div>;
  if (!data) return <div className="container">Loading dashboard...</div>;

  const { items } = data;
  const actionable = items.filter((i) => isActionable(i.status));
  const counts = { overdue: 0, soon: 0, ontrack: 0 };
  for (const item of actionable) counts[bucketFor(item)] += 1;
  const totalActionable = actionable.length;

  const completed = items.filter((i) => i.status === "approved").length;
  const percent = items.length ? Math.round((completed / items.length) * 100) : 0;

  const needsAttention = actionable
    .filter((i) => bucketFor(i) !== "ontrack")
    .sort((a, b) => daysUntil(a.due_date) - daysUntil(b.due_date));

  return (
    <div className="container">
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h1>Your dashboard</h1>
            <p className="subtitle" style={{ marginBottom: 20 }}>A quick read on what needs you now, and what can wait.</p>
          </div>
          <button className="secondary small" onClick={exportCalendar} style={{ flexShrink: 0 }}>
            Export deadlines (.ics)
          </button>
        </div>

        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 56, fontWeight: 700, color: "var(--accent)", lineHeight: 1 }}>{percent}%</div>
          <div className="hint" style={{ margin: "6px 0 0" }}>of your checklist complete ({completed}/{items.length} approved)</div>
        </div>

        {totalActionable > 0 && (
          <div style={{ marginBottom: 8 }} role="img" aria-label={`${counts.overdue} overdue, ${counts.soon} due soon, ${counts.ontrack} on track`}>
            <div style={{ display: "flex", height: 22, borderRadius: 4, overflow: "hidden", gap: 2 }}>
              {["overdue", "soon", "ontrack"].map((key) =>
                counts[key] > 0 ? (
                  <div
                    key={key}
                    title={`${BUCKET[key].label}: ${counts[key]}`}
                    style={{
                      width: `${(counts[key] / totalActionable) * 100}%`,
                      background: BUCKET[key].fill,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "white",
                      fontSize: 12,
                      fontWeight: 700,
                      minWidth: 2,
                    }}
                  >
                    {counts[key] / totalActionable >= 0.12 ? counts[key] : ""}
                  </div>
                ) : null
              )}
            </div>
          </div>
        )}

        <div className="summary-grid" style={{ marginTop: 16 }}>
          {["overdue", "soon", "ontrack"].map((key) => (
            <div className="stat" key={key}>
              <div className="num" style={{ color: BUCKET[key].color }}>{BUCKET[key].icon} {counts[key]}</div>
              <div className="label">{BUCKET[key].label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Needs attention ({needsAttention.length})</h2>
        {needsAttention.length === 0 ? (
          <p className="hint" style={{ marginTop: -6 }}>Nothing urgent right now &mdash; everything actionable is more than a week out.</p>
        ) : (
          needsAttention.map((item) => {
            const days = daysUntil(item.due_date);
            const bucket = bucketFor(item);
            return (
              <div
                key={item.id}
                style={{
                  borderLeft: `4px solid ${BUCKET[bucket].color}`,
                  padding: "10px 14px",
                  marginBottom: 8,
                  background: "var(--surface-alt)",
                  borderRadius: 4,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div>
                  <strong>{item.title}</strong>
                  {item.visa_critical && <span className="badge visa" style={{ marginLeft: 6 }}>Visa-critical</span>}
                </div>
                <div style={{ color: BUCKET[bucket].color, fontWeight: 700, fontSize: "0.85rem", whiteSpace: "nowrap" }}>
                  {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Due today" : `Due in ${days}d`}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
