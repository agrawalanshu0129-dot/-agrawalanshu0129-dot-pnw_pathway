import { useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext";

// Reusable thread, mirroring AssistantWidget's askFn pattern: `loadFn(token)`
// and `sendFn(token, body)` let this same component drive either the
// student's own thread or a staff member's view of a specific student's
// thread without duplicating the chat UI.
export default function MessageThread({ loadFn, sendFn }) {
  const { token, user } = useAuth();
  const [messages, setMessages] = useState(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const boxRef = useRef(null);

  async function load() {
    try {
      const res = await loadFn(token);
      setMessages(res.messages);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [messages]);

  async function send(e) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setSending(true);
    setError("");
    try {
      await sendFn(token, text);
      setBody("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  if (error) return <div className="error-box">{error}</div>;
  if (!messages) return <div>Loading messages...</div>;

  return (
    <div>
      <div className="chat-box" ref={boxRef}>
        {messages.length === 0 && <div className="hint">No messages yet. Say hello.</div>}
        {messages.map((m) => (
          <div className={`chat-msg ${m.sender_user_id === user.id ? "user" : ""}`} key={m.id}>
            <div className="role">
              {m.sender_user_id === user.id ? "You" : `${m.sender_name} (${m.sender_role})`}
            </div>
            <div className="bubble">{m.body}</div>
            <div className="sources">{new Date(m.created_at).toLocaleString()}</div>
          </div>
        ))}
      </div>
      <form className="chat-input-row" onSubmit={send}>
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a message..."
          disabled={sending}
        />
        <button className="primary" disabled={sending}>Send</button>
      </form>
    </div>
  );
}
