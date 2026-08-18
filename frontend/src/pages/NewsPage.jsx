import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";

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

        <div className="demo-box" style={{ marginTop: 0, marginBottom: 20 }}>
          {data.disclaimer}
        </div>

        {data.items.map((item, idx) => (
          <div key={idx} style={{ marginBottom: 18 }}>
            <h2 style={{ fontSize: "1.05rem", marginBottom: 6 }}>{item.title}</h2>
            <div style={{ whiteSpace: "pre-wrap", fontSize: "0.92rem", lineHeight: 1.55 }}>{item.text}</div>
          </div>
        ))}

        {data.sources.length > 0 && (
          <div className="hint" style={{ marginTop: 20, marginBottom: 0 }}>
            Sources: {data.sources.join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}
