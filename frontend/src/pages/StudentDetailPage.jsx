import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";

const STATUS_LABEL = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted, awaiting review",
  approved: "Approved",
  returned: "Returned, needs changes",
};

// FR7: this is the actual approve/return UI. The dashboard table is
// summary-only, so staff land here to act on a specific student's items.
export default function StudentDetailPage({ studentId, onBack }) {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [noteDrafts, setNoteDrafts] = useState({});

  async function load() {
    try {
      const res = await api.studentDetail(token, studentId);
      setData(res);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, [studentId]); // eslint-disable-line

  async function review(itemId, status) {
    if (status === "returned" && !(noteDrafts[itemId] || "").trim()) {
      setError("Add a note explaining what the student needs to fix before returning an item.");
      return;
    }
    setError("");
    setBusyId(itemId);
    try {
      await api.reviewItem(token, studentId, itemId, status, noteDrafts[itemId] || "");
      setNoteDrafts((d) => ({ ...d, [itemId]: "" }));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function viewDocument(itemId) {
    try {
      await api.openStudentDocument(token, studentId, itemId);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!data && !error) return <div className="card">Loading student...</div>;

  return (
    <div>
      <button className="secondary small" onClick={onBack} style={{ marginBottom: 16 }}>&larr; Back to all students</button>

      {error && <div className="error-box">{error}</div>}
      {!data && <div className="card">Loading student...</div>}

      {data && (
        <>
          <div className="card">
            <h1>{data.student.full_name}</h1>
            <p className="subtitle" style={{ marginBottom: 6 }}>
              {data.student.email} &middot; <span style={{ textTransform: "capitalize" }}>{data.student.population}</span>
              {data.student.program ? ` · ${data.student.program}` : ""}
              {data.student.country ? ` · ${data.student.country}` : ""}
            </p>
            <p className="hint" style={{ marginTop: 0 }}>
              Assigned to: {data.student.assigned_staff_name || "Unassigned"}
              {data.student.assignment_is_coverage && <span className="badge risk" style={{ marginLeft: 6 }}>Coverage</span>}
              {data.at_risk && <span className="badge risk" style={{ marginLeft: 6 }}>At risk</span>}
            </p>
          </div>

          <div className="card">
            <h2>Checklist ({data.items.length})</h2>
            {data.items.map((item) => (
              <div className="checklist-item" key={item.id}>
                <div style={{ flex: 1 }}>
                  <div className="title-row">
                    {item.title}
                    {item.visa_critical && <span className="badge visa">Visa-critical</span>}
                  </div>
                  <div className="meta">{item.description}</div>
                  <div className="meta">
                    <span className={`badge ${item.status}`}>{STATUS_LABEL[item.status]}</span>
                    {" · Due "}{new Date(item.due_date).toLocaleDateString()}
                    {" · Owner: "}{item.owner_office}
                  </div>
                  {item.reviewer_note && (
                    <div className="meta" style={{ marginTop: 4 }}><em>Previous note: {item.reviewer_note}</em></div>
                  )}
                  {item.has_document && (
                    <div style={{ marginTop: 8 }}>
                      <button className="secondary small" onClick={() => viewDocument(item.id)}>View uploaded document</button>
                    </div>
                  )}
                  {item.status === "submitted" && (
                    <input
                      placeholder="Note to student (required if returning)"
                      value={noteDrafts[item.id] || ""}
                      onChange={(e) => setNoteDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
                      style={{ marginTop: 8, marginBottom: 0 }}
                    />
                  )}
                </div>
                {item.status === "submitted" && (
                  <div className="actions">
                    <button className="primary small" disabled={busyId === item.id} onClick={() => review(item.id, "approved")}>
                      Approve
                    </button>
                    <button className="secondary small" disabled={busyId === item.id} onClick={() => review(item.id, "returned")}>
                      Return
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
