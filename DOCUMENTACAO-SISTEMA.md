# DOCUMENTACAO TECNICA - CONTROLE DE CONTRATOS E PAGAMENTOS

**Versao:** 1.0.0
**Stack:** SPA (index.html) + API Serverless (api/index.js) + Supabase (PostgreSQL)
**Deploy:** Vercel (controle-de-contratos-omega.vercel.app)

---

## 1. VISAO GERAL DA ARQUITETURA

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER (SPA)                        │
│  index.html (~7185 linhas)                                  │
│  - IndexedDB (cache local)                                  │
│  - Sync bidirecional com o servidor                         │
│  - Realtime via WebSocket (Supabase)                        │
└──────────────────────┬──────────────────────────────────────┘
                       │ fetch() / WebSocket
┌──────────────────────▼──────────────────────────────────────┐
│                   VERCEL (Serverless)                        │
│  api/index.js (~2182 linhas) - Funcao unica                 │
│  - Todas as rotas em um único arquivo                       │
│  - JWT auth via cookie                                      │
│  - CSRF protection                                          │
└──────────────────────┬──────────────────────────────────────┘
                       │ @supabase/supabase-js
┌──────────────────────▼──────────────────────────────────────┐
│                    SUPABASE (PostgreSQL)                     │
│  - 15 tabelas                                               │
│  - Service Role Key (acesso total)                          │
│  - Realtime (WebSocket) para notificacoes                   │
└─────────────────────────────────────────────────────────────┘
```

### Fluxo de Dados

```
1. Login → JWT cookie + CSRF token
2. loadFromServer() → GET /api/sync → dados do Supabase → cache local (IndexedDB)
3. syncToServer() → POST /api/sync → envia todos os registros do cache ao servidor
4. Realtime → WebSocket detecta mudanças → dispara loadFromServer + syncToServer
5. CRUD local → salva no IndexedDB → syncToServer envia ao servidor
```

### Mutex Flags

| Flag | Funcao |
|------|--------|
| `_syncRunning` | Impede concorrencia no sync pull (loadFromServer) |
| `_saveSyncRunning` | Impede concorrencia no sync push (syncToServer) e saves |
| `_lastSyncAt` | Timestamp do ultimo sync bem-sucedido |
| `_serverOffset` | Diferenca de relogio entre cliente e servidor |

---

## 2. VARIAVEIS DE AMBIENTE

| Variavel | Onde | Descricao |
|----------|------|-----------|
| `SUPABASE_URL` | Vercel Env | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel Env | Chave de servico do Supabase (acesso total) |
| `JWT_SECRET` | Vercel Env + .env | Segredo para assinatura de tokens JWT |
| `ADMIN_PASSWORD` | Vercel Env + .env | Senha do usuario admin (fallback se nao existe no DB) |
| `SESSION_TIMEOUT_HOURS` | Codigo | Timeout da sessao em horas (default: 8) |
| `GEMINI_API_KEY` | Codigo | Chave da API Google Gemini (assistente virtual) |

---

## 3. BANCO DE DADOS (SUPABASE)

### 3.1 Diagrama de Tabelas

```
users ──────────┬─────────────── contracts ───────────────┬───────────── payments
                │                                        │
                ├── password_resets                      ├── additives
                │                                        │
                ├── user_setores ── sectors              ├── audit_log
                │
                └── user_empresas ── companies

certidoes (independente)
licitacoes (independente)
destinatarios (independente)
email_config (singleton, id=1)
sync_log (log de auditoria)
```

### 3.2 Tabelas Principais

#### `users`
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | SERIAL PK | ID auto-incremental |
| username | TEXT UNIQUE | Nome de login |
| full_name | TEXT | Nome completo |
| email | TEXT | Email |
| password_hash | TEXT | Hash da senha (bcrypt) |
| role | TEXT DEFAULT 'user' | 'admin' ou 'user' |
| active | INTEGER DEFAULT 1 | 1=ativo, 0=inativo |
| created_at | TEXT | Data de criacao |

#### `contracts`
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | TEXT PK | UUID |
| numero | TEXT UNIQUE | Numero do contrato |
| fornecedor | TEXT | Nome do fornecedor/cliente |
| cnpj | TEXT | CNPJ/CPF |
| objeto | TEXT | Objeto do contrato |
| valor_total | REAL | Valor total |
| inicio / fim | TEXT |Datas de vigencia |
| tem_parcelas | INTEGER | 1=tem parcelas, 0=nao |
| qtd_parcelas | INTEGER | Quantidade de parcelas |
| valor_parcela | REAL | Valor da parcela |
| dia_vencimento | INTEGER | Dia do vencimento |
| empresa_id | TEXT | FK para companies |
| active | INTEGER DEFAULT 1 | 1=ativo, 0=inativo |
| arquivo_contrato | TEXT | JSON do arquivo (base64) |
| created_at / updated_at | TEXT | Timestamps |

#### `payments`
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | TEXT PK | UUID |
| contract_id | TEXT FK | Referencia ao contrato (CASCADE DELETE) |
| descricao | TEXT | Descricao do pagamento |
| vencimento | TEXT | Data de vencimento |
| valor | REAL | Valor |
| data_pagamento | TEXT | Data efetiva do pagamento |
| valor_pago | REAL | Valor efetivamente pago |
| status | TEXT DEFAULT 'pendente' | 'pendente', 'pago', 'atrasado' |
| comprovante | TEXT | JSON do comprovante (base64) |
| deleted_at | TEXT | Soft delete |
| created_at / updated_at | TEXT | Timestamps |

#### `certidoes`
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | TEXT PK | UUID |
| empresa_id | TEXT | FK para companies |
| cnpj, uf, cidade | TEXT | Dados da empresa |
| tipo | TEXT | Tipo da certidao (CND Estadual, Federal, etc.) |
| data_emissao / data_validade | TEXT | Datas |
| status | TEXT DEFAULT 'pendente' | 'pendente', 'vencida', 'vencendo', 'ok' |
| arquivo_nome / arquivo_dados | TEXT | Anexo (base64) |
| deleted_at | TEXT | Soft delete |

#### `licitacoes`
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | TEXT PK | UUID |
| numero_licitacao | TEXT | Numero da licitacao |
| objeto | TEXT | Objeto |
| empresa_id | TEXT | FK para companies |
| contrato_id | TEXT | FK para contracts |
| valor | REAL | Valor |
| status | TEXT DEFAULT 'em_andamento' | 'em_andamento', 'inativo' |
| arquivos | TEXT | JSON array de arquivos |
| deleted_at | TEXT | Soft delete |

#### `companies`
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | TEXT PK | UUID |
| nome | TEXT | Nome da empresa |
| cnpj | TEXT | CNPJ |
| active | INTEGER DEFAULT 1 | Status |

#### `sectors` / `user_setores`
Setores organizacionais e vinculo com usuarios (N:N).

#### `destinatarios`
Destinatarios de alertas por email. Campos `empresa_ids`, `setores`, `alertas` como JSON.

### 3.3 Soft Delete

Tabelas com `deleted_at`:
- `payments`, `additives`, `certidoes`, `licitacoes`, `destinatarios`

Tabelas com `active`:
- `contracts` (active=0 = inativo)
- `companies`, `sectors`, `users`

---

## 4. API ENDPOINTS

### 4.1 Autenticacao

| Rota | Metodo | Auth | CSRF | Descricao |
|------|--------|------|------|-----------|
| `/api/csrf-token` | GET | Nao | Nao | Retorna token CSRF |
| `/api/login` | POST | Nao | Nao | Login (username+password) → JWT cookie |
| `/api/logout` | POST | Sim | Nao | Limpa cookie de sessao |
| `/api/me` | GET | Sim | Nao | Retorna usuario logado |
| `/api/forgot-password` | POST | Nao | Nao | Envia email de reset (rate limit: 3/min) |
| `/api/reset-password` | POST | Nao | Nao | Reseta senha via token |
| `/api/change-password` | POST | Sim | Sim | Altera senha (requer senha atual) |

### 4.2 CRUD Principal

| Rota | Metodo | Auth | CSRF | Descricao |
|------|--------|------|------|-----------|
| `/api/contracts` | GET | Sim | Nao | Lista contratos ativos |
| `/api/contracts` | POST | Sim | Sim | Cria contrato |
| `/api/contracts/:id` | PUT | Sim | Sim | Atualiza contrato |
| `/api/contracts/:id` | DELETE | Admin | Sim | Deleta contrato + pagamentos + aditivos |
| `/api/payments` | GET | Sim | Nao | Lista pagamentos |
| `/api/payments` | POST | Sim | Sim | Cria pagamento |
| `/api/payments/:id` | PUT | Sim | Sim | Atualiza pagamento |
| `/api/payments/:id` | DELETE | Admin | Sim | Deleta pagamento |
| `/api/additives` | POST | Sim | Sim | Cria aditivo |
| `/api/additives/:id` | PUT | Sim | Sim | Atualiza aditivo |
| `/api/additives/:id` | DELETE | Sim | Sim | Deleta aditivo |
| `/api/certidoes` | GET | Sim | Nao | Lista certidoes |
| `/api/certidoes` | POST | Sim | Sim | Cria certidao |
| `/api/certidoes/:id` | PUT | Sim | Sim | Atualiza certidao (inclui soft delete) |
| `/api/certidoes/:id` | DELETE | Sim | Sim | Deleta certidao |
| `/api/licitacoes` | GET | Sim | Nao | Lista licitacoes |
| `/api/licitacoes` | POST | Sim | Sim | Cria licitacao |
| `/api/licitacoes/:id` | PUT | Sim | Sim | Atualiza licitacao |
| `/api/licitacoes/:id` | DELETE | Sim | Sim | Deleta licitacao |

### 4.3 Empresas / Setores / Usuarios

| Rota | Metodo | Auth | CSRF | Descricao |
|------|--------|------|------|-----------|
| `/api/companies` | GET | Nao | Nao | Lista empresas |
| `/api/companies` | POST | Sim | Sim | Cria/upsert empresa |
| `/api/companies/:id` | PUT | Sim | Sim | Atualiza empresa |
| `/api/companies/:id` | DELETE | Admin | Sim | Deleta empresa |
| `/api/sectors` | GET | Sim | Nao | Lista setores |
| `/api/sectors` | POST | Admin Global | Sim | Cria setor |
| `/api/sectors/:id` | PUT | Admin Global | Sim | Atualiza setor |
| `/api/sectors/:id` | DELETE | Admin Global | Sim | Deleta setor |
| `/api/user-setores` | GET | Sim | Nao | Setores do usuario logado |
| `/api/user-setores` | POST | Admin | Sim | Atribui setores a usuario |
| `/api/user-empresas` | GET | Sim | Nao | Empresas do usuario logado |
| `/api/user-empresas` | POST | Admin | Sim | Atribui empresas a usuario |
| `/api/users` | GET | Admin | Nao | Lista usuarios |
| `/api/users` | POST | Admin | Sim | Cria usuario |
| `/api/users/:id` | PUT | Admin | Sim | Atualiza usuario |
| `/api/users/:id` | DELETE | Admin | Sim | Inativa usuario (active=0) |

### 4.4 Sync (Sincronizacao)

| Rota | Metodo | Auth | CSRF | Descricao |
|------|--------|------|------|-----------|
| `/api/sync` | GET | Sim | Nao | Pull: retorna todos os dados (full sync ou incremental com `?since=`) |
| `/api/sync` | POST | Sim | Sim | Push: upsert de todos os registros do cliente |

### 4.5 Outros

| Rota | Metodo | Auth | CSRF | Descricao |
|------|--------|------|------|-----------|
| `/api/config-email` | GET/POST | Sim | Sim | Config SMTP (leitura/gravacao) |
| `/api/enviar-lembrete` | POST | Sim | Sim | Envia lembretes de pagamento |
| `/api/enviar-alertas-contratos` | POST | Sim | Sim | Envia alertas de vencimento de contratos |
| `/api/enviar-alertas-certidoes` | POST | Sim | Sim | Envia alertas de vencimento de certidoes |
| `/api/enviar-alertas-licitacoes` | POST | Sim | Sim | Envia alertas de vencimento de licitacoes |
| `/api/upload-file` | POST | Sim | Sim | Upload de arquivo (base64) |
| `/api/cidades` | GET | Nao | Nao | Lista de cidades brasileiras por UF |
| `/api/assistente` | POST | Nao | Nao | Assistente virtual (Google Gemini AI) |
| `/api/admin-reset` | POST | Nao | Nao | Reset admin (bootstrap de usuarios) |
| `/api/email-diario` | GET | Nao | Nao | Cron: envio diario de alertas (13:00 UTC) |

---

## 5. FLUXO DE SINCRONIZACAO (SYNC)

### 5.1 Inicializacao

```
Login → loadFromServer().then(() => syncToServer())
         │                        │
         ▼                        ▼
    GET /api/sync            POST /api/sync
    (busca tudo do server)   (envia tudo do cache local)
```

### 5.2 loadFromServer() - Pull

```
1. fetch('/api/sync')
2. Servidor executa queries sequenciais (com timeout e tratamento de erro)
3. Retorna JSON com: contratos, pagamentos, usuarios, aditivos, empresas,
   destinatarios, certidoes, licitacoes, sectors, user_setores, server_now
4. Frontend MAPPING: converte formato servidor → formato frontend
   Ex: contracts.numero → numero, contracts.fornecedor → parte
5. Frontend SUBSTITUI cache inteiro (nao usa mergeDelta)
   cachedContratos = contratos (dados mapeados do servidor)
6. Salva no IndexedDB
7. Renderiza pagina ativa
```

**Observacao importante:** O cache e SUBSTITUIDO completamente pelos dados do servidor. Isso garante que registros deletados em outra maquina desaparecam.

### 5.3 syncToServer() - Push

```
1. Monta snapshot: TODOS os registros do cache local
   { contratos: [...], pagamentos: [...], certidoes: [...], ... }
2. Serializa para JSON
3. Se payload > 3.5MB: remove arquivos grandes (base64)
4. Se ainda > 3.5MB: remove todos os arquivos
5. Envia POST /api/sync
6. Servidor processa cada entidade:
   - Se existe no server: compara updated_at
     - Se incoming <= existing (e nao deletado): ignora (skip)
     - Se deletado: soft delete (seta deleted_at / active=0)
     - Se incoming > existing: UPDATE
   - Se NAO existe no server:
     - Se deletado: ignora
     - Se nao: INSERT
```

### 5.4 Conflitos (Server Wins)

A resolucao de conflitos usa `updated_at`:
- O registro com `updated_at` mais recente vence
- Em caso de empate, o servidor prevalece

### 5.5 Protecao contra Soft Delete

Para `certidoes` e `licitacoes`:
- Se o registro ja tem `deleted_at` no servidor, o sync ignora atualizacoes do cliente
- Isso evita que outro usuario "des-delete" um registro

### 5.6 Realtime

```
WebSocket conecta ao Supabase Realtime
  → Detecta mudanca em qualquer tabela
  → Cooldown de 30s pos-sync (evita loops)
  → Debounce de 3s (agrupa mudancas rapidas)
  → Chama loadFromServer().then(() => syncToServer())
```

---

## 6. SEGURANCA

### 6.1 Autenticacao
- JWT assinado com `JWT_SECRET`, armazenado em cookie HttpOnly
- Timeout de sessao configuravel (default: 8 horas)
- Rate limiting: 10 tentativas de login/min por IP

### 6.2 CSRF
- Token CSRF gerado por `/api/csrf-token`
- Requerido em todas as operacoes de escrita (POST, PUT, DELETE)
- Enviado no header `X-CSRF-Token`

### 6.3 Headers de Seguranca (Vercel)
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'self'; ...
```

### 6.4 Controle de Acesso
- **Admin**: Acesso total (CRUD usuarios, empresas, setores, contratos)
- **User**: CRUD de dados, leitura de usuarios
- **Admin Global**: Gerenciamento de setores
- Usuario id=1 (admin) nao pode ser inativado

---

## 7. ARQUITETURA DO FRONTEND

### 7.1 Stack
- **SPA monolitica**: `index.html` (~7185 linhas)
- **IndexedDB**: Cache local (database: `controleContratosDB`)
- **Sem framework**: JavaScript vanilla
- **Charts**: Chart.js (via CDN)

### 7.2 Tabelas IndexedDB
| Object Store | Conteudo |
|-------------|----------|
| `contratos` | Contratos mapeados |
| `pagamentos` | Pagamentos mapeados |
| `certidoes` | Certidoes mapeadas |
| `licitacoes` | Licitacoes mapeadas |
| `empresas` | Empresas |
| `sectors` | Setores |
| `user_setores` | Atribuicoes usuario-setor |
| `destinatarios` | Destinatarios de alertas |
| `tipos` | Tipos de certidao |

### 7.3 Funcoes Principais

| Funcao | Descricao |
|--------|-----------|
| `loadFromServer()` | GET /api/sync → substitui cache local |
| `syncToServer()` | POST /api/sync → envia todos os registros |
| `syncRealtime()` | Trigger do WebSocket → load + sync |
| `renderDashboard()` | Renderiza dashboard com metricas |
| `renderContratos()` | Lista de contratos |
| `salvarContrato()` | Salva contrato (com guard _saveSyncRunning) |
| `excluirCertidao()` | Soft delete via PUT com deleted_at |
| `mapServerContract(c)` | Converte formato server → frontend |
| `mergeDelta()` | (LEGADO) Mescla delta do servidor no cache |

### 7.4 Mapa de Entidades (Server → Frontend)

| Server Column | Frontend Field |
|--------------|---------------|
| numero | numero |
| fornecedor | parte |
| cnpj | doc |
| valor_total | valor |
| empresa_id | empresaId |
| tem_parcelas | temParcelas |
| active | active |
| data_emissao | dataEmissao |
| data_validade | dataValidade |

---

## 8. DEPLOY

### 8.1 Variaveis de Ambiente (Vercel)
Configurar via CLI:
```bash
echo "valor" | vercel env add SUPABASE_URL production
echo "valor" | vercel env add SUPABASE_SERVICE_ROLE_KEY production
echo "valor" | vercel env add JWT_SECRET production
echo "valor" | vercel env add ADMIN_PASSWORD production
```

**IMPORTANTE:** Ao usar `echo "valor" | vercel env add`, enviar APENAS o valor, sem labels.

### 8.2 Deploy
```bash
vercel --prod --yes
```

### 8.3 Cron Jobs
- `/api/email-diario`: Executa diariamente as 13:00 UTC (10:00 BRT)
- Envia alertas de vencimento para destinatarios cadastrados

### 8.4 Limitacoes Vercel Hobby
- Funcoes serverless: 10s timeout
- 1024MB memoria
- 100GB bandwidth/mes

---

## 9. PROBLEMAS CONHECIDOS E SOLUCOES

### 9.1 Certidao reaparece em outra maquina
**Causa:** `mergeDelta()` nao removia registros ausentes do delta do servidor.
**Solucao:** `loadFromServer()` substitui cache inteiro ao inves de fazer merge.

### 9.2 Exclusao nao persiste apos reload
**Causa:** PUT `/api/certidoes/:id` nao aceitava `deleted_at` no body.
**Solucao:** Adicionado `if (body.deleted_at !== undefined) upd.deleted_at = body.deleted_at || null`

### 9.3 Sync recria registros deletados
**Causa:** Sync POST fazia hard DELETE no servidor; outro usuario recriava com dados stale.
**Solucao:** Sync POST agora usa soft delete (seta `deleted_at`) ao inves de hard DELETE.

### 9.4 Sistema volta ao login automaticamente
**Causa:** Cookie HttpOnly expirando ou `sessionStorage` inconsistente.
**Solucao:** Verificar `SESSION_TIMEOUT_HOURS` e consistencia do `sessionStorage.logged_in`.

### 9.5 Supabase excede cota de egress
**Causa:** Sync enviando TODOS os registros a cada poucos segundos × multiplos usuarios.
**Solucao:** Upgrade do plano Supabase OU migrar para self-hosted.

---

## 10. ENDPOINTS DE EMERGENCIA

### Reset de senha via API
```bash
# Listar usuarios
curl -X POST https://controle-de-contratos-omega.vercel.app/api/admin-reset \
  -H "Content-Type: application/json" \
  -d '{"username":"list"}'

# Resetar senha do admin
curl -X POST https://controle-de-contratos-omega.vercel.app/api/admin-reset \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","new_password":"NovaSenh@123"}'
```

### Verificar status do Supabase
```bash
# Via Vercel CLI
vercel logs --limit 10
# Procurar por: "exceed_egress_quota" ou "Service restricted"
```
