const { Pool } = require('pg');
const env = require('./env');

const connectionString = env.databaseUrl;
const sslEnabled = /sslmode=require/i.test(connectionString) || env.nodeEnv === 'production';

const pool = new Pool({
  connectionString,
  ssl: sslEnabled ? { rejectUnauthorized: false } : false
});

pool.on('error', (error) => {
  console.error('Erro inesperado no pool PostgreSQL:', error);
});

async function query(text, params = []) {
  return pool.query(text, params);
}

async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  transaction
};
