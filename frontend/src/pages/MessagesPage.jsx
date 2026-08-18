import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import MessageThread from "../components/MessageThread";

function initials(name) {
  if (!name) return "?";
  // Staff display names sometimes carry a trailing office tag, e.g.
  // "Maria Delgado (ISS)" -- only take tokens that start with a letter so
  // that doesn't produce something like "M(".
  const parts = name.trim().split(/\s+/).filter((p) => /^[A-Za-z]/.test(p));
  if (parts.length === 0) return "?";
  return ((parts[0][0] || "") + (parts[parts.length - 1][0] || "")).toUpperCase();
}

export function lastReadKey(userId) {
  return `pnwp_last_read_messages_${userId}`;
}

export default function MessagesPage() {
  const { user, token } = useAuth();
  const [assignedStaff, setAssignedStaff] = useState(undefined); // undefined = loading, null = none assigned

  useEffect(() => {
    api.myMessages(token)
      .then((res) => setAssignedStaff(res.assigned_staff || null))
      .catch(() => setAssignedStaff(null));
    localStorage.setItem(lastReadKey(user.id), new Date().toISOString());
  }, [token]); // eslint-disable-line

  return (
    <div className="container">
      <div className="card">
        <h1>Messages</h1>
        {assignedStaff === undefined && <p className="subtitle" style={{ marginBottom: 14 }}>A direct line to your ISS contact.</p>}
        {assignedStaff === null && (
          <p className="subtitle" style={{ marginBottom: 14 }}>Your ISS contact hasn't been assigned yet.</p>
        )}
        {assignedStaff && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div
              style={{
                width: 40, height: 40, borderRadius: "50%", background: "var(--accent)", color: "white",
                display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0,
              }}
            >
              {initials(assignedStaff.full_name)}
            </div>
            <div>
              <div style={{ fontWeight: 700 }}>{assignedStaff.full_name}</div>
              <div className="hint" style={{ margin: 0, textTransform: "capitalize" }}>
                {assignedStaff.role === "staff" ? "International Student Services (ISS)" : assignedStaff.role}
              </div>
            </div>
          </div>
        )}
        <MessageThread
          loadFn={api.myMessages}
          sendFn={api.sendMyMessage}
          otherPartyName={assignedStaff ? assignedStaff.full_name.split(" ")[0] : "Your ISS contact"}
          simulateReplies
        />
      </div>
    </div>
  );
}
