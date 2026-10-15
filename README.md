# Sistema de Gestão de Contratos, Licitações e Certidões

Sistema web para controle de contratos, licitações, certidões e certificados digitais com sincronização via Supabase e deploy na Vercel.

## 🚀 Tecnologias

- **Frontend**: HTML5, CSS3, JavaScript (ES Modules) - Single Page Application
- **Backend**: Node.js (Vercel Serverless Functions)
- **Banco de Dados**: Supabase (PostgreSQL)
- **Real-time**: Supabase Realtime (WebSocket)
- **Autenticação**: JWT + HttpOnly Cookies
- **Armazenamento Local**: IndexedDB (cache offline)
- **Deploy**: Vercel

## 📋 Funcionalidades

### Dashboard
- Cards de resumo (contratos, pagamentos, certidões, licitações)
- Gráficos de status (Chart.js)
- Próximos vencimentos

### Certidões
- Cadastro com empresa, CNPJ, UF, cidade, tipo, datas, status
- **Obrigatórios**: Empresa, Tipo, CNPJ, UF, Data Emissão, Data Validade, Arquivo
- Filtros por empresa, UF, tipo, status
- Anexo de arquivos (PDF, imagens)
- Visualização de anexos

### Licitações
- Cadastro com número, nome, CNPJ, edital, objeto, empresa, valor, datas
- **Obrigatórios**: Nº Licitação, Objeto, CNPJ, Data Homologação, Início/Fim Vigência, Arquivo
- Múltiplos anexos por licitação (edital, contrato, aditivo, outro)
- Aditivos/renovações vinculados
- Filtros por empresa, status, número

### Certificados Digitais
- Cadastro por empresa com CNPJ/CPF, datas de inclusão e validade
- **Obrigatórios**: Empresa, CNPJ/CPF, Data Inclusão, Data Validade, Arquivo
- Duas visualizações: Configuração e Página Principal

### Configurações
- **Usuários**: CRUD, perfis (admin, setor_admin, user), empresas/setores por usuário
- **Empresas**: CRUD com CNPJ
- **Setores**: CRUD
- **Tipos de Certidão**: CRUD
- **Destinatários de E-mail**: Configuração de alertas por tipo/empresa/setor
- **E-mail SMTP**: Configuração de servidor, portas, credenciais criptografadas
- **Prazos de Alerta**: Configuração por tipo (contratos, certidões, licitações, certificados)
- **Histórico**: Auditoria de ações

### Notificações
- Sino de notificações no header
- Alertas automáticos por e-mail (agendado + manual)
- Indicador de sincronização

## 🏗️ Arquitetura

```
├── index.html          # SPA completo (HTML + CSS + JS)
├── api/
│   ├── index.js        # API principal (REST + Sync + Realtime)
│   └── email-diario.js # Cron job para envio diário
├── server.js           # Servidor local de desenvolvimento
├── vercel.json         # Configuração Vercel
├── package.json        # Dependências
└── supabase/           # Scripts SQL de migração
```

### Fluxo de Dados

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Navegador  │────▶│  Vercel API  │────▶│  Supabase   │
│  (IndexedDB)│     │ (Serverless) │     │ (PostgreSQL)│
└─────────────┘     └──────────────┘     └─────────────┘
       ▲                   │                    │
       │                   ▼                    ▼
       └──────────────  Realtime  ◀────────────┘
              (WebSocket)
```

### Sincronização (Atual)

**Modo Manual (Padrão)**:
- `SYNC_ENABLED = false` no `index.html`
- Carrega do servidor **apenas ao entrar na aba** (`showPage`)
- Botão "🔄 Atualizar" com feedback visual (⏳ → ✅/❌)
- Salvamento direto via API REST (`apiCall POST/PUT/DELETE`)

**Modo Automático (Opcional)**:
- Definir `SYNC_ENABLED = true`
- Polling a cada 5 min + Realtime
- **Risco**: sobrescreve edições locais não salvas

## 🔧 Setup Local

### Pré-requisitos
- Node.js 18+
- Conta Supabase (projeto criado)
- Vercel CLI (opcional)

### Variáveis de Ambiente
Crie `.env` baseado no `.env.example`:

```env
# Supabase
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key

# JWT
JWT_SECRET=sua-chave-secreta-forte

# Admin (fallback)
ADMIN_USER=admin
ADMIN_PASSWORD=senha-forte

# Sessão
SESSION_TIMEOUT_HOURS=8
```

### Instalação
```bash
npm install
```

### Desenvolvimento
```bash
npm run dev
# Roda em http://localhost:3001
```

### Migração do Banco
```bash
npm run migrate
# Executa supabase/migrate.js
```

## 📦 Deploy Vercel

### Automático (Git Push)
```bash
git add .
git commit -m "mensagem"
git push origin main
```

### Manual
```bash
vercel --prod --yes
```

### Configuração Vercel (`vercel.json`)
- `api/index.js` → `@vercel/node` (Serverless Function)
- `api/email-diario.js` → `@vercel/node` (Cron)
- `index.html` → `@vercel/static` (SPA)
- Rotas: `/api/*` → API, `/*` → `index.html`

## 🗄️ Banco de Dados (Supabase)

### Tabelas Principais
| Tabela | Descrição |
|--------|-----------|
| `users` | Usuários do sistema |
| `companies` | Empresas |
| `sectors` | Setores |
| `contracts` | Contratos |
| `payments` | Pagamentos/Parcelas |
| `additives` | Aditivos de contratos |
| `certidoes` | Certidões/CNDs |
| `licitacoes` | Licitações/Contratos de licitação |
| `certificados_digitais` | Certificados digitais (.pfx) |
| `destinatarios` | E-mails para alertas |
| `email_config` | Config SMTP (1 registro) |
| `tipos_certidao` | Tipos de certidão |
| `user_empresas` | Vinculação usuário-empresa |
| `user_setores` | Vinculação usuário-setor |
| `audit_log` | Histórico de ações |
| `password_resets` | Tokens de reset de senha |

### Realtime
Habilitar no painel Supabase: **Database → Replication → Toggle nas tabelas**:
- `certidoes`, `licitacoes`, `destinatarios`, `users`, `companies`, `sectors`

## 🔐 Autenticação

- **Login**: `POST /api/login` → retorna JWT em cookie HttpOnly
- **Sessão**: 8h (configurável via `SESSION_TIMEOUT_HOURS`)
- **CSRF**: Token por sessão (header `x-csrf-token` ou body `csrf_token`)
- **Perfis**:
  - `admin`: Acesso total
  - `setor_admin`: Usuários, empresas/setores do seu setor
  - `user`: Acesso às empresas vinculadas

## 📧 E-mail

### Configuração (Configuração → E-mail)
- Servidor SMTP, Porta, E-mail remetente, Senha (criptografada AES-256)
- E-mail destinatário master
- Prazos de alerta por categoria

### Envio Manual
Botões na tela de Configuração → E-mail:
- "Enviar Alertas de Contratos"
- "Enviar Alertas de Certidões"
- "Enviar Alertas de Certificados Digitais"
- "Enviar Alertas de Contrato Licitações"

### Automático
- `api/email-diario.js` configurado como Cron na Vercel (diário às 10h)
- Processa destinatários por empresa/setor/tipo de alerta

## 🎨 Interface

### Tema
- Claro/Escuro (toggle no header, persistido em `localStorage`)
- Variáveis CSS para cores

### Responsivo
- Grid fluido (`auto-fit`, `minmax`)
- Tabelas com scroll horizontal
- Modais adaptáveis

### Feedback Visual
- Toasts (sucesso/erro/alerta) - 4s auto-dismiss
- Botões de atualização com estados: `⏳ Atualizando...` → `✅ Atualizado` / `❌ Erro`
- Indicador de sincronização no header (● Sincronizado / ● Sincronizando... / ● Falha)

## 📱 PWA / Offline

- IndexedDB como cache local (versão 8)
- Funciona offline para leitura
- Sync manual ao reconectar
- `onversionchange` força reload se schema mudar

## 🛠️ Scripts Úteis

```bash
npm run dev        # Servidor local
npm run migrate    # Migração Supabase
vercel dev         # Vercel local (precisa vercel.json)
```

## 🔍 Debug

### Console do Navegador
- `[SYNC-GET]` / `[SYNC-POST]` - Logs de sincronização
- `[REALTIME]` - Eventos WebSocket
- `[DB]` - Operações IndexedDB
- `[EMAIL]` - Envio de e-mails

### Variáveis Globais Úteis
```js
cachedCertidoes      // Array local de certidões
cachedLicitacoes     // Array local de licitações
currentUser          // Usuário logado
SYNC_ENABLED         // Flag de sync automático
```

## ⚠️ Problemas Conhecidos / Limitações

1. **Sync full-snapshot desativado** - Evita perda de edição local; use botão "Atualizar"
2. **Arquivos grandes** - Base64 no JSON; limite ~3.5MB no sync (anexos omitidos se exceder)
3. **Realtime** - Precisa estar habilitado no Supabase; senão só polling/manual
4. **CNPJ/CPF** - Validação básica (dígitos verificadores)
5. **IE/Edge Legacy** - Não suportado (ES Modules, fetch, IndexedDB)

## 📄 Licença

Uso interno - Gestão de Contratos e Licitações