import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import AssistantWidget from "../components/AssistantWidget";
import RoadmapView from "../components/RoadmapView";

const STATUS_LABEL = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted, awaiting review",
  approved: "Approved",
  returned: "Returned, needs changes",
};

function daysLabel(dueDateStr) {
  const due = new Date(dueDateStr);
  const now = new Date();
  due.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const days = Math.round((due - now) / 86400000);
  if (days < 0) return { text: `${Math.abs(days)} days overdue`, tone: "overdue" };
  if (days === 0) return { text: "Due today", tone: "soon" };
  if (days <= 7) return { text: `Due in ${days} days`, tone: "soon" };
  return { text: `Due ${due.toLocaleDateString()}`, tone: "ok" };
}

export default function StudentChecklistPage() {
  const { token, user } = useAuth();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [precheckResults, setPrecheckResults] = useState({});

  async function load() {
    try {
      const res = await api.myChecklist(token);
      setData(res);
    } catch (err) {
      setLoadError(err.message);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  async function markSubmitted(itemId) {
    setActionError("");
    setBusyId(itemId);
    try {
      await api.updateMyItem(token, itemId, "submitted");
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function uploadDocument(itemId, file) {
    if (!file) return;
    setActionError("");
    setBusyId(itemId);
    try {
      const res = await api.uploadMyDocument(token, itemId, file);
      setPrecheckResults((p) => ({ ...p, [itemId]: res.ai_precheck || null }));
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function viewDocument(itemId) {
    try {
      await api.openMyDocument(token, itemId);
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function removeDocument(itemId) {
    if (!window.confirm("Remove your uploaded document for this item?")) return;
    setActionError("");
    setBusyId(itemId);
    try {
      await api.removeMyDocument(token, itemId);
      setPrecheckResults((p) => ({ ...p, [itemId]: null }));
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (loadError) return <div className="container"><div className="error-box">{loadError}</div></div>;
  if (!data) return <div className="container">Loading your checklist...</div>;

  const { student, assigned_staff, items, roadmap } = data;
  const completed = items.filter((i) => i.status === "approved").length;
  const percent = items.length ? Math.round((completed / items.length) * 100) : 0;

  return (
    <div className="container">
      {actionError && <div className="error-box" style={{ marginBottom: 16 }}>{actionError}</div>}
      <div className="card">
        <h1>Welcome, {user.full_name.split(" ")[0]}</h1>
        <p className="subtitle">
          {student.population === "international" ? "International" : "Domestic"} student
          {student.program ? ` \u00b7 ${student.program}` : ""}
          {student.country ? ` \u00b7 ${student.country}` : ""}
        </p>
        <p className="hint" style={{ marginTop: -8 }}>
          {assigned_staff
            ? `Your ISS contact: ${assigned_staff.full_name} (${assigned_staff.email})`
            : "Your ISS contact hasn't been assigned yet."}
        </p>

        <div className="summary-grid">
          <div className="stat"><div className="num">{items.length}</div><div className="label">Total requirements</div></div>
          <div className="stat"><div className="num">{completed}</div><div className="label">Approved</div></div>
          <div className="stat"><div className="num">{percent}%</div><div className="label">Complete</div></div>
        </div>
      </div>

      <RoadmapView roadmap={roadmap} />

      <div className="card">
        <h2>Your checklist</h2>
        {items.map((item) => {
          const d = daysLabel(item.due_date);
          const canSubmit = item.status === "not_started" || item.status === "in_progress" || item.status === "returned";
          const canUpload = canSubmit || item.status === "submitted";
          return (
            <div className="checklist-item" key={item.id}>
              <div style={{ flex: 1 }}>
                <div className="title-row">
                  {item.title}
                  {item.visa_critical && <span className="badge visa">Visa-critical</span>}
                </div>
                <div className="meta">{item.description}</div>
                <div className="meta">
                  <span className={`badge ${item.status}`}>{STATUS_LABEL[item.status]}</span>
                  {" "}
                  <span style={{ color: d.tone === "overdue" ? "var(--red)" : d.tone === "soon" ? "var(--amber)" : "var(--gray)", fontWeight: 600 }}>
                    {d.text}
                  </span>
                  {" \u00b7 Owner: "}{item.owner_office}
                </div>
                {item.reviewer_note && <div className="meta" style={{ marginTop: 4 }}><em>Staff note: {item.reviewer_note}</em></div>}
                {item.has_document && (
                  <div style={{ marginTop: 8 }}>
                    <button className="secondary small" onClick={() => viewDocument(item.id)}>View your uploaded document</button>
                    {item.status !== "approved" && (
                      <button
                        className="danger small"
                        style={{ marginLeft: 6 }}
                        disabled={busyId === item.id}
                        onClick={() => removeDocument(item.id)}
                      >
                        Remove
                      </button>
                    )}
                    {precheckResults[item.id] && (
                      <div
                        className="meta"
                        style={{
                          marginTop: 6,
                          color: precheckResults[item.id].status === "check" ? "var(--amber)" : "var(--green)",
                        }}
                      >
                        {precheckResults[item.id].status === "check" ? "⚠ " : "✓ "}
                        {precheckResults[item.id].note}
                      </div>
                    )}
                  </div>
                )}
                {canUpload && (
                  <div style={{ marginTop: 8 }}>
                    <label style={{ marginBottom: 3 }}>
                      {item.has_document ? "Replace document" : "Attach document"} (PDF, PNG, or JPG, up to 5MB)
                    </label>
                    <input
                      type="file"
                      accept="application/pdf,image/png,image/jpeg"
                      disabled={busyId === item.id}
                      style={{ marginBottom: 0 }}
                      onChange={(e) => uploadDocument(item.id, e.target.files[0])}
                    />
                  </div>
                )}
              </div>
              <div className="actions">
                {canSubmit && (
                  <button className="secondary small" disabled={busyId === item.id} onClick={() => markSubmitted(item.id)}>
                    {busyId === item.id ? "Submitting..." : "Mark submitted"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card">
        <h2>Ask the requirements assistant</h2>
        <p className="hint" style={{marginTop: -6}}>Answers come only from approved university documentation, with sources cited.</p>
        <AssistantWidget />
      </div>
    </div>
  );
}
