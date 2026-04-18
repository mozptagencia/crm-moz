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

  document.getElementById('btn-logout').addEventListener('click', () => {
    localStorage.removeItem('moz_user'); localStorage.removeItem('moz_token');
    sessionStorage.removeItem('moz_user'); sessionStorage.removeItem('moz_token');
    window.location.href = 'index.html';
  });

  /* ══════════════════════════════════════════════════════════
     2. ESTADO LOCAL
  ══════════════════════════════════════════════════════════ */
  let leads        = [];
  let users        = [{ id: session.id, nome: session.nome || session.name, email: session.email, role: session.role }];
  let customFields = [];

  const statusLabels = { lead: 'Lead', contactado: 'Contactado', proposta: 'Proposta', cliente: 'Cliente', perdido: 'Perdido' };
  const prioLabels   = { hot: '🔥 Hot', media: 'Média', cold: '❄️ Cold' };

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
      <td><span class="status-badge status--${l.status}">${statusLabels[l.status]||l.status}</span></td>
      <td><span class="priority-badge priority--${l.prioridade}">${prioLabels[l.prioridade]||l.prioridade}</span></td>
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
      <tr><td>Status</td><td>${statusLabels[l.status]||l.status}</td></tr>
      <tr><td>Prioridade</td><td>${prioLabels[l.prioridade]||l.prioridade}</td></tr>
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
          <button class="btn btn--sm btn--secondary" data-edit-user="${u.id}">Editar</button>
        </div>
      </div>`).join('');
  }

  document.getElementById('form-user')?.addEventListener('submit', async e => {
    e.preventDefault();
    const nome  = document.getElementById('fu-nome').value.trim();
    const email = document.getElementById('fu-email').value.trim();
    const pwd   = document.getElementById('fu-pwd').value;
    const role  = document.getElementById('fu-role').value;
    if (!nome || !email || !pwd) { alert('Todos os campos são obrigatórios.'); return; }
    try {
      await api('/auth/register', { method: 'POST', body: { name: nome, email, password: pwd, role } });
      closeModal('modal-user');
      alert('Utilizador criado com sucesso.');
    } catch (err) {
      alert('Erro: ' + err.message);
    }
  });

  document.querySelectorAll('[data-modal-open="modal-user"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('modal-user-title').textContent = 'Adicionar utilizador';
      ['fu-id','fu-nome','fu-email','fu-pwd'].forEach(id => document.getElementById(id) && (document.getElementById(id).value = ''));
      document.getElementById('fu-role').value = 'editor';
    });
  });

  /* ══════════════════════════════════════════════════════════
     13. SETTINGS — CAMPOS & NAVEGAÇÃO
  ══════════════════════════════════════════════════════════ */
  const defaultFields = [
    { key:'empresa', label:'Empresa', type:'text', active:true },
    { key:'sector', label:'Sector', type:'text', active:true },
    { key:'localizacao', label:'Localização', type:'text', active:true },
    { key:'responsavel', label:'Responsável', type:'text', active:true },
    { key:'emailLead', label:'Email', type:'email', active:true },
    { key:'telefone', label:'Telefone', type:'tel', active:true },
    { key:'status', label:'Status', type:'select', active:true },
    { key:'prioridade', label:'Prioridade', type:'select', active:true },
    { key:'valorEstimado', label:'Valor Estimado', type:'text', active:true },
    { key:'canalOrigem', label:'Canal de Origem', type:'text', active:true },
    { key:'ultimoContacto', label:'Último Contacto', type:'date', active:true },
    { key:'followup', label:'Follow-up', type:'date', active:true },
    { key:'linkInterno', label:'Link Interno', type:'url', active:true },
    { key:'linkCliente', label:'Link Cliente', type:'url', active:true },
    { key:'notas', label:'Notas', type:'textarea', active:true },
  ];
  let allFields = [...defaultFields, ...customFields];

  function renderFields() {
    const el = document.getElementById('fields-list');
    if (!el) return;
    el.innerHTML = allFields.map((f,i) => `
      <div class="field-item"><span class="field-item__drag">⠿</span>
      <span class="field-item__name">${f.label}</span><span class="field-item__type">${f.type}</span>
      <label class="field-item__toggle"><input type="checkbox" ${f.active?'checked':''} data-field-toggle="${i}"><div class="toggle-track"></div></label>
      </div>`).join('');
    el.querySelectorAll('[data-field-toggle]').forEach(cb => cb.addEventListener('change', () => { allFields[+cb.dataset.fieldToggle].active = cb.checked; }));
  }

  document.getElementById('form-field')?.addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('ff-name').value.trim();
    if (!name) { alert('Nome obrigatório.'); return; }
    allFields.push({ key: name.toLowerCase().replace(/\s+/g,'_'), label: name, type: document.getElementById('ff-type').value, active: true, custom: true });
    closeModal('modal-field');
    renderFields();
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
    });
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
  renderUsers();
  renderFields();

})();
