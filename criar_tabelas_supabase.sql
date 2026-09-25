-- ============================================================
-- PASSO 1: DELETAR TABELAS ERRADAS (portugues)
-- ============================================================
DROP TABLE IF EXISTS aditivos CASCADE;
DROP TABLE IF EXISTS "registro de auditoria" CASCADE;
DROP TABLE IF EXISTS certificados CASCADE;
DROP TABLE IF EXISTS pro_digitais CASCADE;
DROP TABLE IF EXISTS empresas CASCADE;
DROP TABLE IF EXISTS contratos CASCADE;
DROP TABLE IF EXISTS "tokens csrf" CASCADE;
DROP TABLE IF EXISTS "destinatários" CASCADE;
DROP TABLE IF EXISTS "modelos_de_e-mail" CASCADE;
DROP TABLE IF EXISTS histórico CASCADE;
DROP TABLE IF EXISTS licitações CASCADE;
DROP TABLE IF EXISTS "redefinições_de_senha" CASCADE;
DROP TABLE IF EXISTS pagamentos CASCADE;
DROP TABLE IF EXISTS setores CASCADE;
DROP TABLE IF EXISTS "usuário_empresas" CASCADE;
DROP TABLE IF EXISTS "lojas_de_usuários" CASCADE;
DROP TABLE IF EXISTS "Usuários" CASCADE;

-- ============================================================
-- PASSO 2: CRIAR TABELAS CORRETAS (ingles - ingles)
-- ============================================================

-- 1. COMPANIES (Empresas)
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  cnpj TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (now() AT TIME ZONE 'utc')::text,
  updated_at TEXT DEFAULT (now() AT TIME ZONE 'utc')::text
);

-- 2. USERS (Usuarios)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'user',
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (now() AT TIME ZONE 'utc')::text,
  updated_at TEXT DEFAULT (now() AT TIME ZONE 'utc')::text
);

-- 3. SECTORS (Setores)
CREATE TABLE IF NOT EXISTS sectors (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (now() AT TIME ZONE 'utc')::text
);

-- 4. USER_EMPresas
CREATE TABLE IF NOT EXISTS user_empresas (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  empresa_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, empresa_id)
);

-- 5. USER_SETORES
CREATE TABLE IF NOT EXISTS user_setores (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  setor_id TEXT REFERENCES sectors(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, setor_id)
);

-- 6. CONTRACTS (Contratos)
CREATE TABLE IF NOT EXISTS contracts (
  id TEXT PRIMARY KEY,
  numero TEXT,
  fornecedor TEXT,
  cnpj TEXT,
  objeto TEXT,
  valor_total REAL DEFAULT 0,
  inicio TEXT,
  fim TEXT,
  tem_parcelas INTEGER DEFAULT 0,
  qtd_parcelas INTEGER DEFAULT 0,
  valor_parcela REAL DEFAULT 0,
  dia_vencimento INTEGER,
  responsavel TEXT,
  setor TEXT,
  obs TEXT,
  tipo TEXT,
  empresa_id TEXT REFERENCES companies(id),
  active INTEGER DEFAULT 1,
  forma_pagamento TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (now() AT TIME ZONE 'utc')::text,
  updated_at TEXT DEFAULT (now() AT TIME ZONE 'utc')::text,
  arquivo_contrato TEXT
);

-- 7. PAYMENTS (Pagamentos)
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  contract_id TEXT REFERENCES contracts(id) ON DELETE CASCADE,
  descricao TEXT,
  vencimento TEXT,
  valor REAL DEFAULT 0,
  contrato_num TEXT,
  data_pagamento TEXT,
  valor_pago REAL DEFAULT 0,
  forma_pagamento TEXT,
  status TEXT DEFAULT 'pendente',
  obs TEXT,
  created_by TEXT,
  paid_by TEXT,
  created_at TEXT DEFAULT (now() AT TIME ZONE 'utc')::text,
  updated_at TEXT DEFAULT (now() AT TIME ZONE 'utc')::text,
  deleted_at TEXT,
  comprovante TEXT
);

-- 8. ADDITIVES (Aditivos)
CREATE TABLE IF NOT EXISTS additives (
  id TEXT PRIMARY KEY,
  contract_id TEXT REFERENCES contracts(id) ON DELETE CASCADE,
  numero TEXT,
  data_aditivo TEXT,
  tipo TEXT,
  nova_data_fim TEXT,
  acrescimo_valor REAL DEFAULT 0,
  descricao TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (now() AT TIME ZONE 'utc')::text,
  updated_at TEXT DEFAULT (now() AT TIME ZONE 'utc')::text,
  deleted_at TEXT,
  arquivo_contrato TEXT
);

-- 9. CERTIDOES (Certidoes)
CREATE TABLE IF NOT EXISTS certidoes (
  id TEXT PRIMARY KEY,
  empresa_id TEXT REFERENCES companies(id),
  cnpj TEXT,
  uf TEXT,
  cidade TEXT,
  tipo TEXT,
  data_emissao TEXT,
  data_validade TEXT,
  status TEXT DEFAULT 'pendente',
  arquivo_nome TEXT,
  arquivo_dados TEXT,
  observacoes TEXT,
  criado_em TEXT DEFAULT (now() AT TIME ZONE 'utc')::text,
  updated_at TEXT DEFAULT (now() AT TIME ZONE 'utc')::text,
  deleted_at TEXT
);

-- 10. LICITACOES (Licitacoes)
CREATE TABLE IF NOT EXISTS licitacoes (
  id TEXT PRIMARY KEY,
  empresa_id TEXT REFERENCES companies(id),
  numero_licitacao TEXT,
  edital TEXT,
  nome_licitacao TEXT,
  cnpj TEXT,
  objeto TEXT,
  contrato_id TEXT,
  valor REAL DEFAULT 0,
  data_homologacao TEXT,
  data_inicio TEXT,
  data_fim TEXT,
  status TEXT DEFAULT 'em_andamento',
  arquivos TEXT DEFAULT '[]',
  observacoes TEXT,
  criado_em TEXT DEFAULT (now() AT TIME ZONE 'utc')::text,
  updated_at TEXT DEFAULT (now() AT TIME ZONE 'utc')::text,
  deleted_at TEXT
);

-- 11. DESTINATARIOS
CREATE TABLE IF NOT EXISTS destinatarios (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  nome TEXT,
  empresa_ids TEXT DEFAULT '[]',
  setores TEXT DEFAULT '[]',
  alertas TEXT DEFAULT '[]',
  criado_em TEXT DEFAULT (now() AT TIME ZONE 'utc')::text,
  updated_at TEXT DEFAULT (now() AT TIME ZONE 'utc')::text,
  deleted_at TEXT
);

-- 12. TIPOS_CERTIDAO
CREATE TABLE IF NOT EXISTS tipos_certidao (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (now() AT TIME ZONE 'utc')::text
);

-- 13. CERTIFICADOS DIGITAIS
CREATE TABLE IF NOT EXISTS certificados_digitais (
  id TEXT PRIMARY KEY,
  empresa_id TEXT REFERENCES companies(id),
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'e-CNPJ',
  titular TEXT,
  arquivo_nome TEXT,
  arquivo_base64 TEXT,
  data_vencimento TEXT,
  criado_em TEXT DEFAULT (now() AT TIME ZONE 'utc')::text,
  updated_at TEXT DEFAULT (now() AT TIME ZONE 'utc')::text,
  deleted_at TEXT
);

-- 14. CONFIG EMAIL
CREATE TABLE IF NOT EXISTS config_email (
  id TEXT PRIMARY KEY DEFAULT 'smtp',
  smtp_host TEXT,
  smtp_port INTEGER DEFAULT 587,
  smtp_user TEXT,
  smtp_pass TEXT,
  from_name TEXT,
  from_email TEXT,
  use_tls INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (now() AT TIME ZONE 'utc')::text
);

-- 15. HISTORICO
CREATE TABLE IF NOT EXISTS historico (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  username TEXT,
  action TEXT,
  entity TEXT,
  entity_id TEXT,
  details TEXT,
  created_at TEXT DEFAULT (now() AT TIME ZONE 'utc')::text
);

-- 16. EMAIL TEMPLATES
CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  assunto TEXT,
  corpo TEXT,
  ativo INTEGER DEFAULT 1,
  criado_em TEXT DEFAULT (now() AT TIME ZONE 'utc')::text
);

-- 17. CSRF TOKENS
CREATE TABLE IF NOT EXISTS csrf_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  expires_at TEXT,
  created_at TEXT DEFAULT (now() AT TIME ZONE 'utc')::text
);

-- 18. PASSWORD RESETS
CREATE TABLE IF NOT EXISTS password_resets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  token TEXT,
  expires_at TEXT,
  used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (now() AT TIME ZONE 'utc')::text
);

-- 19. AUDIT LOG
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  action TEXT,
  entity TEXT,
  entity_id TEXT,
  details TEXT,
  created_at TEXT DEFAULT (now() AT TIME ZONE 'utc')::text
);

-- ============================================================
-- INDICES PARA PERFORMANCE
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_contracts_empresa ON contracts(empresa_id);
CREATE INDEX IF NOT EXISTS idx_payments_contract ON payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_additives_contract ON additives(contract_id);
CREATE INDEX IF NOT EXISTS idx_certidoes_empresa ON certidoes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_licitacoes_empresa ON licitacoes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_certdig_empresa ON certificados_digitais(empresa_id);
CREATE INDEX IF NOT EXISTS idx_historico_user ON historico(user_id);
CREATE INDEX IF NOT EXISTS idx_user_empresas_user ON user_empresas(user_id);
CREATE INDEX IF NOT EXISTS idx_user_setores_user ON user_setores(user_id);
