// ============================================================
// Moz CRM · CRUD de Leads/Contactos
// Todas as rotas protegidas por JWT
// ============================================================
const express = require('express');
const pool    = require('../db');
const auth    = require('../middleware/authMiddleware');
const fs      = require('fs').promises;
const path    = require('path');

const router  = express.Router();

// Todas as rotas requerem autenticação
router.use(auth);

// ── LISTAR LEADS ──────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, prioridade, search } = req.query;
    let query  = 'SELECT * FROM contacts WHERE 1=1';
    const params = [];
    let i = 1;

    if (status && status !== 'todos') {
      query += ` AND status = $${i++}`;
      params.push(status);
    }
    if (prioridade && prioridade !== 'todos') {
      query += ` AND prioridade = $${i++}`;
      params.push(prioridade);
    }
    if (search) {
      query += ` AND (empresa ILIKE $${i} OR sector ILIKE $${i} OR localizacao ILIKE $${i})`;
      params.push(`%${search}%`);
      i++;
    }

    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    res.json({ leads: result.rows });
  } catch (err) {
    console.error('Erro ao listar leads:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

// ── OBTER UM LEAD ─────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM contacts WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Lead não encontrado.' });
    res.json({ lead: result.rows[0] });
  } catch (err) {
    console.error('Erro ao obter lead:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

// Campos fixos conhecidos da tabela contacts
const KNOWN_FIELDS = new Set([
  'empresa','sector','localizacao','responsavel','email','telefone',
  'status','prioridade','valor_estimado','canal_origem','ultimo_contacto',
  'followup','link_interno','link_cliente','notas',
]);

function extractCustomData(body) {
  const custom = {};
  Object.keys(body).forEach(k => { if (!KNOWN_FIELDS.has(k)) custom[k] = body[k]; });
  return Object.keys(custom).length ? JSON.stringify(custom) : null;
}

// ── CRIAR LEAD ────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const {
      empresa, sector, localizacao, responsavel, email, telefone,
      status = 'lead', prioridade = 'media', valor_estimado,
      canal_origem, ultimo_contacto, followup, notas
    } = req.body;

    if (!empresa) return res.status(400).json({ error: 'Nome da empresa é obrigatório.' });

    const custom_data = extractCustomData(req.body);

    const result = await pool.query(
      `INSERT INTO contacts
        (user_id, empresa, sector, localizacao, responsavel, email, telefone,
         status, prioridade, valor_estimado, canal_origem, ultimo_contacto, followup, notas, custom_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [req.user.id, empresa, sector, localizacao, responsavel, email, telefone,
       status, prioridade, valor_estimado, canal_origem, ultimo_contacto, followup, notas, custom_data]
    );

    res.status(201).json({ lead: result.rows[0] });
  } catch (err) {
    console.error('Erro ao criar lead:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

// ── EDITAR LEAD ───────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const {
      empresa, sector, localizacao, responsavel, email, telefone,
      status, prioridade, valor_estimado, canal_origem,
      ultimo_contacto, followup, link_interno, link_cliente, notas
    } = req.body;

    const custom_data = extractCustomData(req.body);

    const result = await pool.query(
      `UPDATE contacts SET
        empresa=$1, sector=$2, localizacao=$3, responsavel=$4, email=$5, telefone=$6,
        status=$7, prioridade=$8, valor_estimado=$9, canal_origem=$10,
        ultimo_contacto=$11, followup=$12, link_interno=$13, link_cliente=$14, notas=$15,
        custom_data=$16
       WHERE id=$17
       RETURNING *`,
      [empresa, sector, localizacao, responsavel, email, telefone,
       status, prioridade, valor_estimado, canal_origem,
       ultimo_contacto, followup, link_interno, link_cliente, notas,
       custom_data, req.params.id]
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'Lead não encontrado.' });
    res.json({ lead: result.rows[0] });
  } catch (err) {
    console.error('Erro ao editar lead:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

// ── ELIMINAR LEAD ─────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    // Apenas admins podem eliminar
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Sem permissão para eliminar leads.' });
    }
    await pool.query('DELETE FROM contacts WHERE id = $1', [req.params.id]);
    res.json({ message: 'Lead eliminado.' });
  } catch (err) {
    console.error('Erro ao eliminar lead:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

// ── GERAR DIAGNÓSTICO (copia templates + preenche {{CAMPOS}}) ─
router.post('/:id/generate', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM contacts WHERE id = $1', [req.params.id]);
    const lead   = result.rows[0];
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });

    // Slug da empresa para o nome da pasta
    const slug = lead.empresa
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const leadsDir   = path.join(__dirname, '../../public/leads', slug);
    const tmplDir    = path.join(__dirname, '../../public/templates');

    // Criar pasta do lead se não existir
    await fs.mkdir(leadsDir, { recursive: true });

    // Ler templates
    const [tmplInterna, tmplCliente] = await Promise.all([
      fs.readFile(path.join(tmplDir, 'interna.html'), 'utf8'),
      fs.readFile(path.join(tmplDir, 'cliente.html'), 'utf8'),
    ]);

    // Substituir campos base (sem Claude — preenchimento manual)
    const now   = new Date().toLocaleDateString('pt-PT');
    const fill  = (tpl) => tpl
      .replace(/\{\{EMPRESA\}\}/g,      lead.empresa     || '')
      .replace(/\{\{SECTOR\}\}/g,       lead.sector      || '')
      .replace(/\{\{LOCALIZACAO\}\}/g,  lead.localizacao || '')
      .replace(/\{\{PROPRIETARIO\}\}/g, lead.responsavel || '')
      .replace(/\{\{DATA\}\}/g,         now)
      .replace(/\{\{STATUS_LEAD\}\}/g,  lead.status      || '');

    const internaHtml = fill(tmplInterna);
    const clienteHtml = fill(tmplCliente);

    // Guardar ficheiros
    const internaPath = path.join(leadsDir, 'interna.html');
    const clientePath = path.join(leadsDir, 'cliente.html');

    await Promise.all([
      fs.writeFile(internaPath, internaHtml, 'utf8'),
      fs.writeFile(clientePath, clienteHtml, 'utf8'),
    ]);

    // Actualizar links na base de dados
    const linkInterno = `leads/${slug}/interna.html`;
    const linkCliente = `leads/${slug}/cliente.html`;

    await pool.query(
      'UPDATE contacts SET link_interno=$1, link_cliente=$2 WHERE id=$3',
      [linkInterno, linkCliente, lead.id]
    );

    // Registar no histórico
    await pool.query(
      'INSERT INTO interactions (contact_id, user_id, type, content) VALUES ($1,$2,$3,$4)',
      [lead.id, req.user.id, 'diagnostico', `Templates gerados: ${linkInterno} | ${linkCliente}`]
    );

    res.json({
      message:     'Templates gerados com sucesso.',
      linkInterno,
      linkCliente,
    });
  } catch (err) {
    console.error('Erro ao gerar templates:', err);
    res.status(500).json({ error: 'Erro ao gerar templates: ' + err.message });
  }
});

// ── HISTÓRICO DE INTERACÇÕES ──────────────────────────────────
router.get('/:id/interactions', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT i.*, u.name as user_name
       FROM interactions i
       LEFT JOIN users u ON u.id = i.user_id
       WHERE i.contact_id = $1
       ORDER BY i.created_at DESC`,
      [req.params.id]
    );
    res.json({ interactions: result.rows });
  } catch (err) {
    console.error('Erro ao obter histórico:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

module.exports = router;
