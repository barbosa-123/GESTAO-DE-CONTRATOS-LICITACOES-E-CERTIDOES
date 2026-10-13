-- Supabase SQL Schema for Controle de Contratos
-- Execute no SQL Editor do Supabase

-- Users
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT DEFAULT '',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  active INTEGER NOT NULL DEFAULT 1,
  password_changed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (now()::text)
);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_resets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (now()::text)
);

-- Companies
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  cnpj TEXT DEFAULT '',
  uf_cnpj TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (now()::text)
);

-- Contracts
CREATE TABLE IF NOT EXISTS contracts (
  id TEXT PRIMARY KEY,
  numero TEXT UNIQUE NOT NULL,
  fornecedor TEXT NOT NULL,
  cnpj TEXT,
  objeto TEXT NOT NULL,
  valor_total REAL NOT NULL DEFAULT 0,
  inicio TEXT NOT NULL,
  fim TEXT NOT NULL,
  tem_parcelas INTEGER NOT NULL DEFAULT 0,
  qtd_parcelas INTEGER,
  valor_parcela REAL,
  dia_vencimento INTEGER,
  responsavel TEXT,
  setor TEXT,
  obs TEXT,
  tipo TEXT,
  empresa_id TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  forma_pagamento TEXT,
  arquivo_contrato TEXT,
  resumo TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (now()::text),
  updated_at TEXT
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  vencimento TEXT NOT NULL,
  valor REAL NOT NULL DEFAULT 0,
  contrato_num TEXT,
  data_pagamento TEXT,
  valor_pago REAL,
  forma_pagamento TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  obs TEXT,
  comprovante TEXT,
  created_by INTEGER,
  paid_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (now()::text),
  updated_at TEXT,
  deleted_at TEXT
);

-- Additives
CREATE TABLE IF NOT EXISTS additives (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  numero TEXT,
  data_aditivo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  nova_data_fim TEXT,
  acrescimo_valor REAL,
  descricao TEXT NOT NULL,
  arquivo_contrato TEXT,
  resumo TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (now()::text),
  updated_at TEXT,
  deleted_at TEXT
);

-- Audit Log
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (now()::text)
);

-- Email Recipients
CREATE TABLE IF NOT EXISTS destinatarios (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  nome TEXT DEFAULT '',
  empresa_ids TEXT DEFAULT '[]',
  setores TEXT DEFAULT '[]',
  alertas TEXT DEFAULT '["contratos","pagamentos","certidoes","licitacoes"]',
  criado_em TEXT NOT NULL DEFAULT (now()::text),
  updated_at TEXT,
  deleted_at TEXT
);

-- Email Config
CREATE TABLE IF NOT EXISTS email_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  smtp_server TEXT NOT NULL DEFAULT 'smtp.gmail.com',
  smtp_port INTEGER NOT NULL DEFAULT 587,
  email_remetente TEXT DEFAULT '',
  email_senha_enc TEXT DEFAULT '',
  email_destinatario TEXT DEFAULT '',
  prazos TEXT
);

-- Sectors
CREATE TABLE IF NOT EXISTS sectors (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (now()::text)
);

-- User-Sectors (vinculo usuario-setor)
CREATE TABLE IF NOT EXISTS user_setores (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  setor_id TEXT NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, setor_id)
);

-- Certidoes (Controle de Regularidade)
CREATE TABLE IF NOT EXISTS certidoes (
  id TEXT PRIMARY KEY,
  empresa_id TEXT DEFAULT '',
  cnpj TEXT DEFAULT '',
  uf TEXT DEFAULT '',
  cidade TEXT DEFAULT '',
  tipo TEXT DEFAULT '',
  data_emissao TEXT DEFAULT '',
  data_validade TEXT DEFAULT '',
  status TEXT DEFAULT 'pendente',
  arquivo_nome TEXT DEFAULT '',
  arquivo_dados TEXT DEFAULT '',
  observacoes TEXT DEFAULT '',
  criado_em TEXT NOT NULL DEFAULT (now()::text),
  updated_at TEXT,
  deleted_at TEXT
);

-- Licitacoes
CREATE TABLE IF NOT EXISTS licitacoes (
  id TEXT PRIMARY KEY,
  empresa_id TEXT DEFAULT '',
  numero_licitacao TEXT DEFAULT '',
  edital TEXT DEFAULT '',
  nome_licitacao TEXT DEFAULT '',
  cnpj TEXT DEFAULT '',
  objeto TEXT DEFAULT '',
  contrato_id TEXT DEFAULT '',
  valor REAL DEFAULT 0,
  indice_reajuste TEXT DEFAULT '',
  data_homologacao TEXT DEFAULT '',
  data_inicio TEXT DEFAULT '',
  data_fim TEXT DEFAULT '',
  status TEXT DEFAULT 'em_andamento',
  uf TEXT DEFAULT '',
  cidade TEXT DEFAULT '',
  arquivos TEXT DEFAULT '[]',
  resumo TEXT,
  observacoes TEXT DEFAULT '',
  criado_em TEXT NOT NULL DEFAULT (now()::text),
  updated_at TEXT,
  deleted_at TEXT
);

-- Tipos de Certidao (catalogo gerenciavel)
CREATE TABLE IF NOT EXISTS tipos_certidao (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (now()::text)
);

-- User-Empresas (vinculo usuario-empresa)
CREATE TABLE IF NOT EXISTS user_empresas (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  empresa_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, empresa_id)
);

-- User Permissions (controle granular de acesso por ROLE)
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT DEFAULT '',
  is_system INTEGER NOT NULL DEFAULT 0, -- 1 = não pode excluir (admin, admin_setor, etc)
  created_at TEXT NOT NULL DEFAULT (now()::text),
  updated_at TEXT,
  deleted_at TEXT
);

-- Permissões por Role
CREATE TABLE IF NOT EXISTS role_permissions (
  id SERIAL PRIMARY KEY,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  empresa_id TEXT REFERENCES companies(id) ON DELETE CASCADE, -- NULL = todas empresas
  created_at TEXT NOT NULL DEFAULT (now()::text),
  updated_at TEXT,
  deleted_at TEXT,
  UNIQUE(role_id, resource, action, empresa_id)
);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);

-- User-Role (usuario pertence a uma role)
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id TEXT REFERENCES roles(id) ON DELETE SET NULL;

-- Company Groups (grupos de empresas) - criado antes de user_grupo_empresas
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

-- User-GrupoEmpresas (usuario pertence a um grupo de empresas)
CREATE TABLE IF NOT EXISTS user_grupo_empresas (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  grupo_empresas_id TEXT NOT NULL REFERENCES company_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, grupo_empresas_id)
);

-- Seed roles padrão
INSERT INTO roles (id, nome, descricao, is_system, created_at) VALUES
  ('role_admin', 'Administrador', 'Acesso total ao sistema', 1, now()::text),
  ('role_admin_setor', 'Administrador de Setor', 'Acesso configurável por setor/empresa', 1, now()::text),
  ('role_usuario', 'Usuário Comum', 'Acesso básico configurável', 1, now()::text)
ON CONFLICT (id) DO NOTHING;

-- Admin tem todas as permissões (wildcard)
INSERT INTO role_permissions (role_id, resource, action, empresa_id) VALUES
  ('role_admin', '*', '*', NULL)
ON CONFLICT DO NOTHING;

-- Role Permissions pode referenciar empresa_id OU company_group_id
ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS company_group_id TEXT REFERENCES company_groups(id) ON DELETE CASCADE;

-- Índices
CREATE INDEX IF NOT EXISTS idx_company_group_members_empresa ON company_group_members(empresa_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_group ON role_permissions(company_group_id);

-- Sync Log (rastreia todas as mutacoes para resolucao de conflitos)
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
