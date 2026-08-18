import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";

function formatDate(dateStr) {
  if (!dateStr) return "General guidance";
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function NewsPage() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.news(token).then(setData).catch((err) => setError(err.message));
  }, [token]);

  if (error) return <div className="container"><div className="error-box">{error}</div></div>;
  if (!data) return <div className="container">Loading news...</div>;

  return (
    <div className="container">
      <div className="card">
        <h1>Immigration &amp; Visa News</h1>
        <p className="subtitle" style={{ marginBottom: 14 }}>
          Recent official updates that may affect F-1/J-1 students, pulled only from vetted government sources.
        </p>
        <div className="demo-box" style={{ marginTop: 0 }}>
          {data.disclaimer}
        </div>
      </div>

      {data.items.length === 0 && (
        <div className="card">
          <p className="hint" style={{ marginTop: 0, marginBottom: 0 }}>
            No new official updates found in the last 60 days. Check back later, or visit{" "}
            <a href="https://www.uscis.gov/newsroom" target="_blank" rel="noopener noreferrer">USCIS Newsroom</a> directly.
          </p>
        </div>
      )}

      {data.items.map((item, idx) => (
        <div className="card" key={idx}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
            <h2 style={{ fontSize: "1.05rem", margin: 0 }}>{item.headline}</h2>
            <span className="hint" style={{ margin: 0, whiteSpace: "nowrap", flexShrink: 0 }}>{formatDate(item.date)}</span>
          </div>
          <div className="hint" style={{ marginTop: 0, marginBottom: 10 }}>
            Source:{" "}
            <a href={item.source_url} target="_blank" rel="noopener noreferrer">{item.source_name || item.source_url}</a>
          </div>
          <div style={{ fontSize: "0.92rem", lineHeight: 1.55, marginBottom: item.relevance_note ? 10 : 0 }}>{item.summary}</div>
          {item.relevance_note && (
            <div style={{ fontSize: "0.85rem", lineHeight: 1.5, fontStyle: "italic", color: "#33404f" }}>
              {item.relevance_note}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
