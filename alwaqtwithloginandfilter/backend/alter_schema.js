require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'masjid_db',
    connectionLimit: 10,
});

async function alterSchema() {
    try {
        console.log("Adding contact_number and status...");
        await pool.execute("ALTER TABLE masjids ADD COLUMN contact_number VARCHAR(20) DEFAULT NULL;");
        // add status with default 'approved' so existing rows get it, 
        // then change default to 'pending'
        await pool.execute("ALTER TABLE masjids ADD COLUMN status ENUM('pending', 'approved', 'rejected') DEFAULT 'approved';");
        await pool.execute("ALTER TABLE masjids ALTER COLUMN status SET DEFAULT 'pending';");
        console.log("Success.");
    } catch (err) {
        console.log(err);
    } finally {
        pool.end();
    }
}

alterSchema();
