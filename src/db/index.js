// ============================================================
// Moz CRM · Ligação ao PostgreSQL
// Usa pool de conexões para melhor performance
// ============================================================
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

// Testar ligação ao arrancar
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Erro ao ligar ao PostgreSQL:', err.message);
  } else {
    console.log('✓ PostgreSQL ligado');
    release();
  }
});

module.exports = pool;
