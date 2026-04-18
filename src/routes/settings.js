// ============================================================
// Moz CRM · Configurações — Campos personalizados
// Apenas admins têm acesso de escrita
// ============================================================
const express = require('express');
const pool    = require('../db');
const auth    = require('../middleware/authMiddleware');

const router  = express.Router();

router.use(auth);

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso reservado a administradores.' });
  }
  next();
}

// ── LISTAR CAMPOS ─────────────────────────────────────────────
router.get('/fields', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM custom_fields ORDER BY position ASC, id ASC'
    );
    res.json({ fields: result.rows });
  } catch (err) {
    console.error('Erro ao listar campos:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

// ── CRIAR CAMPO ───────────────────────────────────────────────
router.post('/fields', adminOnly, async (req, res) => {
  try {
    const { key, label, type = 'text', options = null, placeholder = null, position = 0 } = req.body;
    if (!key || !label) {
      return res.status(400).json({ error: 'key e label são obrigatórios.' });
    }
    const result = await pool.query(
      `INSERT INTO custom_fields (key, label, type, options, placeholder, position)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [key, label, type, options ? JSON.stringify(options) : null, placeholder, position]
    );
    res.status(201).json({ field: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Já existe um campo com essa chave.' });
    }
    console.error('Erro ao criar campo:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

// ── EDITAR CAMPO ──────────────────────────────────────────────
router.put('/fields/:id', adminOnly, async (req, res) => {
  try {
    const { label, type, options = null, placeholder = null, active = true, position = 0 } = req.body;
    const result = await pool.query(
      `UPDATE custom_fields
       SET label=$1, type=$2, options=$3, placeholder=$4, active=$5, position=$6
       WHERE id=$7
       RETURNING *`,
      [label, type, options ? JSON.stringify(options) : null, placeholder, active, position, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Campo não encontrado.' });
    res.json({ field: result.rows[0] });
  } catch (err) {
    console.error('Erro ao editar campo:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

// ── ELIMINAR CAMPO ────────────────────────────────────────────
router.delete('/fields/:id', adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM custom_fields WHERE id = $1', [req.params.id]);
    res.json({ message: 'Campo eliminado.' });
  } catch (err) {
    console.error('Erro ao eliminar campo:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

module.exports = router;
