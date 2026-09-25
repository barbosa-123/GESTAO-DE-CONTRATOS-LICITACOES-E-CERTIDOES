-- Tabela de Filiais (cada empresa pode ter multiplas filiais)
CREATE TABLE IF NOT EXISTS filiais (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cnpj TEXT,
  ativa INTEGER DEFAULT 1,
  criado_em TEXT DEFAULT (now() AT TIME ZONE 'utc')::text,
  updated_at TEXT DEFAULT (now() AT TIME ZONE 'utc')::text
);

CREATE INDEX IF NOT EXISTS idx_filiais_empresa ON filiais(empresa_id);

-- Tabela de Certificados Digitais (vinculados a filiais)
CREATE TABLE IF NOT EXISTS certificados_digitais (
  id TEXT PRIMARY KEY,
  filial_id TEXT NOT NULL REFERENCES filiais(id) ON DELETE CASCADE,
  empresa_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_certdig_filial ON certificados_digitais(filial_id);
CREATE INDEX IF NOT EXISTS idx_certdig_empresa ON certificados_digitais(empresa_id);
