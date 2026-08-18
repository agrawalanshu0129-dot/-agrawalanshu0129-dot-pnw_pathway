import { api } from "../api";
import MessageThread from "../components/MessageThread";

export default function MessagesPage() {
  return (
    <div className="container">
      <div className="card">
        <h1>Messages</h1>
        <p className="subtitle" style={{ marginBottom: 14 }}>A direct line to your ISS contact.</p>
        <MessageThread loadFn={api.myMessages} sendFn={api.sendMyMessage} />
      </div>
    </div>
  );
}
