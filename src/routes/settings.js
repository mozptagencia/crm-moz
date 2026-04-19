// ============================================================
// Moz CRM · Configurações — Campos personalizados e Listas
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

// ── CAMPOS PERSONALIZADOS ─────────────────────────────────────
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

router.post('/fields', adminOnly, async (req, res) => {
  try {
    const { key, label, type = 'text', options = null, placeholder = null, position = 0, system = false } = req.body;
    if (!key || !label) {
      return res.status(400).json({ error: 'key e label são obrigatórios.' });
    }
    const result = await pool.query(
      `INSERT INTO custom_fields (key, label, type, options, placeholder, position, system)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (key) DO UPDATE
         SET label=$2, type=$3, options=$4, placeholder=$5, position=$6, system=$7
       RETURNING *`,
      [key, label, type, options ? JSON.stringify(options) : null, placeholder, position, system]
    );
    res.status(201).json({ field: result.rows[0] });
  } catch (err) {
    console.error('Erro ao criar campo:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

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

router.delete('/fields/:id', adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM custom_fields WHERE id = $1', [req.params.id]);
    res.json({ message: 'Campo eliminado.' });
  } catch (err) {
    console.error('Erro ao eliminar campo:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

// ── METADATA DAS LISTAS ───────────────────────────────────────
router.get('/lists-meta', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM lists ORDER BY id ASC');
    res.json({ lists: result.rows });
  } catch (err) {
    console.error('Erro ao listar metadata:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

router.post('/lists-meta', adminOnly, async (req, res) => {
  try {
    const { name, label } = req.body;
    if (!name || !label) return res.status(400).json({ error: 'name e label são obrigatórios.' });
    const slug = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const result = await pool.query(
      'INSERT INTO lists (name, label) VALUES ($1, $2) RETURNING *',
      [slug, label]
    );
    res.status(201).json({ list: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Já existe uma lista com esse nome.' });
    console.error('Erro ao criar lista:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

router.delete('/lists-meta/:name', adminOnly, async (req, res) => {
  if (['status', 'prioridades'].includes(req.params.name)) {
    return res.status(400).json({ error: 'Não é possível eliminar as listas de sistema.' });
  }
  try {
    await pool.query('DELETE FROM list_items WHERE list_name=$1', [req.params.name]);
    await pool.query('DELETE FROM lists WHERE name=$1', [req.params.name]);
    res.json({ message: 'Lista eliminada.' });
  } catch (err) {
    console.error('Erro ao eliminar lista:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

// ── ITENS DAS LISTAS ──────────────────────────────────────────
router.get('/lists', async (req, res) => {
  try {
    const [itemsRes, metaRes] = await Promise.all([
      pool.query('SELECT * FROM list_items ORDER BY list_name, position ASC, id ASC'),
      pool.query('SELECT * FROM lists ORDER BY id ASC'),
    ]);
    const lists = {};
    metaRes.rows.forEach(l => { lists[l.name] = []; });
    itemsRes.rows.forEach(r => { if (lists[r.list_name]) lists[r.list_name].push(r); });
    res.json({ lists, meta: metaRes.rows });
  } catch (err) {
    console.error('Erro ao listar listas:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

router.post('/lists/:name', adminOnly, async (req, res) => {
  try {
    const { name } = req.params;
    const listExists = await pool.query('SELECT id FROM lists WHERE name=$1', [name]);
    if (!listExists.rows[0]) return res.status(404).json({ error: 'Lista não encontrada.' });

    const { value, label, color = null, position = 0 } = req.body;
    if (!value || !label) return res.status(400).json({ error: 'value e label são obrigatórios.' });
    const result = await pool.query(
      'INSERT INTO list_items (list_name, value, label, color, position) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [name, value, label, color, position]
    );
    res.status(201).json({ item: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Já existe um item com esse valor.' });
    console.error('Erro ao criar item:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

router.put('/lists/:name/:id', adminOnly, async (req, res) => {
  try {
    const { label, color = null, position = 0 } = req.body;
    if (!label) return res.status(400).json({ error: 'label é obrigatório.' });
    const result = await pool.query(
      'UPDATE list_items SET label=$1, color=$2, position=$3 WHERE id=$4 AND list_name=$5 RETURNING *',
      [label, color, position, req.params.id, req.params.name]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Item não encontrado.' });
    res.json({ item: result.rows[0] });
  } catch (err) {
    console.error('Erro ao editar item:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

router.delete('/lists/:name/:id', adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM list_items WHERE id=$1 AND list_name=$2', [req.params.id, req.params.name]);
    res.json({ message: 'Item eliminado.' });
  } catch (err) {
    console.error('Erro ao eliminar item:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

module.exports = router;
