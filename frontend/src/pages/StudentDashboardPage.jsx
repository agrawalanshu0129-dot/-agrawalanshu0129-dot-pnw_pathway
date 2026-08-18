import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import DeadlineCalendar from "../components/DeadlineCalendar";
import { lastReadKey } from "./MessagesPage";

function daysUntil(dueDateStr) {
  const due = new Date(dueDateStr);
  const now = new Date();
  due.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.round((due - now) / 86400000);
}

function initials(name) {
  if (!name) return "?";
  // Staff display names sometimes carry a trailing office tag, e.g.
  // "Maria Delgado (ISS)" -- only take tokens that start with a letter so
  // that doesn't produce something like "M(".
  const parts = name.trim().split(/\s+/).filter((p) => /^[A-Za-z]/.test(p));
  if (parts.length === 0) return "?";
  return ((parts[0][0] || "") + (parts[parts.length - 1][0] || "")).toUpperCase();
}

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
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

export default function StudentDashboardPage({ onNavigate }) {
  const { token, user } = useAuth();
  const [data, setData] = useState(null);
  const [messagesData, setMessagesData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.myChecklist(token), api.myMessages(token)])
      .then(([checklist, messages]) => {
        setData(checklist);
        setMessagesData(messages);
      })
      .catch((err) => setError(err.message));
  }, [token]);

  async function exportCalendar() {
    try {
      await api.downloadMyCalendar(token);
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <div className="container"><div className="error-box">{error}</div></div>;
  if (!data || !messagesData) return <div className="container">Loading dashboard...</div>;

  const { items, assigned_staff } = data;
  const actionable = items.filter((i) => isActionable(i.status));
  const counts = { overdue: 0, soon: 0, ontrack: 0 };
  for (const item of actionable) counts[bucketFor(item)] += 1;
  const totalActionable = actionable.length;

  const completed = items.filter((i) => i.status === "approved").length;
  const percent = items.length ? Math.round((completed / items.length) * 100) : 0;

  const needsAttention = actionable
    .filter((i) => bucketFor(i) !== "ontrack")
    .sort((a, b) => daysUntil(a.due_date) - daysUntil(b.due_date));

  const recentActivity = items
    .filter((i) => i.status === "approved" || i.status === "returned")
    .map((i) => ({ ...i, activityAt: i.status === "approved" ? i.completed_at : i.returned_at }))
    .filter((i) => i.activityAt)
    .sort((a, b) => new Date(b.activityAt) - new Date(a.activityAt))
    .slice(0, 5);

  const { messages } = messagesData;
  const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const lastRead = localStorage.getItem(lastReadKey(user.id));
  const hasUnread = latestMessage && latestMessage.sender_user_id !== user.id &&
    (!lastRead || new Date(latestMessage.created_at) > new Date(lastRead));

  return (
    <div className="container">
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1>Your dashboard</h1>
            <p className="subtitle" style={{ marginBottom: 20 }}>A quick read on what needs you now, and what can wait.</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
            <button className="secondary small" onClick={() => onNavigate && onNavigate("checklist")}>View checklist</button>
            <button className="secondary small" onClick={() => onNavigate && onNavigate("messages")}>Message ISS</button>
            <button className="secondary small" onClick={exportCalendar}>Export deadlines (.ics)</button>
          </div>
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
        <h2>Deadline calendar</h2>
        <DeadlineCalendar items={items} />
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

      <div className="card">
        <h2>Your ISS contact</h2>
        {!assigned_staff ? (
          <p className="hint" style={{ marginTop: -6, marginBottom: 0 }}>Your ISS contact hasn't been assigned yet.</p>
        ) : (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: latestMessage ? 14 : 0 }}>
              <div
                style={{
                  width: 40, height: 40, borderRadius: "50%", background: "var(--accent)", color: "white",
                  display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0,
                }}
              >
                {initials(assigned_staff.full_name)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>
                  {assigned_staff.full_name}
                  {hasUnread && <span className="badge risk" style={{ marginLeft: 8 }}>New</span>}
                </div>
                <div className="hint" style={{ margin: 0 }}>{assigned_staff.email}</div>
              </div>
              <button className="secondary small" onClick={() => onNavigate && onNavigate("messages")}>Open Messages</button>
            </div>
            {latestMessage && (
              <div className="hint" style={{ margin: 0, background: "var(--surface-alt)", padding: "8px 12px", borderRadius: 6 }}>
                <strong>{latestMessage.sender_user_id === user.id ? "You" : assigned_staff.full_name.split(" ")[0]}:</strong>{" "}
                {latestMessage.body.length > 120 ? `${latestMessage.body.slice(0, 120)}…` : latestMessage.body}
                {" "}&middot; {timeAgo(latestMessage.created_at)}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Recent activity</h2>
        {recentActivity.length === 0 ? (
          <p className="hint" style={{ marginTop: -6, marginBottom: 0 }}>No staff activity yet &mdash; nothing has been reviewed.</p>
        ) : (
          recentActivity.map((item) => (
            <div key={item.id} className="hint" style={{ margin: "0 0 8px", color: "var(--text)" }}>
              {item.status === "approved" ? (
                <span style={{ color: "var(--green)", fontWeight: 700 }}>✓ Approved</span>
              ) : (
                <span style={{ color: "var(--amber)", fontWeight: 700 }}>↩ Returned</span>
              )}
              {" — "}{item.title}
              {item.status === "returned" && item.reviewer_note && <em> &mdash; {item.reviewer_note}</em>}
              <span style={{ color: "var(--gray)" }}> &middot; {timeAgo(item.activityAt)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
