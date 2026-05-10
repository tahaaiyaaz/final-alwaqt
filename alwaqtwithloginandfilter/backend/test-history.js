

async function run() {
    try {
        console.log("Fetching History for 65...");
        const res = await fetch("http://localhost:3001/api/masjid/65/history");

        const data = await res.json();
        console.log("Status:", res.status);
        console.log("Response:", JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Fetch threw an error:", e);
    }
}
run();
