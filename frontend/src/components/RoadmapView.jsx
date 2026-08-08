function fmtDate(d) {
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const STAGE_STYLE = {
  done: { dot: "#2c5f2d", text: "#2c5f2d", label: "Done" },
  current: { dot: "#1f3864", text: "#1f3864", label: "You are here" },
  upcoming: { dot: "#b8cdeb", text: "#5a6472", label: "Upcoming" },
};

export default function RoadmapView({ roadmap }) {
  if (!roadmap || roadmap.length === 0) return null;

  const current = roadmap.find((r) => r.stage === "current");
  const nextUp = roadmap.filter((r) => r.stage === "upcoming").slice(0, 3);

  return (
    <div className="card">
      <h2>Your journey</h2>
      {current ? (
        <p className="hint" style={{ marginTop: -6 }}>
          You're on <strong style={{ color: "#1f3864" }}>{current.title}</strong>, due {fmtDate(current.due_date)}.
          {nextUp.length > 0 && ` After that: ${nextUp.map((n) => n.title).join(" \u2192 ")}.`}
        </p>
      ) : (
        <p className="hint" style={{ marginTop: -6 }}>All requirements are approved. Nothing left in your journey.</p>
      )}

      <div style={{ display: "flex", overflowX: "auto", gap: 0, paddingBottom: 8, paddingTop: 6 }}>
        {roadmap.map((step, i) => {
          const style = STAGE_STYLE[step.stage];
          return (
            <div key={step.id} style={{ display: "flex", alignItems: "flex-start", minWidth: 150, flexShrink: 0 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 150 }}>
                <div
                  title={style.label}
                  style={{
                    width: step.stage === "current" ? 16 : 12,
                    height: step.stage === "current" ? 16 : 12,
                    borderRadius: "50%",
                    background: style.dot,
                    border: step.stage === "current" ? "3px solid #b8cdeb" : "none",
                    marginBottom: 6,
                  }}
                />
                <div style={{ fontSize: 12, fontWeight: step.stage === "current" ? 700 : 500, color: style.text, textAlign: "center", padding: "0 4px" }}>
                  {step.title}
                </div>
                <div style={{ fontSize: 11, color: "#5a6472", marginTop: 2 }}>
                  {step.stage === "done" ? "\u2713 Approved" : `ETA ${fmtDate(step.due_date)}`}
                </div>
                {step.visa_critical && <div className="badge visa" style={{ marginTop: 4 }}>Visa</div>}
              </div>
              {i < roadmap.length - 1 && (
                <div style={{ height: 2, width: 32, background: "#d9dfe8", marginTop: step.stage === "current" ? 8 : 6, flexShrink: 0 }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
