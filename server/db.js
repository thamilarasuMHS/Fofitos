import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || '13.202.225.50',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'Fofitos_Nutrition',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '$erver2026',
  ssl: false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export default pool;
