import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";

const PROGRAMS = [
  "BS Business Administration", "BS Computer Science", "MS Computer Science",
  "MBA", "MS Data Analytics", "BA Communications",
];
const COUNTRIES = ["India", "China", "South Korea", "Nigeria", "Brazil", "Vietnam", "Mexico", "Other"];

export default function OnboardingPage({ onDone }) {
  const { token } = useAuth();
  const [population, setPopulation] = useState("");
  const [program, setProgram] = useState("");
  const [country, setCountry] = useState("");
  const [fundingType, setFundingType] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.onboard(token, {
        population,
        program,
        country: population === "international" ? country : null,
        funding_type: population === "international" ? fundingType : null,
      });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Complete your profile</h1>
        <p className="subtitle">This generates your personalized requirement checklist (FR1, FR2).</p>

        {error && <div className="error-box">{error}</div>}

        <form onSubmit={submit}>
          <label>I am a...</label>
          <select value={population} onChange={(e) => setPopulation(e.target.value)} required>
            <option value="">Select one</option>
            <option value="domestic">Domestic student</option>
            <option value="international">International student</option>
          </select>

          <label>Program</label>
          <select value={program} onChange={(e) => setProgram(e.target.value)} required>
            <option value="">Select a program</option>
            {PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>

          {population === "international" && (
            <>
              <label>Country</label>
              <select value={country} onChange={(e) => setCountry(e.target.value)} required>
                <option value="">Select a country</option>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>

              <label>Funding type</label>
              <select value={fundingType} onChange={(e) => setFundingType(e.target.value)} required>
                <option value="">Select funding type</option>
                <option value="self">Self-funded</option>
                <option value="family">Family-funded</option>
                <option value="sponsored">Government / employer sponsored</option>
                <option value="assistantship">Graduate assistantship</option>
              </select>
              <p className="hint">Your checklist changes based on funding type.</p>
            </>
          )}

          <button className="primary" disabled={loading}>
            {loading ? "Generating checklist..." : "Generate my checklist"}
          </button>
        </form>
      </div>
    </div>
  );
}
