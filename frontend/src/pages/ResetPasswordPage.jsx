import { useState } from "react";
import { api } from "../api";

export default function ResetPasswordPage({ token }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.resetPassword(token, password);
      setNotice(res.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function goToLogin() {
    window.location.href = window.location.pathname;
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>PNW Pathway</h1>
        <p className="subtitle">Set a new password</p>

        {error && <div className="error-box">{error}</div>}

        {notice ? (
          <>
            <div className="hint" style={{ color: "var(--green)", marginTop: -4 }}>{notice}</div>
            <button className="primary" style={{ width: "100%", marginTop: 12 }} onClick={goToLogin}>
              Go to login
            </button>
          </>
        ) : (
          <form onSubmit={submit}>
            <label>New password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            <label>Confirm new password</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
            <button className="primary" style={{ width: "100%" }} disabled={loading}>
              {loading ? "Please wait..." : "Reset password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
