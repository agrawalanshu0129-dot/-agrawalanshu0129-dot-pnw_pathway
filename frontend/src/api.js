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
  reviewItem: (token, studentId, itemId, status, reviewer_note) =>
    request(`/students/${studentId}/checklist/${itemId}/review`, {
      method: "PATCH", token, body: { status, reviewer_note },
    }),

  askAssistant: (token, question) => request("/ai/ask", { method: "POST", token, body: { question } }),

  cityInfo: (token) => request("/city/info", { token }),
  askCityAssistant: (token, question) => request("/city/ask", { method: "POST", token, body: { question } }),

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
};
