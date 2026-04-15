/* ============================================================
   MOZ · CRM.JS  v2
   Auth check · Tabs · Leads CRUD · Import/Export · Settings
   ============================================================ */

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     1. AUTENTICAÇÃO
  ══════════════════════════════════════════════════════════ */
  const session = (() => {
    const raw = localStorage.getItem('moz_user') || sessionStorage.getItem('moz_user');
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  })();

  // Redirecionar para login se não há sessão
  if (!session) {
    window.location.href = 'index.html';
    return; // parar execução
  }

  // Preencher UI com dados do user
  const initials = session.nome ? session.nome.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() : '?';
  document.getElementById('user-avatar').textContent = initials;
  document.getElementById('user-name').textContent = session.nome || session.email;
  document.getElementById('user-role').textContent = '· ' + (session.role === 'admin' ? 'Admin' : session.role === 'editor' ? 'Editor' : 'Viewer');

  // Logout
  document.getElementById('btn-logout').addEventListener('click', () => {
    localStorage.removeItem('moz_user');
    sessionStorage.removeItem('moz_user');
    window.location.href = 'index.html';
  });

  /* ══════════════════════════════════════════════════════════
     2. DADOS (em memória — substituir por API quando backend pronto)
  ══════════════════════════════════════════════════════════ */
  let leads = [
    {
      id: 1, empresa: 'Auto Sog', sector: 'Automóvel', localizacao: 'Estremoz',
      responsavel: 'Proprietário', emailLead: 'autosog@mail.telepac.pt', telefone: '268 339 131',
      status: 'proposta', prioridade: 'hot', valorEstimado: '€ 820/mês',
      ultimoContacto: '2026-04-10', followup: '2026-04-22', canalOrigem: 'Prospecção directa',
      notas: 'Único concessionário Renault em Estremoz. Zero presença digital.',
      linkInterno: 'leads/auto-sog/interna.html', linkCliente: 'leads/auto-sog/cliente.html'
    },
    {
      id: 2, empresa: 'Miraldino', sector: 'Máquinas Agrícolas', localizacao: 'Sousel',
      responsavel: 'Severo Mendes', emailLead: '', telefone: '268 551 100',
      status: 'contactado', prioridade: 'media', valorEstimado: '€ 750/mês',
      ultimoContacto: '2026-04-08', followup: '2026-04-25', canalOrigem: 'Prospecção directa',
      notas: 'Líder distrital >30% quota. Website existe mas sem SEO. LinkedIn inexistente.',
      linkInterno: 'leads/miraldino/interna.html', linkCliente: 'leads/miraldino/cliente.html'
    },
  ];

  let users = [
    { id: 1, nome: session.nome || 'Admin', email: session.email || 'hello@moz.pt', role: session.role || 'admin' },
    { id: 2, nome: 'Equipa Moz', email: 'equipa@moz.pt', role: 'editor' },
  ];

  let customFields = [];

  /* ══════════════════════════════════════════════════════════
     3. NAVEGAÇÃO DE PAINÉIS (tabs)
  ══════════════════════════════════════════════════════════ */
  const panels = {
    leads:    document.getElementById('panel-leads'),
    io:       document.getElementById('panel-io'),
    settings: document.getElementById('panel-settings'),
  };
  const tabLinks = document.querySelectorAll('.crm-tab-link');

  function switchTab(name) {
    Object.values(panels).forEach(p => p.classList.remove('active'));
    tabLinks.forEach(l => {
      const active = l.dataset.tab === name;
      l.style.color  = active ? 'var(--color-teal)'            : 'rgba(255,255,255,.45)';
      l.style.background = active ? 'rgba(50,141,151,.15)' : '';
    });
    if (panels[name]) panels[name].classList.add('active');
  }

  tabLinks.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      switchTab(link.dataset.tab);
    });
  });

  // Activar leads por defeito
  switchTab('leads');

  /* ══════════════════════════════════════════════════════════
     4. MODAIS (abertura / fecho genérico)
  ══════════════════════════════════════════════════════════ */
  document.querySelectorAll('[data-modal-open]').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.modalOpen));
  });
  document.querySelectorAll('[data-modal-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.modalClose));
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay.id); });
  });

  function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
  }
  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
  }

  /* ══════════════════════════════════════════════════════════
     5. LEADS — RENDER
  ══════════════════════════════════════════════════════════ */
  const tbody    = document.getElementById('crm-tbody');
  const emptyDiv = document.getElementById('crm-empty');

  const statusLabels = {
    lead: 'Lead', contactado: 'Contactado', proposta: 'Proposta', cliente: 'Cliente', perdido: 'Perdido'
  };
  const prioLabels = { hot: '🔥 Hot', media: 'Média', cold: '❄️ Cold' };

  let filterStatus = 'todos';
  let filterPrio   = 'todos';
  let filterSearch = '';
  let sortCol      = null;
  let sortAsc      = true;

  function filteredLeads() {
    return leads.filter(l => {
      const mStatus = filterStatus === 'todos' || l.status === filterStatus;
      const mPrio   = filterPrio   === 'todos' || l.prioridade === filterPrio;
      const mSearch = !filterSearch ||
        (l.empresa     || '').toLowerCase().includes(filterSearch) ||
        (l.sector      || '').toLowerCase().includes(filterSearch) ||
        (l.localizacao || '').toLowerCase().includes(filterSearch);
      return mStatus && mPrio && mSearch;
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
      <td class="td-empresa">
        ${l.empresa}
        <small>${[l.sector, l.localizacao].filter(Boolean).join(' · ')}</small>
      </td>
      <td><span class="status-badge status--${l.status}">${statusLabels[l.status] || l.status}</span></td>
      <td><span class="priority-badge priority--${l.prioridade}">${prioLabels[l.prioridade] || l.prioridade}</span></td>
      <td>${l.valorEstimado || '—'}</td>
      <td>${fmtDate(l.ultimoContacto)}</td>
      <td>${l.canalOrigem || '—'}</td>
      <td class="td-notes">${l.notas ? l.notas.slice(0,80) + (l.notas.length > 80 ? '…' : '') : '—'}</td>
      <td class="td-actions">
        <button class="action-link" data-edit="${l.id}" title="Editar">✏ Editar</button>
        <button class="action-link action-link--diag" data-diagnose="${l.id}" title="Gerar Diagnóstico & Proposta com IA">🧠 Diagnóstico</button>
        ${l.linkInterno ? `<a class="action-link" href="${l.linkInterno}" target="_blank" title="Versão interna">📋 Int.</a>` : ''}
        ${l.linkCliente ? `<a class="action-link" href="${l.linkCliente}" target="_blank" title="Versão cliente">📄 Cli.</a>` : ''}
        <button class="action-link action-link--pdf" data-pdf="${l.id}" title="Exportar ficha PDF">🖨</button>
        <button class="action-link action-link--delete" data-delete="${l.id}" title="Eliminar">✕</button>
      </td>
    </tr>`;
  }

  function attachRowEvents() {
    tbody.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => openEditLead(+btn.dataset.edit));
    });
    tbody.querySelectorAll('[data-diagnose]').forEach(btn => {
      btn.addEventListener('click', () => runDiagnosis(+btn.dataset.diagnose));
    });
    tbody.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => deleteLead(+btn.dataset.delete));
    });
    tbody.querySelectorAll('[data-pdf]').forEach(btn => {
      btn.addEventListener('click', () => printLeadPdf(+btn.dataset.pdf));
    });
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
      document.querySelectorAll('[data-filter-prio]').forEach(b => b.classList.remove('active', 'active--orange', 'active--yellow'));
      btn.classList.add(btn.dataset.filterPrio === 'hot' ? 'active--orange' : btn.dataset.filterPrio === 'media' ? 'active--yellow' : 'active');
      render();
    });
  });

  document.getElementById('crm-search')?.addEventListener('input', e => {
    filterSearch = e.target.value.toLowerCase();
    render();
  });

  document.querySelectorAll('.crm-table th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortCol === col) sortAsc = !sortAsc; else { sortCol = col; sortAsc = true; }
      document.querySelectorAll('.crm-table th').forEach(h => { h.classList.remove('sorted'); h.querySelector('.sort-icon') && (h.querySelector('.sort-icon').textContent = '↕'); });
      th.classList.add('sorted');
      th.querySelector('.sort-icon') && (th.querySelector('.sort-icon').textContent = sortAsc ? '↑' : '↓');
      leads.sort((a, b) => {
        const av = (a[col] || '').toString().toLowerCase();
        const bv = (b[col] || '').toString().toLowerCase();
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      });
      render();
    });
  });

  /* ══════════════════════════════════════════════════════════
     7. CRUD — CRIAR / EDITAR LEAD
  ══════════════════════════════════════════════════════════ */
  const formLead = document.getElementById('form-lead');

  // Abrir modal de novo lead limpo
  document.querySelectorAll('[data-modal-open="modal-lead"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('modal-lead-title').textContent = 'Novo Lead';
      document.getElementById('f-lead-id').value = '';
      formLead.reset();
      // Activar primeiro tab
      switchModalTab('info');
      openModal('modal-lead');
    });
  });

  function openEditLead(id) {
    const l = leads.find(x => x.id === id);
    if (!l) return;
    document.getElementById('modal-lead-title').textContent = 'Editar Lead — ' + l.empresa;
    document.getElementById('f-lead-id').value      = l.id;
    document.getElementById('f-empresa').value      = l.empresa       || '';
    document.getElementById('f-sector').value       = l.sector        || '';
    document.getElementById('f-localizacao').value  = l.localizacao   || '';
    document.getElementById('f-responsavel').value  = l.responsavel   || '';
    document.getElementById('f-email-lead').value   = l.emailLead     || '';
    document.getElementById('f-telefone').value     = l.telefone      || '';
    document.getElementById('f-status').value       = l.status        || 'lead';
    document.getElementById('f-prio').value         = l.prioridade    || 'media';
    document.getElementById('f-valor').value        = l.valorEstimado || '';
    document.getElementById('f-canal').value        = l.canalOrigem   || '';
    document.getElementById('f-data').value         = l.ultimoContacto || '';
    document.getElementById('f-followup').value     = l.followup      || '';
    document.getElementById('f-link-int').value     = l.linkInterno   || '';
    document.getElementById('f-link-cli').value     = l.linkCliente   || '';
    document.getElementById('f-notas').value        = l.notas         || '';
    switchModalTab('info');
    openModal('modal-lead');
  }

  formLead.addEventListener('submit', e => {
    e.preventDefault();
    const id       = document.getElementById('f-lead-id').value;
    const payload  = {
      empresa:        document.getElementById('f-empresa').value.trim(),
      sector:         document.getElementById('f-sector').value.trim(),
      localizacao:    document.getElementById('f-localizacao').value.trim(),
      responsavel:    document.getElementById('f-responsavel').value.trim(),
      emailLead:      document.getElementById('f-email-lead').value.trim(),
      telefone:       document.getElementById('f-telefone').value.trim(),
      status:         document.getElementById('f-status').value,
      prioridade:     document.getElementById('f-prio').value,
      valorEstimado:  document.getElementById('f-valor').value.trim(),
      canalOrigem:    document.getElementById('f-canal').value.trim(),
      ultimoContacto: document.getElementById('f-data').value,
      followup:       document.getElementById('f-followup').value,
      linkInterno:    document.getElementById('f-link-int').value.trim(),
      linkCliente:    document.getElementById('f-link-cli').value.trim(),
      notas:          document.getElementById('f-notas').value.trim(),
    };
    if (!payload.empresa) {
      alert('O nome da empresa é obrigatório.');
      return;
    }
    if (id) {
      // Editar
      const idx = leads.findIndex(x => x.id === +id);
      if (idx !== -1) leads[idx] = { ...leads[idx], ...payload };
    } else {
      // Novo
      payload.id = Date.now();
      leads.push(payload);
    }
    closeModal('modal-lead');
    render();
  });

  function deleteLead(id) {
    if (!confirm('Eliminar este lead? Esta acção não pode ser desfeita.')) return;
    leads = leads.filter(l => l.id !== id);
    render();
  }

  /* ══════════════════════════════════════════════════════════
     8. TABS DO MODAL DE LEAD
  ══════════════════════════════════════════════════════════ */
  document.querySelectorAll('.modal-tab').forEach(tab => {
    tab.addEventListener('click', () => switchModalTab(tab.dataset.modalTab));
  });

  function switchModalTab(name) {
    document.querySelectorAll('.modal-tab').forEach(t => t.classList.toggle('active', t.dataset.modalTab === name));
    document.querySelectorAll('.modal-tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
  }

  /* ══════════════════════════════════════════════════════════
     9. EXPORTAR PDF (impressão do modal)
  ══════════════════════════════════════════════════════════ */
  document.getElementById('btn-lead-pdf').addEventListener('click', () => {
    const id  = document.getElementById('f-lead-id').value;
    const l   = leads.find(x => x.id === +id);
    if (!l && !id) { alert('Guarda o lead primeiro para exportar PDF.'); return; }
    printLeadPdf(id ? +id : null, l);
  });

  function printLeadPdf(id, leadData) {
    const l = leadData || leads.find(x => x.id === id);
    if (!l) return;
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>${l.empresa} · Moz CRM</title>
    <style>
      * { box-sizing: border-box; margin:0; padding:0; }
      body { font-family: system-ui, sans-serif; font-size: 13px; line-height: 1.6; color:#222; padding:2.5cm; }
      h1 { font-size:20px; margin-bottom:4px; }
      .meta { color:#777; font-size:11px; margin-bottom:24px; }
      table { width:100%; border-collapse:collapse; margin-bottom:20px; }
      td { padding:8px 10px; border-bottom:1px solid #eee; vertical-align:top; }
      td:first-child { font-weight:600; width:40%; color:#444; }
      .section { font-size:10px; font-weight:700; letter-spacing:.15em; text-transform:uppercase; color:#888; margin:20px 0 8px; }
      .footer { margin-top:40px; padding-top:12px; border-top:1px solid #ddd; font-size:10px; color:#aaa; }
    </style></head><body>
    <h1>${l.empresa}</h1>
    <div class="meta">Exportado do Moz CRM · ${new Date().toLocaleDateString('pt-PT')}</div>
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
      <tr><td>Próximo Follow-up</td><td>${fmtDate(l.followup)}</td></tr>
    </table>
    ${l.notas ? `<div class="section">Notas</div><p class="pdf-notes-text">${l.notas}</p>` : ''}
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
    const header = csvCols.join(';');
    const rows   = data.map(l => csvCols.map(c => `"${(l[c]||'').toString().replace(/"/g,'""')}"`).join(';'));
    const csv    = [header, ...rows].join('\n');
    const blob   = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url    = URL.createObjectURL(blob);
    const a      = Object.assign(document.createElement('a'), { href: url, download: 'moz-crm.csv' });
    a.click();
    URL.revokeObjectURL(url);
  }

  document.getElementById('btn-export-csv')?.addEventListener('click', () => exportCsv(filteredLeads()));
  document.getElementById('btn-export-all')?.addEventListener('click', () => exportCsv(leads));

  /* ══════════════════════════════════════════════════════════
     11. MODELO CSV (download)
  ══════════════════════════════════════════════════════════ */
  document.getElementById('btn-download-template')?.addEventListener('click', () => {
    const header = csvCols.join(';');
    const example = csvCols.map(c => `"${c === 'empresa' ? 'Exemplo Lda.' : c === 'status' ? 'lead' : c === 'prioridade' ? 'media' : ''}"`).join(';');
    const csv    = [header, example].join('\n');
    const blob   = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a      = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'moz-crm-modelo.csv' });
    a.click();
  });

  /* ══════════════════════════════════════════════════════════
     12. IMPORTAR CSV
  ══════════════════════════════════════════════════════════ */
  const dropZone    = document.getElementById('drop-zone');
  const importFile  = document.getElementById('import-file');
  const btnImport   = document.getElementById('btn-process-import');
  const importFeed  = document.getElementById('import-feedback');
  let   importData  = null;

  if (dropZone) {
    dropZone.addEventListener('click', () => importFile.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    });
  }

  importFile?.addEventListener('change', () => {
    if (importFile.files[0]) processFile(importFile.files[0]);
  });

  function processFile(file) {
    if (!file.name.endsWith('.csv')) {
      showImportFeed('Apenas ficheiros .csv são aceites.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const text  = e.target.result.replace(/^\uFEFF/, ''); // strip BOM
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { showImportFeed('Ficheiro vazio ou sem dados.', 'error'); return; }
      const headers = lines[0].split(';').map(h => h.replace(/^"|"$/g,'').trim());
      importData = lines.slice(1).map((line, i) => {
        const vals = line.split(';').map(v => v.replace(/^"|"$/g,'').trim());
        const obj  = { id: Date.now() + i };
        headers.forEach((h, idx) => obj[h] = vals[idx] || '');
        return obj;
      }).filter(r => r.empresa);
      showImportFeed(`${importData.length} lead(s) prontos para importar. Clica em "Importar ficheiro" para confirmar.`, 'ok');
      btnImport.disabled = false;
    };
    reader.readAsText(file, 'UTF-8');
  }

  btnImport?.addEventListener('click', () => {
    if (!importData || !importData.length) return;
    leads = [...leads, ...importData];
    showImportFeed(`✓ ${importData.length} lead(s) importados com sucesso.`, 'ok');
    importData = null;
    btnImport.disabled = true;
    render();
    // Mudar para tab de leads após importação
    switchTab('leads');
  });

  function showImportFeed(msg, type) {
    importFeed.textContent = msg;
    importFeed.style.display  = 'block';
    importFeed.style.color    = type === 'error' ? '#e74c3c' : 'var(--color-teal)';
  }

  /* ══════════════════════════════════════════════════════════
     13. SETTINGS — UTILIZADORES
  ══════════════════════════════════════════════════════════ */
  function renderUsers() {
    const el = document.getElementById('users-list');
    if (!el) return;
    const roleClass = { admin: 'role--admin', editor: 'role--editor', viewer: 'role--viewer' };
    const roleLabel = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };
    el.innerHTML = users.map(u => `
      <div class="user-row">
        <div class="user-row__avatar">${u.nome.slice(0,2).toUpperCase()}</div>
        <div class="user-row__info">
          <div class="user-row__name">${u.nome}</div>
          <div class="user-row__email">${u.email}</div>
        </div>
        <span class="user-row__role-badge ${roleClass[u.role]||'role--viewer'}">${roleLabel[u.role]||u.role}</span>
        <div class="user-row__actions">
          <button class="btn btn--sm btn--secondary" class="t-ink" data-edit-user="${u.id}">Editar</button>
          ${u.id !== 1 ? `<button class="btn btn--sm" class="btn--danger-lt" data-delete-user="${u.id}">✕</button>` : ''}
        </div>
      </div>`).join('');

    el.querySelectorAll('[data-edit-user]').forEach(btn => {
      btn.addEventListener('click', () => openEditUser(+btn.dataset.editUser));
    });
    el.querySelectorAll('[data-delete-user]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('Eliminar este utilizador?')) {
          users = users.filter(u => u.id !== +btn.dataset.deleteUser);
          renderUsers();
        }
      });
    });
  }

  document.getElementById('form-user')?.addEventListener('submit', e => {
    e.preventDefault();
    const id   = document.getElementById('fu-id').value;
    const nome = document.getElementById('fu-nome').value.trim();
    const email= document.getElementById('fu-email').value.trim();
    const role = document.getElementById('fu-role').value;
    if (!nome || !email) { alert('Nome e email são obrigatórios.'); return; }
    if (id) {
      const u = users.find(x => x.id === +id);
      if (u) { u.nome = nome; u.email = email; u.role = role; }
    } else {
      users.push({ id: Date.now(), nome, email, role });
    }
    closeModal('modal-user');
    renderUsers();
  });

  function openEditUser(id) {
    const u = users.find(x => x.id === id);
    if (!u) return;
    document.getElementById('modal-user-title').textContent = 'Editar utilizador';
    document.getElementById('fu-id').value   = u.id;
    document.getElementById('fu-nome').value = u.nome;
    document.getElementById('fu-email').value= u.email;
    document.getElementById('fu-role').value = u.role;
    document.getElementById('fu-pwd').value  = '';
    openModal('modal-user');
  }

  // Limpar form ao abrir novo utilizador
  document.querySelectorAll('[data-modal-open="modal-user"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('modal-user-title').textContent = 'Adicionar utilizador';
      document.getElementById('fu-id').value   = '';
      document.getElementById('fu-nome').value = '';
      document.getElementById('fu-email').value= '';
      document.getElementById('fu-pwd').value  = '';
      document.getElementById('fu-role').value = 'editor';
    });
  });

  /* ══════════════════════════════════════════════════════════
     14. SETTINGS — CAMPOS DAS LEADS
  ══════════════════════════════════════════════════════════ */
  const defaultFields = [
    { key: 'empresa',         label: 'Empresa',          type: 'text',   active: true },
    { key: 'sector',          label: 'Sector',           type: 'text',   active: true },
    { key: 'localizacao',     label: 'Localização',      type: 'text',   active: true },
    { key: 'responsavel',     label: 'Responsável',      type: 'text',   active: true },
    { key: 'emailLead',       label: 'Email',            type: 'email',  active: true },
    { key: 'telefone',        label: 'Telefone',         type: 'tel',    active: true },
    { key: 'status',          label: 'Status',           type: 'select', active: true },
    { key: 'prioridade',      label: 'Prioridade',       type: 'select', active: true },
    { key: 'valorEstimado',   label: 'Valor Estimado',   type: 'text',   active: true },
    { key: 'canalOrigem',     label: 'Canal de Origem',  type: 'text',   active: true },
    { key: 'ultimoContacto',  label: 'Último Contacto',  type: 'date',   active: true },
    { key: 'followup',        label: 'Follow-up',        type: 'date',   active: true },
    { key: 'linkInterno',     label: 'Link Interno',     type: 'url',    active: true },
    { key: 'linkCliente',     label: 'Link Cliente',     type: 'url',    active: true },
    { key: 'notas',           label: 'Notas',            type: 'textarea', active: true },
  ];

  let allFields = [...defaultFields, ...customFields];

  function renderFields() {
    const el = document.getElementById('fields-list');
    if (!el) return;
    el.innerHTML = allFields.map((f, i) => `
      <div class="field-item" data-idx="${i}">
        <span class="field-item__drag" title="Arrastar para reordenar">⠿</span>
        <span class="field-item__name">${f.label}</span>
        <span class="field-item__type">${f.type}</span>
        <label class="field-item__toggle" title="${f.active ? 'Activo' : 'Inactivo'}">
          <input type="checkbox" ${f.active ? 'checked' : ''} data-field-toggle="${i}">
          <div class="toggle-track"></div>
        </label>
      </div>`).join('');

    el.querySelectorAll('[data-field-toggle]').forEach(cb => {
      cb.addEventListener('change', () => {
        allFields[+cb.dataset.fieldToggle].active = cb.checked;
      });
    });
  }

  document.getElementById('form-field')?.addEventListener('submit', e => {
    e.preventDefault();
    const name  = document.getElementById('ff-name').value.trim();
    const type  = document.getElementById('ff-type').value;
    const ph    = document.getElementById('ff-placeholder').value.trim();
    if (!name) { alert('Nome do campo é obrigatório.'); return; }
    allFields.push({ key: name.toLowerCase().replace(/\s+/g, '_'), label: name, type, placeholder: ph, active: true, custom: true });
    closeModal('modal-field');
    renderFields();
  });

  /* ══════════════════════════════════════════════════════════
     15. SETTINGS — NAVEGAÇÃO LATERAL
  ══════════════════════════════════════════════════════════ */
  document.querySelectorAll('.settings-nav__item').forEach(item => {
    item.addEventListener('click', () => {
      const key = item.dataset.settings;
      document.querySelectorAll('.settings-nav__item').forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
      item.classList.add('active');
      const sec = document.getElementById('settings-' + key);
      if (sec) sec.classList.add('active');
      // Renderizar ao activar
      if (key === 'users')  renderUsers();
      if (key === 'fields') renderFields();
    });
  });

  /* ══════════════════════════════════════════════════════════
     16. UTILS
  ══════════════════════════════════════════════════════════ */
  function fmtDate(str) {
    if (!str) return '—';
    const d = new Date(str);
    return isNaN(d) ? str : d.toLocaleDateString('pt-PT');
  }


  /* ══════════════════════════════════════════════════════════
     DIAGNÓSTICO — Geração automática com IA
  ══════════════════════════════════════════════════════════ */
  async function runDiagnosis(id) {
    const l = leads.find(x => x.id === id);
    if (!l) return;

    const API_URL = document.getElementById('api-url')?.value?.trim();

    // ── SEM BACKEND: mostrar instruções ──────────────────────
    if (!API_URL) {
      const msg = [
        `Diagnóstico: ${l.empresa}`,
        '',
        'O backend ainda não está configurado.',
        'Quando a Hostinger estiver pronta:',
        '  1. Define o URL da API em Configurações → Geral',
        '  2. Clica novamente neste botão',
        '',
        'O servidor irá:',
        '  • Copiar as templates (interna + cliente)',
        '  • Preencher os {{CAMPOS}} via Claude API',
        '  • Guardar em leads/' + slugify(l.empresa) + '/',
        '  • Actualizar os links neste registo'
      ].join('\n');
      alert(msg);
      return;
    }

    // ── COM BACKEND: chamada à API ────────────────────────────
    const btn = tbody.querySelector(`[data-diagnose="${id}"]`);
    if (btn) { btn.textContent = '⏳ A gerar…'; btn.disabled = true; }

    try {
      const res = await fetch(`${API_URL}/leads/${id}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token || ''}`
        },
        body: JSON.stringify({ lead: l })
      });

      if (!res.ok) throw new Error(`Erro ${res.status}: ${await res.text()}`);

      const data = await res.json();
      // Actualizar links no lead
      const idx = leads.findIndex(x => x.id === id);
      if (idx !== -1) {
        leads[idx].linkInterno = data.linkInterno;
        leads[idx].linkCliente = data.linkCliente;
      }

      render();
      if (btn) { btn.textContent = '✓ Gerado'; }
      setTimeout(() => render(), 2000); // re-render para mostrar os links

    } catch (err) {
      alert('Erro ao gerar diagnóstico:\n' + err.message);
      if (btn) { btn.textContent = '🧠 Diagnóstico'; btn.disabled = false; }
    }
  }

  function slugify(str) {
    return str.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /* ══════════════════════════════════════════════════════════
     17. INIT
  ══════════════════════════════════════════════════════════ */
  render();
  renderUsers();
  renderFields();

})();
