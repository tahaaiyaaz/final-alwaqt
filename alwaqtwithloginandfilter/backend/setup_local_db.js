const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function setupDatabase() {
    try {
        console.log("Connecting to MySQL server without selecting a database...");
        const connection = await mysql.createConnection({
            host: '127.0.0.1',
            user: 'root',
            password: '',
            multipleStatements: true
        });

        console.log("Creating database 'alwaqt' if it doesn't exist...");
        await connection.query("CREATE DATABASE IF NOT EXISTS alwaqt CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;");
        
        console.log("Switching to 'alwaqt' database...");
        await connection.query("USE alwaqt;");

        console.log("Reading init.sql...");
        const initSqlPath = path.join(__dirname, 'init.sql');
        const sqlStatements = fs.readFileSync(initSqlPath, 'utf8');

        console.log("Executing init.sql to build tables...");
        await connection.query(sqlStatements);

        console.log("✅ Database 'alwaqt' and all tables were created successfully.");
        await connection.end();
        process.exit(0);
    } catch (error) {
        console.error("❌ Failed to setup database:", error.message);
        process.exit(1);
    }
}

setupDatabase();
