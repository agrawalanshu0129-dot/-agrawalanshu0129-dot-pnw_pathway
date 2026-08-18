import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDayLabel(d) {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(d) {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// Under Messages: shows the student's booked appointments plus a picker for
// their assigned ISS contact's open 30-minute slots. Availability is
// computed server-side from fixed business hours (see
// backend/src/routes/appointments.js) -- there's no staff-editable calendar
// to pull from in this prototype.
export default function ScheduleAppointment() {
  const { token } = useAuth();
  const [myAppointments, setMyAppointments] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [open, setOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadAppointments() {
    try {
      const res = await api.myAppointments(token);
      setMyAppointments(res.appointments);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { loadAppointments(); }, []); // eslint-disable-line

  async function openPicker() {
    setOpen(true);
    setError("");
    if (!availability) {
      try {
        const res = await api.appointmentAvailability(token);
        setAvailability(res);
        const firstDay = res.slots.length > 0 ? dayKey(new Date(res.slots[0])) : null;
        setSelectedDay(firstDay);
      } catch (err) {
        setError(err.message);
      }
    }
  }

  async function book(iso) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await api.bookAppointment(token, iso);
      const start = new Date(res.start_time);
      setNotice(`Booked for ${formatDayLabel(start)} at ${formatTime(start)} — 30 min with ${res.staff_name}.`);
      setOpen(false);
      setAvailability(null);
      await loadAppointments();
    } catch (err) {
      setError(err.message);
      setAvailability(null); // the slot list may be stale (e.g. someone else just booked it); refetch next open
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id) {
    if (!window.confirm("Cancel this appointment?")) return;
    setError("");
    setNotice("");
    try {
      await api.cancelAppointment(token, id);
      await loadAppointments();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!myAppointments) return null;

  const byDay = {};
  if (availability) {
    for (const iso of availability.slots) {
      const d = new Date(iso);
      const key = dayKey(d);
      (byDay[key] = byDay[key] || []).push({ iso, date: d });
    }
  }
  const dayKeys = Object.keys(byDay);

  return (
    <div className="card">
      <h2>Appointments</h2>

      {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}
      {notice && <div className="hint" style={{ color: "var(--green)", marginTop: -6 }}>{notice}</div>}

      {myAppointments.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          {myAppointments.map((a) => {
            const start = new Date(a.start_time);
            return (
              <div
                key={a.id}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 12px", background: "var(--surface-alt)", borderRadius: 6, marginBottom: 6,
                }}
              >
                <div className="hint" style={{ margin: 0, color: "var(--text)" }}>
                  <strong>{formatDayLabel(start)}</strong> at {formatTime(start)} &middot; 30 min with {a.staff_name}
                </div>
                <button className="danger small" onClick={() => cancel(a.id)}>Cancel</button>
              </div>
            );
          })}
        </div>
      )}

      {!open ? (
        <button className="secondary small" onClick={openPicker}>Schedule appointment</button>
      ) : (
        <div>
          {!availability ? (
            <p className="hint" style={{ marginTop: 0 }}>Loading availability...</p>
          ) : !availability.staff ? (
            <p className="hint" style={{ marginTop: 0, marginBottom: 0 }}>Your ISS contact hasn't been assigned yet.</p>
          ) : dayKeys.length === 0 ? (
            <p className="hint" style={{ marginTop: 0, marginBottom: 0 }}>No open slots in the next two weeks &mdash; check back soon.</p>
          ) : (
            <div>
              <p className="hint" style={{ marginTop: 0 }}>Pick a day, then a 30-minute slot with {availability.staff.full_name}.</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                {dayKeys.map((key) => (
                  <button
                    key={key}
                    className={selectedDay === key ? "primary small" : "secondary small"}
                    onClick={() => setSelectedDay(key)}
                  >
                    {formatDayLabel(byDay[key][0].date)}
                  </button>
                ))}
              </div>
              {selectedDay && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {byDay[selectedDay].map((slot) => (
                    <button
                      key={slot.iso}
                      className="secondary small"
                      disabled={busy}
                      onClick={() => book(slot.iso)}
                    >
                      {formatTime(slot.date)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button className="secondary small" style={{ marginTop: 12 }} onClick={() => setOpen(false)}>Close</button>
        </div>
      )}
    </div>
  );
}
