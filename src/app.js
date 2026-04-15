// ============================================================
// Moz CRM · Entry point do servidor Express
// ============================================================
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');

// Rotas
const authRoutes     = require('./routes/auth');
const contactRoutes  = require('./routes/contacts');
const claudeRoutes   = require('./routes/claude');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARES ───────────────────────────────────────────────
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : '*',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── FICHEIROS ESTÁTICOS (Frontend) ────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));

// ── API ROUTES ────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/leads',    contactRoutes);
app.use('/api/claude',   claudeRoutes);

// ── HEALTH CHECK ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status:  'ok',
    version: '1.0.0',
    time:    new Date().toISOString(),
  });
});

// ── FALLBACK: devolver index.html para rotas do SPA ───────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── ARRANCAR SERVIDOR ─────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✓ Moz CRM a correr em http://localhost:${PORT}`);
  console.log(`  Ambiente: ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = app;
