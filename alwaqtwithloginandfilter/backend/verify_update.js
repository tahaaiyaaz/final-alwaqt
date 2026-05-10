const http = require('http');

const masjidId = 1;
const baseUrl = 'http://localhost:3001';

function request(url, options = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
                } else {
                    reject(new Error(`Status: ${res.statusCode}, Body: ${data}`));
                }
            });
        });
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

async function run() {
    console.log(`--- Verification for Masjid ID ${masjidId} ---`);

    try {
        console.log("\n1. Fetching current details...");
        const currentData = await request(`${baseUrl}/api/masjid/${masjidId}`);
        console.log("Current Fajr:", currentData.details.timings.fajr);

        const newTime = "0" + (Math.floor(Math.random() * 9) + 1) + ":45 AM";
        console.log(`\n2. Updating Fajr to: ${newTime}`);

        const payload = JSON.stringify({
            masjidId: masjidId,
            updates: {
                name: currentData.details.name,
                addressLine1: currentData.details.addressLine1,
                timings: {
                    ...currentData.details.timings,
                    fajr: newTime
                }
            }
        });

        await request(`${baseUrl}/updateMasjid`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
            body: payload
        });
        console.log("Update successful.");

        console.log("\n3. Verifying...");
        const verifyData = await request(`${baseUrl}/api/masjid/${masjidId}`);
        console.log("New Fajr in DB:", verifyData.details.timings.fajr);

        if (verifyData.details.timings.fajr === newTime) {
            console.log("\nSUCCESS: Database updated!");
        } else {
            console.log("\nFAILURE: Database NOT updated.");
        }
    } catch (e) {
        console.error("Test failed:", e.message);
    }
}

run();
