const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'alwaqt',
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  connectTimeout: 5000,
});

// Helper function to wrap query options with a strict 5-second timeout
const wrapQueryConfig = (sqlOrConfig) => {
  if (typeof sqlOrConfig === 'string') {
    return { sql: sqlOrConfig, timeout: 5000 };
  } else if (sqlOrConfig && typeof sqlOrConfig === 'object') {
    return { timeout: 5000, ...sqlOrConfig };
  }
  return sqlOrConfig;
};

// Monkey-patch pool.execute and pool.query
const originalPoolExecute = pool.execute;
const originalPoolQuery = pool.query;

pool.execute = function (sqlOrConfig, values) {
  return originalPoolExecute.call(pool, wrapQueryConfig(sqlOrConfig), values);
};

pool.query = function (sqlOrConfig, values) {
  return originalPoolQuery.call(pool, wrapQueryConfig(sqlOrConfig), values);
};

// Monkey-patch connections retrieved from the pool to also enforce timeouts
const originalGetConnection = pool.getConnection;
pool.getConnection = async function () {
  const conn = await originalGetConnection.call(pool);
  
  const originalConnExecute = conn.execute;
  const originalConnQuery = conn.query;
  
  conn.execute = function (sqlOrConfig, values) {
    return originalConnExecute.call(conn, wrapQueryConfig(sqlOrConfig), values);
  };
  
  conn.query = function (sqlOrConfig, values) {
    return originalConnQuery.call(conn, wrapQueryConfig(sqlOrConfig), values);
  };
  
  return conn;
};

module.exports = pool;
