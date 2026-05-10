async function testUpdate() {
    try {
        const payload = {
            masjidId: 1,
            updates: {
                timings: {
                    fajr: "05:00",
                    dhuhr: "13:30",
                    asar: "17:00",
                    maghrib: "18:30",
                    isha: "20:00",
                    jummatiming: ["13:30", "14:00"],
                    taravi: [
                        { time: "20:30", parah: "1-3", startDate: "1" }
                    ]
                },
                events: [
                    { name: "Tafseer", description: "Daily Tafseer", speakerName: "Imam", frequency: "daily" }
                ]
            }
        };

        console.log("Sending payload...");
        const response = await fetch("http://localhost:3001/updateMasjid", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log("Status:", response.status);
        console.log("Response:", data);

    } catch (e) {
        console.error("Fetch error:", e);
    }
}

testUpdate();
