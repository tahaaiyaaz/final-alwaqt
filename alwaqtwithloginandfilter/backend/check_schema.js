require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'masjid_db',
    connectionLimit: 10,
});

async function checkSchema() {
    try {
        const [rows] = await pool.execute("DESCRIBE masjids;");
        console.log(rows);
    } catch (err) {
        console.log(err);
    } finally {
        pool.end();
    }
}

checkSchema();
