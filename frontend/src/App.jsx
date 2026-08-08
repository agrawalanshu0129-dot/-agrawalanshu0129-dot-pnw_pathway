import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./AuthContext";
import LoginPage from "./pages/LoginPage";
import OnboardingPage from "./pages/OnboardingPage";
import StudentChecklistPage from "./pages/StudentChecklistPage";
import StaffDashboardPage from "./pages/StaffDashboardPage";
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

  useEffect(() => {
    api.myChecklist(token)
      .then(() => setNeedsOnboarding(false))
      .catch(() => setNeedsOnboarding(true))
      .finally(() => setChecked(true));
  }, [token]);

  if (!checked) return <div className="container">Loading...</div>;
  if (needsOnboarding) return <OnboardingPage onDone={() => setNeedsOnboarding(false)} />;
  return <StudentChecklistPage />;
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
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
