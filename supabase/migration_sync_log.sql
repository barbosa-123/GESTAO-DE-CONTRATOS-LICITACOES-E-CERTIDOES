-- Migration: Sync via log + Roles/Grupos de Empresas
-- Execute no SQL Editor do Supabase (idempotente: pode rodar várias vezes)

-- ============================================================
-- 1. Colunas de timestamp nas tabelas novas (caso já existam)
-- ============================================================
ALTER TABLE roles ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS deleted_at TEXT;
ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS deleted_at TEXT;

-- ============================================================
-- 2. Company Groups (grupos de empresas)
--    Criado ANTES de tudo que faz referência a ele
-- ============================================================
CREATE TABLE IF NOT EXISTS company_groups (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (now()::text),
  updated_at TEXT,
  deleted_at TEXT
);

-- Company Group Members (empresas dentro do grupo)
CREATE TABLE IF NOT EXISTS company_group_members (
  group_id TEXT NOT NULL REFERENCES company_groups(id) ON DELETE CASCADE,
  empresa_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, empresa_id)
);

-- ============================================================
-- 3. Coluna company_group_id em role_permissions
--    (tabela já existe de tentativa anterior, sem a coluna)
-- ============================================================
ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS company_group_id TEXT REFERENCES company_groups(id) ON DELETE CASCADE;

-- ============================================================
-- 4. Tabelas dependentes
-- ============================================================
-- User-Role (usuario pertence a uma role)
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id TEXT REFERENCES roles(id) ON DELETE SET NULL;

-- User-GrupoEmpresas (usuario pertence a um grupo de empresas)
CREATE TABLE IF NOT EXISTS user_grupo_empresas (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  grupo_empresas_id TEXT NOT NULL REFERENCES company_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, grupo_empresas_id)
);

-- ============================================================
-- 5. Índices (somente depois que as colunas existem)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_group ON role_permissions(company_group_id);
CREATE INDEX IF NOT EXISTS idx_company_group_members_empresa ON company_group_members(empresa_id);

-- ============================================================
-- 6. Seeds (idempotentes, sem duplicar)
-- ============================================================
INSERT INTO roles (id, nome, descricao, is_system, created_at) VALUES
  ('role_admin', 'Administrador', 'Acesso total ao sistema', 1, now()::text),
  ('role_admin_setor', 'Administrador de Setor', 'Acesso configurável por setor/empresa', 1, now()::text),
  ('role_usuario', 'Usuário Comum', 'Acesso básico configurável', 1, now()::text)
ON CONFLICT (id) DO NOTHING;

-- Admin tem todas as permissões (wildcard) - só insere se ainda não existir
INSERT INTO role_permissions (role_id, resource, action, empresa_id, updated_at)
SELECT 'role_admin', '*', '*', NULL, now()::text
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions WHERE role_id = 'role_admin' AND resource = '*' AND action = '*'
);

-- Backfill de updated_at para registros existentes
UPDATE roles SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE role_permissions SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE company_groups SET updated_at = created_at WHERE updated_at IS NULL;

-- ============================================================
-- 7. Sync log (updated_at/deleted_at nas tabelas operacionais)
-- ============================================================
-- UF do CNPJ em companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS uf_cnpj TEXT DEFAULT '';

ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS deleted_at TEXT;

ALTER TABLE additives ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE additives ADD COLUMN IF NOT EXISTS deleted_at TEXT;

ALTER TABLE certidoes ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE certidoes ADD COLUMN IF NOT EXISTS deleted_at TEXT;

ALTER TABLE licitacoes ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE licitacoes ADD COLUMN IF NOT EXISTS deleted_at TEXT;

ALTER TABLE licitacoes ADD COLUMN IF NOT EXISTS indice_reajuste TEXT DEFAULT '';

-- UF e Cidade da licitação
ALTER TABLE licitacoes ADD COLUMN IF NOT EXISTS uf TEXT DEFAULT '';
ALTER TABLE licitacoes ADD COLUMN IF NOT EXISTS cidade TEXT DEFAULT '';

ALTER TABLE destinatarios ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE destinatarios ADD COLUMN IF NOT EXISTS deleted_at TEXT;

-- Certificados digitais: coluna UF e senha do certificado
ALTER TABLE certificados_digitais ADD COLUMN IF NOT EXISTS uf TEXT DEFAULT '';
ALTER TABLE certificados_digitais ADD COLUMN IF NOT EXISTS senha TEXT DEFAULT '';

-- Criar tabela sync_log
CREATE TABLE IF NOT EXISTS sync_log (
  id SERIAL PRIMARY KEY,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  machine_id TEXT DEFAULT '',
  data_hash TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (now()::text)
);
CREATE INDEX IF NOT EXISTS idx_sync_log_entity ON sync_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_created ON sync_log(created_at);

-- Preencher updated_at existente com created_at para registros sem timestamp
UPDATE payments SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE additives SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE certidoes SET updated_at = criado_em WHERE updated_at IS NULL;
UPDATE licitacoes SET updated_at = criado_em WHERE updated_at IS NULL;
UPDATE destinatarios SET updated_at = criado_em WHERE updated_at IS NULL;
UPDATE contracts SET updated_at = created_at WHERE updated_at IS NULL;
