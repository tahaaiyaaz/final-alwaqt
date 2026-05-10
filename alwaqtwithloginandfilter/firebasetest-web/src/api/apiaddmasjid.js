import { API_BASE } from "../config";

export async function addMasjid(data) {
  // Attach the logged-in user's ID for backend auth validation
  const stored = localStorage.getItem("@user");
  if (stored) {
    try {
      const user = JSON.parse(stored);
      if (user && user.userid) {
        data.userId = user.userid;
      }
    } catch { /* ignore parse errors */ }
  }

  const baseUrl = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
  const response = await fetch(
    `${baseUrl}/addMasjid`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }
  );
  return response.json();
}
