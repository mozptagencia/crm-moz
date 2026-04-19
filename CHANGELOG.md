# CRM Moz — Diário de Desenvolvimento

---

## 2026-04-19 — Sessão Claude Code

**Branch:** main | **Último commit:** `6b0e19f`
**VPS:** crm.happymoz.com | **Processo PM2:** moz-crm

---

### Passo 1 — Campos Personalizados das Leads ✅

- Tabela `custom_fields` criada (key, label, type, options JSONB, placeholder, active, position)
- API REST: `GET/POST/PUT/DELETE /api/settings/fields`
- Separador "Outros" no modal de lead renderiza campos activos
- Campos guardados em `custom_data` JSONB na tabela `contacts`
- Frontend carrega campos via `loadCustomFields()` ao iniciar
- Edição de lead existente via `normLead` + `renderLeadCustomFields`
- Toggle activo/inactivo por campo
- Campos de sistema visíveis mas sem botão eliminar

**Ficheiros:** `src/routes/settings.js` (criado), `src/app.js`, `src/db/schema.sql`, `public/crm.html`, `public/assets/js/crm.js`, `public/assets/css/crm.css`

---

### Passo 2 — Utilizadores ✅

- `GET /api/auth/users` (admin only)
- `PUT /api/auth/users/:id` — editar nome, email, role, password opcional
- `DELETE /api/auth/users/:id` — protegido (não elimina conta própria)
- `loadUsers()` carrega da API ao iniciar e após criar/editar
- Modal reutilizado para criar e editar (título e label de password dinâmicos)
- Botão "Eliminar" só aparece ao editar (e não para conta própria)
- Botão "Editar" corrigido (cor + abertura do modal)

**Ficheiros:** `src/routes/auth.js`, `public/crm.html`, `public/assets/js/crm.js`

---

### Passo 3 — Status, Prioridades e Listas ✅

- Tabela `lists` criada (metadata: name, label), pré-populada com status e prioridades
- Coluna `color` adicionada a `list_items`
- Coluna `system BOOLEAN` adicionada a `custom_fields`
- API:
  - `GET /api/settings/lists`
  - `POST /api/settings/lists-meta` — criar lista
  - `DELETE /api/settings/lists-meta/:name` — protegido (não elimina status/prioridades)
  - `POST/PUT /api/settings/lists/:name` — criar/editar item com cor
- Color picker visual (9 cores predefinidas) no modal de item
- Badges na tabela de leads usam cor da BD via `badgeStyle()`
- Selects `f-status` e `f-prio` carregam da API (sem opções hardcoded)
- `getOptionsForSource()` suporta qualquer lista
- Select "Usar lista de" actualiza com listas disponíveis
- Campos de sistema editáveis via upsert com `system: true`
- Listas personalizadas disponíveis como fonte em campos tipo "select"

**Ficheiros:** `src/routes/settings.js` (reescrito), `src/db/schema.sql`, `public/crm.html`, `public/assets/js/crm.js`, `public/assets/css/crm.css`

---

### Bugs Corrigidos

| Bug | Causa | Fix |
|-----|-------|-----|
| `settings.js` perdido no git reset | Nunca tinha sido committed | Recriado e committed |
| `custom_fields` não existia na VPS | Schema não re-executado | SQL manual via psql |
| Campos não gravavam após logout | Tabela inexistente, erro silencioso | Tabela criada + erro exposto no frontend |
| Permissão negada em `custom_fields` | Tabela criada pelo user `postgres`, app usa `moz_crm` | `GRANT` executado via psql |
| `custom_data` ausente em `contacts` | Coluna em falta no schema | `ALTER TABLE` via psql |
| Botão "Editar" utilizadores invisível | Faltava classe `t-ink` | Classe adicionada |
| Modal edição utilizador não abria | `is-open` em vez de `open` | Corrigido |
| Status/Prioridade não actualizavam | Typo `f-prioridade` + opções hardcoded | Corrigidos ambos |
| `list_items` sem permissão | Tabela criada após GRANT inicial | GRANT re-executado |

---

### Pendente

- **Passo 4** — Templates (gestão de templates HTML de diagnóstico)
- **Passo 5** — Configurações gerais
- Bugs visuais CSS (em curso)
- Diagnóstico com Claude API (após criar a Skill)
- Arquivo de leads eliminadas
