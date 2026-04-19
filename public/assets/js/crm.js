/* ============================================================
   MOZ · CRM.JS  v3 — Integrado com API
   ============================================================ */
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     1. SESSÃO & API HELPER
  ══════════════════════════════════════════════════════════ */
  const session = (() => {
    const raw = localStorage.getItem('moz_user') || sessionStorage.getItem('moz_user');
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  })();

  if (!session) { window.location.href = 'index.html'; return; }

  const token = localStorage.getItem('moz_token') || sessionStorage.getItem('moz_token') || '';

  // Helper para todas as chamadas à API
  async function api(path, opts = {}) {
    const res = await fetch('/api' + path, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(opts.headers || {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
    return data;
  }

  // Preencher user bar
  const initials = (session.nome || session.name || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  document.getElementById('user-avatar').textContent = initials;
  document.getElementById('user-name').textContent   = session.nome || session.name || session.email;
  document.getElementById('user-role').textContent   = '· ' + (session.role === 'admin' ? 'Admin' : session.role === 'editor' ? 'Editor' : 'Viewer');

  // Ocultar Configurações para não-admins
  if (session.role !== 'admin') {
    const settingsLink = document.querySelector('[data-tab="settings"]');
    if (settingsLink) settingsLink.style.display = 'none';
  }

  document.getElementById('btn-logout').addEventListener('click', () => {
    localStorage.removeItem('moz_user'); localStorage.removeItem('moz_token');
    sessionStorage.removeItem('moz_user'); sessionStorage.removeItem('moz_token');
    window.location.href = 'index.html';
  });

  /* ══════════════════════════════════════════════════════════
     2. ESTADO LOCAL
  ══════════════════════════════════════════════════════════ */
  let leads        = [];
  let users        = [];
  let customFields = [];
  let listItems    = {
    status:      [
      { value:'lead', label:'Lead' }, { value:'contactado', label:'Contactado' },
      { value:'proposta', label:'Proposta Enviada' }, { value:'cliente', label:'Cliente' }, { value:'perdido', label:'Perdido' },
    ],
    prioridades: [
      { value:'hot', label:'🔥 Alta (Hot)' }, { value:'media', label:'Média' }, { value:'cold', label:'❄️ Baixa (Cold)' },
    ],
  };

  function statusLabels(v) { return (listItems.status.find(i => i.value === v) || {}).label || v; }
  function prioLabels(v)   { return (listItems.prioridades.find(i => i.value === v) || {}).label || v; }

  const LIST_COLORS = [
    { name: 'cinza',    hex: '#9ca3af' },
    { name: 'teal',     hex: '#328d97' },
    { name: 'verde',    hex: '#22a05a' },
    { name: 'amarelo',  hex: '#ffba08' },
    { name: 'laranja',  hex: '#fb7f33' },
    { name: 'vermelho', hex: '#e53e3e' },
    { name: 'azul',     hex: '#3b82f6' },
    { name: 'roxo',     hex: '#8b5cf6' },
    { name: 'magenta',  hex: '#b72d6a' },
  ];

  function badgeStyle(color) {
    if (!color) return '';
    const hex = color.startsWith('#') ? color : (LIST_COLORS.find(c => c.name === color)?.hex || color);
    return `background:${hex}22;color:${hex};border:1px solid ${hex}55`;
  }

  let filterStatus = 'todos';
  let filterPrio   = 'todos';
  let filterSearch = '';
  let sortCol      = null;
  let sortAsc      = true;

  /* ══════════════════════════════════════════════════════════
     3. TABS DE PAINEL
  ══════════════════════════════════════════════════════════ */
  const panels   = { leads: document.getElementById('panel-leads'), io: document.getElementById('panel-io'), settings: document.getElementById('panel-settings') };
  const tabLinks = document.querySelectorAll('.crm-tab-link');

  function switchTab(name) {
    Object.values(panels).forEach(p => p.classList.remove('active'));
    tabLinks.forEach(l => {
      l.style.color      = '';
      l.style.background = '';
      l.classList.toggle('crm-tab-link--active', l.dataset.tab === name);
    });
    if (panels[name]) panels[name].classList.add('active');
  }
  tabLinks.forEach(l => l.addEventListener('click', e => { e.preventDefault(); switchTab(l.dataset.tab); }));
  switchTab('leads');

  /* ══════════════════════════════════════════════════════════
     4. MODAIS
  ══════════════════════════════════════════════════════════ */
  document.querySelectorAll('[data-modal-open]').forEach(btn  => btn.addEventListener('click', () => openModal(btn.dataset.modalOpen)));
  document.querySelectorAll('[data-modal-close]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.modalClose)));
  document.querySelectorAll('.modal-overlay').forEach(o => o.addEventListener('click', e => { if (e.target === o) closeModal(o.id); }));

  function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
  function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

  /* ══════════════════════════════════════════════════════════
     5. RENDER DA TABELA
  ══════════════════════════════════════════════════════════ */
  const tbody    = document.getElementById('crm-tbody');
  const emptyDiv = document.getElementById('crm-empty');

  // Normalizar campos da API (snake_case → camelCase)
  function normLead(l) {
    return {
      id:             l.id,
      empresa:        l.empresa,
      sector:         l.sector,
      localizacao:    l.localizacao,
      responsavel:    l.responsavel,
      emailLead:      l.email,
      telefone:       l.telefone,
      status:         l.status,
      prioridade:     l.prioridade,
      valorEstimado:  l.valor_estimado,
      canalOrigem:    l.canal_origem,
      ultimoContacto: l.ultimo_contacto ? l.ultimo_contacto.split('T')[0] : '',
      followup:       l.followup        ? l.followup.split('T')[0] : '',
      linkInterno:    l.link_interno,
      linkCliente:    l.link_cliente,
      notas:          l.notas,
      customData:     l.custom_data || {},
    };
  }

  function filteredLeads() {
    return leads.filter(l => {
      const mS = filterStatus === 'todos' || l.status === filterStatus;
      const mP = filterPrio   === 'todos' || l.prioridade === filterPrio;
      const mQ = !filterSearch ||
        (l.empresa     ||'').toLowerCase().includes(filterSearch) ||
        (l.sector      ||'').toLowerCase().includes(filterSearch) ||
        (l.localizacao ||'').toLowerCase().includes(filterSearch);
      return mS && mP && mQ;
    });
  }

  function render() {
    const list = filteredLeads();
    tbody.innerHTML = list.map(rowHtml).join('');
    emptyDiv.style.display = list.length ? 'none' : 'block';
    updateStats();
    attachRowEvents();
  }

  function rowHtml(l) {
    return `
    <tr data-id="${l.id}">
      <td class="td-empresa">${l.empresa}<small>${[l.sector, l.localizacao].filter(Boolean).join(' · ')}</small></td>
      <td><span class="status-badge status--${l.status}" style="${badgeStyle((listItems.status.find(i=>i.value===l.status)||{}).color)}">${statusLabels(l.status)}</span></td>
      <td><span class="priority-badge priority--${l.prioridade}" style="${badgeStyle((listItems.prioridades.find(i=>i.value===l.prioridade)||{}).color)}">${prioLabels(l.prioridade)}</span></td>
      <td>${l.valorEstimado||'—'}</td>
      <td>${fmtDate(l.ultimoContacto)}</td>
      <td>${l.canalOrigem||'—'}</td>
      <td class="td-notes">${l.notas ? l.notas.slice(0,80)+(l.notas.length>80?'…':'') : '—'}</td>
      <td class="td-actions">
        <button class="action-link" data-edit="${l.id}">✏ Editar</button>
        <button class="action-link action-link--diag" data-diagnose="${l.id}">🧠 Diagnóstico</button>
        ${l.linkInterno ? `<a class="action-link" href="${l.linkInterno}" target="_blank">📋 Int.</a>` : ''}
        ${l.linkCliente ? `<a class="action-link" href="${l.linkCliente}" target="_blank">📄 Cli.</a>` : ''}
        <button class="action-link action-link--pdf" data-pdf="${l.id}">🖨</button>
        <button class="action-link action-link--delete" data-delete="${l.id}">✕</button>
      </td>
    </tr>`;
  }

  function attachRowEvents() {
    tbody.querySelectorAll('[data-edit]').forEach(b     => b.addEventListener('click', () => openEditLead(+b.dataset.edit)));
    tbody.querySelectorAll('[data-diagnose]').forEach(b => b.addEventListener('click', () => runDiagnosis(+b.dataset.diagnose)));
    tbody.querySelectorAll('[data-delete]').forEach(b   => b.addEventListener('click', () => deleteLead(+b.dataset.delete)));
    tbody.querySelectorAll('[data-pdf]').forEach(b      => b.addEventListener('click', () => printLeadPdf(+b.dataset.pdf)));
  }

  function updateStats() {
    document.getElementById('stat-total').textContent    = leads.length;
    document.getElementById('stat-clientes').textContent = leads.filter(l => l.status === 'cliente').length;
    document.getElementById('stat-proposta').textContent = leads.filter(l => l.status === 'proposta').length;
    document.getElementById('stat-hot').textContent      = leads.filter(l => l.prioridade === 'hot').length;
  }

  /* ══════════════════════════════════════════════════════════
     6. FILTROS & ORDENAÇÃO
  ══════════════════════════════════════════════════════════ */
  document.querySelectorAll('[data-filter-status]').forEach(btn => {
    btn.addEventListener('click', () => {
      filterStatus = btn.dataset.filterStatus;
      document.querySelectorAll('[data-filter-status]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      render();
    });
  });

  document.querySelectorAll('[data-filter-prio]').forEach(btn => {
    btn.addEventListener('click', () => {
      filterPrio = btn.dataset.filterPrio;
      document.querySelectorAll('[data-filter-prio]').forEach(b => b.classList.remove('active','active--orange','active--yellow'));
      btn.classList.add(btn.dataset.filterPrio === 'hot' ? 'active--orange' : btn.dataset.filterPrio === 'media' ? 'active--yellow' : 'active');
      render();
    });
  });

  document.getElementById('crm-search')?.addEventListener('input', e => { filterSearch = e.target.value.toLowerCase(); render(); });

  document.querySelectorAll('.crm-table th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortCol === col) sortAsc = !sortAsc; else { sortCol = col; sortAsc = true; }
      document.querySelectorAll('.crm-table th').forEach(h => { h.classList.remove('sorted'); h.querySelector('.sort-icon') && (h.querySelector('.sort-icon').textContent = '↕'); });
      th.classList.add('sorted');
      th.querySelector('.sort-icon') && (th.querySelector('.sort-icon').textContent = sortAsc ? '↑' : '↓');
      leads.sort((a,b) => { const av=(a[col]||'').toString().toLowerCase(), bv=(b[col]||'').toString().toLowerCase(); return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av); });
      render();
    });
  });

  /* ══════════════════════════════════════════════════════════
     7. CRUD LEADS — com API
  ══════════════════════════════════════════════════════════ */

  // Carregar leads da API
  async function loadLeads() {
    try {
      const data = await api('/leads');
      leads = (data.leads || []).map(normLead);
      render();
    } catch (err) {
      console.error('Erro ao carregar leads:', err.message);
    }
  }

  // Abrir modal novo lead
  document.querySelectorAll('[data-modal-open="modal-lead"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('modal-lead-title').textContent = 'Novo Lead';
      document.getElementById('f-lead-id').value = '';
      document.getElementById('form-lead').reset();
      renderLeadCustomFields(null);
      updateOthersTabVisibility();
      switchModalTab('info');
      openModal('modal-lead');
    });
  });

  // Abrir modal editar
  function openEditLead(id) {
    const l = leads.find(x => x.id === id);
    if (!l) return;
    document.getElementById('modal-lead-title').textContent = 'Editar Lead — ' + l.empresa;
    document.getElementById('f-lead-id').value     = l.id;
    document.getElementById('f-empresa').value     = l.empresa       || '';
    document.getElementById('f-sector').value      = l.sector        || '';
    document.getElementById('f-localizacao').value = l.localizacao   || '';
    document.getElementById('f-responsavel').value = l.responsavel   || '';
    document.getElementById('f-email-lead').value  = l.emailLead     || '';
    document.getElementById('f-telefone').value    = l.telefone      || '';
    document.getElementById('f-status').value      = l.status        || 'lead';
    document.getElementById('f-prio').value        = l.prioridade    || 'media';
    document.getElementById('f-valor').value       = l.valorEstimado || '';
    document.getElementById('f-canal').value       = l.canalOrigem   || '';
    document.getElementById('f-data').value        = l.ultimoContacto|| '';
    document.getElementById('f-followup').value    = l.followup      || '';
    document.getElementById('f-link-int').value    = l.linkInterno   || '';
    document.getElementById('f-link-cli').value    = l.linkCliente   || '';
    document.getElementById('f-notas').value       = l.notas         || '';
    renderLeadCustomFields(l);
    updateOthersTabVisibility();
    switchModalTab('info');
    openModal('modal-lead');
  }

  // Submeter formulário (criar ou editar)
  document.getElementById('form-lead').addEventListener('submit', async e => {
    e.preventDefault();
    const id = document.getElementById('f-lead-id').value;

    const payload = {
      empresa:         document.getElementById('f-empresa').value.trim(),
      sector:          document.getElementById('f-sector').value.trim(),
      localizacao:     document.getElementById('f-localizacao').value.trim(),
      responsavel:     document.getElementById('f-responsavel').value.trim(),
      email:           document.getElementById('f-email-lead').value.trim(),
      telefone:        document.getElementById('f-telefone').value.trim(),
      status:          document.getElementById('f-status').value,
      prioridade:      document.getElementById('f-prio').value,
      valor_estimado:  document.getElementById('f-valor').value.trim(),
      canal_origem:    document.getElementById('f-canal').value.trim(),
      ultimo_contacto: document.getElementById('f-data').value || null,
      followup:        document.getElementById('f-followup').value || null,
      link_interno:    document.getElementById('f-link-int').value.trim(),
      link_cliente:    document.getElementById('f-link-cli').value.trim(),
      notas:           document.getElementById('f-notas').value.trim(),
    };

    // Recolher campos custom da tab "Outros"
    allFields.filter(f => f.custom && f.active).forEach(f => {
      const el = document.getElementById('fcustom-' + f.key);
      if (el) payload[f.key] = el.value;
    });

    if (!payload.empresa) { alert('O nome da empresa é obrigatório.'); return; }

    try {
      if (id) {
        await api(`/leads/${id}`, { method: 'PUT', body: payload });
      } else {
        await api('/leads', { method: 'POST', body: payload });
      }
      closeModal('modal-lead');
      await loadLeads();
    } catch (err) {
      alert('Erro ao guardar lead: ' + err.message);
    }
  });

  // Eliminar
  async function deleteLead(id) {
    if (!confirm('Eliminar este lead? Esta acção não pode ser desfeita.')) return;
    try {
      await api(`/leads/${id}`, { method: 'DELETE' });
      await loadLeads();
    } catch (err) {
      alert('Erro ao eliminar: ' + err.message);
    }
  }

  /* ══════════════════════════════════════════════════════════
     8. TABS DO MODAL
  ══════════════════════════════════════════════════════════ */
  document.querySelectorAll('.modal-tab').forEach(tab => tab.addEventListener('click', () => switchModalTab(tab.dataset.modalTab)));

  function switchModalTab(name) {
    document.querySelectorAll('.modal-tab').forEach(t => t.classList.toggle('active', t.dataset.modalTab === name));
    document.querySelectorAll('.modal-tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
  }

  /* ══════════════════════════════════════════════════════════
     9. PDF
  ══════════════════════════════════════════════════════════ */
  document.getElementById('btn-lead-pdf').addEventListener('click', () => {
    const id = document.getElementById('f-lead-id').value;
    if (!id) { alert('Guarda o lead primeiro.'); return; }
    printLeadPdf(+id);
  });

  function printLeadPdf(id) {
    const l = leads.find(x => x.id === id);
    if (!l) return;
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${l.empresa} · Moz CRM</title>
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;font-size:13px;line-height:1.6;color:#222;padding:2.5cm}h1{font-size:20px;margin-bottom:4px}.meta{color:#777;font-size:11px;margin-bottom:24px}table{width:100%;border-collapse:collapse;margin-bottom:20px}td{padding:8px 10px;border-bottom:1px solid #eee;vertical-align:top}td:first-child{font-weight:600;width:40%;color:#444}.section{font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#888;margin:20px 0 8px}.footer{margin-top:40px;padding-top:12px;border-top:1px solid #ddd;font-size:10px;color:#aaa}</style>
    </head><body>
    <h1>${l.empresa}</h1><div class="meta">Exportado do Moz CRM · ${new Date().toLocaleDateString('pt-PT')}</div>
    <div class="section">Informação</div>
    <table>
      <tr><td>Empresa</td><td>${l.empresa||'—'}</td></tr>
      <tr><td>Sector</td><td>${l.sector||'—'}</td></tr>
      <tr><td>Localização</td><td>${l.localizacao||'—'}</td></tr>
      <tr><td>Responsável</td><td>${l.responsavel||'—'}</td></tr>
      <tr><td>Email</td><td>${l.emailLead||'—'}</td></tr>
      <tr><td>Telefone</td><td>${l.telefone||'—'}</td></tr>
    </table>
    <div class="section">Comercial</div>
    <table>
      <tr><td>Status</td><td>${statusLabels(l.status)}</td></tr>
      <tr><td>Prioridade</td><td>${prioLabels(l.prioridade)}</td></tr>
      <tr><td>Valor Estimado</td><td>${l.valorEstimado||'—'}</td></tr>
      <tr><td>Canal de Origem</td><td>${l.canalOrigem||'—'}</td></tr>
      <tr><td>Último Contacto</td><td>${fmtDate(l.ultimoContacto)}</td></tr>
      <tr><td>Follow-up</td><td>${fmtDate(l.followup)}</td></tr>
    </table>
    ${l.notas ? `<div class="section">Notas</div><p style="font-size:12px;line-height:1.7;white-space:pre-wrap">${l.notas}</p>` : ''}
    <div class="footer">Moz · hello@moz.pt · +351 912 420 900 · Estremoz</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); w.close(); }, 400);
  }

  /* ══════════════════════════════════════════════════════════
     10. EXPORTAR CSV
  ══════════════════════════════════════════════════════════ */
  const csvCols = ['empresa','sector','localizacao','responsavel','emailLead','telefone','status','prioridade','valorEstimado','canalOrigem','ultimoContacto','followup','notas'];

  function exportCsv(data) {
    const csv  = [csvCols.join(';'), ...data.map(l => csvCols.map(c => `"${(l[c]||'').toString().replace(/"/g,'""')}"`).join(';'))].join('\n');
    const a    = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'})), download: 'moz-crm.csv' });
    a.click();
  }

  document.getElementById('btn-export-csv')?.addEventListener('click', () => exportCsv(filteredLeads()));
  document.getElementById('btn-export-all')?.addEventListener('click', () => exportCsv(leads));

  document.getElementById('btn-download-template')?.addEventListener('click', () => {
    const csv = [csvCols.join(';'), csvCols.map(c => `"${c==='empresa'?'Exemplo Lda.':c==='status'?'lead':c==='prioridade'?'media':''}"` ).join(';')].join('\n');
    Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'})), download: 'moz-crm-modelo.csv' }).click();
  });

  /* ══════════════════════════════════════════════════════════
     11. IMPORTAR CSV — via API
  ══════════════════════════════════════════════════════════ */
  const dropZone   = document.getElementById('drop-zone');
  const importFile = document.getElementById('import-file');
  const btnImport  = document.getElementById('btn-process-import');
  const importFeed = document.getElementById('import-feedback');
  let importData   = null;

  if (dropZone) {
    dropZone.addEventListener('click', () => importFile.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag-over'); if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); });
  }

  importFile?.addEventListener('change', () => { if (importFile.files[0]) processFile(importFile.files[0]); });

  function processFile(file) {
    if (!file.name.endsWith('.csv')) { showImportFeed('Apenas ficheiros .csv são aceites.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const lines   = e.target.result.replace(/^\uFEFF/,'').split('\n').filter(l => l.trim());
      if (lines.length < 2) { showImportFeed('Ficheiro vazio.', 'error'); return; }
      const headers = lines[0].split(';').map(h => h.replace(/^"|"$/g,'').trim());
      importData    = lines.slice(1).map(line => {
        const vals = line.split(';').map(v => v.replace(/^"|"$/g,'').trim());
        const obj  = {};
        headers.forEach((h, i) => obj[h] = vals[i] || '');
        return obj;
      }).filter(r => r.empresa);
      showImportFeed(`${importData.length} lead(s) prontos. Clica em "Importar ficheiro".`, 'ok');
      btnImport.disabled = false;
    };
    reader.readAsText(file, 'UTF-8');
  }

  btnImport?.addEventListener('click', async () => {
    if (!importData?.length) return;
    let ok = 0, fail = 0;
    for (const row of importData) {
      try {
        await api('/leads', { method: 'POST', body: {
          empresa: row.empresa, sector: row.sector, localizacao: row.localizacao,
          responsavel: row.responsavel, email: row.emailLead, telefone: row.telefone,
          status: row.status || 'lead', prioridade: row.prioridade || 'media',
          valor_estimado: row.valorEstimado, canal_origem: row.canalOrigem, notas: row.notas
        }});
        ok++;
      } catch { fail++; }
    }
    showImportFeed(`✓ ${ok} importados${fail ? ` · ${fail} com erro` : ''}.`, 'ok');
    importData = null;
    btnImport.disabled = true;
    await loadLeads();
    switchTab('leads');
  });

  function showImportFeed(msg, type) {
    importFeed.textContent     = msg;
    importFeed.style.display   = 'block';
    importFeed.style.color     = type === 'error' ? '#e74c3c' : 'var(--color-teal)';
  }

  /* ══════════════════════════════════════════════════════════
     12. UTILIZADORES — cria via API /auth/register
  ══════════════════════════════════════════════════════════ */
  function renderUsers() {
    const el = document.getElementById('users-list');
    if (!el) return;
    const roleClass = { admin: 'role--admin', editor: 'role--editor', viewer: 'role--viewer' };
    const roleLabel = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };
    el.innerHTML = users.map(u => `
      <div class="user-row">
        <div class="user-row__avatar">${(u.nome||'?').slice(0,2).toUpperCase()}</div>
        <div class="user-row__info"><div class="user-row__name">${u.nome}</div><div class="user-row__email">${u.email}</div></div>
        <span class="user-row__role-badge ${roleClass[u.role]||'role--viewer'}">${roleLabel[u.role]||u.role}</span>
        <div class="user-row__actions">
          <button class="btn btn--sm btn--secondary t-ink" data-edit-user="${u.id}">Editar</button>
        </div>
      </div>`).join('');
  }

  document.getElementById('form-user')?.addEventListener('submit', async e => {
    e.preventDefault();
    const id    = document.getElementById('fu-id').value;
    const nome  = document.getElementById('fu-nome').value.trim();
    const email = document.getElementById('fu-email').value.trim();
    const pwd   = document.getElementById('fu-pwd').value;
    const role  = document.getElementById('fu-role').value;
    if (!nome || !email) { alert('Nome e email são obrigatórios.'); return; }
    if (!id && !pwd) { alert('A palavra-passe é obrigatória para novos utilizadores.'); return; }
    try {
      if (id) {
        const body = { name: nome, email, role };
        if (pwd) body.password = pwd;
        await api(`/auth/users/${id}`, { method: 'PUT', body });
      } else {
        await api('/auth/register', { method: 'POST', body: { name: nome, email, password: pwd, role } });
      }
      closeModal('modal-user');
      await loadUsers();
    } catch (err) {
      alert('Erro: ' + err.message);
    }
  });

  document.getElementById('fu-delete-btn')?.addEventListener('click', async () => {
    const id = document.getElementById('fu-id').value;
    if (!id) return;
    if (!confirm('Eliminar este utilizador? Esta acção não pode ser desfeita.')) return;
    try {
      await api(`/auth/users/${id}`, { method: 'DELETE' });
      closeModal('modal-user');
      await loadUsers();
    } catch (err) {
      alert('Erro: ' + err.message);
    }
  });

  document.getElementById('users-list')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-edit-user]');
    if (!btn) return;
    const u = users.find(u => String(u.id) === String(btn.dataset.editUser));
    if (!u) return;
    document.getElementById('modal-user-title').textContent = 'Editar utilizador';
    document.getElementById('fu-id').value    = u.id;
    document.getElementById('fu-nome').value  = u.nome;
    document.getElementById('fu-email').value = u.email;
    document.getElementById('fu-pwd').value   = '';
    document.getElementById('fu-role').value  = u.role;
    document.getElementById('fu-pwd-label').textContent = 'Palavra-passe (deixa em branco para não alterar)';
    document.getElementById('fu-delete-btn').style.display = String(u.id) === String(session.id) ? 'none' : '';
    openModal('modal-user');
  });

  document.querySelectorAll('[data-modal-open="modal-user"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('modal-user-title').textContent = 'Adicionar utilizador';
      ['fu-id','fu-nome','fu-email','fu-pwd'].forEach(id => document.getElementById(id) && (document.getElementById(id).value = ''));
      document.getElementById('fu-role').value = 'editor';
      document.getElementById('fu-pwd-label').textContent = 'Palavra-passe *';
      document.getElementById('fu-delete-btn').style.display = 'none';
    });
  });

  /* ══════════════════════════════════════════════════════════
     13. SETTINGS — CAMPOS & NAVEGAÇÃO
  ══════════════════════════════════════════════════════════ */
  const defaultFields = [
    { key:'empresa',        label:'Empresa',         type:'text',     active:true, system:true },
    { key:'sector',         label:'Sector',          type:'text',     active:true, system:true },
    { key:'localizacao',    label:'Localização',     type:'text',     active:true, system:true },
    { key:'responsavel',    label:'Responsável',     type:'text',     active:true, system:true },
    { key:'emailLead',      label:'Email',           type:'email',    active:true, system:true },
    { key:'telefone',       label:'Telefone',        type:'tel',      active:true, system:true },
    { key:'status',         label:'Status',          type:'select',   active:true, system:true },
    { key:'prioridade',     label:'Prioridade',      type:'select',   active:true, system:true },
    { key:'valorEstimado',  label:'Valor Estimado',  type:'text',     active:true, system:true },
    { key:'canalOrigem',    label:'Canal de Origem', type:'text',     active:true, system:true },
    { key:'ultimoContacto', label:'Último Contacto', type:'date',     active:true, system:true },
    { key:'followup',       label:'Follow-up',       type:'date',     active:true, system:true },
    { key:'linkInterno',    label:'Link Interno',    type:'url',      active:true, system:true },
    { key:'linkCliente',    label:'Link Cliente',    type:'url',      active:true, system:true },
    { key:'notas',          label:'Notas',           type:'textarea', active:true, system:true },
  ];
  let allFields = [...defaultFields, ...customFields];

  /* ── Auxiliares de campos custom ─────────────────────────────*/
  function fieldTypeLabel(f) {
    const map = { text:'Texto', url:'URL', email:'Email', tel:'Telefone', number:'Número', date:'Data', textarea:'Texto longo', select:'Lista' };
    if (f.type === 'select' && f.options?.source) return `Lista (${f.options.source === 'status' ? 'Status' : 'Prioridades'})`;
    return map[f.type] || f.type;
  }

  function getOptionsForSource(source) {
    if (listItems[source]) return listItems[source].map(i => ({ value: i.value, label: i.label }));
    return [];
  }

  function refreshListSourceSelect() {
    const sel = document.getElementById('ff-list-source');
    if (!sel) return;
    sel.innerHTML = listsMeta.map(l => `<option value="${l.name}">${l.label}</option>`).join('');
  }

  function toggleSelectSection(show) {
    const sec = document.getElementById('ff-select-options');
    const row = document.getElementById('ff-placeholder-row');
    if (sec) sec.style.display = show ? '' : 'none';
    if (row) row.style.display = show ? 'none' : '';
  }

  function populateDefaultValues(source, currentVal) {
    const sel = document.getElementById('ff-default-value');
    if (!sel) return;
    sel.innerHTML = getOptionsForSource(source).map(o =>
      `<option value="${o.value}"${o.value === currentVal ? ' selected' : ''}>${o.label}</option>`
    ).join('');
  }

  let listsMeta = []; // [{name, label}, ...]

  async function loadLists() {
    try {
      const data = await api('/settings/lists');
      listsMeta = data.meta || [];
      Object.keys(data.lists).forEach(name => {
        if (data.lists[name].length) listItems[name] = data.lists[name];
      });
      refreshLeadStatusSelects();
      refreshListSourceSelect();
      renderAllListSections();
    } catch { refreshLeadStatusSelects(); }
  }

  function refreshLeadStatusSelects() {
    const fStatus = document.getElementById('f-status');
    const fPrio   = document.getElementById('f-prio');
    if (fStatus) fStatus.innerHTML = listItems.status.map(i =>
      `<option value="${i.value}">${i.label}</option>`).join('');
    if (fPrio) fPrio.innerHTML = listItems.prioridades.map(i =>
      `<option value="${i.value}">${i.label}</option>`).join('');
  }

  function renderAllListSections() {
    const container = document.getElementById('all-lists-container');
    if (!container) return;
    const isAdmin = session.role === 'admin';
    container.innerHTML = listsMeta.map((meta, mIdx) => {
      const items = listItems[meta.name] || [];
      const isSystem = ['status', 'prioridades'].includes(meta.name);
      return `
        <div style="margin-bottom:1.5rem">
          <div class="settings-section__header">
            <h4 class="settings-h4">${meta.label}</h4>
            ${isAdmin ? `<div style="display:flex;gap:.5rem">
              <button class="btn btn--primary btn--sm" data-add-list="${meta.name}">+ Adicionar</button>
              ${!isSystem ? `<button class="btn btn--danger-lt btn--sm" data-delete-list="${meta.name}">Eliminar lista</button>` : ''}
            </div>` : ''}
          </div>
          <div class="fields-list" id="list-section-${meta.name}">
            ${items.map(item => renderListItemRow(item, meta.name, isAdmin)).join('')}
          </div>
        </div>
        ${mIdx < listsMeta.length - 1 ? '<div class="settings-divider"></div>' : ''}`;
    }).join('');
    attachListSectionEvents();
  }

  function renderListItemRow(item, listName, isAdmin) {
    const style = item.color ? badgeStyle(item.color) : '';
    const swatch = item.color ? `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${item.color.startsWith('#') ? item.color : (LIST_COLORS.find(c=>c.name===item.color)?.hex||item.color)};margin-right:.35rem;vertical-align:middle"></span>` : '';
    return `
      <div class="field-item">
        <span class="field-item__drag">⠿</span>
        <span class="field-item__name"><span class="status-badge" style="${style}">${swatch}${item.label}</span></span>
        <span class="field-item__type t-muted">${item.value}</span>
        ${isAdmin ? `<div class="field-item__actions">
          <button class="btn btn--sm btn--secondary t-ink" data-edit-list-item="${item.id}" data-list-name="${listName}">Editar</button>
          <button class="btn btn--sm btn--danger-lt" data-delete-list-item="${item.id}" data-list-name="${listName}">✕</button>
        </div>` : ''}
      </div>`;
  }

  function renderSingleListSection(listName) {
    const el = document.getElementById('list-section-' + listName);
    if (!el) return;
    const isAdmin = session.role === 'admin';
    el.innerHTML = (listItems[listName] || []).map(item => renderListItemRow(item, listName, isAdmin)).join('');
    attachListSectionEvents();
  }

  function buildColorPicker(selectedColor) {
    const el = document.getElementById('li-color-picker');
    if (!el) return;
    el.innerHTML = LIST_COLORS.map(c => `
      <div class="color-swatch${selectedColor === c.hex ? ' selected' : ''}"
           style="background:${c.hex}"
           title="${c.name}"
           data-color="${c.hex}"></div>`).join('');
    el.querySelectorAll('.color-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        el.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        sw.classList.add('selected');
        document.getElementById('li-color').value = sw.dataset.color;
      });
    });
  }

  function attachListSectionEvents() {
    document.querySelectorAll('[data-edit-list-item]').forEach(btn => {
      btn.addEventListener('click', () => {
        const listName = btn.dataset.listName;
        const id       = btn.dataset.editListItem;
        const item     = (listItems[listName] || []).find(i => String(i.id) === String(id));
        if (!item) return;
        document.getElementById('modal-list-item-title').textContent = 'Editar item';
        document.getElementById('li-id').value    = item.id;
        document.getElementById('li-list').value  = listName;
        document.getElementById('li-value').value = item.value;
        document.getElementById('li-label').value = item.label;
        document.getElementById('li-color').value = item.color || '';
        document.getElementById('li-value').disabled = true;
        document.getElementById('li-delete-btn').style.display = '';
        buildColorPicker(item.color || '');
        openModal('modal-list-item');
      });
    });
    document.querySelectorAll('[data-delete-list-item]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const listName = btn.dataset.listName;
        const id       = btn.dataset.deleteListItem;
        if (!confirm('Eliminar este item?')) return;
        try {
          await api(`/settings/lists/${listName}/${id}`, { method: 'DELETE' });
          listItems[listName] = (listItems[listName] || []).filter(i => String(i.id) !== String(id));
          renderSingleListSection(listName);
        } catch (err) { alert('Erro: ' + err.message); }
      });
    });
    document.querySelectorAll('[data-add-list]').forEach(btn => {
      btn.addEventListener('click', () => {
        const listName = btn.dataset.addList;
        document.getElementById('modal-list-item-title').textContent = 'Adicionar item';
        document.getElementById('li-id').value    = '';
        document.getElementById('li-list').value  = listName;
        document.getElementById('li-value').value = '';
        document.getElementById('li-label').value = '';
        document.getElementById('li-color').value = '';
        document.getElementById('li-value').disabled = false;
        document.getElementById('li-delete-btn').style.display = 'none';
        buildColorPicker('');
        openModal('modal-list-item');
      });
    });
    document.querySelectorAll('[data-delete-list]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.deleteList;
        if (!confirm(`Eliminar a lista "${name}" e todos os seus itens?`)) return;
        try {
          await api(`/settings/lists-meta/${name}`, { method: 'DELETE' });
          listsMeta = listsMeta.filter(l => l.name !== name);
          delete listItems[name];
          renderAllListSections();
        } catch (err) { alert('Erro: ' + err.message); }
      });
    });
  }

  function updateOthersTabVisibility() {
    const tabBtn = document.getElementById('tab-btn-outros');
    if (tabBtn) tabBtn.style.display = allFields.some(f => f.custom && f.active) ? '' : 'none';
  }

  function renderLeadCustomFields(leadData) {
    const panel = document.getElementById('tab-outros');
    if (!panel) return;
    const active = allFields.filter(f => f.custom && f.active);
    if (!active.length) {
      panel.innerHTML = '<p class="settings-section__sub" style="padding:.5rem 0">Ainda não há campos personalizados. Adiciona campos em ⚙️ Configurações.</p>';
      return;
    }
    panel.innerHTML = active.map(f => {
      const val = (leadData && leadData.customData && leadData.customData[f.key]) ? leadData.customData[f.key] : '';
      let input = '';
      if (f.type === 'textarea') {
        input = `<textarea id="fcustom-${f.key}" name="${f.key}" placeholder="${f.placeholder||''}">${val}</textarea>`;
      } else if (f.type === 'select') {
        const opts = getOptionsForSource(f.options?.source || '');
        const def  = val || f.placeholder || '';
        input = `<select id="fcustom-${f.key}" name="${f.key}">${opts.map(o => `<option value="${o.value}"${o.value===def?' selected':''}>${o.label}</option>`).join('')}</select>`;
      } else {
        input = `<input type="${f.type}" id="fcustom-${f.key}" name="${f.key}" placeholder="${f.placeholder||''}" value="${val}">`;
      }
      return `<div class="form-row full"><div class="form-group"><label>${f.label}</label>${input}</div></div>`;
    }).join('');
  }

  async function loadUsers() {
    if (session.role !== 'admin') return;
    try {
      const data = await api('/auth/users');
      users = (data.users || []).map(u => ({
        id: u.id, nome: u.name, email: u.email, role: u.role,
      }));
      renderUsers();
    } catch { /* sem permissão ou API indisponível */ }
  }

  async function loadCustomFields() {
    try {
      const data = await api('/settings/fields');
      customFields = (data.fields || []).map(f => ({
        id: f.id, key: f.key, label: f.label, type: f.type,
        options: f.options, placeholder: f.placeholder,
        active: f.active, position: f.position, custom: true,
      }));
      allFields = [...defaultFields, ...customFields];
      renderFields();
      updateOthersTabVisibility();
    } catch { /* sem campos custom ou API indisponível */ }
  }

  async function saveCustomField(fieldData, existingId) {
    if (!token) { alert('Sessão expirada. Faz login novamente.'); return null; }
    const method = existingId ? 'PUT' : 'POST';
    const path   = existingId ? `/settings/fields/${existingId}` : '/settings/fields';
    try {
      return await api(path, { method, body: fieldData });
    } catch (err) {
      alert('Erro ao guardar campo: ' + err.message);
      return null;
    }
  }

  async function deleteCustomField(id) {
    if (!token || !id) return;
    try { await api(`/settings/fields/${id}`, { method: 'DELETE' }); } catch {}
  }

  function renderFields() {
    const el = document.getElementById('fields-list');
    if (!el) return;
    el.innerHTML = allFields.map((f, i) => `
      <div class="field-item" data-idx="${i}">
        <span class="field-item__drag">⠿</span>
        <span class="field-item__name">${f.label}</span>
        <span class="field-item__type">${fieldTypeLabel(f)}</span>
        <label class="field-item__toggle" title="${f.active ? 'Activo' : 'Inactivo'}">
          <input type="checkbox" ${f.active ? 'checked' : ''} data-field-toggle="${i}">
          <div class="toggle-track"></div>
        </label>
        ${session.role === 'admin' ? `
        <div class="field-item__actions">
          <button class="btn btn--sm btn--secondary t-ink" data-edit-field="${i}">Editar</button>
          ${f.custom ? `<button class="btn btn--sm btn--danger-lt" data-delete-field="${i}">✕</button>` : ''}
        </div>` : ''}
      </div>`).join('');

    el.querySelectorAll('[data-field-toggle]').forEach(cb => {
      cb.addEventListener('change', () => {
        const f = allFields[+cb.dataset.fieldToggle];
        f.active = cb.checked;
        if (f.id && token) api(`/settings/fields/${f.id}`, { method:'PUT', body:{ label:f.label, type:f.type, options:f.options, placeholder:f.placeholder, active:f.active, position:f.position||0 } }).catch(()=>{});
        else if (f.system && token) api('/settings/fields', { method:'POST', body:{ key:f.key, label:f.label, type:f.type, active:f.active, system:true } }).catch(()=>{});
        updateOthersTabVisibility();
      });
    });
    el.querySelectorAll('[data-edit-field]').forEach(btn => btn.addEventListener('click', () => openEditField(+btn.dataset.editField)));
    el.querySelectorAll('[data-delete-field]').forEach(btn => btn.addEventListener('click', () => deleteFieldLocal(+btn.dataset.deleteField)));
  }

  function openEditField(idx) {
    const f = allFields[idx];
    if (!f) return;
    document.querySelector('#modal-field .modal__title').textContent = 'Editar campo';
    document.getElementById('ff-field-idx').value   = idx;
    document.getElementById('ff-name').value         = f.label;
    document.getElementById('ff-type').value         = f.type;
    document.getElementById('ff-placeholder').value  = f.type !== 'select' ? (f.placeholder || '') : '';
    // Campo de sistema: desactivar chave (não editável)
    const keyInput = document.getElementById('ff-key');
    if (keyInput) { keyInput.value = f.key; keyInput.disabled = !!f.system; }
    const isSelect = f.type === 'select';
    toggleSelectSection(isSelect);
    if (isSelect && f.options?.source) {
      document.getElementById('ff-list-source').value = f.options.source;
      populateDefaultValues(f.options.source, f.placeholder);
    }
    openModal('modal-field');
  }

  async function deleteFieldLocal(idx) {
    const f = allFields[idx];
    if (!f?.custom) return;
    if (!confirm(`Eliminar o campo "${f.label}"? Esta acção não pode ser desfeita.`)) return;
    await deleteCustomField(f.id);
    allFields.splice(idx, 1);
    customFields = allFields.filter(x => x.custom);
    renderFields();
    updateOthersTabVisibility();
  }

  // Resetar modal ao abrir novo campo
  document.querySelectorAll('[data-modal-open="modal-field"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelector('#modal-field .modal__title').textContent = 'Adicionar campo personalizado';
      document.getElementById('ff-field-idx').value  = '';
      document.getElementById('ff-name').value        = '';
      document.getElementById('ff-type').value        = 'text';
      document.getElementById('ff-placeholder').value = '';
      toggleSelectSection(false);
    });
  });

  document.getElementById('ff-type')?.addEventListener('change', function () {
    const isSelect = this.value === 'select';
    toggleSelectSection(isSelect);
    if (isSelect) populateDefaultValues(document.getElementById('ff-list-source')?.value || 'status');
  });

  document.getElementById('ff-list-source')?.addEventListener('change', function () {
    populateDefaultValues(this.value);
  });

  document.getElementById('form-field')?.addEventListener('submit', async e => {
    e.preventDefault();
    const idxEl = document.getElementById('ff-field-idx');
    const idx   = idxEl?.value !== '' ? +idxEl.value : -1;
    const name  = document.getElementById('ff-name').value.trim();
    const type  = document.getElementById('ff-type').value;
    if (!name) { alert('Nome do campo é obrigatório.'); return; }

    const key = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
    const fieldData = { key, label: name, type, active: true, custom: true };

    if (type === 'select') {
      fieldData.options     = { source: document.getElementById('ff-list-source').value };
      fieldData.placeholder = document.getElementById('ff-default-value').value;
    } else {
      fieldData.placeholder = document.getElementById('ff-placeholder').value.trim() || null;
      fieldData.options     = null;
    }

    let existingId = null;
    const isSystemField = idx >= 0 && allFields[idx]?.system;

    if (idx >= 0 && allFields[idx]?.custom) {
      existingId         = allFields[idx].id;
      fieldData.active   = allFields[idx].active;
      fieldData.position = allFields[idx].position || 0;
    } else if (isSystemField) {
      // Campo de sistema: upsert com POST (ON CONFLICT DO UPDATE no backend)
      fieldData.key    = allFields[idx].key;
      fieldData.system = true;
      fieldData.active = allFields[idx].active;
    }

    let result;
    if (isSystemField && !allFields[idx]?.id) {
      result = await saveCustomField(fieldData, null);
    } else {
      result = await saveCustomField(fieldData, existingId);
    }
    if (!result) return;

    if (idx >= 0) {
      allFields[idx] = { ...allFields[idx], ...fieldData, id: result.field?.id || existingId };
    } else {
      fieldData.id     = result.field?.id;
      fieldData.custom = true;
      allFields.push(fieldData);
    }
    customFields = allFields.filter(x => x.custom);
    if (idxEl) idxEl.value = '';
    closeModal('modal-field');
    renderFields();
    updateOthersTabVisibility();
  });

  document.querySelectorAll('.settings-nav__item').forEach(item => {
    item.addEventListener('click', () => {
      const key = item.dataset.settings;
      document.querySelectorAll('.settings-nav__item').forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
      item.classList.add('active');
      document.getElementById('settings-'+key)?.classList.add('active');
      if (key === 'users')  renderUsers();
      if (key === 'fields') renderFields();
      if (key === 'status') renderAllListSections();
    });
  });

  // Submit: criar / editar item de lista
  document.getElementById('form-list-item')?.addEventListener('submit', async e => {
    e.preventDefault();
    const id       = document.getElementById('li-id').value;
    const listName = document.getElementById('li-list').value;
    const value    = document.getElementById('li-value').value.trim();
    const label    = document.getElementById('li-label').value.trim();
    const color    = document.getElementById('li-color').value || null;
    if (!label || (!id && !value)) { alert('Preenche todos os campos.'); return; }
    try {
      if (id) {
        const res = await api(`/settings/lists/${listName}/${id}`, { method: 'PUT', body: { label, color } });
        const idx = (listItems[listName] || []).findIndex(i => String(i.id) === String(id));
        if (idx >= 0) listItems[listName][idx] = res.item;
      } else {
        const res = await api(`/settings/lists/${listName}`, { method: 'POST', body: { value, label, color } });
        if (!listItems[listName]) listItems[listName] = [];
        listItems[listName].push(res.item);
      }
      renderSingleListSection(listName);
      refreshLeadStatusSelects();
      closeModal('modal-list-item');
    } catch (err) { alert('Erro: ' + err.message); }
  });

  // Delete a partir do modal
  document.getElementById('li-delete-btn')?.addEventListener('click', async () => {
    const id       = document.getElementById('li-id').value;
    const listName = document.getElementById('li-list').value;
    if (!id || !confirm('Eliminar este item?')) return;
    try {
      await api(`/settings/lists/${listName}/${id}`, { method: 'DELETE' });
      listItems[listName] = (listItems[listName] || []).filter(i => String(i.id) !== String(id));
      renderSingleListSection(listName);
      refreshLeadStatusSelects();
      closeModal('modal-list-item');
    } catch (err) { alert('Erro: ' + err.message); }
  });

  // Submit: criar nova lista
  document.getElementById('form-new-list')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name  = document.getElementById('nl-name').value.trim();
    const label = document.getElementById('nl-label').value.trim();
    if (!name || !label) { alert('Preenche todos os campos.'); return; }
    try {
      const res = await api('/settings/lists-meta', { method: 'POST', body: { name, label } });
      listsMeta.push(res.list);
      listItems[res.list.name] = [];
      closeModal('modal-new-list');
      document.getElementById('nl-name').value  = '';
      document.getElementById('nl-label').value = '';
      renderAllListSections();
    } catch (err) { alert('Erro: ' + err.message); }
  });

  /* ══════════════════════════════════════════════════════════
     14. DIAGNÓSTICO — via API
  ══════════════════════════════════════════════════════════ */
  async function runDiagnosis(id) {
    const l   = leads.find(x => x.id === id);
    if (!l) return;
    const btn = tbody.querySelector(`[data-diagnose="${id}"]`);
    if (btn) { btn.textContent = '⏳ A gerar…'; btn.disabled = true; }
    try {
      const data = await api(`/leads/${id}/generate`, { method: 'POST' });
      await loadLeads();
      if (btn) btn.textContent = '✓ Gerado';
      setTimeout(() => { if (btn) { btn.textContent = '🧠 Diagnóstico'; btn.disabled = false; } }, 3000);
    } catch (err) {
      alert('Erro ao gerar diagnóstico: ' + err.message);
      if (btn) { btn.textContent = '🧠 Diagnóstico'; btn.disabled = false; }
    }
  }

  /* ══════════════════════════════════════════════════════════
     15. UTILS
  ══════════════════════════════════════════════════════════ */
  function fmtDate(str) {
    if (!str) return '—';
    const d = new Date(str);
    return isNaN(d) ? str : d.toLocaleDateString('pt-PT');
  }

  /* ══════════════════════════════════════════════════════════
     16. INIT
  ══════════════════════════════════════════════════════════ */
  loadLeads();
  loadUsers();
  loadLists();
  renderFields();
  loadCustomFields();

})();
