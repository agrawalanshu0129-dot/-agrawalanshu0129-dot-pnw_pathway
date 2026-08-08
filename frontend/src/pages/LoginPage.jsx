import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", full_name: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      if (mode === "forgot") {
        const res = await api.forgotPassword(form.email);
        setNotice(res.message);
      } else {
        const data = mode === "login"
          ? await api.login({ email: form.email, password: form.password })
          : await api.register(form);
        login(data.token, data.user);
      }
    } catch (err) {
      setError(err.message + (err.message.includes("fetch") ? " (backend may be waking up, try again in 30s)" : ""));
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(email) {
    setMode("login");
    setForm({ email, password: "Demo1234!", full_name: "" });
  }

  function switchMode(next) {
    setMode(next);
    setError("");
    setNotice("");
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>PNW Pathway</h1>
        <p className="subtitle">Student journey &amp; requirements tracker</p>

        {error && <div className="error-box">{error}</div>}
        {notice && <div className="hint" style={{ color: "#2c5f2d", marginTop: -4 }}>{notice}</div>}

        <form onSubmit={submit}>
          {mode === "register" && (
            <>
              <label>Full name</label>
              <input value={form.full_name} onChange={set("full_name")} required />
            </>
          )}
          <label>Email</label>
          <input type="email" value={form.email} onChange={set("email")} required />
          {mode !== "forgot" && (
            <>
              <label>Password</label>
              <input type="password" value={form.password} onChange={set("password")} required minLength={8} />
            </>
          )}
          <button className="primary" style={{ width: "100%" }} disabled={loading}>
            {loading ? "Please wait..." : mode === "login" ? "Log in" : mode === "register" ? "Create account" : "Send reset link"}
          </button>
        </form>

        <div className="toggle-row">
          {mode === "login" && (
            <>
              New student? <button onClick={() => switchMode("register")}>Create an account</button>
              {" · "}
              <button onClick={() => switchMode("forgot")}>Forgot password?</button>
            </>
          )}
          {mode === "register" && (
            <>Already have an account? <button onClick={() => switchMode("login")}>Log in</button></>
          )}
          {mode === "forgot" && (
            <>Remembered it? <button onClick={() => switchMode("login")}>Log in</button></>
          )}
        </div>

        {mode === "login" && (
          <div className="demo-box">
            <strong>Demo accounts</strong> (password: Demo1234!)<br />
            <button className="secondary small" style={{marginTop:6, marginRight:6}} onClick={() => fillDemo("staff@pnwu.edu")}>Staff (ISS)</button>
            <button className="secondary small" style={{marginTop:6, marginRight:6}} onClick={() => fillDemo("student.intl@pnwu.edu")}>Int'l student</button>
            <button className="secondary small" style={{marginTop:6}} onClick={() => fillDemo("student.domestic@pnwu.edu")}>Domestic student</button>
          </div>
        )}
      </div>
    </div>
  );
}
