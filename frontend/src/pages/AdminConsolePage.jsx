import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";

function CaseloadSection() {
  const { token, user } = useAuth();
  const [assignments, setAssignments] = useState(null);
  const [unassigned, setUnassigned] = useState([]);
  const [staff, setStaff] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [assignStudentId, setAssignStudentId] = useState("");
  const [assignStaffId, setAssignStaffId] = useState("");
  const [fromStaffId, setFromStaffId] = useState("");
  const [toStaffId, setToStaffId] = useState("");

  async function load() {
    try {
      const [a, u, s] = await Promise.all([
        api.assignments(token, false),
        api.unassignedStudents(token),
        api.assignableStaff(token),
      ]);
      setAssignments(a.assignments);
      setUnassigned(u.students);
      setStaff(s.staff);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  async function handleAssign(e) {
    e.preventDefault();
    setError(""); setNotice("");
    try {
      await api.assignStudent(token, Number(assignStudentId), Number(assignStaffId));
      setAssignStudentId(""); setAssignStaffId("");
      setNotice("Student assigned.");
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleReassign(e) {
    e.preventDefault();
    setError(""); setNotice("");
    try {
      const res = await api.reassignCaseload(token, Number(fromStaffId), Number(toStaffId));
      setNotice(`Reassigned ${res.reassigned_count} student(s) for vacation coverage.`);
      setFromStaffId(""); setToStaffId("");
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleEnd(id) {
    setError(""); setNotice("");
    try {
      await api.endAssignment(token, id);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <div className="error-box">{error}</div>;
  if (!assignments) return <div>Loading caseloads...</div>;

  return (
    <div>
      {notice && <div className="hint" style={{ color: "var(--green)", marginBottom: 14 }}>{notice}</div>}

      <div className="card">
        <h2>Assign a student</h2>
        <p className="hint" style={{ marginTop: -6 }}>Unassigned students only ({unassigned.length}).</p>
        <form onSubmit={handleAssign}>
          <div className="filters">
            <div>
              <label>Student</label>
              <select value={assignStudentId} onChange={(e) => setAssignStudentId(e.target.value)} required>
                <option value="">Select a student&hellip;</option>
                {unassigned.map((s) => (
                  <option key={s.student_id} value={s.student_id}>{s.full_name} ({s.email})</option>
                ))}
              </select>
            </div>
            <div>
              <label>Assign to</label>
              <select value={assignStaffId} onChange={(e) => setAssignStaffId(e.target.value)} required>
                <option value="">Select staff&hellip;</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name} ({s.role})</option>
                ))}
              </select>
            </div>
            <div style={{ flex: "0 0 auto" }}>
              <label>&nbsp;</label>
              <button className="primary" type="submit" disabled={!assignStudentId || !assignStaffId}>Assign</button>
            </div>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Vacation coverage</h2>
        <p className="hint" style={{ marginTop: -6 }}>
          Move an entire caseload from one staff member to another. New assignments are flagged as coverage.
        </p>
        <form onSubmit={handleReassign}>
          <div className="filters">
            <div>
              <label>From</label>
              <select value={fromStaffId} onChange={(e) => setFromStaffId(e.target.value)} required>
                <option value="">Select staff&hellip;</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name} ({s.role})</option>
                ))}
              </select>
            </div>
            <div>
              <label>To</label>
              <select value={toStaffId} onChange={(e) => setToStaffId(e.target.value)} required>
                <option value="">Select staff&hellip;</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name} ({s.role})</option>
                ))}
              </select>
            </div>
            <div style={{ flex: "0 0 auto" }}>
              <label>&nbsp;</label>
              <button className="primary" type="submit" disabled={!fromStaffId || !toStaffId || fromStaffId === toStaffId}>
                Reassign caseload
              </button>
            </div>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Current caseloads ({assignments.length})</h2>
        <table>
          <thead>
            <tr><th>Student</th><th>Assigned staff</th><th>Type</th><th>Since</th><th></th></tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr key={a.id}>
                <td><strong>{a.student_name}</strong><br /><span className="hint" style={{ margin: 0 }}>{a.student_email}</span></td>
                <td>{a.staff_name}{a.staff_email === user.email ? " (you)" : ""}</td>
                <td>{a.is_coverage ? <span className="badge risk">Coverage</span> : <span className="badge ok">Primary</span>}</td>
                <td>{new Date(a.effective_at).toLocaleDateString()}</td>
                <td><button className="secondary small" onClick={() => handleEnd(a.id)}>Unassign</button></td>
              </tr>
            ))}
            {assignments.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--gray)", padding: 24 }}>No active assignments.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StaffAccountsSection() {
  const { token } = useAuth();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ email: "", password: "", full_name: "", role: "staff" });

  async function load() {
    try {
      const res = await api.adminUsers(token);
      setUsers(res.users);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  async function handleCreate(e) {
    e.preventDefault();
    setError(""); setNotice("");
    try {
      await api.createStaffUser(token, form);
      setForm({ email: "", password: "", full_name: "", role: "staff" });
      setNotice(`Account created for ${form.full_name}.`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRoleChange(id, role) {
    setError(""); setNotice("");
    try {
      await api.changeUserRole(token, id, role);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <div className="error-box">{error}</div>;
  if (!users) return <div>Loading staff accounts...</div>;

  return (
    <div>
      {notice && <div className="hint" style={{ color: "var(--green)", marginBottom: 14 }}>{notice}</div>}

      <div className="card">
        <h2>Create a staff account</h2>
        <form onSubmit={handleCreate}>
          <div className="filters">
            <div>
              <label>Full name</label>
              <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
            </div>
            <div>
              <label>Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div>
              <label>Temporary password</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
            </div>
            <div>
              <label>Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="staff">Staff</option>
                <option value="supervisor">Supervisor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div style={{ flex: "0 0 auto" }}>
              <label>&nbsp;</label>
              <button className="primary" type="submit">Create</button>
            </div>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Staff, supervisor &amp; admin accounts ({users.length})</h2>
        <table>
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Change role</th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.full_name}</td>
                <td>{u.email}</td>
                <td style={{ textTransform: "capitalize" }}>{u.role}</td>
                <td>
                  <select
                    defaultValue={u.role}
                    onChange={(e) => handleRoleChange(u.id, e.target.value)}
                    style={{ marginBottom: 0, width: "auto" }}
                  >
                    <option value="staff">Staff</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuditLogSection() {
  const { token } = useAuth();
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(true);

  async function load(beforeId) {
    try {
      const res = await api.auditLog(token, beforeId);
      setEntries((prev) => (beforeId && prev ? [...prev, ...res.entries] : res.entries));
      setHasMore(res.entries.length === 50);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  if (error) return <div className="error-box">{error}</div>;
  if (!entries) return <div>Loading audit log...</div>;

  return (
    <div className="card">
      <h2>Audit log</h2>
      <p className="hint" style={{ marginTop: -6 }}>
        Every mutating action across the app (assignments, reviews, uploads, admin changes, both assistants), most recent first.
      </p>
      <table>
        <thead>
          <tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Detail</th></tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td>{new Date(e.created_at).toLocaleString()}</td>
              <td>{e.actor_name ? `${e.actor_name} (${e.actor_role})` : "—"}</td>
              <td>{e.action}</td>
              <td>{e.entity}{e.entity_id ? ` #${e.entity_id}` : ""}</td>
              <td className="hint" style={{ margin: 0, maxWidth: 320, overflowWrap: "break-word" }}>
                {JSON.stringify(e.detail)}
              </td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--gray)", padding: 24 }}>No audit log entries yet.</td></tr>
          )}
        </tbody>
      </table>
      {hasMore && entries.length > 0 && (
        <button className="secondary small" style={{ marginTop: 12 }} onClick={() => load(entries[entries.length - 1].id)}>
          Load more
        </button>
      )}
    </div>
  );
}

export default function AdminConsolePage() {
  const { user } = useAuth();
  const [section, setSection] = useState("caseload");

  return (
    <div>
      {user.role === "admin" && (
        <div className="tabs" style={{ marginBottom: 18 }}>
          <button className={section === "caseload" ? "active" : ""} onClick={() => setSection("caseload")}>Caseload &amp; Coverage</button>
          <button className={section === "staff" ? "active" : ""} onClick={() => setSection("staff")}>Staff Accounts</button>
          <button className={section === "audit" ? "active" : ""} onClick={() => setSection("audit")}>Audit Log</button>
        </div>
      )}
      {section === "caseload" && <CaseloadSection />}
      {section === "staff" && <StaffAccountsSection />}
      {section === "audit" && <AuditLogSection />}
    </div>
  );
}
