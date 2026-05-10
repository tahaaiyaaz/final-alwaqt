const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixDB() {
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

        // Find the constraint name
        const [rows] = await connection.execute(`
            SELECT CONSTRAINT_NAME 
            FROM information_schema.KEY_COLUMN_USAGE 
            WHERE TABLE_NAME = 'events' AND COLUMN_NAME = 'masjid_id' AND REFERENCED_TABLE_NAME = 'users'
        `);

        if (rows.length > 0) {
            const constraintName = rows[0].CONSTRAINT_NAME;
            await connection.query(`ALTER TABLE events DROP FOREIGN KEY ${constraintName}`);
            console.log("Dropped incorrect foreign key:", constraintName);
        }

        // Add the correct constraint
        await connection.query(`
            ALTER TABLE events 
            ADD CONSTRAINT fk_events_masjid 
            FOREIGN KEY (masjid_id) REFERENCES masjids(id) ON DELETE CASCADE
        `);

        console.log("Migration fix executed successfully.");

        connection.end();
    } catch (e) {
        console.error("Migration error:", e);
    }
}

fixDB();
