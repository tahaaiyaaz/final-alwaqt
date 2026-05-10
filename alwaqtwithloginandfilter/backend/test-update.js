

async function run() {
    try {
        const payload = {
            masjidId: 65,
            updates: {
                name: "Test Update",
                timings: {
                    fajr: "05:00 AM",
                    jummatiming: [
                        { time: "01:30 PM", bayan: "English" }
                    ]
                }
            }
        };

        console.log("Sending payload...");
        const res = await fetch("http://localhost:3001/updateMasjid", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        console.log("Status:", res.status);
        console.log("Response:", JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Fetch threw an error:", e);
    }
}
run();
