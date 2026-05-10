const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrateDB() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'password',
            database: process.env.DB_NAME || 'alwaqt',
            multipleStatements: true
        });

        console.log("Connected to DB successfully.");

        const sql = `
CREATE TABLE IF NOT EXISTS events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    masjid_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    speaker_name VARCHAR(255),
    frequency ENUM('daily', 'weekly', 'monthly', 'yearly') DEFAULT 'weekly',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (masjid_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_settings (
    setting_key VARCHAR(50) PRIMARY KEY,
    setting_value VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES ('show_add_button', 'true');
        `;

        await connection.query(sql);
        console.log("Migration executed successfully.");

        connection.end();
    } catch (e) {
        console.error("Migration error:", e);
    }
}

migrateDB();
