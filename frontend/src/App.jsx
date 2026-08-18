import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./AuthContext";
import LoginPage from "./pages/LoginPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import OnboardingPage from "./pages/OnboardingPage";
import StudentChecklistPage from "./pages/StudentChecklistPage";
import StudentDashboardPage from "./pages/StudentDashboardPage";
import NewsPage from "./pages/NewsPage";
import StaffDashboardPage from "./pages/StaffDashboardPage";
import CityLifePage from "./pages/CityLifePage";
import { api } from "./api";
import "./styles.css";

function TopBar() {
  const { user, logout } = useAuth();
  return (
    <div className="topbar">
      <div className="brand">PNW Pathway <span>Student Journey &amp; Requirements Tracker</span></div>
      <div className="who">
        {user.full_name} &middot; <span style={{ textTransform: "capitalize" }}>{user.role}</span>
        <button className="link" onClick={logout}>Log out</button>
      </div>
    </div>
  );
}

function StudentArea() {
  const { token } = useAuth();
  const [checked, setChecked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [tab, setTab] = useState("checklist");

  useEffect(() => {
    api.myChecklist(token)
      .then(() => setNeedsOnboarding(false))
      .catch(() => setNeedsOnboarding(true))
      .finally(() => setChecked(true));
  }, [token]);

  if (!checked) return <div className="container">Loading...</div>;
  if (needsOnboarding) return <OnboardingPage onDone={() => setNeedsOnboarding(false)} />;

  return (
    <div>
      <div className="container" style={{ paddingBottom: 0, paddingTop: 20 }}>
        <div className="tabs">
          <button className={tab === "checklist" ? "active" : ""} onClick={() => setTab("checklist")}>My Checklist</button>
          <button className={tab === "citylife" ? "active" : ""} onClick={() => setTab("citylife")}>Settling In: Everett</button>
          <button className={tab === "news" ? "active" : ""} onClick={() => setTab("news")}>News</button>
          <button className={tab === "dashboard" ? "active" : ""} onClick={() => setTab("dashboard")}>Dashboard</button>
        </div>
      </div>
      {tab === "checklist" && <StudentChecklistPage />}
      {tab === "citylife" && <CityLifePage />}
      {tab === "news" && <NewsPage />}
      {tab === "dashboard" && <StudentDashboardPage />}
    </div>
  );
}

function Shell() {
  const { token, user } = useAuth();
  if (!token || !user) return <LoginPage />;

  return (
    <div className="app-shell">
      <TopBar />
      {user.role === "student" ? <StudentArea /> : <StaffDashboardPage />}
      <div className="footer-note">
        PNW Pathway &middot; ITEC 6993 IT Capstone prototype &middot; not affiliated with a real university system
      </div>
    </div>
  );
}

export default function App() {
  const resetToken = new URLSearchParams(window.location.search).get("reset_token");
  if (resetToken) return <ResetPasswordPage token={resetToken} />;

  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
