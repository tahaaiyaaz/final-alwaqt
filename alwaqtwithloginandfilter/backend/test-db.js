const mysql = require('mysql2/promise');
require('dotenv').config();

async function testDB() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'password',
            database: process.env.DB_NAME || 'alwaqt',
        });

        console.log("Connected to DB successfully.");

        try {
            const [settings] = await connection.execute("SELECT * FROM app_settings");
            console.log("Settings table exists.", settings);
        } catch (e) {
            console.log("Settings table error:", e.message);
        }

        try {
            const [events] = await connection.execute("SELECT * FROM events");
            console.log("Events table exists.", events.length, "events");
        } catch (e) {
            console.log("Events table error:", e.message);
        }

        connection.end();
    } catch (e) {
        console.error("DB connection error:", e);
    }
}

testDB();
