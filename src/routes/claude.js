// ============================================================
// Moz CRM · Integração com Claude API
// POST /api/claude/ask     — pergunta genérica com contexto
// POST /api/claude/diagnose/:id — diagnóstico completo de lead
// ============================================================
const express   = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const pool      = require('../db');
const auth      = require('../middleware/authMiddleware');
const fs        = require('fs').promises;
const path      = require('path');

const router = express.Router();
router.use(auth);

// Inicializar cliente Anthropic (só se a chave existir)
const getClient = () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY não configurada.');
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
};

// ── PERGUNTA GENÉRICA ─────────────────────────────────────────
router.post('/ask', async (req, res) => {
  try {
    const { question, contactId } = req.body;
    if (!question) return res.status(400).json({ error: 'Pergunta em falta.' });

    let context = '';

    // Se enviado um contactId, incluir dados do lead como contexto
    if (contactId) {
      const result = await pool.query('SELECT * FROM contacts WHERE id = $1', [contactId]);
      if (result.rows[0]) {
        const l = result.rows[0];
        context = `
Contexto do lead:
- Empresa: ${l.empresa}
- Sector: ${l.sector || 'não definido'}
- Localização: ${l.localizacao || 'não definida'}
- Responsável: ${l.responsavel || 'não definido'}
- Status: ${l.status}
- Prioridade: ${l.prioridade}
- Valor estimado: ${l.valor_estimado || 'não definido'}
- Notas: ${l.notas || 'sem notas'}
        `.trim();
      }
    }

    const client   = getClient();
    const message  = await client.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: context ? `${context}\n\nPergunta: ${question}` : question
      }]
    });

    res.json({ answer: message.content[0].text });
  } catch (err) {
    console.error('Erro na Claude API:', err.message);
    if (err.message.includes('ANTHROPIC_API_KEY')) {
      return res.status(503).json({ error: 'Claude API não configurada.' });
    }
    res.status(500).json({ error: 'Erro ao contactar Claude: ' + err.message });
  }
});

// ── DIAGNÓSTICO COMPLETO COM IA ───────────────────────────────
router.post('/diagnose/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM contacts WHERE id = $1', [req.params.id]);
    const lead   = result.rows[0];
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });

    const client = getClient();

    // Ler templates
    const tmplDir     = path.join(__dirname, '../../public/templates');
    const tmplInterna = await fs.readFile(path.join(tmplDir, 'interna.html'), 'utf8');
    const tmplCliente = await fs.readFile(path.join(tmplDir, 'cliente.html'), 'utf8');

    // Extrair lista de {{CAMPOS}} únicos do template
    const campos = [...new Set([
      ...tmplInterna.matchAll(/\{\{([A-Z0-9_]+)\}\}/g),
      ...tmplCliente.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)
    ].map(m => m[1]))];

    // Pedir ao Claude para preencher os campos
    const prompt = `
És um especialista em marketing digital para PME do Alentejo.
Vais preencher os campos de um diagnóstico digital para a empresa "${lead.empresa}".

Dados disponíveis:
- Empresa: ${lead.empresa}
- Sector: ${lead.sector || ''}
- Localização: ${lead.localizacao || ''}
- Responsável: ${lead.responsavel || ''}
- Notas: ${lead.notas || ''}

Preenche os seguintes campos em formato JSON.
Para campos sem informação, usa valores plausíveis baseados no sector e localização.
Escreve em português de Portugal.

Campos a preencher: ${campos.slice(0, 40).join(', ')}

Responde APENAS com um objecto JSON válido, sem markdown nem explicações.
`.trim();

    const message = await client.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages:   [{ role: 'user', content: prompt }]
    });

    // Fazer parse do JSON devolvido
    let valores = {};
    try {
      const raw = message.content[0].text.replace(/```json|```/g, '').trim();
      valores = JSON.parse(raw);
    } catch {
      return res.status(500).json({ error: 'Claude devolveu JSON inválido.' });
    }

    // Substituir {{CAMPOS}} nos templates
    const slug = lead.empresa
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const now     = new Date().toLocaleDateString('pt-PT');
    const replace = (tpl) => {
      let out = tpl;
      // Campos base
      out = out.replace(/\{\{EMPRESA\}\}/g, lead.empresa || '');
      out = out.replace(/\{\{DATA\}\}/g,    now);
      // Campos do Claude
      for (const [key, val] of Object.entries(valores)) {
        out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val || '');
      }
      // Limpar campos não preenchidos
      out = out.replace(/\{\{[A-Z0-9_]+\}\}/g, '');
      return out;
    };

    const internaHtml = replace(tmplInterna);
    const clienteHtml = replace(tmplCliente);

    // Guardar ficheiros
    const leadsDir = path.join(__dirname, '../../public/leads', slug);
    await fs.mkdir(leadsDir, { recursive: true });

    await Promise.all([
      fs.writeFile(path.join(leadsDir, 'interna.html'), internaHtml, 'utf8'),
      fs.writeFile(path.join(leadsDir, 'cliente.html'), clienteHtml, 'utf8'),
    ]);

    // Actualizar links na BD
    const linkInterno = `leads/${slug}/interna.html`;
    const linkCliente = `leads/${slug}/cliente.html`;

    await pool.query(
      'UPDATE contacts SET link_interno=$1, link_cliente=$2 WHERE id=$3',
      [linkInterno, linkCliente, lead.id]
    );

    // Registar no histórico
    await pool.query(
      'INSERT INTO interactions (contact_id, user_id, type, content) VALUES ($1,$2,$3,$4)',
      [lead.id, req.user.id, 'diagnostico', 'Diagnóstico gerado via Claude API']
    );

    res.json({
      message:     'Diagnóstico gerado com sucesso.',
      linkInterno,
      linkCliente,
      campos_preenchidos: Object.keys(valores).length,
    });
  } catch (err) {
    console.error('Erro no diagnóstico:', err.message);
    if (err.message.includes('ANTHROPIC_API_KEY')) {
      return res.status(503).json({ error: 'Claude API não configurada.' });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
