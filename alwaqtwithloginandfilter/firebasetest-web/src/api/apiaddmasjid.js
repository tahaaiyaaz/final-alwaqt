import { API_BASE } from "../config";
import { getBearerToken } from "../firebaseConfig";

export async function addMasjid(data) {
  const token = await getBearerToken();

  const baseUrl = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
  const headers = { 
    "Content-Type": "application/json" 
  };
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(
    `${baseUrl}/addMasjid`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    }
  );
  return response.json();
}
