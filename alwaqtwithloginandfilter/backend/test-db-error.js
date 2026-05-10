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
            port: process.env.DB_PORT || 3306
        });

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const masjidId = 65;
        console.log("Checking Jumma Timings...");
        await connection.execute('DELETE FROM jumma_timings WHERE masjid_id = ?', [masjidId]);
        await connection.execute('INSERT INTO jumma_timings (masjid_id, timing, bayan_name) VALUES (?, ?, ?)', [masjidId, '01:30 PM', 'English']);

        console.log("Checking Masjid Changes...");
        await connection.execute(
            'INSERT INTO masjid_changes (masjid_id, user_id, changed_by_name, change_type, change_summary) VALUES (?, ?, ?, ?, ?)',
            [masjidId, null, 'Unknown Person', 'Unknown', 'Test Summary']
        );

        console.log("Checking history deletion...");
        const [keepRows] = await connection.execute(
            'SELECT id FROM masjid_changes WHERE masjid_id = ? ORDER BY created_at DESC LIMIT 5',
            [masjidId]
        );

        if (keepRows.length > 0) {
            const keepIds = keepRows.map(r => r.id);
            const placeholders = keepIds.map(() => '?').join(',');
            await connection.execute(
                `DELETE FROM masjid_changes WHERE masjid_id = ? AND id NOT IN (${placeholders})`,
                [masjidId, ...keepIds]
            );
        }

        await connection.commit();
        console.log("SUCCESS!");
    } catch (e) {
        if (connection) await connection.rollback();
        console.error("SQL ERROR:", e.message);
    } finally {
        if (connection) connection.release();
        process.exit(0);
    }
}
run();
