const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'alwaqt',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

    try {
        console.log("Seeding test announcement...");
        await pool.execute(`
            INSERT INTO announcements (title, message, is_active) 
            VALUES (?, ?, 1)
        `, [
            "✨ Welcome to the New Al Waqt!",
            "We've just released a fresh update with a brand new UI and a guided tour. \n\nCheck out the beautiful new map markers, guided walkthroughs, and improved prayer tracking. Enjoy the new experience!"
        ]);
        console.log("Announcement inserted successfully!");
    } catch (e) {
        console.error("Failed to seed:", e);
    } finally {
        pool.end();
    }
}

run();
