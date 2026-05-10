import { API_BASE } from "../config";

export async function updateUserDetails(userId, updates) {
  const response = await fetch(
    `${API_BASE}/updateUser`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...updates }),
    }
  );
  return response.json();
}
