import { API_BASE } from "../config";

export async function updateMasjidDetails(masjidId, updates, updater = null, verificationData = null) {
  try {
    // Attach the logged-in user's ID for backend auth validation
    let userId = null;
    const stored = localStorage.getItem("@user");
    if (stored) {
      try {
        const user = JSON.parse(stored);
        if (user && user.userid) userId = user.userid;
      } catch { /* ignore */ }
    }

    const requestBody = {
      masjidId: masjidId,
      updates: updates,
      userId: userId,
    };
    if (updater) {
      requestBody.updater = updater;
    }
    if (verificationData) {
      requestBody.verificationData = verificationData;
    }

    const response = await fetch(`${API_BASE}/updateMasjid`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
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
