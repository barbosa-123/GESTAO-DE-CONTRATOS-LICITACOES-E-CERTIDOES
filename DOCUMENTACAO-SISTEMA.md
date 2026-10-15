# DOCUMENTACAO TECNICA - GESTAO DE CONTRATOS, LICITACOES E CERTIDOES

**Versao:** 1.2.0 (15/10/2026)
**Stack:** SPA (index.html, 7319 linhas) + API Serverless (api/index.js, 3215 linhas) + Supabase (PostgreSQL)
**Deploy:** Vercel (controle-de-contratos-omega.vercel.app) + execucao local (server.js, porta do .env)
**Modo de sync atual:** MANUAL (`SYNC_ENABLED = false` no index.html)

---

## 1. VISAO GERAL DA ARQUITETURA

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER (SPA)                        │
│  index.html (7319 linhas)                                   │
│  - IndexedDB (cache local)                                  │
│  - Gravacao direta via API REST (apiCall POST/PUT/DELETE)   │
│  - Pull do servidor ao entrar em cada aba                   │
│  - Exportacao Excel (CSV) / PDF via navegador               │
└──────────────────────┬──────────────────────────────────────┘
                       │ fetch()
┌──────────────────────▼──────────────────────────────────────┐
│              SERVIDOR LOCAL (server.js)                      │
│  - Serve arquivos estaticos + delega /api/*                  │
│  - Agenda envio automatico de e-mail diario as 08:30         │
│    (executa api/email-diario.js enquanto aberto)             │
└──────────────────────┬──────────────────────────────────────┘
                       │ (em producao: Vercel)
┌──────────────────────▼──────────────────────────────────────┐
│                   VERCEL (Serverless)                        │
│  api/index.js (3215 linhas) - Todas as rotas /api/*          │
│  api/email-diario.js (484 linhas) - Cron diario 08:30 BRT    │
│  - JWT auth via cookie + CSRF                                │
└──────────────────────┬──────────────────────────────────────┘
                       │ @supabase/supabase-js
┌──────────────────────▼──────────────────────────────────────┐
│                    SUPABASE (PostgreSQL)                     │
│  - ~20 tabelas                                              │
│  - Service Role Key (acesso total)                          │
└─────────────────────────────────────────────────────────────┘
```

### Fluxo de Dados (modo atual - manual)

```
1. Login → JWT cookie + CSRF token
2. Abrir aba (Certidoes / Licitacoes / Certificados) → loadFromServer()
   → GET /api/sync → dados do Supabase → cache local (IndexedDB) → render
3. CRUD (salvar/editar/excluir) → apiCall(POST/PUT/DELETE) direto na API
   → e atualiza o cache local (IndexedDB)
4. Botao "Atualizar" (relogio) em cada lista → loadFromServer() com
   feedback visual (⏳ Atualizando... → ✅ / ❌)
```

> **Importante:** `SYNC_ENABLED = false` (index.html:7234) desativa o sync
> automatico (push, polling de 5 min e Supabase Realtime). O pull continua
> acontecendo ao entrar nas abas e pelo botao "Atualizar". Para reativar o
> modo automatico, altere a flag para `true`.

---

## 2. TELAS E FUNCIONALIDADES

### 2.1 Dashboard
- Cards de resumo: certidoes prox. vencer/vencidas, licitacoes total/em andamento/vencidas, certificados digitais total/prox. vencer/vencidos
- 3 graficos (Chart.js): Certidoes por Status, Licitacoes por Status, Certidoes — Vencimento nos Proximos 6 Meses
- Filtro por Grupo de Empresas
- **Clique nos cards/graficos** abre modal de detalhe com Empresa, Tipo, CNPJ, **UF**, **Cidade**, Validade e Status
- Botoes de exportacao Excel/PDF do relatorio do Dashboard (inclui os graficos no PDF)

### 2.2 Certidoes
- Cadastro: Empresa*, Tipo*, CNPJ/CPF*, UF*, Cidade, Emissao*, Validade* (ou "Sem Validade"), Status, Observacoes, Arquivo* (obrigatorio)
- CNPJ preenche Empresa/UF automaticamente (lookup por CNPJ)
- Status calculado: Valida / Vencendo (<=30 dias) / Vencida
- Tabela com filtros (empresa, UF, tipo, status), ordenacao por clique e paginacao
- Botao **Atualizar** (recarrega do servidor, com feedback ⏳/✅/❌)
- Botoes "Excel" e "PDF" (exportam com os filtros aplicados)
- Exclusao: apenas administrador — **soft delete** (`PUT /api/certidoes/:id` com `deleted_at`)

### 2.3 Contrato Licitações
- Cadastro: Numero*, Nome, CNPJ*, Edital, UF, Cidade, Objeto*, Empresa Vencedora, Valor, Indice de Reajuste, Homologacao*, Vigencia (inicio*/fim*), Status, Observacoes, Arquivos* (multiplos)
- Campos obrigatorios: Numero da Licitacao, Objeto, CNPJ, Data Homologacao, Inicio/Fim de Vigencia e Arquivo
- Aditivos por licitacao (Registrar Aditivo)
- Filtros: empresa, status, numero. Ordenacao e paginacao
- Botao **Atualizar** (recarrega do servidor, com feedback)
- Botoes "Excel" e "PDF"
- **Inativar/Reativar:** qualquer usuario com permissao; **Excluir: apenas administrador (DELETE definitivo — nao usa soft delete)**
- **Botao "Ver" — Resumo da Licitacao:**
  - Dados do contrato, anexos e "Gerar Resumo com IA"
  - Tabela **Certidoes Obrigatorias da Empresa (uma por tipo):**
    - Filtra pelo **CNPJ** da licitacao (fallback: empresa)
    - **Federal** = tipo com "Federal" no nome: vale para **qualquer CNPJ/filial**, aparece **mesmo vencida**, nao filtra UF
    - **Estadual/Municipal** = precisa da mesma **UF** da licitacao (municipal prioriza a cidade do contrato)
    - Demais tipos: precisam da mesma UF
    - Uma linha por tipo (deduplicada): prioriza valida > vencida, maior validade, emissao mais recente
    - Coluna **Obrigatoria**; se faltar Federal, Estadual da UF ou Municipal da UF → linha vermelha **"Nao encontrada"**
    - Coluna **Anexo** com botao Ver (abre o arquivo da certidao)

### 2.4 Certificados Digitais
- Cadastro: CNPJ/CPF*, Empresa*, UF, Inclusao*, Validade*, Senha (consultavel com botao "Senha"/"Copiar"), Arquivo
- Badge "Vencido" / "Vence em X dias"
- Duas telas: Pagina Principal e Configuracao (mesmo CRUD)
- Botao **Atualizar** em ambas as telas
- Filtro por empresa; botoes "Excel" e "PDF"
- Exclusao: **soft delete** (`DELETE /api/certificados-digitais/:id` grava `deleted_at`)

### 2.5 Configuracao (submenu)
Subsecoes reais (`showConfigSub`): Minha Conta, Usuarios (perfis + empresas/setores), Empresas, Grupos de Empresas, Certificados Digitais, Setores, Tipos de Certidao, Destinatarios, E-mail (SMTP + envio manual de alertas), Historico (auditoria), Sistema (Informacoes do Sistema).

> Perfis `setor_admin` tem acesso restrito (nao ve Certificados Digitais,
> Setores, E-mail, Historico e Sistema; cai em Usuarios).

### 2.6 Assistente Virtual
- Botao "?" no canto inferior direito; usa Google Gemini (GEMINI_API_KEY) com respostas offline de fallback
- Base de conhecimento cobre: cadastros, certidoes obrigatorias do resumo, exportacao Excel/PDF, envio automatico de e-mails, dashboard, filtros, permissoes
- Botoes de sugestao: cadastrar certidao/licitacao/certificado/empresa, usuarios, alertas, dashboard, exportar, resumo da licitacao, envio automatico, alterar senha

### 2.7 Recursos gerais
- Sino de notificacoes (vencimentos)
- Tema claro/escuro (icone lua/sol, persistido em localStorage)
- Indicador de sincronizacao no header
- Toasts de feedback (sucesso/erro/alerta)

---

## 3. VARIAVEIS DE AMBIENTE

| Variavel | Onde | Descricao |
|----------|------|-----------|
| `SUPABASE_URL` | Vercel Env + .env | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel Env + .env | Chave de servico (acesso total) |
| `JWT_SECRET` | Vercel Env + .env | Assinatura dos tokens JWT e da senha SMTP criptografada |
| `ADMIN_PASSWORD` | Vercel Env + .env | Fallback da senha admin |
| `GEMINI_API_KEY` | Vercel Env + .env | Assistente virtual (Google Gemini) |
| `PORT` | .env | Porta do servidor local (default 3001; usa 5000 no .env) |
| `SESSION_TIMEOUT_HOURS` | .env / Codigo | Timeout da sessao (default: 8h) |
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_USER` / `EMAIL_PASS` | .env | SMTP (fallback; a config principal fica em `email_config` no banco) |
| `CORS_ALLOWED_ORIGINS` | .env | Origens permitidas (separadas por virgula) |

---

## 4. BANCO DE DADOS (SUPABASE)

### 4.1 Tabelas Principais

| Tabela | Descricao |
|--------|-----------|
| `users` | Usuarios (username, password_hash, role, active) |
| `password_resets` | Tokens de reset de senha |
| `companies` | Empresas (nome, cnpj, active) |
| `contracts` | Contratos gerais (vinculados a licitacoes via `licitacoes.contrato_id`; usados nos alertas de contratos) |
| `payments` | Pagamentos dos contratos (usados nos alertas de pagamentos) |
| `additives` | Aditivos de licitacoes/contratos |
| `certidoes` | Certidoes (empresa_id, cnpj, uf, cidade, tipo, datas, status, arquivo_nome/arquivo_dados base64, observacoes, deleted_at) |
| `licitacoes` | Contrato Licitacoes (numero, cnpj, uf, cidade, objeto, valor, vigencia, arquivos JSON, resumo, deleted_at) |
| `certificados_digitais` | Certificados digitais (empresa_id, cnpj, uf, data_inclusao, data_vencimento, senha, arquivo, deleted_at) |
| `tipos_certidao` | Catalogo editavel de tipos de certidao |
| `destinatarios` | Destinatarios de alertas (email, nome, empresa_ids JSON, setores JSON, alertas JSON) |
| `email_config` | Config SMTP singleton (id=1, senha criptografada AES-256-CBC) |
| `sectors` / `user_setores` | Setores e vinculo N:N com usuarios |
| `user_empresas` | Vinculo usuario-empresas |
| `roles` / `role_permissions` | Perfis e permissoes por modulo (recurso/acao/company_group_id) |
| `user_permissions` | Permissoes avulsas por usuario (cache no sync) |
| `company_groups` / `company_group_members` / `user_grupo_empresas` | Grupos de empresas (filtro do Dashboard e permissoes) |
| `audit_log` | Auditoria de acoes |
| `sync_log` | Log de operacoes de sync |

### 4.2 Soft Delete
- Com `deleted_at`: payments, additives, certidoes, certificados digitais, destinatarios, **licitacoes (campo existe, mas a API de DELETE da licitacao faz exclusao definitiva)**
- Com `active=0`: contracts, companies, sectors, users, company_groups, tipos_certidao

---

## 5. API ENDPOINTS

### 5.1 Autenticacao
| Rota | Metodo | Auth | CSRF | Descricao |
|------|--------|------|------|-----------|
| `/api/csrf-token` | GET | Nao | Nao | Token CSRF |
| `/api/login` | POST | Nao | Nao | Login → JWT cookie |
| `/api/logout` | POST | Sim | Nao | Limpa sessao |
| `/api/me` | GET | Sim | Nao | Usuario logado |
| `/api/forgot-password` | POST | Nao | Nao | Reset via email (rate limit 3/min) |
| `/api/reset-password` | POST | Nao | Nao | Reseta via token |
| `/api/change-password` | POST | Sim | Sim | Altera senha propria |

### 5.2 CRUD Principal
| Rota | Metodo | Auth | CSRF | Descricao |
|------|--------|------|------|-----------|
| `/api/certidoes` | GET/POST | Sim | POST | Lista / cria certidao |
| `/api/certidoes/:id` | PUT/DELETE | Sim | Sim | PUT: atualiza e faz **soft delete** (envia `deleted_at`) — uso padrao da tela; DELETE: exclusao definitiva |
| `/api/licitacoes` | GET/POST | Sim | POST | Lista / cria licitacao |
| `/api/licitacoes/:id` | PUT/DELETE | Sim | Sim | Atualiza (status, arquivos) / **exclusao definitiva** |
| `/api/certificados-digitais` | GET/POST/PUT/DELETE | Sim | Sim | CRUD (DELETE = soft delete com `deleted_at`) |
| `/api/contracts` | GET/POST/PUT/DELETE | Sim | Sim | CRUD contratos (legado/alertas) |
| `/api/payments` | GET/POST/PUT/DELETE | Sim | Sim | CRUD pagamentos (legado/alertas) |
| `/api/additives` | POST/PUT/DELETE | Sim | Sim | CRUD aditivos |
| `/api/companies` | GET/POST/PUT/DELETE | Varied | Sim | Empresas |
| `/api/sectors`, `/api/tipos-certidao` | CRUD | Sim | Sim | Cadastros auxiliares |
| `/api/users`, `/api/user-setores`, `/api/user-empresas`, `/api/user-grupo-empresas` | CRUD | Admin | Sim | Usuarios e vinculos |
| `/api/user-role`, `/api/user-permissions`, `/api/user-permissions-copy` | POST (+GET) | Admin | Sim | Perfil e permissoes por usuario |
| `/api/roles`, `/api/role-permissions`, `/api/role-permissions-copy` | CRUD | Admin | Sim | Perfis e permissoes por modulo |
| `/api/company-groups`, `/api/company-group-members` | CRUD | Sim | Sim | Grupos de empresas |
| `/api/destinatarios` | GET/POST/DELETE | Sim | Sim | Destinatarios de alertas (DELETE = soft delete) |

### 5.3 Sync
| Rota | Metodo | Auth | CSRF | Descricao |
|------|--------|------|------|-----------|
| `/api/sync` | GET | Sim | Nao | Pull (full ou incremental `?since=`) |
| `/api/sync` | POST | Sim | Sim | Push (upsert com resolucao por updated_at) |

> O push so e executado pelo cliente se `SYNC_ENABLED = true`.

### 5.4 E-mail e Alertas
| Rota | Metodo | Auth | CSRF | Descricao |
|------|--------|------|------|-----------|
| `/api/config-email` | GET/POST | Sim | Sim | Config SMTP |
| `/api/enviar-alertas-contratos` | POST | Sim | Sim | Envio manual de alertas de contratos |
| `/api/enviar-alertas-certidoes` | POST | Sim | Sim | Envio manual de alertas de certidoes |
| `/api/enviar-alertas-licitacoes` | POST | Sim | Sim | Envio manual de alertas de licitacoes |
| `/api/enviar-alertas-certificados-digitais` | POST | Sim | Sim | Envio manual de certificados digitais |
| `/api/enviar-lembrete` / `/api/enviar-lembrete-pagamentos` | POST | Sim | Sim | Lembrete de pagamentos (legado) |
| `/api/email-diario` | GET | Nao | Nao | **Cron: envio AUTOMATICO diario as 08:30 BRT (11:30 UTC)** |

### 5.5 Outros
| Rota | Metodo | Auth | CSRF | Descricao |
|------|--------|------|------|-----------|
| `/api/cidades` | GET | Nao | Nao | Cidades por UF (le `api/cidades.json`) |
| `/api/upload-file` | POST | Sim | Sim | Upload base64 |
| `/api/assistente` | POST | Nao | Nao | Assistente virtual (Gemini + fallback offline) |
| `/api/admin-reset` | POST | Nao | Nao | Reset de usuarios (emergencia) |

---

## 6. E-MAIL AUTOMATICO (08:30)

### 6.1 Como funciona
- **Script:** `api/email-diario.js` (handler serverless independente, 484 linhas)
- **Horario:** todo dia as **08:30 (America/Sao_Paulo, UTC-3)** = 11:30 UTC
- **Conteudo:** para cada destinatario (Configuracao > Destinatarios), envia e-mail somente quando ha algo para alertar:
  - **Pagamentos** vencidos / hoje / amanha (tabela `payments`)
  - **Contratos** vencidos e vencendo em 31-35, 16-30, 15 e <=14 dias
  - **Certidoes** vencidas e vencendo (mesmas faixas)
  - **Contrato Licitacoes** vencidas e vencendo (mesmas faixas)
  - **Certificados Digitais** vencidos e vencendo (ate 30 dias)
- Cada destinatario recebe apenas os tipos marcados em "Receber Alertas de" (contratos, certidoes, certificados_digitais, licitacoes) e apenas das empresas vinculadas

### 6.2 Execucao local
- O `server.js` agenda o envio ao iniciar (`agendarEmailDiario()`, chamada em `server.listen`)
- Horario fixo no codigo: `EMAIL_DIARIO_HORA = 8`, `EMAIL_DIARIO_MINUTO = 30`
- Exibe no console: `[EMAIL AUTO] Proximo envio automatico: ...`
- **Requer servidor aberto** no horario; se o servidor iniciar depois das 08:30, agenda para o dia seguinte

### 6.3 Execucao na Vercel
- `vercel.json` define `crons: [{ path: "/api/email-diario", schedule: "30 11 * * *" }]`
- Rota especifica `/api/email-diario` → `api/email-diario.js` (antes do catch-all `/api/(.*)`)
- Requer **deploy** para valer

---

## 7. EXPORTACAO DE RELATORIOS (EXCEL / PDF)

- **Botoes discretos** ("Excel" e "PDF", classe `btn-export`) em: Dashboard, Certidoes, Contrato Licitacoes e Certificados Digitais
- **Excel:** baixa `.csv` com BOM UTF-8 e separador `;` (abre direto no Excel pt-BR)
- **PDF:** abre janela com relatorio formatado (titulo, data, filtros) e aciona a impressao → escolher **"Salvar como PDF"**
- Ambos **respeitam os filtros aplicados na tela**
- Dashboard: inclui secao Resumo (indicadores), alertas de certidoes, lista de licitacoes e os **3 graficos** (imagens) no PDF
- Funcoes: `exportarCertidoes()`, `exportarLicitacoes()`, `exportarCertificadosDigitais()`, `exportarDashboard()` + helpers `_exportarExcel()` / `_exportarPdf()` / `_exportarNomeArquivo()`

---

## 8. FLUXO DE SINCRONIZACAO (SYNC)

### 8.0 Modo atual: MANUAL (`SYNC_ENABLED = false`)
- **Pull:** `loadFromServer()` roda ao entrar nas abas (Certidoes, Licitacoes, Certificados Digitais) e pelo botao **Atualizar** (`atualizarComFeedback`)
- **Gravacao:** CRUD chama `apiCall(method, path, payload)` direto na API e atualiza o cache local — nao ha push em lote
- **Desativados:** polling de 300s, retry de 30s, Supabase Realtime e `syncToServer()` automatico
- Para reativar: `const SYNC_ENABLED = true` (index.html, linha ~7234)

### 8.1 Pull (loadFromServer)
```
GET /api/sync → tabelas do Supabase → mapping snake_case→camelCase
→ substitui os caches (cachedCertidoes, cachedLicitacoes, ...) → IndexedDB → render
```
O cache e SUBSTITUIDO completamente (registros deletados em outra maquina somem).

### 8.2 Push (syncToServer) — somente com SYNC_ENABLED=true
```
POST /api/sync com todos os registros do cache
→ servidor compara updated_at: mais recente vence; deletado vira soft delete
→ payload > 3.5MB: remove arquivos base64 progressivamente
```

### 8.3 Protecoes
- Mutex flags `_syncRunning` / `_saveSyncRunning` evitam concorrencia
- Certidoes/licitacoes com `deleted_at` no servidor nao sao "des-deletadas" pelo cliente
- Cooldown de 30s pos-sync (`SYNC_COOLDOWN_MS`) e debounce de 30s no realtime

---

## 9. SEGURANCA

- JWT em cookie HttpOnly; timeout de sessao (8h default)
- CSRF obrigatorio em escritas (header `X-CSRF-Token` / body `csrf_token`)
- Rate limit de login (10/min por IP) e de forgot-password (3/min)
- Perfis: admin (total), setor_admin (restrito aos seus setores), usuario (basico)
- Permissoes por modulo via `roles`/`role_permissions` (recurso + acao + company_group_id), cobradas no backend e espelhadas no menu
- Exclusoes normalmente exigem admin; menu/botoes se ajustam por permissao
- Senha de certificado digital guardada para consulta (botao "Senha"/"Copiar")
- Senha SMTP criptografada com AES-256-CBC (chave derivada de JWT_SECRET)

---

## 10. DEPLOY

### 10.1 Variaveis (Vercel)
```bash
echo "valor" | vercel env add SUPABASE_URL production
echo "valor" | vercel env add SUPABASE_SERVICE_ROLE_KEY production
echo "valor" | vercel env add JWT_SECRET production
echo "valor" | vercel env add ADMIN_PASSWORD production
echo "valor" | vercel env add GEMINI_API_KEY production
```

### 10.2 Deploy
```bash
vercel --prod --yes
```

### 10.3 Cron Jobs
| Rota | Schedule | Horario BRT | Conteudo |
|------|----------|-------------|----------|
| `/api/email-diario` | `30 11 * * *` | 08:30 | Alertas de pagamentos, contratos, certidoes, licitacoes e certificados digitais |

### 10.4 Execucao local
```bash
npm run dev   # node server.js (porta do .env, ex: 5000; default 3001)
```
O servidor local serve o front, delega /api/* para `api/index.js` e agenda o e-mail diario.

### 10.5 Limitacoes Vercel Hobby
- 10s timeout por funcao; 1024MB RAM; 100GB bandwidth/mes

---

## 11. PROBLEMAS CONHECIDOS E SOLUCOES

| Problema | Causa / Solucao |
|----------|-----------------|
| Alteracao nao aparece em outra maquina | Sync automatico esta desligado (`SYNC_ENABLED=false`); use o botao "Atualizar" da tela |
| Certidao reaparece em outra maquina | Cache agora e substituido integralmente no pull (nao usa merge) |
| Exclusao nao persiste apos reload | PUT de certidoes/licitacoes/certificados aceita `deleted_at` (soft delete) |
| Exclusao de licitacao some para sempre | DELETE de licitacoes e definitivo (hard delete) por definicao |
| Sync recria registros deletados | Sync POST usa soft delete ao inves de hard DELETE |
| E-mail automatico nao dispara | Verificar: servidor local aberto (local) ou cron + deploy (Vercel); config SMTP e destinatarios cadastrados |
| Botao Ver nao mostra certidao federal | Certidao federal vencida e de outra filial: federais ignoram CNPJ e aparecem mesmo vencidas |
| Select ilegivel no modo escuro | Nao usar `background:#fff` inline em inputs/selects (herda o tema) |
| Exportacao PDF nao abre | Navegador bloqueou janela (pop-up); permitir pop-ups do site |
| Supabase excede cota de egress | Upgrade de plano ou reduzir frequencia do sync |
| Alertas falham na Vercel | Payload com anexos base64 excedia limite — funcao monta HTML leve (corrigido) |

---

## 12. ENDPOINTS DE EMERGENCIA

```bash
# Listar usuarios
curl -X POST https://controle-de-contratos-omega.vercel.app/api/admin-reset \
  -H "Content-Type: application/json" -d '{"username":"list"}'

# Resetar senha do admin
curl -X POST https://controle-de-contratos-omega.vercel.app/api/admin-reset \
  -H "Content-Type: application/json" -d '{"username":"admin","new_password":"NovaSenh@123"}'

# Testar envio do e-mail diario manualmente
curl https://controle-de-contratos-omega.vercel.app/api/email-diario
```

---

## 13. ARQUIVOS DO PROJETO

| Arquivo | Descricao |
|---------|-----------|
| `index.html` | SPA completa (HTML + CSS + JS, 7319 linhas) |
| `api/index.js` | API REST + sync + assistente (3215 linhas) |
| `api/email-diario.js` | Envio diario automatico de alertas (484 linhas) |
| `api/cidades.json` | Base de cidades/UFs |
| `server.js` | Servidor local (estaticos + /api + agendamento 08:30) |
| `vercel.json` | Builds, rotas e cron da Vercel |
| `supabase/` | Scripts de migracao (`npm run migrate`) |
| `criar_tabelas_supabase*.sql` | DDL das tabelas |
| `_verify.cjs` | Script de verificacao das tabelas via API do Supabase |
| `README.md` | Visao geral, setup e deploy |
