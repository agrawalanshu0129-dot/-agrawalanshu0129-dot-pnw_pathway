import { useState } from "react";

export default function BudgetCalculator({ estimate }) {
  const [income, setIncome] = useState("");
  const total =
    estimate.housing_1br + estimate.food + estimate.transportation + estimate.utilities + estimate.healthcare_misc;
  const monthlyIncome = parseFloat(income) || 0;
  const remaining = monthlyIncome - total;

  const rows = [
    { label: "Housing (1BR)", value: estimate.housing_1br },
    { label: "Food", value: estimate.food },
    { label: "Transportation", value: estimate.transportation },
    { label: "Utilities", value: estimate.utilities },
    { label: "Healthcare & misc.", value: estimate.healthcare_misc },
  ];

  return (
    <div>
      <label>Your expected monthly income (stipend, assistantship, savings draw, etc.)</label>
      <input
        type="number"
        placeholder="e.g. 2800"
        value={income}
        onChange={(e) => setIncome(e.target.value)}
        style={{ maxWidth: 220 }}
      />

      <table style={{ marginTop: 10 }}>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td style={{ textAlign: "right" }}>${r.value.toLocaleString()}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: 700 }}>
            <td>Estimated total</td>
            <td style={{ textAlign: "right" }}>${total.toLocaleString()}</td>
          </tr>
          {monthlyIncome > 0 && (
            <tr style={{ fontWeight: 700, color: remaining >= 0 ? "#2c5f2d" : "#8a2f2f" }}>
              <td>{remaining >= 0 ? "Left over" : "Shortfall"}</td>
              <td style={{ textAlign: "right" }}>${Math.abs(remaining).toLocaleString()}</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="hint" style={{ marginTop: 10 }}>
        Based on curated Seattle, WA averages for a single adult. A roommate typically cuts the housing line
        significantly, since 2-bedroom rent splits well below two separate 1-bedrooms.
      </p>
    </div>
  );
}
