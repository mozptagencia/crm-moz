-- ============================================================
-- Moz CRM · Schema PostgreSQL
-- Executar: psql -U $DB_USER -d $DB_NAME -f schema.sql
-- ============================================================

-- Extensão para gerar UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── UTILIZADORES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(100)        NOT NULL,
  email        VARCHAR(255)        NOT NULL UNIQUE,
  password_hash VARCHAR(255)       NOT NULL,
  role         VARCHAR(20)         NOT NULL DEFAULT 'editor',  -- admin | editor | viewer
  created_at   TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

-- ── LEADS / CONTACTOS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER            REFERENCES users(id) ON DELETE SET NULL,
  empresa        VARCHAR(150)       NOT NULL,
  sector         VARCHAR(100),
  localizacao    VARCHAR(100),
  responsavel    VARCHAR(100),
  email          VARCHAR(255),
  telefone       VARCHAR(50),
  status         VARCHAR(30)        NOT NULL DEFAULT 'lead',     -- lead | contactado | proposta | cliente | perdido
  prioridade     VARCHAR(10)        NOT NULL DEFAULT 'media',    -- hot | media | cold
  valor_estimado VARCHAR(50),
  canal_origem   VARCHAR(100),
  ultimo_contacto DATE,
  followup       DATE,
  link_interno   TEXT,
  link_cliente   TEXT,
  notas          TEXT,
  custom_data    JSONB,
  created_at     TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

-- ── INTERACÇÕES / HISTÓRICO ───────────────────────────────────
CREATE TABLE IF NOT EXISTS interactions (
  id          SERIAL PRIMARY KEY,
  contact_id  INTEGER            NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_id     INTEGER            REFERENCES users(id) ON DELETE SET NULL,
  type        VARCHAR(50)        NOT NULL DEFAULT 'nota',  -- nota | email | chamada | reuniao | diagnostico
  content     TEXT               NOT NULL,
  created_at  TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

-- ── LISTAS CONFIGURÁVEIS (status, prioridades) ───────────────
CREATE TABLE IF NOT EXISTS list_items (
  id        SERIAL PRIMARY KEY,
  list_name VARCHAR(32)  NOT NULL,              -- 'status' | 'prioridades'
  value     VARCHAR(64)  NOT NULL,
  label     VARCHAR(128) NOT NULL,
  position  INTEGER      NOT NULL DEFAULT 0,
  UNIQUE(list_name, value)
);

-- Valores por defeito
INSERT INTO list_items (list_name, value, label, position) VALUES
  ('status', 'lead',        'Lead',              0),
  ('status', 'contactado',  'Contactado',        1),
  ('status', 'proposta',    'Proposta Enviada',  2),
  ('status', 'cliente',     'Cliente',           3),
  ('status', 'perdido',     'Perdido',           4),
  ('prioridades', 'hot',   '🔥 Alta (Hot)',      0),
  ('prioridades', 'media', 'Média',              1),
  ('prioridades', 'cold',  '❄️ Baixa (Cold)',    2)
ON CONFLICT (list_name, value) DO NOTHING;

-- ── CAMPOS PERSONALIZADOS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS custom_fields (
  id          SERIAL PRIMARY KEY,
  key         VARCHAR(64)         NOT NULL UNIQUE,
  label       VARCHAR(128)        NOT NULL,
  type        VARCHAR(32)         NOT NULL DEFAULT 'text',  -- text | textarea | select | date | number
  options     JSONB,                                         -- ex: {"source":"status"} ou {"source":"prioridades"}
  placeholder VARCHAR(128),
  active      BOOLEAN             NOT NULL DEFAULT TRUE,
  position    INTEGER             NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

-- ── ÍNDICES ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_contacts_status     ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_contacts_prioridade ON contacts(prioridade);
CREATE INDEX IF NOT EXISTS idx_contacts_user_id    ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_interactions_contact ON interactions(contact_id);

-- ── TRIGGER: actualizar updated_at automaticamente ────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── UTILIZADOR ADMIN INICIAL ──────────────────────────────────
-- Password: moz2026 (mudar após o primeiro login!)
INSERT INTO users (name, email, password_hash, role)
VALUES (
  'Administrador',
  'hello@moz.pt',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',  -- password
  'admin'
)
ON CONFLICT (email) DO NOTHING;

\echo '✓ Schema criado com sucesso'
