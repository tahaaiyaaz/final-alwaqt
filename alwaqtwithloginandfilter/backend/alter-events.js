const mysql = require('mysql2/promise');
require('dotenv').config();

async function alterEvents() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'password',
            database: process.env.DB_NAME || 'alwaqt'
        });

        console.log("Connected to DB successfully.");

        try {
            await connection.query("ALTER TABLE events ADD COLUMN time VARCHAR(50) DEFAULT NULL");
            console.log("Added time column.");
        } catch (e) {
            console.log("time column may already exist: ", e.message);
        }

        try {
            await connection.query("ALTER TABLE events ADD COLUMN date_info VARCHAR(100) DEFAULT NULL");
            console.log("Added date_info column.");
        } catch (e) {
            console.log("date_info column may already exist: ", e.message);
        }

        connection.end();
    } catch (e) {
        console.error("Migration error:", e);
    }
}

alterEvents();
