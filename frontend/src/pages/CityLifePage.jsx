import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import AssistantWidget from "../components/AssistantWidget";
import BudgetCalculator from "../components/BudgetCalculator";

export default function CityLifePage() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.cityInfo(token).then(setData).catch((e) => setError(e.message));
  }, [token]);

  if (error) return <div className="container"><div className="error-box">{error}</div></div>;
  if (!data) return <div className="container">Loading...</div>;

  const { cost_of_living, neighborhoods, transit, transit_note } = data;

  return (
    <div className="container">
      <div className="card">
        <h1>Settling in: Everett, WA</h1>
        <p className="subtitle">
          Cost of living, housing, and getting around, curated for PNW University students. Figures are estimates
          as of {cost_of_living.as_of}, verify current numbers before making decisions.
        </p>
        <div className="summary-grid">
          <div className="stat">
            <div className="num">{cost_of_living.cost_of_living_index}</div>
            <div className="label">Cost-of-living index (US avg = 100)</div>
          </div>
          <div className="stat">
            <div className="num">${cost_of_living.rent_ranges.one_bedroom[0].toLocaleString()}-{cost_of_living.rent_ranges.one_bedroom[1].toLocaleString()}</div>
            <div className="label">Typical 1BR rent range</div>
          </div>
          <div className="stat">
            <div className="num">{transit.length}</div>
            <div className="label">Transit agencies serving Everett</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Budget calculator</h2>
        <BudgetCalculator estimate={cost_of_living.monthly_estimate_single_adult} />
      </div>

      <div className="card">
        <h2>Neighborhoods</h2>
        <table>
          <thead><tr><th>Neighborhood</th><th>Vibe</th><th>Approx. 1BR rent</th></tr></thead>
          <tbody>
            {neighborhoods.map((n) => (
              <tr key={n.name}>
                <td><strong>{n.name}</strong></td>
                <td>{n.vibe}</td>
                <td>${n.approx_1br_rent.toLocaleString()}/mo</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Getting around</h2>
        <p className="hint" style={{ marginTop: -6 }}>{transit_note}</p>
        {transit.map((t) => (
          <div className="checklist-item" key={t.agency}>
            <div>
              <div className="title-row">{t.agency}</div>
              <div className="meta">{t.covers}</div>
              <div className="meta"><em>{t.good_for}</em></div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Ask about life in Everett</h2>
        <p className="hint" style={{ marginTop: -6 }}>
          Separate from the requirements assistant, this one can search the web for current prices, transit changes,
          and similar day-to-day questions. Not for visa or enrollment questions, use the requirements assistant on
          your checklist page for those.
        </p>
        <AssistantWidget
          askFn={api.askCityAssistant}
          placeholder="Ask about housing, transit, budgeting..."
          examples={'Try asking: "What is a realistic monthly budget for a grad student?" or "How do I get from Everett Station to Seattle?"'}
        />
      </div>
    </div>
  );
}
