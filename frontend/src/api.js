const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

async function request(path, { method = "GET", token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

// Downloads a document and opens it in a new tab, rather than following a
// plain <a href> (the endpoint requires the same Bearer token as every
// other API call, so it can't be a bare link).
async function openDocument(path, token) {
  const res = await fetch(`${BASE_URL}/api${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Could not load document (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Triggers a browser "Save As" for an authenticated endpoint's response,
// since a plain <a href> can't carry the Bearer token this API requires.
async function downloadFile(path, token, filename) {
  const res = await fetch(`${BASE_URL}/api${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Could not download file (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const api = {
  register: (body) => request("/auth/register", { method: "POST", body }),
  login: (body) => request("/auth/login", { method: "POST", body }),

  onboard: (token, body) => request("/students/onboard", { method: "POST", token, body }),
  myChecklist: (token) => request("/students/me/checklist", { token }),
  updateMyItem: (token, itemId, status) =>
    request(`/students/me/checklist/${itemId}`, { method: "PATCH", token, body: { status } }),

  dashboard: (token, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/dashboard${qs ? `?${qs}` : ""}`, { token });
  },
  studentDetail: (token, studentId) => request(`/dashboard/${studentId}`, { token }),
  sendReminders: (token, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/dashboard/remind${qs ? `?${qs}` : ""}`, { method: "POST", token });
  },
  reviewItem: (token, studentId, itemId, status, reviewer_note) =>
    request(`/students/${studentId}/checklist/${itemId}/review`, {
      method: "PATCH", token, body: { status, reviewer_note },
    }),

  uploadMyDocument: async (token, itemId, file) => {
    const content_base64 = await fileToBase64(file);
    return request(`/students/me/checklist/${itemId}/document`, {
      method: "POST", token, body: { filename: file.name, mime_type: file.type, content_base64 },
    });
  },
  openMyDocument: (token, itemId) => openDocument(`/students/me/checklist/${itemId}/document`, token),
  openStudentDocument: (token, studentId, itemId) =>
    openDocument(`/students/${studentId}/checklist/${itemId}/document`, token),

  askAssistant: (token, question) => request("/ai/ask", { method: "POST", token, body: { question } }),

  cityInfo: (token) => request("/city/info", { token }),
  askCityAssistant: (token, question) => request("/city/ask", { method: "POST", token, body: { question } }),

  news: (token) => request("/news", { token }),

  downloadMyCalendar: (token) => downloadFile("/students/me/checklist.ics", token, "pnw-pathway-deadlines.ics"),

  myMessages: (token) => request("/messages/me", { token }),
  sendMyMessage: (token, body) => request("/messages/me", { method: "POST", token, body: { body } }),
  studentMessages: (token, studentId) => request(`/messages/${studentId}`, { token }),
  sendStudentMessage: (token, studentId, body) =>
    request(`/messages/${studentId}`, { method: "POST", token, body: { body } }),

  assignments: (token, mine) => request(`/assignments${mine ? "?mine=true" : ""}`, { token }),
  assignableStaff: (token) => request("/assignments/staff", { token }),
  unassignedStudents: (token) => request("/assignments/unassigned", { token }),
  assignStudent: (token, student_id, staff_user_id) =>
    request("/assignments", { method: "POST", token, body: { student_id, staff_user_id } }),
  reassignCaseload: (token, from_staff_user_id, to_staff_user_id) =>
    request("/assignments/reassign", { method: "POST", token, body: { from_staff_user_id, to_staff_user_id } }),
  endAssignment: (token, id) => request(`/assignments/${id}/end`, { method: "PATCH", token }),

  adminUsers: (token, role) => request(`/admin/users${role ? `?role=${role}` : ""}`, { token }),
  createStaffUser: (token, body) => request("/admin/users", { method: "POST", token, body }),
  changeUserRole: (token, id, role) =>
    request(`/admin/users/${id}/role`, { method: "PATCH", token, body: { role } }),
  auditLog: (token, beforeId) => request(`/admin/audit-log${beforeId ? `?before_id=${beforeId}` : ""}`, { token }),

  forgotPassword: (email) => request("/auth/forgot-password", { method: "POST", body: { email } }),
  resetPassword: (reset_token, new_password) =>
    request("/auth/reset-password", { method: "POST", body: { reset_token, new_password } }),
};
