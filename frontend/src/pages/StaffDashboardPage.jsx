import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import AssistantWidget from "../components/AssistantWidget";

export default function StaffDashboardPage() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [population, setPopulation] = useState("");
  const [program, setProgram] = useState("");
  const [tab, setTab] = useState("students");

  async function load() {
    try {
      const params = {};
      if (population) params.population = population;
      if (program) params.program = program;
      const res = await api.dashboard(token, params);
      setData(res);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, [population, program]); // eslint-disable-line

  if (error) return <div className="container wide"><div className="error-box">{error}</div></div>;
  if (!data) return <div className="container wide">Loading dashboard...</div>;

  const { students, summary } = data;
  const atRiskStudents = students.filter((s) => s.at_risk);

  return (
    <div className="container wide">
      <h1>Staff Dashboard</h1>
      <p className="subtitle">International Student Services &amp; Registrar view</p>

      <div className="summary-grid">
        <div className="stat"><div className="num">{summary.total_students}</div><div className="label">Students onboarded</div></div>
        <div className="stat"><div className="num" style={{ color: summary.at_risk_count > 0 ? "#8a2f2f" : "#2c5f2d" }}>{summary.at_risk_count}</div><div className="label">At-risk students</div></div>
        <div className="stat"><div className="num">{summary.avg_percent_complete}%</div><div className="label">Avg. completion</div></div>
      </div>

      <div className="tabs">
        <button className={tab === "students" ? "active" : ""} onClick={() => setTab("students")}>All Students</button>
        <button className={tab === "atrisk" ? "active" : ""} onClick={() => setTab("atrisk")}>At-Risk Queue ({atRiskStudents.length})</button>
        <button className={tab === "assistant" ? "active" : ""} onClick={() => setTab("assistant")}>Ask Assistant</button>
      </div>

      {tab !== "assistant" && (
        <div className="card">
          <div className="filters">
            <div>
              <label>Population</label>
              <select value={population} onChange={(e) => setPopulation(e.target.value)}>
                <option value="">All</option>
                <option value="domestic">Domestic</option>
                <option value="international">International</option>
              </select>
            </div>
            <div>
              <label>Program contains</label>
              <input value={program} onChange={(e) => setProgram(e.target.value)} placeholder="e.g. Computer Science" />
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Student</th><th>Population</th><th>Program</th><th>Progress</th><th>Overdue</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(tab === "atrisk" ? atRiskStudents : students).map((s) => (
                <tr key={s.id} className={s.at_risk ? "risk-row" : ""}>
                  <td><strong>{s.full_name}</strong><br /><span className="hint" style={{margin:0}}>{s.email}</span></td>
                  <td style={{ textTransform: "capitalize" }}>{s.population}{s.country ? ` (${s.country})` : ""}</td>
                  <td>{s.program}</td>
                  <td>{s.completed_items}/{s.total_items} &middot; {s.percent_complete}%</td>
                  <td>{s.overdue_count > 0 ? s.overdue_count : "\u2014"}</td>
                  <td>
                    {s.at_risk
                      ? <span className="badge risk">At risk</span>
                      : <span className="badge ok">On track</span>}
                    {s.risk_reasons.length > 0 && <div className="hint" style={{marginTop:4, marginBottom:0}}>{s.risk_reasons.join("; ")}</div>}
                  </td>
                </tr>
              ))}
              {(tab === "atrisk" ? atRiskStudents : students).length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: "center", color: "#5a6472", padding: 24 }}>No students match this view.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "assistant" && (
        <div className="card">
          <h2>Ask the requirements assistant</h2>
          <p className="hint" style={{marginTop: -6}}>Same assistant students use, so staff can verify what students are being told.</p>
          <AssistantWidget />
        </div>
      )}
    </div>
  );
}
