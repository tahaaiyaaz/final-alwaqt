const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    let connection;
    try {
        const pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'alwaqt',
            port: process.env.DB_PORT || 3306,
            multipleStatements: true
        });

        connection = await pool.getConnection();

        console.log("Adding bayan_name to jumma_timings...");
        try {
            await connection.execute('ALTER TABLE jumma_timings ADD COLUMN bayan_name VARCHAR(255) DEFAULT NULL');
            console.log("Column bayan_name added successfully.");
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log("Column bayan_name already exists.");
            } else {
                console.error("Error adding column:", err.message);
            }
        }

        console.log("Creating masjid_changes table if not exists...");
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS masjid_changes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                masjid_id INT NOT NULL,
                user_id INT DEFAULT NULL,
                changed_by_name VARCHAR(255) DEFAULT 'Unknown Person',
                change_type ENUM('Muazzin', 'Follower', 'User', 'Unknown') DEFAULT 'Unknown',
                change_summary TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (masjid_id) REFERENCES masjids(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
                INDEX idx_masjid_changes (masjid_id)
            ) ENGINE=InnoDB;
        `);
        console.log("masjid_changes table ready.");

        console.log("SUCCESS! Database schema is up to date.");
    } catch (e) {
        console.error("FATAL SQL ERROR:", e.message);
    } finally {
        if (connection) connection.release();
        process.exit(0);
    }
}
run();
