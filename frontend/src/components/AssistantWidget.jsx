import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";

export default function AssistantWidget() {
  const { token } = useAuth();
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);

  async function ask(e) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setQuestion("");
    setLoading(true);
    try {
      const res = await api.askAssistant(token, q);
      setMessages((m) => [...m, { role: "assistant", text: res.answer, sources: res.sources }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", text: `Error: ${err.message}`, sources: [] }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="chat-box">
        {messages.length === 0 && (
          <div className="hint">Try asking: "When do I need to pay the SEVIS fee?" or "What financial documents do I need as a sponsored student?"</div>
        )}
        {messages.map((m, i) => (
          <div className={`chat-msg ${m.role}`} key={i}>
            <div className="role">{m.role === "user" ? "You" : "Assistant"}</div>
            <div className="bubble">{m.text}</div>
            {m.sources && m.sources.length > 0 && (
              <div className="sources">Sources: {m.sources.join(", ")}</div>
            )}
          </div>
        ))}
        {loading && <div className="chat-msg assistant"><div className="role">Assistant</div><div className="bubble">Thinking...</div></div>}
      </div>
      <form className="chat-input-row" onSubmit={ask}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about a requirement..."
        />
        <button className="primary" disabled={loading}>Ask</button>
      </form>
    </div>
  );
}
