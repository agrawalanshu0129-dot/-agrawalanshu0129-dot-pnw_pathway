import { useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext";

const REPLY_POLL_MS = 2500;
const REPLY_POLL_ATTEMPTS = 6; // ~15s, comfortably longer than the simulated-reply delay

// Reusable thread, mirroring AssistantWidget's askFn pattern: `loadFn(token)`
// and `sendFn(token, body)` let this same component drive either the
// student's own thread or a staff member's view of a specific student's
// thread without duplicating the chat UI.
//
// `otherPartyName` labels the typing indicator; `simulateReplies` turns that
// indicator on after a send (only meaningful on the student's own thread,
// where the backend may insert a simulated demo reply a few seconds later).
export default function MessageThread({ loadFn, sendFn, otherPartyName, simulateReplies }) {
  const { token, user } = useAuth();
  const [messages, setMessages] = useState(null);
  const [body, setBody] = useState("");
  const [loadError, setLoadError] = useState("");
  const [sendError, setSendError] = useState("");
  const [sending, setSending] = useState(false);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const boxRef = useRef(null);
  const pollTimer = useRef(null);

  async function load() {
    try {
      const res = await loadFn(token);
      setMessages(res.messages);
      return res.messages;
    } catch (err) {
      setLoadError(err.message);
      return null;
    }
  }

  useEffect(() => {
    load();
    return () => clearTimeout(pollTimer.current);
  }, []); // eslint-disable-line

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [messages]);

  function pollForReply(afterMessageId, attemptsLeft) {
    pollTimer.current = setTimeout(async () => {
      const fresh = await load();
      const gotReply = fresh && fresh.some((m) => m.id > afterMessageId && m.sender_user_id !== user.id);
      if (gotReply || attemptsLeft <= 1) {
        setAwaitingReply(false);
      } else {
        pollForReply(afterMessageId, attemptsLeft - 1);
      }
    }, REPLY_POLL_MS);
  }

  async function send(e) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setSending(true);
    setSendError("");
    try {
      const lastIdBefore = messages && messages.length > 0 ? messages[messages.length - 1].id : 0;
      await sendFn(token, text);
      setBody("");
      await load();
      if (simulateReplies) {
        setAwaitingReply(true);
        pollForReply(lastIdBefore, REPLY_POLL_ATTEMPTS);
      }
    } catch (err) {
      setSendError(err.message);
    } finally {
      setSending(false);
    }
  }

  if (loadError) return <div className="error-box">{loadError}</div>;
  if (!messages) return <div>Loading messages...</div>;

  return (
    <div>
      {sendError && <div className="error-box" style={{ marginBottom: 10 }}>{sendError}</div>}
      <div className="chat-box" ref={boxRef}>
        {messages.length === 0 && <div className="hint">No messages yet. Say hello.</div>}
        {messages.map((m) => (
          <div className={`chat-msg ${m.sender_user_id === user.id ? "user" : ""}`} key={m.id}>
            <div className="role">
              {m.sender_user_id === user.id ? "You" : `${m.sender_name} (${m.sender_role})`}
            </div>
            <div className="bubble">{m.body}</div>
            <div className="sources">
              {new Date(m.created_at).toLocaleString()}
              {m.is_simulated && <span title="Auto-generated for this demo, not a real staff reply"> &middot; Automated demo reply</span>}
            </div>
          </div>
        ))}
        {awaitingReply && (
          <div className="chat-msg">
            <div className="role">{otherPartyName || "They"}</div>
            <div className="bubble hint" style={{ margin: 0, fontStyle: "italic" }}>typing&hellip;</div>
          </div>
        )}
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
