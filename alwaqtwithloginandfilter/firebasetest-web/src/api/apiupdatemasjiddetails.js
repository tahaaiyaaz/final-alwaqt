import { API_BASE } from "../config";
import { getBearerToken } from "../firebaseConfig";

export async function updateMasjidDetails(masjidId, updates, updater = null, verificationData = null) {
  try {
    const token = await getBearerToken();

    const requestBody = {
      masjidId: masjidId,
      updates: updates,
    };
    if (updater) {
      requestBody.updater = updater;
    }
    if (verificationData) {
      requestBody.verificationData = verificationData;
    }

    const headers = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/updateMasjid`, {
      method: "PUT",
      headers,
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (response.ok) {
      console.log("Masjid updated successfully:", data);
      return data;
    } else {
      console.error("Error updating masjid:", data.error || data.message);
      throw new Error(data.error || data.message || "Failed to update masjid");
    }
  } catch (error) {
    console.error("Error during fetch:", error);
    throw error;
  }
}
