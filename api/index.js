import { createClient } from '@supabase/supabase-js'
import jwt from 'jsonwebtoken'
import nodemailer from 'nodemailer'
import crypto from 'crypto'
import fs from 'fs'
import nodePath from 'path'
import { fileURLToPath } from 'url'

const __dirname = nodePath.dirname(fileURLToPath(import.meta.url))
const JWT_SECRET = process.env.JWT_SECRET

const forgotPasswordAttempts = new Map()

function checkForgotPasswordRateLimit(ip) {
  const now = Date.now()
  const windowMs = 60 * 1000
  const maxAttempts = 3
  const record = forgotPasswordAttempts.get(ip)
  if (!record || (now - record.start) > windowMs) {
    forgotPasswordAttempts.set(ip, { start: now, count: 1 })
    return true
  }
  record.count++
  if (record.count > maxAttempts) return false
  return true
}

let _supabase = null
function getSupabase() {
  if (_supabase) return _supabase
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('SUPABASE_URL:', url ? 'OK' : 'MISSING', 'SUPABASE_SERVICE_ROLE_KEY:', key ? 'OK' : 'MISSING')
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devem estar configurados nas variaveis de ambiente do Vercel.')
  }
  console.log('Connecting to Supabase:', url)
  _supabase = createClient(url, key, { realtime: { eventsPerSecond: 0 } })
  return _supabase
}

// ─── HELPERS ───────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_ASSISTENTE = `Voce e o Assistente Virtual do sistema GESTAO DE CONTRATOS, LICITACOES E CERTIDOES.
Seu papel e ajudar o usuario a entender e usar o sistema. Responda SEMPRE em portugues brasileiro, de forma simples, direta e objetiva.
Nao invente funcionalidades que nao existam. Se nao souber, diga que nao tem essa informacao e sugira onde procurar.

== SISTEMA ==
Aplicacao web (SPA) para gerenciar CERTIDOES, LICITACOES e CERTIFICADOS DIGITAIS de empresas.
Telas no menu superior: Dashboard | Certidoes | Contrato Licitacoes | Certificados Digitais | Configuracao.

== DASHBOARD ==
Cards de resumo (certidoes vencendo/vencidas, licitacoes em andamento/vencidas, certificados digitais) e graficos.
Filtro por Grupo de Empresas. Clique nos cards para ir para a tela correspondente.

== CERTIDOES ==
Clique em "Nova Certidao" (botao azul). Campos: Empresa*, Tipo*, CNPJ/CPF*, UF*, Cidade, Data de Emissao*, Validade* (ou "sem validade"), Status, Observacoes e Arquivo (obrigatorio).
Dica: ao digitar o CNPJ (14 digitos), o sistema procura a empresa cadastrada e preenche Empresa e UF automaticamente.
Status e calculado automaticamente: Valida / Vencendo / Vencida.
Exclusao: apenas administrador. A tabela tem filtros por empresa, UF, tipo e status, paginacao e exportacao CSV.
Status possiveis: pendente, valida, vencendo, vencida (calculado pela data de validade).

== LICITACOES (Contrato Licitacoes) ==
Clique em "Nova Licitacao". Campos: Numero*, Nome, CNPJ*, Edital, UF, Cidade, Objeto*, Empresa Vencedora, Valor, Indice de Reajuste, Data de Homologacao*, Vigencia (inicio* e fim*), Status, Observacoes e Arquivos (obrigatorio ao criar, multiplos).
Ao digitar o CNPJ, preenche e bloqueia a Empresa Vencedora automaticamente.
Cada licitacao tem ADITIVOS: abra a licitacao e clique em Registrar Aditivo.
Exclusao: apenas administrador (exclusao definitiva). Qualquer usuario com permissao pode inativar/reativar.
Filtros: empresa, status, numero da licitacao.
Botao "Ver" abre o Resumo da Licitacao: dados do contrato, anexos, "Gerar Resumo com IA" e a tabela Certidoes Obrigatorias da Empresa (uma por tipo).
Nessa tabela: certidoes com "Federal" no nome valem para QUALQUER CNPJ/filial e aparecem mesmo vencidas; certidoes estaduais e municipais precisam da mesma UF da licitacao (na municipal, prioriza a cidade do contrato). Todas marcadas como Obrigatorias. Se faltar Federal, Estadual da UF ou Municipal da UF, aparece linha vermelha "Nao encontrada". A coluna Anexo mostra o arquivo da certidao com botao Ver.

== CERTIFICADOS DIGITAIS ==
Clique em "Novo Certificado Digital". Campos: CNPJ/CPF*, Empresa*, UF, Data de Inclusao*, Data de Validade*, Senha do certificado (fica visivel, com botao Copiar) e Arquivo (.pdf/.jpg/.png).
O CNPJ preenche a Empresa e a UF automaticamente.
A senha e guardada para consulta de quem precisar instalar o certificado em outra maquina. Ha um botao "Senha" na lista para ver e copiar.
Exclusao: apenas administrador. Badge mostra "Vencido" ou "Vence em X dias".

== CONFIGURACAO (submenu) ==
- Minha Conta: altere sua propria senha.
- Usuarios: crie/edite usuarios, defina perfil (admin, setor_admin ou usuario) e quais empresas e setores cada um acessa. Apenas admin global cria outros admins.
- Grupos de Empresas: agrupe empresas para facilitar filtros e permissoes.
- Empresas: cadastre nome e CNPJ (sem duplicidade). Pode inativar sem excluir.
- Setores e Tipos de Certidao: cadastros auxiliares com inativar.
- Destinatarios: quem recebe os alertas por e-mail (email, nome, empresas, setores, tipos de alerta).
- E-mail: configure SMTP (servidor, porta, remetente, senha). Botoes de envio manual de alertas.
- Historico: registro de acoes (auditoria).

== ALERTAS POR E-MAIL ==
Envio AUTOMATICO diario as 08:30 para os destinatarios cadastrados (Configuracao > Destinatarios), com alertas de Contratos, Certidoes, Contrato Licitacoes e Certificados Digitais, conforme os tipos marcados em cada destinatario e as empresas vinculadas a ele.
Localmente o envio automatico ocorre enquanto o servidor estiver aberto; na Vercel e um agendamento (cron).
Tambem ha envio manual pelos botoes em Configuracao > E-mail (um botao por tipo de alerta).
So sao enviados e-mails quando ha algo para alertar (vencidos ou proximos do vencimento).

== PERMISSOES ==
Perfis: admin (acesso total), setor_admin (restrito aos seus setores), usuario (permissoes basicas).
Exclusoes (certidoes, licitacoes, certificados, usuarios) normalmente exigem admin.
O menu e os botoes se ajustam conforme a permissao do usuario.

== RECURSOS ==
- Sino de notificacoes: alertas de vencimentos.
- Tema claro/escuro: icone de lua/sol no canto superior direito.
- Exportacao de relatorios: botoes discretos "Excel" e "PDF" em todas as telas (Dashboard, Certidoes, Contrato Licitacoes e Certificados Digitais). Excel baixa arquivo .csv (abre no Excel). PDF abre janela de impressao: escolha "Salvar como PDF". Exporta os dados com os filtros aplicados na tela; o Dashboard inclui o resumo e os graficos no PDF.
- Detalhe dos graficos do Dashboard: clique em uma fatia ou bloco para ver a lista detalhada (Empresa, Tipo, CNPJ, UF, Cidade, Validade, Status).
- Anexos: armazenados no sistema; PDFs podem ser visualizados, baixados e impressos.
- Senha esquecida: use "Esqueci a senha" na tela de login.

Responda duvidas de uso do sistema. Para problemas tecnicos (servidor, banco), sugira falar com o administrador.`

function respostaOffline(pergunta) {
  const p = pergunta.toLowerCase()
  if (['certidao', 'certidão', 'certidoes', 'certidões'].some(w => p.includes(w)))
    return 'Para cadastrar uma certidao, clique em "Nova Certidao" no menu Certidoes. Preencha Empresa, Tipo, CNPJ, UF, cidades, datas e anexe o arquivo. Ao digitar o CNPJ, a empresa e a UF sao preenchidas automaticamente. A exclusao so pode ser feita por administrador.'
  if (['licitacao', 'licitações', 'licitacoe', 'edital', 'aditivo'].some(w => p.includes(w)))
    return 'Para cadastrar uma licitacao, va em "Contrato Licitacoes" e clique em "Nova Licitacao". Preencha Numero, CNPJ, Objeto, datas de homologacao e vigencia, e anexe os arquivos. Cada licitacao pode ter aditivos (botao dentro da licitacao). Exclusao apenas de administrador.'
  if (['certificado digital', 'certificado', 'senha do certificado'].some(w => p.includes(w)))
    return 'Em "Certificados Digitais", clique em "Novo Certificado Digital". Informe o CNPJ (preenche empresa e UF), datas, senha do certificado e anexe o arquivo. A senha fica visivel e pode ser copiada com o botao "Copiar" ou pelo botao "Senha" na lista.'
  if (['cnpj', 'empresa', 'cadastre a empresa'].some(w => p.includes(w)))
    return 'Para cadastrar empresas, va em Configuracao > Empresas. Informe nome e CNPJ (sem duplicidade). CNPJ e CPF sao aceitos nos cadastros. Voce pode inativar uma empresa sem exclui-la.'
  if (['usuario', 'senha', 'login', 'perfil', 'permissao'].some(w => p.includes(w)))
    return 'Usuarios: Configuracao > Usuarios. La voce cria usuarios, define o perfil (admin, setor_admin ou usuario) e quais empresas/setores cada um acessa. Para alterar sua propria senha: Configuracao > Minha Conta. Senha esquecida: use "Esqueci a senha" no login.'
  if (['email', 'smtp', 'alerta', 'lembrete', 'notificacao', 'destinatario', 'automatico', 'automático'].some(w => p.includes(w)))
    return 'Configure o e-mail em Configuracao > E-mail (servidor SMTP, porta, remetente, senha). Os destinatarios sao cadastrados em Configuracao > Destinatarios (marque os tipos de alerta e as empresas de cada um). O envio e AUTOMATICO todo dia as 08:30 (contratos, certidoes, licitacoes e certificados digitais), desde que haja vencidos ou proximos do vencimento. Tambem ha botoes de envio manual em Configuracao > E-mail.'
  if (['dashboard', 'inicio', 'resumo do dashboard', 'grafico'].some(w => p.includes(w)))
    return 'O Dashboard mostra cards de resumo (certidoes vencendo/vencidas, licitacoes, certificados digitais) e graficos, com filtro por Grupo de Empresas. Clique em um card ou numa parte do grafico para ver a lista detalhada (com UF e Cidade). Ha botoes Excel e PDF para exportar o relatorio do Dashboard.'
  if (['tema', 'escuro', 'claro'].some(w => p.includes(w)))
    return 'Para mudar o tema, clique no icone da lua/sol no canto superior direito do header.'
  if (['exportar', 'excel', 'csv', 'planilha', 'pdf', 'relatorio', 'impressão', 'impressao'].some(w => p.includes(w)))
    return 'Em todas as telas (Dashboard, Certidoes, Contrato Licitacoes e Certificados Digitais) ha botoes discretos "Excel" e "PDF" no canto superior. Excel baixa um .csv que abre no Excel. PDF abre uma janela de impressao: escolha "Salvar como PDF". A exportacao respeita os filtros aplicados na tela; o Dashboard inclui resumo e graficos.'
  if (['resumo', 'obrigatoria', 'obrigatorias', 'resumo com ia', 'botao ver'].some(w => p.includes(w)))
    return 'No botao "Ver" de cada licitacao abre o Resumo: dados do contrato, anexos, "Gerar Resumo com IA" e as Certidoes Obrigatorias da Empresa (uma por tipo). Certidoes com "Federal" no nome valem para qualquer filial/CNPJ e aparecem mesmo vencidas; estaduais e municipais precisam da mesma UF da licitacao (municipal prioriza a cidade). Se faltar Federal, Estadual da UF ou Municipal da UF, aparece em vermelho "Nao encontrada". A coluna Anexo tem o botao Ver para abrir o arquivo.'
  if (['historico', 'auditoria', 'log'].some(w => p.includes(w)))
    return 'O historico de acoes fica em Configuracao > Historico. La voce ve quem fez o que e quando.'
  if (['grupo', 'grupos'].some(w => p.includes(w)))
    return 'Grupos de Empresas: Configuracao > Grupos de Empresas. Agrupe empresas para facilitar filtros no Dashboard e permissoes de usuarios.'
  if (['setor', 'setores'].some(w => p.includes(w)))
    return 'Setores: Configuracao > Setores. Cadastre os setores da empresa; eles sao usados para restringir acesso de usuarios e destinatarios de alertas.'
  if (['vencendo', 'vencida', 'vencido', 'alerta de vencimento'].some(w => p.includes(w)))
    return 'O sistema calcula automaticamente o status de certidoes e certificados digitais (Valida, Vencendo, Vencida) com base na data de validade. O sino de notificacoes e o Dashboard mostram os proximos vencimentos.'
  if (['filtro', 'filtrar', 'busca', 'pesquisar'].some(w => p.includes(w)))
    return 'Cada tela de listagem (Certidoes, Licitacoes, Certificados Digitais) tem filtros no topo (por empresa, UF, tipo, status, etc.). Use-os para encontrar registros rapidamente.'
  return 'Posso ajudar com: certidoes, licitacoes (incluindo resumo e certidoes obrigatorias), certificados digitais, empresas, usuarios e permissoes, grupos de empresas, setores, destinatarios de e-mail e envio automatico de alertas, dashboard, filtros e exportacao (Excel/PDF). Sua pergunta e sobre qual assunto?'
}

function json(data, status = 200, extraHeaders = {}) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(data)
  }
}

function parseCookies(header) {
  const cookies = {}
  if (!header) return cookies
  header.split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=')
    if (k) cookies[k.trim()] = v.join('=').trim()
  })
  return cookies
}

function setCookie(name, value, opts = {}) {
  let s = `${name}=${value}; Path=/; HttpOnly; SameSite=Lax`
  if (opts.secure) s += '; Secure'
  if (opts.maxAge) s += `; Max-Age=${opts.maxAge}`
  return s
}

function getAuthUser(cookieHeader) {
  try {
    const cookies = parseCookies(cookieHeader)
    const token = cookies['token']
    if (!token) return null
    return jwt.verify(token, JWT_SECRET)
  } catch { return null }
}

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex')
    crypto.pbkdf2(password, salt, 310000, 32, 'sha256', (err, key) => {
      if (err) reject(err)
      else resolve(`pbkdf2_sha256$${salt}$${key.toString('hex')}`)
    })
  })
}

function checkPassword(password, hash) {
  return new Promise((resolve, reject) => {
    if (!hash) return resolve(false)

    // Formato werkzeug: pbkdf2:sha256:600000$<base64salt>$<base64hash>
    if (hash.startsWith('pbkdf2:')) {
      try {
        const parts = hash.split('$')
        if (parts.length < 3) return resolve(false)
        const salt = Buffer.from(parts[1], 'base64')
        const storedHash = Buffer.from(parts[2], 'base64')
        const iterations = parseInt(hash.split(':')[2]) || 600000
        crypto.pbkdf2(password, salt, iterations, storedHash.length, 'sha256', (err, key) => {
          if (err) reject(err)
          else resolve(key.equals(storedHash))
        })
      } catch { resolve(false) }
      return
    }

    // Formato werkzeug: scrypt:32768:8:1$<base64salt>$<base64hash>
    if (hash.startsWith('scrypt:')) {
      try {
        const parts = hash.split('$')
        if (parts.length < 3) return resolve(false)
        const params = parts[0].split(':')
        const N = parseInt(params[1]) || 32768
        const r = parseInt(params[2]) || 8
        const p = parseInt(params[3]) || 1
        const salt = Buffer.from(parts[1], 'base64')
        const storedHash = Buffer.from(parts[2], 'base64')
        const maxMem = 16 * 1024 * 1024
        crypto.scrypt(password, salt, storedHash.length, { N, r, p, maxmem: maxMem }, (err, key) => {
          if (err) reject(err)
          else resolve(key.equals(storedHash))
        })
      } catch { resolve(false) }
      return
    }

    // Formato api.js: pbkdf2_sha256$<hexsalt>$<hexhash>
    if (hash.includes('$')) {
      const parts = hash.split('$')
      if (parts.length < 3) return resolve(false)
      const salt = parts[1]
      const storedHash = parts[2]
      crypto.pbkdf2(password, salt, 310000, 32, 'sha256', (err, key) => {
        if (err) reject(err)
        else resolve(key.toString('hex') === storedHash)
      })
      return
    }

    resolve(false)
  })
}

function deriveCsrf(userId) {
  const h = crypto.createHmac('sha256', JWT_SECRET)
  h.update(String(userId))
  return h.digest('hex')
}

function validateCsrf(user, bodyCsrf) {
  if (!user || !bodyCsrf) return false
  const sessionCsrf = user._csrfToken || deriveCsrf(user.id)
  return sessionCsrf === bodyCsrf
}

// ─── MATRIZ DE PERMISSOES (role_permissions) ─────────────────────────────
// A matriz resource/action e a fonte da verdade das rotas administrativas.
// Os atalhos legados continuam valendo: 'admin' passa em tudo e 'setor_admin'
// mantem o acesso administrativo que ja tinha (compatibilidade com roles
// criadas antes da matriz). Demais papeis passam pela matriz.
const ROLE_PERM_CACHE_MS = 60 * 1000
const rolePermCache = new Map()

function clearRolePermCache(roleId) {
  if (roleId) rolePermCache.delete(roleId)
  else rolePermCache.clear()
}

async function getRolePerms(roleId) {
  const hit = rolePermCache.get(roleId)
  if (hit && (Date.now() - hit.ts) < ROLE_PERM_CACHE_MS) return hit.perms
  let perms = []
  try {
    const { data, error } = await getSupabase().from('role_permissions').select('*').eq('role_id', roleId)
    if (!error && data) perms = data.filter(p => !p.deleted_at)
  } catch (e) {
    console.error('[PERM] Erro ao ler role_permissions:', e.message)
  }
  rolePermCache.set(roleId, { perms, ts: Date.now() })
  return perms
}

// Rotas administrativas nao tem contexto de empresa, entao so valem
// permissoes atribuidas sem escopo (empresa_id e company_group_id vazios).
async function temPermissaoRole(roleId, resource, action) {
  if (!roleId) return false
  const perms = await getRolePerms(roleId)
  if (perms.some(p => p.resource === '*' && p.action === '*')) return true
  return perms.some(p =>
    p.resource === resource &&
    p.action === action &&
    !p.empresa_id &&
    !p.company_group_id
  )
}

// Papel efetivo lido do banco: o JWT nao carrega role_id e o campo legado
// `users.role` pode estar defasado quando a role e trocada por /user-role.
async function getEffectiveRole(user) {
  try {
    const { data } = await getSupabase().from('users').select('role, role_id').eq('id', user.id).single()
    if (data) return { role: legacyRoleFromRoleId(data.role_id, data.role), roleId: data.role_id || null }
  } catch (e) {
    console.error('[PERM] Erro ao ler papel do usuario:', e.message)
  }
  return { role: user.role || null, roleId: null }
}

async function requirePerm(user, resource, action) {
  if (!user) return json({ ok: false, erro: 'Nao autenticado' }, 401)
  const { role, roleId } = await getEffectiveRole(user)
  if (role === 'admin') return null
  if (role === 'setor_admin') return null
  if (roleId && await temPermissaoRole(roleId, resource, action)) return null
  return json({ ok: false, erro: `Acesso restrito: permissao ${resource}.${action} nao concedida` }, 403)
}

// Exige administrador global ou a permissao correspondente na matriz.
// (Substitui o antigo requireGlobalAdmin, que so aceitava role 'admin'.)
async function requireGlobalPerm(user, resource, action) {
  if (!user) return json({ ok: false, erro: 'Nao autenticado' }, 401)
  const { role, roleId } = await getEffectiveRole(user)
  if (role === 'admin') return null
  if (roleId && await temPermissaoRole(roleId, resource, action)) return null
  return json({ ok: false, erro: `Acesso restrito: permissao ${resource}.${action} nao concedida` }, 403)
}

// Atribuir papeis de administrador so pode quem ja e administrador global:
// ambos ('role_admin' e 'role_admin_setor') pulam os guards da matriz, entao
// quem so tem permissoes nao pode se promover por meio deles.
async function requirePermParaRole(user, roleId) {
  if (roleId !== 'role_admin' && roleId !== 'role_admin_setor') return null
  const { role } = await getEffectiveRole(user)
  if (role === 'admin') return null
  return json({ ok: false, erro: 'Somente o administrador global pode atribuir papeis de administrador' }, 403)
}

// Quem so tem a matriz de permissoes nao altera (nem rebaixa) um
// administrador global: protege o admin principal de ser despromovido.
async function requirePermToManageUser(user, targetUserId) {
  const me = await getEffectiveRole(user)
  if (me.role === 'admin') return null
  try {
    const { data } = await getSupabase().from('users').select('role, role_id').eq('id', targetUserId).single()
    if (data && legacyRoleFromRoleId(data.role_id, data.role) === 'admin') {
      return json({ ok: false, erro: 'Somente o administrador global pode alterar um administrador' }, 403)
    }
  } catch (e) {
    console.error('[PERM] Erro ao verificar usuario alvo:', e.message)
  }
  return null
}

// O campo legado `users.role` aceita apenas 'admin' | 'setor_admin' | outros.
// Nunca gravar o id da role (ex.: 'role_admin') neste campo: getEffectiveRole()
// e o menu/tratamento de telas derivam o papel do usuário daqui (com fallback
// para a role_id), então valores fora da lista deixam o usuário sem papel.
function legacyRoleFromRoleId(roleId, fallback) {
  if (roleId === 'role_admin') return 'admin'
  if (roleId === 'role_admin_setor') return 'setor_admin'
  if (roleId) return 'usuario'
  return (fallback || 'user').trim() || 'user'
}

function requireAuth(user) {
  if (!user) {
    return json({ ok: false, erro: 'Nao autenticado' }, 401)
  }
  return null
}

async function audit(userId, action, entity, entityId = '', details = '') {
  await getSupabase().from('audit_log').insert({
    user_id: userId, action, entity,
    entity_id: entityId, details
  })
}

function escapeHtml(s) {
  if (!s) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function money(v) {
  const n = parseFloat(v) || 0
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
}

function datefmt(s) {
  if (!s) return '-'
  try {
    const d = new Date(s.slice(0, 10))
    return d.toLocaleDateString('pt-BR')
  } catch { return String(s) }
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function safeFloat(value, def = 0) {
  if (value == null || value === '') return def
  const n = parseFloat(value)
  return isNaN(n) ? def : n
}

function validarCpfCnpj(valor) {
  const nums = String(valor).replace(/\D/g, '')
  if (nums.length === 11) {
    if (nums === nums[0].repeat(11)) return false
    let s1 = 0
    for (let i = 0; i < 9; i++) s1 += parseInt(nums[i]) * (10 - i)
    const d1 = (s1 * 10 % 11) % 11
    let s2 = 0
    for (let i = 0; i < 10; i++) s2 += parseInt(nums[i]) * (11 - i)
    const d2 = (s2 * 10 % 11) % 11
    return parseInt(nums[9]) === d1 && parseInt(nums[10]) === d2
  }
  if (nums.length === 14) {
    if (nums === nums[0].repeat(14)) return false
    const p1 = [5,4,3,2,9,8,7,6,5,4,3,2]
    let s1 = 0
    for (let i = 0; i < 12; i++) s1 += parseInt(nums[i]) * p1[i]
    let d1 = 11 - (s1 % 11)
    if (d1 >= 10) d1 = 0
    const p2 = [6,5,3,2,9,8,7,6,5,4,3,2]
    let s2 = 0
    for (let i = 0; i < 13; i++) s2 += parseInt(nums[i]) * p2[i]
    let d2 = 11 - (s2 % 11)
    if (d2 >= 10) d2 = 0
    return parseInt(nums[12]) === d1 && parseInt(nums[13]) === d2
  }
  return true
}

// ─── EMAIL ─────────────────────────────────────────────────────────────────

async function getEmailConfig() {
  const { data } = await getSupabase().from('email_config').select('*').eq('id', 1).single()
  if (!data) return {}
  const cfg = { ...data }
  cfg.email_servidor = cfg.email_servidor || cfg.smtp_server || ''
  cfg.email_porta = cfg.email_porta || cfg.smtp_port || ''
  if (cfg.email_senha_enc) {
    try {
      const decipher = crypto.createDecipheriv(
        'aes-256-cbc',
        crypto.createHash('sha256').update(JWT_SECRET).digest(),
        Buffer.from(cfg.email_senha_enc, 'hex').slice(0, 16)
      )
      const encrypted = Buffer.from(cfg.email_senha_enc, 'hex').slice(16)
      cfg.email_senha = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
      console.log('[EMAIL-DECRYPT] Senha descriptografada, len:', cfg.email_senha.length)
    } catch (e) {
      console.error('[EMAIL-DECRYPT] Erro ao descriptografar:', e.message)
      cfg.email_senha = ''
    }
  }
  cfg.email_senha_enc = undefined
  if (cfg.prazos && typeof cfg.prazos === 'string') {
    try { cfg.prazos = JSON.parse(cfg.prazos); } catch (e) { cfg.prazos = {}; }
  }
  return cfg
}

async function saveEmailConfig(cfg) {
  const data = { ...cfg }
  if (data.email_senha && data.email_senha !== '********') {
    const key = crypto.createHash('sha256').update(JWT_SECRET).digest()
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
    const encrypted = Buffer.concat([cipher.update(data.email_senha, 'utf8'), cipher.final()])
    data.email_senha_enc = Buffer.concat([iv, encrypted]).toString('hex')
  }
  delete data.email_senha
  const dbData = {
    id: 1,
    smtp_server: data.email_servidor || data.smtp_server || '',
    smtp_port: data.email_porta || data.smtp_port || 587,
    email_remetente: data.email_remetente || '',
    email_senha_enc: data.email_senha_enc || '',
    email_destinatario: data.email_destinatario || ''
  }
  if (data.prazos) {
    dbData.prazos = JSON.stringify(data.prazos)
  }
  const { error } = await getSupabase().from('email_config').upsert(dbData)
  if (error) console.error('[EMAIL] Erro ao salvar config:', error.message)
  else console.log('[EMAIL] Config salva. Senha criptografada len:', (dbData.email_senha_enc || '').length)
}

// ─── EMAIL SENDING ─────────────────────────────────────────────────────────

function processPayments(contratos, pagamentos, hoje, empresaNomes = {}) {
  const vencidos = [], venceHoje = [], venceAmanha = []
  for (const p of pagamentos) {
    if (p.data_pagamento) continue
    const venc = (p.vencimento || '').slice(0, 10)
    const dv = new Date(venc)
    if (isNaN(dv)) continue
    const c = contratos.find(c2 => c2.id === p.contract_id)
    const diff = Math.floor((dv - new Date(hoje)) / 86400000)
    const info = {
      numero_contrato: p.contrato_num || (c ? c.numero : '?'),
      empresa: empresaNomes[c?.empresa_id] || '',
      parte: c ? c.fornecedor : '?',
      descricao: p.descricao || '?',
      vencimento: datefmt(venc),
      valor: money(p.valor || 0)
    }
    if (diff < 0) { info.dias = Math.abs(diff); vencidos.push(info) }
    else if (diff === 0) venceHoje.push(info)
    else if (diff === 1) venceAmanha.push(info)
  }
  return [vencidos, venceHoje, venceAmanha]
}

function processContratosVencidos(contratos, hoje) {
  const vencidos = []
  const hj = new Date(hoje)
  for (const c of contratos) {
    const fim = (c.fim || '').slice(0, 10)
    const df = new Date(fim)
    if (isNaN(df)) continue
    const diff = Math.floor((hj - df) / 86400000)
    if (diff <= 0) continue
    vencidos.push({ numero: c.numero, fornecedor: c.fornecedor, objeto: c.objeto, fim: datefmt(fim), dias_passados: diff })
  }
  return vencidos
}

function processContratosAVencer(contratos, hoje) {
  const grupos = { d35: [], d30: [], d15: [], d0_14: [] }
  const hj = new Date(hoje)
  for (const c of contratos) {
    const fim = (c.fim || '').slice(0, 10)
    const df = new Date(fim)
    if (isNaN(df)) continue
    const diff = Math.floor((df - hj) / 86400000)
    if (diff < 0) continue
    const info = { numero: c.numero, fornecedor: c.fornecedor, objeto: c.objeto, fim: datefmt(fim), dias: diff }
    if (diff >= 31 && diff <= 35) grupos.d35.push(info)
    else if (diff >= 16 && diff <= 30) grupos.d30.push(info)
    else if (diff === 15) grupos.d15.push(info)
    else if (diff >= 0 && diff <= 14) grupos.d0_14.push(info)
  }
  return grupos
}

function montarHtmlPagamentos(vencidos, venceHoje, venceAmanha, tituloExtra = '') {
  let html = `<h2 style="color:#1a3c5e">Lembrete de Vencimentos${escapeHtml(tituloExtra)}</h2>`
  if (vencidos.length) {
    html += `<h3 style="color:#c0392b">VENCIDOS</h3><table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;margin-bottom:20px"><tr style="background:#ffe1e1"><th>Contrato</th><th>Fornecedor</th><th>Parcela</th><th>Vencimento</th><th>Valor</th><th>Dias</th></tr>`
    for (const v of vencidos) html += `<tr><td>${escapeHtml(v.numero_contrato)}</td><td>${escapeHtml(v.parte)}</td><td>${escapeHtml(v.descricao)}</td><td>${escapeHtml(v.vencimento)}</td><td>R$ ${escapeHtml(v.valor)}</td><td>${v.dias} dia(s)</td></tr>`
    html += '</table>'
  }
  if (venceHoje.length) {
    html += `<h3 style="color:#d4820a">VENCEM HOJE</h3><table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;margin-bottom:20px"><tr style="background:#fff3cd"><th>Contrato</th><th>Fornecedor</th><th>Parcela</th><th>Vencimento</th><th>Valor</th></tr>`
    for (const v of venceHoje) html += `<tr><td>${escapeHtml(v.numero_contrato)}</td><td>${escapeHtml(v.parte)}</td><td>${escapeHtml(v.descricao)}</td><td>${escapeHtml(v.vencimento)}</td><td>R$ ${escapeHtml(v.valor)}</td></tr>`
    html += '</table>'
  }
  if (venceAmanha.length) {
    html += `<h3 style="color:#24527a">VENCEM AMANHA</h3><table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;margin-bottom:20px"><tr style="background:#eef6ff"><th>Contrato</th><th>Fornecedor</th><th>Parcela</th><th>Vencimento</th><th>Valor</th></tr>`
    for (const v of venceAmanha) html += `<tr><td>${escapeHtml(v.numero_contrato)}</td><td>${escapeHtml(v.parte)}</td><td>${escapeHtml(v.descricao)}</td><td>${escapeHtml(v.vencimento)}</td><td>R$ ${escapeHtml(v.valor)}</td></tr>`
    html += '</table>'
  }
  return html
}

function montarHtmlContratos(vencidos, grupos, tituloExtra = '') {
  let html = ''
  if (vencidos.length) {
    html += `<h2 style="color:#c0392b">Contratos Vencidos${escapeHtml(tituloExtra)}</h2><table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;margin-bottom:20px"><tr style="background:#ffe1e1"><th>Contrato</th><th>Fornecedor</th><th>Objeto</th><th>Termino</th><th>Dias</th></tr>`
    for (const c of vencidos) html += `<tr><td>${escapeHtml(c.numero)}</td><td>${escapeHtml(c.fornecedor)}</td><td>${escapeHtml(c.objeto)}</td><td>${escapeHtml(c.fim)}</td><td>${c.dias_passados} dia(s)</td></tr>`
    html += '</table>'
  }
  const secoes = [
    ['d35', 'ENTRE 31 E 35 DIAS', '#24527a', '#eef6ff'],
    ['d30', 'ENTRE 16 E 30 DIAS', '#d4820a', '#fff3cd'],
    ['d15', 'FALTAM 15 DIAS', '#c0392b', '#ffe1e1'],
    ['d0_14', 'MENOS DE 15 DIAS', '#b71c1c', '#ffd7d7'],
  ]
  for (const [chave, titulo, cor, bg] of secoes) {
    const grupo = grupos[chave]
    if (!grupo?.length) continue
    if (html) html += `<h2 style="color:#1a3c5e">Aviso de Vencimento${escapeHtml(tituloExtra)}</h2>`
    html += `<h3 style="color:${cor}">${titulo}</h3><table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;margin-bottom:20px"><tr style="background:${bg}"><th>Contrato</th><th>Fornecedor</th><th>Objeto</th><th>Termino</th><th>Dias</th></tr>`
    for (const c of grupo) html += `<tr><td>${escapeHtml(c.numero)}</td><td>${escapeHtml(c.fornecedor)}</td><td>${escapeHtml(c.objeto)}</td><td>${escapeHtml(c.fim)}</td><td>${c.dias} dia(s)</td></tr>`
    html += '</table>'
  }
  return html
}

function processCertidoesVencidas(certidoes, hoje, empMap) {
  const vencidas = []
  const hj = new Date(hoje)
  for (const ct of certidoes) {
    const fv = (ct.data_validade || '').slice(0, 10)
    const df = new Date(fv)
    if (isNaN(df)) continue
    const diff = Math.floor((hj - df) / 86400000)
    if (diff <= 0) continue
    const empNome = empMap ? (empMap[ct.empresa_id] || ct.empresa_id || '') : (ct.empresa_id || '')
    vencidas.push({ id: ct.id, tipo: ct.tipo, empresa: empNome, cnpj: ct.cnpj || '', uf: ct.uf || '', cidade: ct.cidade || '', validade: datefmt(fv), dias: diff })
  }
  return vencidas
}

function processCertidoesAVencer(certidoes, hoje, empMap) {
  const grupos = { d35: [], d30: [], d15: [], d0_14: [] }
  const hj = new Date(hoje)
  for (const ct of certidoes) {
    const fv = (ct.data_validade || '').slice(0, 10)
    const df = new Date(fv)
    if (isNaN(df)) continue
    const diff = Math.floor((df - hj) / 86400000)
    if (diff < 0) continue
    const empNome = empMap ? (empMap[ct.empresa_id] || ct.empresa_id || '') : (ct.empresa_id || '')
    const info = { id: ct.id, tipo: ct.tipo, empresa: empNome, cnpj: ct.cnpj || '', uf: ct.uf || '', cidade: ct.cidade || '', validade: datefmt(fv), dias: diff }
    if (diff >= 31 && diff <= 35) grupos.d35.push(info)
    else if (diff >= 16 && diff <= 30) grupos.d30.push(info)
    else if (diff === 15) grupos.d15.push(info)
    else if (diff >= 0 && diff <= 14) grupos.d0_14.push(info)
  }
  return grupos
}

function montarHtmlCertidoes(vencidas, grupos, tituloExtra = '') {
  let html = ''
  if (vencidas.length) {
    html += `<h2 style="color:#c0392b">Certidoes Vencidas${escapeHtml(tituloExtra)}</h2><table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;margin-bottom:20px"><tr style="background:#ffe1e1"><th>Tipo</th><th>Empresa</th><th>CNPJ</th><th>Estado</th><th>Municipio</th><th>Validade</th><th>Dias Vencida</th></tr>`
    for (const c of vencidas) html += `<tr><td>${escapeHtml(c.tipo)}</td><td>${escapeHtml(c.empresa)}</td><td>${escapeHtml(c.cnpj)}</td><td>${escapeHtml(c.uf)}</td><td>${escapeHtml(c.cidade)}</td><td>${escapeHtml(c.validade)}</td><td>${c.dias} dia(s)</td></tr>`
    html += '</table>'
  }
  const secoes = [
    ['d35', 'ENTRE 31 E 35 DIAS', '#24527a', '#eef6ff'],
    ['d30', 'ENTRE 16 E 30 DIAS', '#d4820a', '#fff3cd'],
    ['d15', 'FALTAM 15 DIAS', '#c0392b', '#ffe1e1'],
    ['d0_14', 'MENOS DE 15 DIAS', '#b71c1c', '#ffd7d7'],
  ]
  for (const [chave, titulo, cor, bg] of secoes) {
    const grupo = grupos[chave]
    if (!grupo?.length) continue
    if (html) html += `<h2 style="color:#1a3c5e">Aviso de Validade${escapeHtml(tituloExtra)}</h2>`
    html += `<h3 style="color:${cor}">${titulo}</h3><table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;margin-bottom:20px"><tr style="background:${bg}"><th>Tipo</th><th>Empresa</th><th>CNPJ</th><th>Estado</th><th>Municipio</th><th>Validade</th><th>Dias</th></tr>`
    for (const c of grupo) html += `<tr><td>${escapeHtml(c.tipo)}</td><td>${escapeHtml(c.empresa)}</td><td>${escapeHtml(c.cnpj)}</td><td>${escapeHtml(c.uf)}</td><td>${escapeHtml(c.cidade)}</td><td>${escapeHtml(c.validade)}</td><td>${c.dias} dia(s)</td></tr>`
    html += '</table>'
  }
  return html || `<p style="color:#2e7d52">Nenhuma certidao com alerta pendente.</p>`
}

function processLicitacoesVencidas(licitacoes, hoje, empMap = {}) {
  const vencidas = []
  const hj = new Date(hoje)
  for (const lc of licitacoes) {
    const fv = (lc.data_fim || '').slice(0, 10)
    const df = new Date(fv)
    if (isNaN(df)) continue
    const diff = Math.floor((hj - df) / 86400000)
    if (diff <= 0) continue
    vencidas.push({ id: lc.id, numero: lc.numero_licitacao || '', objeto: lc.objeto || '', empresa: empMap[lc.empresa_id] || lc.empresa_id || '', dataFim: datefmt(fv), dias: diff })
  }
  return vencidas
}

function processLicitacoesAVencer(licitacoes, hoje, empMap = {}) {
  const grupos = { d35: [], d30: [], d15: [], d0_14: [] }
  const hj = new Date(hoje)
  for (const lc of licitacoes) {
    const fv = (lc.data_fim || '').slice(0, 10)
    const df = new Date(fv)
    if (isNaN(df)) continue
    const diff = Math.floor((df - hj) / 86400000)
    if (diff < 0) continue
    const info = { id: lc.id, numero: lc.numero_licitacao || '', objeto: lc.objeto || '', empresa: empMap[lc.empresa_id] || lc.empresa_id || '', dataFim: datefmt(fv), dias: diff }
    if (diff >= 31 && diff <= 35) grupos.d35.push(info)
    else if (diff >= 16 && diff <= 30) grupos.d30.push(info)
    else if (diff === 15) grupos.d15.push(info)
    else if (diff >= 0 && diff <= 14) grupos.d0_14.push(info)
  }
  return grupos
}

function montarHtmlLicitacoes(vencidas, grupos, tituloExtra = '') {
  let html = ''
  if (vencidas.length) {
    html += `<h2 style="color:#c0392b">Licitacoes Vencidas${escapeHtml(tituloExtra)}</h2><table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;margin-bottom:20px"><tr style="background:#ffe1e1"><th>Numero</th><th>Objeto</th><th>Empresa</th><th>Data Fim</th><th>Dias</th></tr>`
    for (const l of vencidas) html += `<tr><td>${escapeHtml(l.numero)}</td><td>${escapeHtml(l.objeto)}</td><td>${escapeHtml(l.empresa)}</td><td>${escapeHtml(l.dataFim)}</td><td>${l.dias} dia(s)</td></tr>`
    html += '</table>'
  }
  const secoes = [
    ['d35', 'ENTRE 31 E 35 DIAS', '#24527a', '#eef6ff'],
    ['d30', 'ENTRE 16 E 30 DIAS', '#d4820a', '#fff3cd'],
    ['d15', 'FALTAM 15 DIAS', '#c0392b', '#ffe1e1'],
    ['d0_14', 'MENOS DE 15 DIAS', '#b71c1c', '#ffd7d7'],
  ]
  for (const [chave, titulo, cor, bg] of secoes) {
    const grupo = grupos[chave]
    if (!grupo?.length) continue
    if (html) html += `<h2 style="color:#1a3c5e">Aviso de Vencimento${escapeHtml(tituloExtra)}</h2>`
    html += `<h3 style="color:${cor}">${titulo}</h3><table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;margin-bottom:20px"><tr style="background:${bg}"><th>Numero</th><th>Objeto</th><th>Empresa</th><th>Data Fim</th><th>Dias</th></tr>`
    for (const l of grupo) html += `<tr><td>${escapeHtml(l.numero)}</td><td>${escapeHtml(l.objeto)}</td><td>${escapeHtml(l.empresa)}</td><td>${escapeHtml(l.dataFim)}</td><td>${l.dias} dia(s)</td></tr>`
    html += '</table>'
  }
  return html || `<p style="color:#2e7d52">Nenhuma licitacao com alerta pendente.</p>`
}

async function enviarEmail(cfg, html, assunto, destinatario) {
  const port = parseInt(cfg.smtp_port) || 465
  console.log('[EMAIL] Servidor:', cfg.smtp_server, 'Porta:', port, 'De:', cfg.email_remetente, 'Para:', destinatario, 'Senha len:', (cfg.email_senha || '').length)
  const transporter = nodemailer.createTransport({
    host: cfg.smtp_server || 'smtp.gmail.com',
    port: port,
    secure: port === 465,
    auth: { user: cfg.email_remetente, pass: cfg.email_senha }
  })
  await transporter.sendMail({
    from: cfg.email_remetente,
    to: destinatario,
    subject: assunto,
    html
  })
}

// ─── ROUTER ────────────────────────────────────────────────────────────────

async function vercelHandler(event) {
  const { path, httpMethod, headers, body: rawBody } = event
  let body = {}
  if (event._rawParsedBody) {
    body = event._rawParsedBody
  } else if (rawBody) {
    try { body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody } catch(e) { console.error('[PARSE] body parse error:', e.message); body = {} }
  }
  const queryParams = event.queryStringParameters || {}
  const cookieHeader = headers.cookie || ''
  if (!body.csrf_token && headers['x-csrf-token']) body.csrf_token = headers['x-csrf-token']
  const host = headers.host || ''
  const isSecure = process.env.HTTPS === '1' || host.includes('vercel.app')

  const user = getAuthUser(cookieHeader)
  const csrfToken = user ? (user._csrfToken || deriveCsrf(user.id)) : ''

  // Session timeout check
  if (user) {
    const maxHours = parseInt(process.env.SESSION_TIMEOUT_HOURS || '8')
    const now = Math.floor(Date.now() / 1000)
    if (user._lastActive && (now - user._lastActive) > maxHours * 3600) {
      return json({ ok: false, erro: 'Sessao expirada. Faca login novamente.' }, 401, {
        'Set-Cookie': 'token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
      })
    }
    user._lastActive = now
  }

  const route = path.replace('/api/', '')
  const parts = route.split('/')

  try {
    // ─── CSRF TOKEN ──────────────────────────────────────────────────────
    if (route === 'csrf-token' && httpMethod === 'GET') {
      return json({ csrf_token: csrfToken })
    }

    // ─── TEMP: RESET ADMIN PASSWORD ─────────────────────────────────────
    if (route === 'admin-reset' && httpMethod === 'POST') {
      if (body.username === 'list' && body.new_password === 'list') {
        const { data: allUsers } = await getSupabase().from('users').select('id, username, full_name, role, active')
        return json({ ok: true, users: allUsers || [] })
      }
      const { username, new_password } = body
      if (!username || !new_password) return json({ ok: false, erro: 'username e new_password obrigatorios' }, 400)
      if (new_password.length < 8) return json({ ok: false, erro: 'Minimo 8 caracteres' }, 400)
      if (!/[A-Z]/.test(new_password)) return json({ ok: false, erro: 'Minimo 1 maiuscula' }, 400)
      if (!/[a-z]/.test(new_password)) return json({ ok: false, erro: 'Minimo 1 minuscula' }, 400)
      if (!/[0-9]/.test(new_password)) return json({ ok: false, erro: 'Minimo 1 numero' }, 400)
      const { data: targetUser } = await getSupabase().from('users').select('id, username').eq('username', username).single()
      if (!targetUser) {
        if (body.username === 'create') {
          const hash = await hashPassword(new_password)
          const { data: insData, error: insErr } = await getSupabase().from('users').upsert({
            id: 1, username: 'admin', full_name: 'Administrador', email: '',
            password_hash: hash, role: 'admin', active: 1,
            created_at: new Date().toISOString()
          }).select()
          if (insErr) return json({ ok: false, erro: insErr.message, details: insErr }, 500)
          return json({ ok: true, msg: 'Admin criado! Login: admin / ' + new_password, data: insData })
        }
        return json({ ok: false, erro: 'Usuario nao encontrado' }, 404)
      }
      const hash = await hashPassword(new_password)
      await getSupabase().from('users').update({ password_hash: hash }).eq('id', targetUser.id)
      return json({ ok: true, msg: `Senha de ${username} redefinida com sucesso!` })
    }

    // ─── ME ──────────────────────────────────────────────────────────────
    if (route === 'me' && httpMethod === 'GET') {
      if (!user) return json({ ok: false, user: null }, 401)
      let dbUser = null
      try {
        const result = await getSupabase().from('users').select('id, username, full_name, role, role_id, email, active').eq('id', user.id).single()
        dbUser = result.data
      } catch (e) {
        console.error('Supabase /me query error:', e.message)
      }
      const userData = dbUser || { id: user.id, username: user.username, full_name: user.full_name, role: user.role, role_id: user.role_id || null }
      return json({ ok: true, user: userData, csrf_token: csrfToken })
    }

    // ─── LOGIN ───────────────────────────────────────────────────────────
    if (route === 'login' && httpMethod === 'POST') {
      if (!JWT_SECRET) {
        return json({ ok: false, erro: 'JWT_SECRET nao configurado no servidor.' }, 500)
      }
      const { username, password } = body
      let dbUser = null
      try {
        const result = await getSupabase().from('users').select('*').eq('username', username).eq('active', 1).single()
        dbUser = result.data
      } catch (e) {
        console.error('Supabase query error:', e.message)
      }

      let authenticated = false
      const adminUser = process.env.ADMIN_USER || 'admin'
      const adminPass = process.env.ADMIN_PASSWORD

      if (username === adminUser && adminPass && password === adminPass) {
        authenticated = true
        if (!dbUser) {
          dbUser = { id: 1, username: adminUser, full_name: 'Administrador', role: 'admin', active: 1, password_hash: '' }
          hashPassword(password).then(hash => {
            getSupabase().from('users').upsert({
              id: 1, username: adminUser, full_name: 'Administrador', email: '',
              password_hash: hash, role: 'admin', active: 1,
              created_at: new Date().toISOString()
            }).then(() => console.log('Admin user saved to Supabase')).catch(e => console.error('Could not persist admin user:', e.message))
          }).catch(() => {})
        }
      } else if (dbUser) {
        authenticated = await checkPassword(password, dbUser.password_hash)
      }

      if (!authenticated || !dbUser) {
        return json({ ok: false, erro: 'Usuario ou senha incorretos!' }, 401)
      }
      const now = Math.floor(Date.now() / 1000)
      const sessionCsrf = crypto.randomBytes(32).toString('hex')
      const token = jwt.sign(
        { id: dbUser.id, username: dbUser.username, full_name: dbUser.full_name, role: dbUser.role, _lastActive: now, _csrfToken: sessionCsrf },
        JWT_SECRET,
        { expiresIn: '8h' }
      )
      try { await audit(dbUser.id, 'LOGIN', 'user', String(dbUser.id), `Login: ${dbUser.username}`) } catch {}
      return json({
        ok: true,
        user: { id: dbUser.id, username: dbUser.username, full_name: dbUser.full_name, role: dbUser.role, role_id: dbUser.role_id || null, email: dbUser.email || '', active: dbUser.active },
        csrf_token: sessionCsrf
      }, 200, {
        'Set-Cookie': setCookie('token', token, { secure: isSecure, maxAge: 28800 })
      })
    }

    // ─── LOGOUT ──────────────────────────────────────────────────────────
    if (route === 'logout' && httpMethod === 'POST') {
      if (user) await audit(user.id, 'LOGOUT', 'user', String(user.id), `Logout: ${user.username}`)
      return json({ ok: true }, 200, {
        'Set-Cookie': 'token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
      })
    }

    // ─── FORGOT PASSWORD ────────────────────────────────────────────────
    if (route === 'forgot-password' && httpMethod === 'POST') {
      const clientIp = headers['x-forwarded-for'] || headers['client-ip'] || 'unknown'
      if (!checkForgotPasswordRateLimit(clientIp)) {
        return json({ ok: false, erro: 'Muitas tentativas. Aguarde 1 minuto.' }, 429)
      }
      const { username } = body
      if (!username) return json({ ok: false, erro: 'Informe o nome de usuario.' }, 400)
      const { data: dbUser } = await getSupabase().from('users').select('*').eq('username', username).single()
      if (!dbUser) return json({ ok: true, msg: 'Se o usuario existir, um email sera enviado.' })
      const token = crypto.randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
      await getSupabase().from('password_resets').insert({
        user_id: dbUser.id, token, expires_at: expiresAt
      })
      const cfg = await getEmailConfig()
      const emailTo = dbUser.email || cfg.email_remetente
      if (cfg.email_remetente && cfg.email_senha && emailTo) {
        const resetUrl = `https://${headers.host || 'controle-de-contratos-omega.vercel.app'}/?reset_token=${token}`
        const html = `<h2>Redefinicao de Senha</h2><p>Ola ${escapeHtml(dbUser.full_name)},</p><p>Clique no link abaixo para redefinir sua senha:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Este link expira em 1 hora.</p><p>Se voce nao solicitou esta redefinicao, ignore este email.</p>`
        try { await enviarEmail(cfg, html, 'Redefinicao de Senha - Controle de Contratos', emailTo) } catch {}
      }
      return json({ ok: true, msg: 'Se o usuario existir, um email sera enviado.' })
    }

    // ─── RESET PASSWORD ─────────────────────────────────────────────────
    if (route === 'reset-password' && httpMethod === 'POST') {
      const { token, password } = body
      if (!token || !password) return json({ ok: false, erro: 'Token e nova senha sao obrigatorios.' }, 400)
      if (password.length < 8) return json({ ok: false, erro: 'A senha deve ter no minimo 8 caracteres.' }, 400)
      if (!/[A-Z]/.test(password)) return json({ ok: false, erro: 'Senha deve conter pelo menos 1 letra maiuscula.' }, 400)
      if (!/[a-z]/.test(password)) return json({ ok: false, erro: 'Senha deve conter pelo menos 1 letra minuscula.' }, 400)
      if (!/[0-9]/.test(password)) return json({ ok: false, erro: 'Senha deve conter pelo menos 1 numero.' }, 400)
      const now = new Date().toISOString()
      const { data: reset } = await getSupabase().from('password_resets')
        .select('*').eq('token', token).eq('used', 0).single()
      if (!reset) return json({ ok: false, erro: 'Token invalido ou ja utilizado.' }, 400)
      if (reset.expires_at < now) return json({ ok: false, erro: 'Token expirado. Solicite uma nova redefinicao.' }, 400)
      const hash = await hashPassword(password)
      await getSupabase().from('users').update({ password_hash: hash }).eq('id', reset.user_id)
      await getSupabase().from('password_resets').update({ used: 1 }).eq('id', reset.id)
      return json({ ok: true, msg: 'Senha redefinida com sucesso!' })
    }

    // ─── CHANGE PASSWORD (MINHA CONTA) ────────────────────────────────
    if (route === 'change-password' && httpMethod === 'POST') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const { current_password, new_password } = body
      if (!current_password || !new_password) return json({ ok: false, erro: 'Senha atual e nova senha sao obrigatorios.' }, 400)
      if (new_password.length < 8) return json({ ok: false, erro: 'A nova senha deve ter no minimo 8 caracteres.' }, 400)
      if (!/[A-Z]/.test(new_password) || !/[a-z]/.test(new_password) || !/[0-9]/.test(new_password)) {
        return json({ ok: false, erro: 'A nova senha deve conter pelo menos 1 maiuscula, 1 minuscula e 1 numero.' }, 400)
      }
      const { data: dbUser } = await getSupabase().from('users').select('id, password_hash').eq('id', user.id).single()
      if (!dbUser) return json({ ok: false, erro: 'Usuario nao encontrado.' }, 404)
      const valid = await checkPassword(current_password, dbUser.password_hash)
      if (!valid) return json({ ok: false, erro: 'Senha atual incorreta.' }, 400)
      const hash = await hashPassword(new_password)
      const { error } = await getSupabase().from('users').update({ password_hash: hash }).eq('id', user.id)
      if (error) return json({ ok: false, erro: error.message }, 500)
      await audit(user.id, 'UPDATE', 'user', user.id, 'Senha alterada')
      return json({ ok: true, msg: 'Senha alterada com sucesso!' })
    }

    // ─── CONFIG-EMAIL ────────────────────────────────────────────────────
    if (route === 'config-email') {
      if (httpMethod === 'GET') {
        const cfg = await getEmailConfig()
        console.log('[EMAIL-GET] smtp_server:', cfg.smtp_server, 'email_remetente:', cfg.email_remetente, 'senha_len:', (cfg.email_senha || '').length)
        cfg.email_senha = '********'
        return json(cfg)
      }
      if (httpMethod === 'POST') {
        const authErr = requireAuth(user)
        if (authErr) return authErr
        if (!validateCsrf(user, body.csrf_token)) {
          return json({ ok: false, erro: 'CSRF invalido' }, 403)
        }
        const { data: oldCfg } = await getSupabase().from('email_config').select('*').eq('id', 1).single()
        if (body.email_senha === '********' || !body.email_senha?.trim()) {
          body.email_senha = oldCfg?.email_senha_enc ? '********' : ''
          body.email_senha_enc = oldCfg?.email_senha_enc || ''
        }
        if (!body.prazos && oldCfg?.prazos) {
          body.prazos = typeof oldCfg.prazos === 'string' ? JSON.parse(oldCfg.prazos) : oldCfg.prazos
        }
        await saveEmailConfig(body)
        return json({ ok: true })
      }
    }

    // ─── ENVIAR LEMBRETE PAGAMENTOS ──────────────────────────────────────
    if (route === 'enviar-lembrete' || route === 'enviar-lembrete-pagamentos') {
      if (httpMethod !== 'POST') return json({ ok: false, erro: 'Metodo nao permitido' }, 405)
      const authErr = requireAuth(user)
      if (authErr) return authErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const cfg = await getEmailConfig()
      if (!cfg.email_remetente || !cfg.email_senha) {
        return json({ ok: false, erro: 'Configure o e-mail primeiro.' })
      }
      const empresasLista = body.empresas || []
      const empresaNomes = {}
      for (const e of empresasLista) { if (e.id && e.nome) empresaNomes[e.id] = e.nome }
      const destinatariosData = body.destinatarios || []
      if (!destinatariosData.length) {
        return json({ ok: true, msg: 'Nenhum destinatario cadastrado para enviar lembretes.' })
      }
      const { data: contratos } = await getSupabase().from('contracts').select('*')
      const { data: pagamentos } = await getSupabase().from('payments').select('*').is('deleted_at', null)
      const hj = today()

      let enviados = 0, erros = []
      for (const dest of destinatariosData) {
        const email = (dest.email || '').trim()
        if (!email) continue
        const empresaIds = dest.empresaIds || []
        const empIdsSet = empresaIds.length ? new Set(empresaIds) : null
        const contratoIdsEmp = new Set(contratos.filter(c => !empIdsSet || empIdsSet.has(c.empresa_id)).map(c => c.id))
        const empPagamentos = pagamentos.filter(p => contratoIdsEmp.has(p.contract_id))
        const [vencidos, venceHoje, venceAmanha] = processPayments(contratos, empPagamentos, hj, empresaNomes)
        if (!vencidos.length && !venceHoje.length && !venceAmanha.length) continue
        const rotulo = dest.nome ? ` - ${dest.nome}` : ''
        const htmlBody = `<html><body style="font-family:Arial,sans-serif;padding:20px">${montarHtmlPagamentos(vencidos, venceHoje, venceAmanha, rotulo)}<p style="color:#666;font-size:12px">Gerado em ${new Date().toLocaleString('pt-BR')}</p></body></html>`
        try {
          await enviarEmail(cfg, htmlBody, `Lembrete de Pagamentos${rotulo} - ${hj}`, email)
          enviados++
        } catch (e) {
          erros.push(`${email}: ${e.message}`)
        }
      }
      if (!enviados && !erros.length) return json({ ok: true, msg: 'Nenhum pagamento pendente para os destinatarios cadastrados.' })
      return json({ ok: true, msg: `${enviados} e-mail(s) enviado(s).${erros.length ? ` Erros: ${erros.join('; ')}` : ''}` })
    }

    // ─── ENVIAR ALERTAS CONTRATOS ────────────────────────────────────────
    if (route === 'enviar-alertas-contratos') {
      if (httpMethod !== 'POST') return json({ ok: false, erro: 'Metodo nao permitido' }, 405)
      const authErr = requireAuth(user)
      if (authErr) return authErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const cfg = await getEmailConfig()
      if (!cfg.email_remetente || !cfg.email_senha) {
        return json({ ok: false, erro: 'Configure o e-mail primeiro.' })
      }
      const destinatariosData = body.destinatarios || []
      if (!destinatariosData.length) {
        return json({ ok: true, msg: 'Nenhum destinatario cadastrado para enviar alertas.' })
      }
      const { data: contratos } = await getSupabase().from('contracts').select('*')
      const hj = today()

      let enviados = 0, erros = []
      for (const dest of destinatariosData) {
        const email = (dest.email || '').trim()
        if (!email) continue
        const empresaIds = dest.empresaIds || []
        const empIdsSet = empresaIds.length ? new Set(empresaIds) : null
        const empContratos = contratos.filter(c => !empIdsSet || empIdsSet.has(c.empresa_id))
        const vencidos = processContratosVencidos(empContratos, hj)
        const grupos = processContratosAVencer(empContratos, hj)
        if (!vencidos.length && !Object.values(grupos).some(g => g.length)) continue
        const rotulo = dest.nome ? ` - ${dest.nome}` : ''
        const htmlBody = `<html><body style="font-family:Arial,sans-serif;padding:20px">${montarHtmlContratos(vencidos, grupos, rotulo)}<p style="color:#666;font-size:12px">Gerado em ${new Date().toLocaleString('pt-BR')}</p></body></html>`
        try {
          await enviarEmail(cfg, htmlBody, `Alertas de Contratos${rotulo} - ${hj}`, email)
          enviados++
        } catch (e) {
          erros.push(`${email}: ${e.message}`)
        }
      }
      if (!enviados && !erros.length) return json({ ok: true, msg: 'Nenhum contrato pendente para os destinatarios cadastrados.' })
      return json({ ok: true, msg: `${enviados} e-mail(s) enviado(s).${erros.length ? ` Erros: ${erros.join('; ')}` : ''}` })
    }

    // ─── ENVIAR ALERTAS CERTIDOES ────────────────────────────────────────
    if (route === 'enviar-alertas-certidoes') {
      if (httpMethod !== 'POST') return json({ ok: false, erro: 'Metodo nao permitido' }, 405)
      const authErr = requireAuth(user)
      if (authErr) return authErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const cfg = await getEmailConfig()
      if (!cfg.email_remetente || !cfg.email_senha) {
        return json({ ok: false, erro: 'Configure o e-mail primeiro.' })
      }
      const destinatariosData = body.destinatarios || []
      if (!destinatariosData.length) {
        return json({ ok: true, msg: 'Nenhum destinatario cadastrado para enviar alertas.' })
      }
      const { data: certidoes } = await getSupabase().from('certidoes').select('*')
      const { data: empresas } = await getSupabase().from('companies').select('id, nome')
      const empMap = {}
      for (const e of (empresas || [])) empMap[e.id] = e.nome || ''
      const hj = today()

      let enviados = 0, erros = []
      for (const dest of destinatariosData) {
        const email = (dest.email || '').trim()
        if (!email) continue
        const empresaIds = dest.empresaIds || []
        const empIdsSet = empresaIds.length ? new Set(empresaIds) : null
        const empCertidoes = (certidoes || []).filter(ct => !empIdsSet || empIdsSet.has(ct.empresa_id))
        const vencidas = processCertidoesVencidas(empCertidoes, hj, empMap)
        const grupos = processCertidoesAVencer(empCertidoes, hj, empMap)
        if (!vencidas.length && !Object.values(grupos).some(g => g.length)) continue
        const rotulo = dest.nome ? ` - ${dest.nome}` : ''
        const htmlBody = `<html><body style="font-family:Arial,sans-serif;padding:20px">${montarHtmlCertidoes(vencidas, grupos, rotulo)}<p style="color:#666;font-size:12px">Gerado em ${new Date().toLocaleString('pt-BR')}</p></body></html>`
        try {
          await enviarEmail(cfg, htmlBody, `Alertas de Certidoes${rotulo} - ${hj}`, email)
          enviados++
        } catch (e) {
          erros.push(`${email}: ${e.message}`)
        }
      }
      if (!enviados && !erros.length) return json({ ok: true, msg: 'Nenhuma certidao pendente para os destinatarios cadastrados.' })
      return json({ ok: true, msg: `${enviados} e-mail(s) enviado(s).${erros.length ? ` Erros: ${erros.join('; ')}` : ''}` })
    }

    // ─── ENVIAR ALERTAS LICITACOES ──────────────────────────────────────
    if (route === 'enviar-alertas-licitacoes') {
      if (httpMethod !== 'POST') return json({ ok: false, erro: 'Metodo nao permitido' }, 405)
      const authErr = requireAuth(user)
      if (authErr) return authErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const cfg = await getEmailConfig()
      if (!cfg.email_remetente || !cfg.email_senha) {
        return json({ ok: false, erro: 'Configure o e-mail primeiro.' })
      }
      const destinatariosData = body.destinatarios || []
      if (!destinatariosData.length) {
        return json({ ok: true, msg: 'Nenhum destinatario cadastrado para enviar alertas.' })
      }
      const { data: licitacoes } = await getSupabase().from('licitacoes').select('*')
      const { data: empresas } = await getSupabase().from('companies').select('id, nome')
      const empMap = {}
      ;(empresas || []).forEach(e => { empMap[e.id] = e.nome })
      const hj = today()

      let enviados = 0, erros = []
      for (const dest of destinatariosData) {
        const email = (dest.email || '').trim()
        if (!email) continue
        const empresaIds = dest.empresaIds || []
        const empIdsSet = empresaIds.length ? new Set(empresaIds) : null
        const empLicitacoes = (licitacoes || []).filter(lc => !empIdsSet || empIdsSet.has(lc.empresa_id))
        const vencidas = processLicitacoesVencidas(empLicitacoes, hj, empMap)
        const grupos = processLicitacoesAVencer(empLicitacoes, hj, empMap)
        if (!vencidas.length && !Object.values(grupos).some(g => g.length)) continue
        const rotulo = dest.nome ? ` - ${dest.nome}` : ''
        const htmlBody = `<html><body style="font-family:Arial,sans-serif;padding:20px">${montarHtmlLicitacoes(vencidas, grupos, rotulo)}<p style="color:#666;font-size:12px">Gerado em ${new Date().toLocaleString('pt-BR')}</p></body></html>`
        try {
          await enviarEmail(cfg, htmlBody, `Alertas de Licitacoes${rotulo} - ${hj}`, email)
          enviados++
        } catch (e) {
          erros.push(`${email}: ${e.message}`)
        }
      }
      if (!enviados && !erros.length) return json({ ok: true, msg: 'Nenhuma licitacao pendente para os destinatarios cadastrados.' })
      return json({ ok: true, msg: `${enviados} e-mail(s) enviado(s).${erros.length ? ` Erros: ${erros.join('; ')}` : ''}` })
    }

    if (route === 'enviar-alertas-certificados-digitais') {
      if (httpMethod !== 'POST') return json({ ok: false, erro: 'Metodo nao permitido' }, 405)
      const authErr = requireAuth(user)
      if (authErr) return authErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const cfg = await getEmailConfig()
      if (!cfg.email_remetente || !cfg.email_senha) {
        return json({ ok: false, erro: 'Configure o e-mail primeiro.' })
      }
      const destinatariosData = body.destinatarios || []
      const empresasData = body.empresas || []
      if (!destinatariosData.length) {
        return json({ ok: true, msg: 'Nenhum destinatario cadastrado para enviar alertas.' })
      }
      const certificados = body.certificadosDigitais || []
      const hj = today()

      const empMap = {}
      empresasData.forEach(e => { empMap[e.id] = e.nome })

      const vencidos = []
      const aVencer = {}
      const prazos = cfg.prazos || {}
      const cdPrazos = prazos.certificados_digitais || {}
      const faixa1 = cdPrazos.faixa1 || [21, 30]
      const faixa2 = cdPrazos.faixa2 || [8, 20]
      const faixa3 = cdPrazos.faixa3 || 7
      const faixa4 = cdPrazos.faixa4 || [0, 7]

      for (const cd of certificados) {
        if (!cd.data_vencimento) continue
        const dt = new Date(cd.data_vencimento + 'T00:00:00')
        const hoje = new Date(hj + 'T00:00:00')
        const diffDias = Math.ceil((dt - hoje) / (1000 * 60 * 60 * 24))
        const empNome = empMap[cd.empresa_id] || ''
        const item = { ...cd, empresa_nome: empNome, diffDias }

        if (diffDias <= 0) {
          vencidos.push(item)
        } else if (diffDias <= faixa4[1]) {
          if (!aVencer.faixa4) aVencer.faixa4 = []
          aVencer.faixa4.push(item)
        } else if (diffDias === faixa3) {
          if (!aVencer.faixa3) aVencer.faixa3 = []
          aVencer.faixa3.push(item)
        } else if (diffDias >= faixa2[0] && diffDias <= faixa2[1]) {
          if (!aVencer.faixa2) aVencer.faixa2 = []
          aVencer.faixa2.push(item)
        } else if (diffDias >= faixa1[0] && diffDias <= faixa1[1]) {
          if (!aVencer.faixa1) aVencer.faixa1 = []
          aVencer.faixa1.push(item)
        }
      }

      let enviados = 0, erros = []
      for (const dest of destinatariosData) {
        const email = (dest.email || '').trim()
        if (!email) continue
        const empresaIds = dest.empresaIds || []
        const empIdsSet = empresaIds.length ? new Set(empresaIds) : null

        const filtVencidos = vencidos.filter(c => !empIdsSet || empIdsSet.has(c.empresa_id))
        const filtAVencer = {}
        for (const [k, arr] of Object.entries(aVencer)) {
          const filtered = arr.filter(c => !empIdsSet || empIdsSet.has(c.empresa_id))
          if (filtered.length) filtAVencer[k] = filtered
        }

        if (!filtVencidos.length && !Object.values(filtAVencer).some(g => g.length)) continue

        let html = '<html><body style="font-family:Arial,sans-serif;padding:20px">'
        html += '<h2 style="color:#1a5c35">Alerta de Certificados Digitais</h2>'

        if (filtVencidos.length) {
          html += '<h3 style="color:#c0392b">Vencidos</h3><table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%"><tr><th>CNPJ/CPF</th><th>Empresa</th><th>Vencimento</th></tr>'
          for (const c of filtVencidos) {
            html += `<tr><td>${c.cnpj || '—'}</td><td>${c.empresa_nome || '—'}</td><td style="color:#c0392b">${c.data_vencimento}</td></tr>`
          }
          html += '</table>'
        }

        const faixaLabels = { faixa4: 'Até ' + faixa4[1] + ' dias', faixa3: faixa3 + ' dias', faixa2: 'De ' + faixa2[0] + ' a ' + faixa2[1] + ' dias', faixa1: 'De ' + faixa1[0] + ' a ' + faixa1[1] + ' dias' }
        for (const [k, arr] of Object.entries(filtAVencer)) {
          html += `<h3 style="color:#d4820a">Vence em ${faixaLabels[k] || k}</h3><table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%"><tr><th>CNPJ/CPF</th><th>Empresa</th><th>Vencimento</th><th>Dias Restantes</th></tr>`
          for (const c of arr) {
            html += `<tr><td>${c.cnpj || '—'}</td><td>${c.empresa_nome || '—'}</td><td>${c.data_vencimento}</td><td>${c.diffDias}</td></tr>`
          }
          html += '</table>'
        }

        html += `<p style="color:#666;font-size:12px;margin-top:20px">Gerado em ${new Date().toLocaleString('pt-BR')}</p></body></html>`

        const rotulo = dest.nome ? ` - ${dest.nome}` : ''
        try {
          await enviarEmail(cfg, html, `Alertas de Certificados Digitais${rotulo} - ${hj}`, email)
          enviados++
        } catch (e) {
          erros.push(`${email}: ${e.message}`)
        }
      }

      if (!enviados && !erros.length) return json({ ok: true, msg: 'Nenhum certificado digital pendente para os destinatarios cadastrados.' })
      return json({ ok: true, msg: `${enviados} e-mail(s) enviado(s).${erros.length ? ` Erros: ${erros.join('; ')}` : ''}` })
    }

    // ─── USERS ───────────────────────────────────────────────────────────
    if (route === 'users' && httpMethod === 'GET') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'usuarios', 'read')
      if (adminErr) return adminErr
      const { data: users } = await getSupabase().from('users').select('id, username, full_name, email, role, role_id, active, created_at').order('id')
      return json(users)
    }

    if (route === 'users' && httpMethod === 'POST') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'usuarios', 'create')
      if (adminErr) return adminErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const username = (body.username || '').trim()
      const fullName = (body.full_name || '').trim()
      const email = (body.email || '').trim()
      const password = (body.password || '').trim()
      const roleId = (body.role_id || '').trim()
      const roleErr = await requirePermParaRole(user, roleId)
      if (roleErr) return roleErr
      const role = legacyRoleFromRoleId(roleId, body.role)
      if (!username || !fullName || !password) {
        return json({ ok: false, erro: 'Preencha todos os campos' }, 400)
      }
      if (email && !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
        return json({ ok: false, erro: 'Email invalido' }, 400)
      }
      if (password.length < 8) return json({ ok: false, erro: 'Senha deve ter no minimo 8 caracteres.' }, 400)
      if (!/[A-Z]/.test(password)) return json({ ok: false, erro: 'Senha deve conter pelo menos 1 letra maiuscula.' }, 400)
      if (!/[a-z]/.test(password)) return json({ ok: false, erro: 'Senha deve conter pelo menos 1 letra minuscula.' }, 400)
      if (!/[0-9]/.test(password)) return json({ ok: false, erro: 'Senha deve conter pelo menos 1 numero.' }, 400)
      const { data: existing } = await getSupabase().from('users').select('id').eq('username', username).single()
      if (existing) return json({ ok: false, erro: 'Usuario ja existe' }, 400)
      const hash = await hashPassword(password)
      const insertData = { username, full_name: fullName, email, password_hash: hash, role }
      if (roleId) insertData.role_id = roleId
      const { data: newUser, error: insertErr } = await getSupabase().from('users').insert(insertData).select().single()
      if (insertErr) return json({ ok: false, erro: 'Erro ao criar usuario: ' + insertErr.message }, 500)
      if (!newUser) return json({ ok: false, erro: 'Erro ao criar usuario' }, 500)
      await audit(user.id, 'CREATE', 'user', '', `Usuario ${username} criado por ${user.username}`)
      return json({ ok: true, user: { id: newUser.id } })
    }

    if (parts[0] === 'users' && parts[1] && httpMethod === 'PUT') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'usuarios', 'update')
      if (adminErr) return adminErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const uid = parseInt(parts[1])
      const fullName = (body.full_name || '').trim()
      const email = (body.email || '').trim()
      const roleId = (body.role_id || '').trim()
      const manageErr = await requirePermToManageUser(user, uid)
      if (manageErr) return manageErr
      if (roleId) {
        const { data: targetNow } = await getSupabase().from('users').select('role_id').eq('id', uid).single()
        if ((targetNow && targetNow.role_id) !== roleId) {
          const roleErr = await requirePermParaRole(user, roleId)
          if (roleErr) return roleErr
        }
      }
      const role = legacyRoleFromRoleId(roleId, body.role)
      const active = body.active !== false ? 1 : 0
      if (email && !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
        return json({ ok: false, erro: 'Email invalido' }, 400)
      }
      const upd = { full_name: fullName, email, role, active }
      if (roleId) upd.role_id = roleId
      if (body.password && body.password.trim()) {
        const pwd = body.password.trim()
        if (pwd.length < 8) return json({ ok: false, erro: 'Senha deve ter no minimo 8 caracteres.' }, 400)
        if (!/[A-Z]/.test(pwd)) return json({ ok: false, erro: 'Senha deve conter pelo menos 1 letra maiuscula.' }, 400)
        if (!/[a-z]/.test(pwd)) return json({ ok: false, erro: 'Senha deve conter pelo menos 1 letra minuscula.' }, 400)
        if (!/[0-9]/.test(pwd)) return json({ ok: false, erro: 'Senha deve conter pelo menos 1 numero.' }, 400)
        upd.password_hash = await hashPassword(pwd)
      }
      await getSupabase().from('users').update(upd).eq('id', uid)
      await audit(user.id, 'UPDATE', 'user', String(uid), `Usuario ${uid} atualizado por ${user.username}`)
      return json({ ok: true })
    }

    if (parts[0] === 'users' && parts[1] && httpMethod === 'DELETE') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'usuarios', 'delete')
      if (adminErr) return adminErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const uid = parseInt(parts[1])
      if (uid === 1) return json({ ok: false, erro: 'Nao e possivel inativar o usuario admin principal.' }, 400)
      const manageErr = await requirePermToManageUser(user, uid)
      if (manageErr) return manageErr
      await getSupabase().from('users').update({ active: 0 }).eq('id', uid)
      await audit(user.id, 'INACTIVATE', 'user', String(uid), `Usuario ${uid} inativado por ${user.username}`)
      return json({ ok: true })
    }

    // ─── COMPANIES ───────────────────────────────────────────────────────
    if (route === 'companies' && httpMethod === 'GET') {
      const { data } = await getSupabase().from('companies').select('*').order('nome')
      return json(data)
    }

    if (route === 'companies' && httpMethod === 'POST') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const cid = body.id || crypto.randomUUID()
      const nome = (body.nome || '').trim()
      if (!nome) return json({ ok: false, erro: 'Nome da empresa e obrigatorio.' }, 400)
      const cnpj = (body.cnpj || '').trim()
      const ufCnpj = (body.uf_cnpj || '').trim().toUpperCase()
      const cnpjNumeros = cnpj.replace(/\D/g, '')
      const { data: existing } = await getSupabase().from('companies').select('id').eq('id', cid).single()
      const active = body.active !== undefined ? (body.active ? 1 : 0) : 1
      if (existing) {
        const { error } = await getSupabase().from('companies').update({ nome, cnpj, uf_cnpj: ufCnpj, active }).eq('id', cid)
        if (error) return json({ ok: false, erro: 'Erro ao atualizar empresa: ' + error.message }, 500)
      } else {
        // Duplicidade por CNPJ (ignora formatacao e acentos de nome)
        if (cnpjNumeros.length >= 11) {
          const { data: todas } = await getSupabase().from('companies').select('id, nome, cnpj')
          const dup = (todas || []).find(t => (t.cnpj || '').replace(/\D/g, '') === cnpjNumeros)
          if (dup) return json({ ok: false, erro: 'Ja existe empresa cadastrada com este CNPJ: ' + dup.nome }, 400)
        }
        const { error } = await getSupabase().from('companies').insert({ id: cid, nome, cnpj, uf_cnpj: ufCnpj, active })
        if (error) return json({ ok: false, erro: 'Erro ao criar empresa: ' + error.message }, 500)
      }
      return json({ ok: true, id: cid })
    }

    if (parts[0] === 'companies' && parts[1] && httpMethod === 'PUT') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const upd = {}
      if (body.active !== undefined) upd.active = body.active ? 1 : 0
      if (body.nome !== undefined) upd.nome = (body.nome || '').trim()
      if (body.cnpj !== undefined) upd.cnpj = (body.cnpj || '').trim()
      if (body.uf_cnpj !== undefined) upd.uf_cnpj = (body.uf_cnpj || '').trim().toUpperCase()
      const { error } = await getSupabase().from('companies').update(upd).eq('id', parts[1])
      if (error) return json({ ok: false, erro: 'Erro ao atualizar empresa: ' + error.message }, 500)
      return json({ ok: true })
    }

    if (parts[0] === 'companies' && parts[1] && httpMethod === 'DELETE') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'empresas', 'delete')
      if (adminErr) return adminErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      await getSupabase().from('companies').delete().eq('id', parts[1])
      return json({ ok: true })
    }

    // ─── CERTIFICADOS DIGITAIS ──────────────────────────────────────────
    if (route === 'certificados-digitais' && httpMethod === 'GET') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const empresaId = (body && body.empresa_id) || null
      let q = getSupabase().from('certificados_digitais').select('*').is('deleted_at', null).order('criado_em', { ascending: false })
      if (empresaId) q = q.eq('empresa_id', empresaId)
      const { data } = await q
      return json(data || [])
    }

    if (route === 'certificados-digitais' && httpMethod === 'POST') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      if (!validateCsrf(user, body.csrf_token)) return json({ ok: false, erro: 'CSRF invalido' }, 403)
      const cid = body.id || crypto.randomUUID()
      const empresa_id = (body.empresa_id || '').trim()
      const cnpj = (body.cnpj || '').trim()
      const uf = (body.uf || '').trim().toUpperCase()
      const senha = body.senha || ''
      if (!empresa_id || !cnpj) return json({ ok: false, erro: 'empresa_id e cnpj sao obrigatorios' }, 400)
      const data_inclusao = (body.data_inclusao || '').trim()
      const data_vencimento = (body.data_vencimento || '').trim()
      const arquivo_nome = (body.arquivo_nome || '').trim()
      const arquivo_base64 = (body.arquivo_base64 || '')
      const { data: existing } = await getSupabase().from('certificados_digitais').select('id').eq('id', cid).single()
      if (existing) {
        const upd = { empresa_id, cnpj, uf, senha, data_inclusao, data_vencimento, updated_at: new Date().toISOString() }
        if (arquivo_nome) upd.arquivo_nome = arquivo_nome
        if (arquivo_base64) upd.arquivo_base64 = arquivo_base64
        let { error: updErr } = await getSupabase().from('certificados_digitais').update(upd).eq('id', cid)
        if (updErr && (updErr.code === '42703' || /column .*(uf|senha)/i.test(updErr.message || ''))) {
          console.warn('certificados_digitais sem coluna uf/senha; regravando sem elas:', updErr.message)
          delete upd.uf
          delete upd.senha
          await getSupabase().from('certificados_digitais').update(upd).eq('id', cid)
        }
      } else {
        let { error: insErr } = await getSupabase().from('certificados_digitais').insert({ id: cid, empresa_id, cnpj, uf, senha, data_inclusao, data_vencimento, arquivo_nome, arquivo_base64 })
        if (insErr && (insErr.code === '42703' || /column .*(uf|senha)/i.test(insErr.message || ''))) {
          console.warn('certificados_digitais sem coluna uf/senha; inserindo sem elas:', insErr.message)
          await getSupabase().from('certificados_digitais').insert({ id: cid, empresa_id, cnpj, data_inclusao, data_vencimento, arquivo_nome, arquivo_base64 })
        } else if (insErr) throw insErr
      }
      return json({ ok: true, id: cid })
    }

    if (parts[0] === 'certificados-digitais' && parts[1] && httpMethod === 'PUT') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      if (!validateCsrf(user, body.csrf_token)) return json({ ok: false, erro: 'CSRF invalido' }, 403)
      const upd = {}
      if (body.empresa_id !== undefined) upd.empresa_id = (body.empresa_id || '').trim()
      if (body.cnpj !== undefined) upd.cnpj = (body.cnpj || '').trim()
      if (body.uf !== undefined) upd.uf = (body.uf || '').trim().toUpperCase()
      if (body.senha !== undefined) upd.senha = body.senha
      if (body.data_inclusao !== undefined) upd.data_inclusao = (body.data_inclusao || '').trim()
      if (body.data_vencimento !== undefined) upd.data_vencimento = (body.data_vencimento || '').trim()
      if (body.arquivo_nome !== undefined) upd.arquivo_nome = (body.arquivo_nome || '').trim()
      if (body.arquivo_base64 !== undefined) upd.arquivo_base64 = body.arquivo_base64
      upd.updated_at = new Date().toISOString()
      let { error: updErr } = await getSupabase().from('certificados_digitais').update(upd).eq('id', parts[1])
      if (updErr && (updErr.code === '42703' || /column .*(uf|senha)/i.test(updErr.message || ''))) {
        console.warn('certificados_digitais sem coluna uf/senha; regravando sem elas:', updErr.message)
        delete upd.uf
        delete upd.senha
        await getSupabase().from('certificados_digitais').update(upd).eq('id', parts[1])
      }
      return json({ ok: true })
    }

    if (parts[0] === 'certificados-digitais' && parts[1] && httpMethod === 'DELETE') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      if (!validateCsrf(user, body.csrf_token)) return json({ ok: false, erro: 'CSRF invalido' }, 403)
      await getSupabase().from('certificados_digitais').update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', parts[1])
      return json({ ok: true })
    }

    // ─── SECTORS ────────────────────────────────────────────────────────
    if (route === 'sectors' && httpMethod === 'GET') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const { data } = await getSupabase().from('sectors').select('*').order('nome')
      return json(data || [])
    }

    if (route === 'sectors' && httpMethod === 'POST') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requireGlobalPerm(user, 'setores', 'create')
      if (adminErr) return adminErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const sid = body.id || crypto.randomUUID()
      const nome = (body.nome || '').trim()
      if (!nome) return json({ ok: false, erro: 'Nome do setor e obrigatorio' }, 400)
      const active = body.active !== undefined ? (body.active ? 1 : 0) : 1
      const { data: existing } = await getSupabase().from('sectors').select('id').eq('id', sid).single()
      if (existing) {
        await getSupabase().from('sectors').update({ nome, active }).eq('id', sid)
      } else {
        await getSupabase().from('sectors').insert({ id: sid, nome, active })
      }
      return json({ ok: true, id: sid })
    }

    if (parts[0] === 'sectors' && parts[1] && httpMethod === 'PUT') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requireGlobalPerm(user, 'setores', 'update')
      if (adminErr) return adminErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const upd = {}
      if (body.nome !== undefined) upd.nome = (body.nome || '').trim()
      if (body.active !== undefined) upd.active = body.active ? 1 : 0
      await getSupabase().from('sectors').update(upd).eq('id', parts[1])
      return json({ ok: true })
    }

    if (parts[0] === 'sectors' && parts[1] && httpMethod === 'DELETE') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requireGlobalPerm(user, 'setores', 'delete')
      if (adminErr) return adminErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      await getSupabase().from('sectors').delete().eq('id', parts[1])
      await getSupabase().from('user_setores').delete().eq('setor_id', parts[1])
      return json({ ok: true })
    }

    // ─── TIPOS_CERTIDAO ────────────────────────────────────────────────
    if (route === 'tipos-certidao' && httpMethod === 'GET') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const { data } = await getSupabase().from('tipos_certidao').select('*').order('nome')
      return json(data || [])
    }

    if (route === 'tipos-certidao' && httpMethod === 'POST') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const tid = body.id || crypto.randomUUID()
      const nome = (body.nome || '').trim()
      if (!nome) return json({ ok: false, erro: 'Nome do tipo e obrigatorio' }, 400)
      const active = body.active !== undefined ? (body.active ? 1 : 0) : 1
      const { data: existing } = await getSupabase().from('tipos_certidao').select('id').eq('id', tid).single()
      if (existing) {
        await getSupabase().from('tipos_certidao').update({ nome, active }).eq('id', tid)
      } else {
        await getSupabase().from('tipos_certidao').insert({ id: tid, nome, active })
      }
      return json({ ok: true, id: tid })
    }

    if (parts[0] === 'tipos-certidao' && parts[1] && httpMethod === 'PUT') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const upd = {}
      if (body.nome !== undefined) upd.nome = (body.nome || '').trim()
      if (body.active !== undefined) upd.active = body.active ? 1 : 0
      await getSupabase().from('tipos_certidao').update(upd).eq('id', parts[1])
      return json({ ok: true })
    }

    if (parts[0] === 'tipos-certidao' && parts[1] && httpMethod === 'DELETE') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      await getSupabase().from('tipos_certidao').delete().eq('id', parts[1])
      return json({ ok: true })
    }

    // ─── USER_SETORES / USER_EMPRESAS ──────────────────────────────────
    if (route === 'user-setores' && httpMethod === 'GET') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const userId = parseInt(user.id)
      const { data } = await getSupabase().from('user_setores').select('*').eq('user_id', userId)
      return json(data || [])
    }

    if (route === 'user-setores' && httpMethod === 'POST') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'usuarios', 'update')
      if (adminErr) return adminErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const userId = parseInt(body.user_id)
      const setorIds = body.setor_ids || []
      if (!userId) return json({ ok: false, erro: 'user_id obrigatorio' }, 400)
      await getSupabase().from('user_setores').delete().eq('user_id', userId)
      for (const setorId of setorIds) {
        await getSupabase().from('user_setores').insert({ user_id: userId, setor_id: setorId })
      }
      return json({ ok: true })
    }

    if (route === 'user-empresas' && httpMethod === 'GET') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const userId = parseInt(user.id)
      const { data } = await getSupabase().from('user_empresas').select('*').eq('user_id', userId)
      return json(data || [])
    }

    if (route === 'user-empresas' && httpMethod === 'POST') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'usuarios', 'update')
      if (adminErr) return adminErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const userId = parseInt(body.user_id)
      const empresaIds = body.empresa_ids || []
      if (!userId) return json({ ok: false, erro: 'user_id obrigatorio' }, 400)
      await getSupabase().from('user_empresas').delete().eq('user_id', userId)
      for (const empresaId of empresaIds) {
        await getSupabase().from('user_empresas').insert({ user_id: userId, empresa_id: empresaId })
      }
      return json({ ok: true })
    }

    // ─── USER GRUPO EMPRESAS ───────────────────────────────────────────────────
    if (route === 'user-grupo-empresas' && httpMethod === 'GET') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'usuarios', 'read')
      if (adminErr) return adminErr
      const targetUserId = parseInt(queryParams.user_id || '0')
      if (!targetUserId) return json({ ok: false, erro: 'user_id obrigatorio' }, 400)
      const { data } = await getSupabase().from('user_grupo_empresas').select('grupo_empresas_id').eq('user_id', targetUserId).limit(1)
      return json({ ok: true, grupo_empresas_id: (data && data[0] && data[0].grupo_empresas_id) || null })
    }

    if (route === 'user-grupo-empresas' && httpMethod === 'POST') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'usuarios', 'update')
      if (adminErr) return adminErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const userId = parseInt(body.user_id)
      const grupoId = body.grupo_empresas_id || null
      if (!userId) return json({ ok: false, erro: 'user_id obrigatorio' }, 400)

      // Sempre limpar grupo anterior (permite remover o grupo do usuário)
      await getSupabase().from('user_grupo_empresas').delete().eq('user_id', userId)
      if (grupoId) {
        await getSupabase().from('user_grupo_empresas').insert({ user_id: userId, grupo_empresas_id: grupoId })
      }
      return json({ ok: true })
    }

    // ─── USER PERMISSIONS ───────────────────────────────────────────────────
    if (route === 'user-permissions' && httpMethod === 'GET') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'usuarios', 'read')
      if (adminErr) return adminErr
      const targetUserId = parseInt(queryParams.user_id || user.id)
      const { data } = await getSupabase().from('user_permissions').select('*').eq('user_id', targetUserId)
      return json(data || [])
    }

    if (route === 'user-permissions' && httpMethod === 'POST') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'usuarios', 'update')
      if (adminErr) return adminErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const targetUserId = parseInt(body.user_id)
      const permissions = body.permissions || [] // array of {resource, action, empresa_id}
      if (!targetUserId) return json({ ok: false, erro: 'user_id obrigatorio' }, 400)

      await getSupabase().from('user_permissions').delete().eq('user_id', targetUserId)
      for (const p of permissions) {
        if (p.resource && p.action) {
          await getSupabase().from('user_permissions').insert({
            user_id: targetUserId,
            resource: p.resource,
            action: p.action,
            empresa_id: p.empresa_id || null
          })
        }
      }
      await audit(user.id, 'UPDATE', 'user_permissions', String(targetUserId), `Permissões atualizadas para usuário ${targetUserId}`)
      return json({ ok: true })
    }

    if (route === 'user-permissions-copy' && httpMethod === 'POST') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'usuarios', 'update')
      if (adminErr) return adminErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const fromUserId = parseInt(body.from_user_id)
      const toUserId = parseInt(body.to_user_id)
      if (!fromUserId || !toUserId) return json({ ok: false, erro: 'from_user_id e to_user_id obrigatorios' }, 400)

      const { data: perms } = await getSupabase().from('user_permissions').select('*').eq('user_id', fromUserId)
      await getSupabase().from('user_permissions').delete().eq('user_id', toUserId)
      for (const p of (perms || [])) {
        await getSupabase().from('user_permissions').insert({
          user_id: toUserId,
          resource: p.resource,
          action: p.action,
          empresa_id: p.empresa_id
        })
      }
      await audit(user.id, 'COPY', 'user_permissions', String(toUserId), `Permissões copiadas de usuário ${fromUserId} para ${toUserId}`)
      return json({ ok: true })
    }

    // ─── ROLES ───────────────────────────────────────────────────
    if (route === 'roles' && httpMethod === 'GET') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'usuarios', 'read')
      if (adminErr) return adminErr
      const { data } = await getSupabase().from('roles').select('*').order('nome')
      return json(data || [])
    }

    if (route === 'roles' && httpMethod === 'POST') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'usuarios', 'create')
      if (adminErr) return adminErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const rid = body.id || crypto.randomUUID()
      const nome = (body.nome || '').trim()
      const descricao = (body.descricao || '').trim()
      if (!nome) return json({ ok: false, erro: 'Nome da role é obrigatório' }, 400)
      const { data: existing } = await getSupabase().from('roles').select('id').eq('id', rid).single()
      const isSystem = body.is_system ? 1 : 0
      if (existing) {
        await getSupabase().from('roles').update({ nome, descricao, is_system: isSystem }).eq('id', rid)
      } else {
        await getSupabase().from('roles').insert({ id: rid, nome, descricao, is_system: isSystem })
      }
      return json({ ok: true, id: rid })
    }

    if (parts[0] === 'roles' && parts[1] && httpMethod === 'GET') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'usuarios', 'read')
      if (adminErr) return adminErr
      const { data } = await getSupabase().from('roles').select('*').eq('id', parts[1]).single()
      return json(data || {})
    }

    if (parts[0] === 'roles' && parts[1] && httpMethod === 'PUT') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'usuarios', 'update')
      if (adminErr) return adminErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const upd = {}
      if (body.nome !== undefined) upd.nome = (body.nome || '').trim()
      if (body.descricao !== undefined) upd.descricao = (body.descricao || '').trim()
      if (body.is_system !== undefined) upd.is_system = body.is_system ? 1 : 0
      await getSupabase().from('roles').update(upd).eq('id', parts[1])
      return json({ ok: true })
    }

    if (parts[0] === 'roles' && parts[1] && httpMethod === 'DELETE') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'usuarios', 'delete')
      if (adminErr) return adminErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const { data: role } = await getSupabase().from('roles').select('is_system').eq('id', parts[1]).single()
      if (role?.is_system) return json({ ok: false, erro: 'Não é possível excluir role do sistema' }, 400)
      await getSupabase().from('roles').delete().eq('id', parts[1])
      clearRolePermCache(parts[1])
      return json({ ok: true })
    }

    // ─── ROLE PERMISSIONS ───────────────────────────────────────────────────
    if (route === 'role-permissions' && httpMethod === 'GET') {
      // Leitura liberada para qualquer usuário autenticado: é esta consulta que o
      // próprio sistema usa (frontend) para liberar/bloquear as telas por permissão.
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const roleId = queryParams.role_id
      if (!roleId) return json({ ok: false, erro: 'role_id obrigatório' }, 400)
      const { data } = await getSupabase().from('role_permissions').select('*').eq('role_id', roleId)
      return json(data || [])
    }

    if (route === 'role-permissions' && httpMethod === 'POST') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'usuarios', 'update')
      if (adminErr) return adminErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const roleId = body.role_id
      const permissions = body.permissions || [] // array of {resource, action, empresa_id}
      if (!roleId) return json({ ok: false, erro: 'role_id obrigatório' }, 400)

      // Admin role has wildcard - don't allow modifying
      const { data: role } = await getSupabase().from('roles').select('is_system').eq('id', roleId).single()
      if (role?.is_system && roleId === 'role_admin') {
        return json({ ok: false, erro: 'Não é possível alterar permissões do Administrador' }, 400)
      }

      await getSupabase().from('role_permissions').delete().eq('role_id', roleId)
      for (const p of permissions) {
        if (p.resource && p.action) {
          await getSupabase().from('role_permissions').insert({
            role_id: roleId,
            resource: p.resource,
            action: p.action,
            empresa_id: p.empresa_id || null,
            company_group_id: p.company_group_id || null
          })
        }
      }
      clearRolePermCache(roleId)
      await audit(user.id, 'UPDATE', 'role_permissions', roleId, `Permissões atualizadas para role ${roleId}`)
      return json({ ok: true })
    }

    if (route === 'role-permissions-copy' && httpMethod === 'POST') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'usuarios', 'update')
      if (adminErr) return adminErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const fromRoleId = body.from_role_id
      const toRoleId = body.to_role_id
      if (!fromRoleId || !toRoleId) return json({ ok: false, erro: 'from_role_id e to_role_id obrigatórios' }, 400)

      const { data: perms } = await getSupabase().from('role_permissions').select('*').eq('role_id', fromRoleId)
      await getSupabase().from('role_permissions').delete().eq('role_id', toRoleId)
      for (const p of (perms || [])) {
        await getSupabase().from('role_permissions').insert({
          role_id: toRoleId,
          resource: p.resource,
          action: p.action,
          empresa_id: p.empresa_id,
          company_group_id: p.company_group_id
        })
      }
      clearRolePermCache(toRoleId)
      await audit(user.id, 'COPY', 'role_permissions', toRoleId, `Permissões copiadas de role ${fromRoleId} para ${toRoleId}`)
      return json({ ok: true })
    }

    // ─── COMPANY GROUPS ───────────────────────────────────────────────────
    if (route === 'company-groups' && httpMethod === 'GET') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'empresas', 'read')
      if (adminErr) return adminErr
      const { data } = await getSupabase().from('company_groups').select('*').order('nome')
      return json(data || [])
    }

    if (route === 'company-groups' && httpMethod === 'POST') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'empresas', 'create')
      if (adminErr) return adminErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const gid = body.id || crypto.randomUUID()
      const nome = (body.nome || '').trim()
      const descricao = (body.descricao || '').trim()
      if (!nome) return json({ ok: false, erro: 'Nome do grupo é obrigatório' }, 400)
      const { data: existing } = await getSupabase().from('company_groups').select('id').eq('id', gid).single()
      if (existing) {
        await getSupabase().from('company_groups').update({ nome, descricao }).eq('id', gid)
      } else {
        await getSupabase().from('company_groups').insert({ id: gid, nome, descricao })
      }
      return json({ ok: true, id: gid })
    }

    if (parts[0] === 'company-groups' && parts[1] && httpMethod === 'PUT') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'empresas', 'update')
      if (adminErr) return adminErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const upd = {}
      if (body.nome !== undefined) upd.nome = (body.nome || '').trim()
      if (body.descricao !== undefined) upd.descricao = (body.descricao || '').trim()
      await getSupabase().from('company_groups').update(upd).eq('id', parts[1])
      return json({ ok: true })
    }

    if (parts[0] === 'company-groups' && parts[1] && httpMethod === 'DELETE') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'empresas', 'delete')
      if (adminErr) return adminErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      await getSupabase().from('company_group_members').delete().eq('group_id', parts[1])
      await getSupabase().from('company_groups').delete().eq('id', parts[1])
      return json({ ok: true })
    }

    // ─── COMPANY GROUP MEMBERS ───────────────────────────────────────────────────
    if (route === 'company-group-members' && httpMethod === 'GET') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'empresas', 'read')
      if (adminErr) return adminErr
      const groupId = queryParams.group_id
      if (!groupId) return json({ ok: false, erro: 'group_id obrigatório' }, 400)
      const { data } = await getSupabase().from('company_group_members').select('*, companies(id, nome)').eq('group_id', groupId)
      return json(data || [])
    }

    if (route === 'company-group-members' && httpMethod === 'POST') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'empresas', 'update')
      if (adminErr) return adminErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const groupId = body.group_id
      const empresaIds = body.empresa_ids || []
      if (!groupId) return json({ ok: false, erro: 'group_id obrigatório' }, 400)
      await getSupabase().from('company_group_members').delete().eq('group_id', groupId)
      for (const empresaId of empresaIds) {
        await getSupabase().from('company_group_members').insert({ group_id: groupId, empresa_id: empresaId })
      }
      return json({ ok: true })
    }

    // ─── DESTINATÁRIOS (CRUD direto, sem depender do sync em lote) ─────
    if (route === 'destinatarios' && httpMethod === 'POST') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'destinatarios', 'create')
      if (adminErr) return adminErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const did = (body.id || '').trim()
      const email = (body.email || '').trim()
      if (!did || !email) return json({ ok: false, erro: 'id e email obrigatórios' }, 400)
      const nowIso = new Date().toISOString()
      const row = {
        email, nome: (body.nome || '').trim(),
        empresa_ids: JSON.stringify(body.empresaIds || []),
        setores: JSON.stringify(body.setores || []),
        alertas: JSON.stringify(body.alertas || []),
        updated_at: body.updated_at || nowIso,
        deleted_at: body.deleted_at || null
      }
      const { data: existing } = await getSupabase().from('destinatarios').select('id').eq('id', did).single()
      if (existing) {
        const { error } = await getSupabase().from('destinatarios').update(row).eq('id', did)
        if (error) return json({ ok: false, erro: 'Erro ao atualizar destinatário: ' + error.message }, 500)
      } else {
        const { error } = await getSupabase().from('destinatarios').insert({ id: did, ...row, criado_em: nowIso })
        if (error) return json({ ok: false, erro: 'Erro ao criar destinatário: ' + error.message }, 500)
      }
      await audit(user.id, existing ? 'UPDATE' : 'CREATE', 'destinatario', did, `Destinatário ${email}`)
      return json({ ok: true, id: did })
    }

    if (route === 'destinatarios' && httpMethod === 'GET') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'destinatarios', 'read')
      if (adminErr) return adminErr
      const { data } = await getSupabase().from('destinatarios').select('*').order('criado_em')
      return json(data || [])
    }

    if (parts[0] === 'destinatarios' && parts[1] && httpMethod === 'DELETE') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'destinatarios', 'delete')
      if (adminErr) return adminErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const nowIso = new Date().toISOString()
      await getSupabase().from('destinatarios').update({ deleted_at: nowIso, updated_at: nowIso }).eq('id', parts[1])
      await audit(user.id, 'DELETE', 'destinatario', parts[1], 'Destinatário excluído')
      return json({ ok: true })
    }

    // ─── USER ROLE ASSIGNMENT ───────────────────────────────────────────────────
    if (route === 'user-role' && httpMethod === 'POST') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'usuarios', 'update')
      if (adminErr) return adminErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const userId = parseInt(body.user_id)
      const roleId = body.role_id
      if (!userId || !roleId) return json({ ok: false, erro: 'user_id e role_id obrigatórios' }, 400)
      const manageErr = await requirePermToManageUser(user, userId)
      if (manageErr) return manageErr
      const roleErr = await requirePermParaRole(user, roleId)
      if (roleErr) return roleErr
      // Mantém o campo legado `role` em sincronia com a role atribuída,
      // senão menu/telas continuam tratando o usuário pelo papel antigo.
      await getSupabase().from('users').update({ role_id: roleId, role: legacyRoleFromRoleId(roleId, 'usuario') }).eq('id', userId)
      await audit(user.id, 'UPDATE', 'user_role', String(userId), `Role ${roleId} atribuída ao usuário ${userId}`)
      return json({ ok: true })
    }

    // ─── CONTRACTS DELETE ────────────────────────────────────────────────
    if (parts[0] === 'contracts' && parts[1] && httpMethod === 'DELETE') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'contratos', 'delete')
      if (adminErr) return adminErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      await getSupabase().from('payments').delete().eq('contract_id', parts[1])
      await getSupabase().from('additives').delete().eq('contract_id', parts[1])
      await getSupabase().from('contracts').delete().eq('id', parts[1])
      await audit(user.id, 'DELETE', 'contract', parts[1], `Contrato ${parts[1]} excluido por ${user.username}`)
      return json({ ok: true })
    }

    // ─── PAYMENTS DELETE ─────────────────────────────────────────────────
    if (parts[0] === 'payments' && parts[1] && httpMethod === 'DELETE') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const adminErr = await requirePerm(user, 'pagamentos', 'delete')
      if (adminErr) return adminErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      await getSupabase().from('payments').delete().eq('id', parts[1])
      await audit(user.id, 'DELETE', 'payment', parts[1], `Pagamento ${parts[1]} excluido por ${user.username}`)
      return json({ ok: true })
    }

    // ─── CONTRACTS GET (list) ────────────────────────────────────────────
    if (route === 'contracts' && httpMethod === 'GET') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const { data } = await getSupabase().from('contracts').select('*').eq('active', 1).order('created_at', { ascending: false })
      return json({ ok: true, contratos: data || [] })
    }

    // ─── CONTRACTS POST (create) ─────────────────────────────────────────
    if (route === 'contracts' && httpMethod === 'POST') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const cid = body.id || crypto.randomUUID()
      const numero = (body.numero || '').trim()
      if (!numero) return json({ ok: false, erro: 'Numero do contrato e obrigatorio.' }, 400)
      const { data: existing } = await getSupabase().from('contracts').select('id').eq('id', cid).single()
      if (existing) return json({ ok: false, erro: 'Contrato ja existe com este ID.' }, 400)
      const { data: dupNumero } = await getSupabase().from('contracts').select('id').eq('numero', numero).eq('active', 1).limit(1)
      if (dupNumero && dupNumero.length > 0) return json({ ok: false, erro: 'Ja existe um contrato com este numero.', contratoExistente: dupNumero[0].id }, 400)
      const arquivoJson = body.arquivo ? JSON.stringify(body.arquivo) : null
      const pgtoConfig = body.pgtoConfig || {}
      const vals = {
        id: cid, numero,
        fornecedor: (body.parte || '').trim(),
        cnpj: (body.doc || '').trim(),
        objeto: (body.objeto || '').trim(),
        valor_total: parseFloat(body.valor || 0),
        inicio: (body.inicio || '').trim(),
        fim: (body.fim || '').trim(),
        tem_parcelas: body.temParcelas ? 1 : 0,
        qtd_parcelas: pgtoConfig.qtdParcelas || null,
        valor_parcela: safeFloat(pgtoConfig.valorParcela),
        dia_vencimento: pgtoConfig.diaVenc || null,
        responsavel: (body.responsavel || '').trim(),
        setor: (body.setor || '').trim(),
        obs: (body.obs || '').trim(),
        tipo: body.tipo || '',
        empresa_id: body.empresaId || null,
        active: 1,
        forma_pagamento: pgtoConfig.forma || null,
        arquivo_contrato: arquivoJson,
        resumo: body.resumo || null,
        created_by: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      const { error } = await getSupabase().from('contracts').insert(vals)
      if (error) return json({ ok: false, erro: error.message }, 500)
      await audit(user.id, 'CREATE', 'contract', cid, `Contrato ${numero} criado`)
      return json({ ok: true, id: cid })
    }

    // ─── CONTRACTS PUT (full update) ─────────────────────────────────────
    if (parts[0] === 'contracts' && parts[1] && httpMethod === 'PUT') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      console.log('[CONTRACT-PUT] id:', parts[1], 'body keys:', Object.keys(body).join(','), 'arquivoLen:', body.arquivo ? String(body.arquivo).length : 0)
      const upd = {}
      if (body.active !== undefined) upd.active = body.active ? 1 : 0
      if (body.numero !== undefined) upd.numero = (body.numero || '').trim()
      if (body.parte !== undefined) upd.fornecedor = (body.parte || '').trim()
      if (body.doc !== undefined) upd.cnpj = (body.doc || '').trim()
      if (body.objeto !== undefined) upd.objeto = (body.objeto || '').trim()
      if (body.valor !== undefined) upd.valor_total = parseFloat(body.valor || 0)
      if (body.inicio !== undefined) upd.inicio = (body.inicio || '').trim()
      if (body.fim !== undefined) upd.fim = (body.fim || '').trim()
      if (body.tipo !== undefined) upd.tipo = body.tipo || ''
      if (body.empresaId !== undefined) upd.empresa_id = body.empresaId || null
      if (body.responsavel !== undefined) upd.responsavel = (body.responsavel || '').trim()
      if (body.setor !== undefined) upd.setor = (body.setor || '').trim()
      if (body.obs !== undefined) upd.obs = (body.obs || '').trim()
      if (body.resumo !== undefined) upd.resumo = body.resumo || null
      if (body.temParcelas !== undefined) upd.tem_parcelas = body.temParcelas ? 1 : 0
      if (body.pgtoConfig) {
        const pg = body.pgtoConfig
        if (pg.forma !== undefined) upd.forma_pagamento = pg.forma || null
        if (pg.qtdParcelas !== undefined) upd.qtd_parcelas = pg.qtdParcelas || null
        if (pg.valorParcela !== undefined) upd.valor_parcela = safeFloat(pg.valorParcela)
        if (pg.diaVenc !== undefined) upd.dia_vencimento = pg.diaVenc || null
      }
      if (body.arquivo !== undefined) upd.arquivo_contrato = body.arquivo ? JSON.stringify(body.arquivo) : null
      upd.updated_at = new Date().toISOString()
      const { error: updErr } = await getSupabase().from('contracts').update(upd).eq('id', parts[1])
      if (updErr) { console.error('[CONTRACT-PUT] Supabase error:', updErr.message); return json({ ok: false, erro: updErr.message }, 500) }
      console.log('[CONTRACT-PUT] OK id:', parts[1], 'fields:', Object.keys(upd).join(','))
      await audit(user.id, 'UPDATE', 'contract', parts[1], `Contrato ${parts[1]} atualizado`)
      return json({ ok: true })
    }

    // ─── PAYMENTS GET (list) ─────────────────────────────────────────────
    if (route === 'payments' && httpMethod === 'GET') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const { data } = await getSupabase().from('payments').select('*').order('vencimento')
      return json({ ok: true, pagamentos: data || [] })
    }

    // ─── PAYMENTS POST (create) ──────────────────────────────────────────
    if (route === 'payments' && httpMethod === 'POST') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const pid = body.id || crypto.randomUUID()
      const cid = (body.contratoId || '').trim()
      if (!cid) return json({ ok: false, erro: 'contract_id e obrigatorio.' }, 400)
      const comprovanteJson = body.comprovante ? JSON.stringify(body.comprovante) : null
      const vals = {
        id: pid, contract_id: cid,
        descricao: (body.descricao || '').trim(),
        vencimento: (body.vencimento || '').trim(),
        valor: parseFloat(body.valor || 0),
        contrato_num: (body.contratoNum || '').trim() || null,
        data_pagamento: (body.dataPagamento || '').trim() || null,
        valor_pago: safeFloat(body.valorPago) || (body.dataPagamento ? parseFloat(body.valor || 0) : null),
        forma_pagamento: (body.formaPgto || '').trim() || null,
        status: body.dataPagamento ? 'pago' : (body.status || 'pendente'),
        obs: (body.obs || '').trim(),
        comprovante: comprovanteJson,
        created_by: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      const { error } = await getSupabase().from('payments').insert(vals)
      if (error) return json({ ok: false, erro: error.message }, 500)
      await audit(user.id, 'CREATE', 'payment', pid, `Pagamento criado para contrato ${cid}`)
      return json({ ok: true, id: pid })
    }

    // ─── PAYMENTS PUT (update) ───────────────────────────────────────────
    if (parts[0] === 'payments' && parts[1] && httpMethod === 'PUT') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const upd = {}
      if (body.descricao !== undefined) upd.descricao = (body.descricao || '').trim()
      if (body.vencimento !== undefined) upd.vencimento = (body.vencimento || '').trim()
      if (body.valor !== undefined) upd.valor = parseFloat(body.valor || 0)
      if (body.contratoNum !== undefined) upd.contrato_num = (body.contratoNum || '').trim()
      if (body.dataPagamento !== undefined) upd.data_pagamento = (body.dataPagamento || '').trim() || null
      if (body.valorPago !== undefined) upd.valor_pago = safeFloat(body.valorPago)
      if (body.formaPgto !== undefined) upd.forma_pagamento = (body.formaPgto || '').trim() || null
      if (body.status !== undefined) upd.status = body.status || 'pendente'
      if (body.obs !== undefined) upd.obs = (body.obs || '').trim()
      if (body.comprovante !== undefined) upd.comprovante = body.comprovante ? JSON.stringify(body.comprovante) : null
      if (body.deleted_at !== undefined) upd.deleted_at = body.deleted_at || null
      upd.updated_at = new Date().toISOString()
      await getSupabase().from('payments').update(upd).eq('id', parts[1])
      await audit(user.id, 'UPDATE', 'payment', parts[1], `Pagamento ${parts[1]} atualizado`)
      return json({ ok: true })
    }

    // ─── ADDITIVES POST (create) ─────────────────────────────────────────
    if (route === 'additives' && httpMethod === 'POST') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const aid = body.id || crypto.randomUUID()
      const cid = (body.contract_id || '').trim()
      if (!cid) return json({ ok: false, erro: 'contract_id e obrigatorio.' }, 400)
      const arquivoJson = body.arquivo ? JSON.stringify(body.arquivo) : null
      const vals = {
        id: aid, contract_id: cid,
        numero: (body.numero || '').trim(),
        data_aditivo: (body.data || '').trim(),
        tipo: (body.tipo || '').trim(),
        nova_data_fim: (body.novaData || '').trim() || null,
        acrescimo_valor: safeFloat(body.novoValor),
        descricao: (body.objeto || '').trim(),
        arquivo_contrato: arquivoJson,
        resumo: body.resumo || null,
        created_by: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      const { error } = await getSupabase().from('additives').insert(vals)
      if (error) return json({ ok: false, erro: error.message }, 500)
      await audit(user.id, 'CREATE', 'additive', aid, `Aditivo criado para contrato ${cid}`)
      return json({ ok: true, id: aid })
    }

    // ─── ADDITIVES PUT (update) ──────────────────────────────────────────
    if (parts[0] === 'additives' && parts[1] && httpMethod === 'PUT') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const upd = {}
      if (body.numero !== undefined) upd.numero = (body.numero || '').trim()
      if (body.data !== undefined) upd.data_aditivo = (body.data || '').trim()
      if (body.tipo !== undefined) upd.tipo = (body.tipo || '').trim()
      if (body.novaData !== undefined) upd.nova_data_fim = (body.novaData || '').trim() || null
      if (body.novoValor !== undefined) upd.acrescimo_valor = safeFloat(body.novoValor)
      if (body.objeto !== undefined) upd.descricao = (body.objeto || '').trim()
      if (body.arquivo !== undefined) upd.arquivo_contrato = body.arquivo ? JSON.stringify(body.arquivo) : null
      if (body.resumo !== undefined) upd.resumo = body.resumo || null
      if (body.deleted_at !== undefined) upd.deleted_at = body.deleted_at || null
      upd.updated_at = new Date().toISOString()
      await getSupabase().from('additives').update(upd).eq('id', parts[1])
      await audit(user.id, 'UPDATE', 'additive', parts[1], `Aditivo ${parts[1]} atualizado`)
      return json({ ok: true })
    }

    // ─── ADDITIVES DELETE ────────────────────────────────────────────────
    if (parts[0] === 'additives' && parts[1] && httpMethod === 'DELETE') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      await getSupabase().from('additives').delete().eq('id', parts[1])
      await audit(user.id, 'DELETE', 'additive', parts[1], `Aditivo ${parts[1]} excluido`)
      return json({ ok: true })
    }

    // ─── SYNC ────────────────────────────────────────────────────────────
    if (route === 'sync') {
      if (httpMethod === 'GET') {
        const authErr = requireAuth(user)
        if (authErr) return authErr
        const since = queryParams.since || null
        const safeQuery = async (label, fn) => {
          try {
            const r = await fn()
            if (r.error) { console.error(`[SYNC-GET] Erro em ${label}:`, r.error.message); return [] }
            return r.data || []
          } catch (e) { console.error(`[SYNC-GET] Excecao em ${label}:`, e.message); return [] }
        }
        const CONTRACT_COLS = 'id,numero,fornecedor,cnpj,objeto,valor_total,inicio,fim,tem_parcelas,qtd_parcelas,valor_parcela,dia_vencimento,responsavel,setor,obs,tipo,empresa_id,active,forma_pagamento,created_by,created_at,updated_at,arquivo_contrato'
        const PAYMENT_COLS = 'id,contract_id,descricao,vencimento,valor,contrato_num,data_pagamento,valor_pago,forma_pagamento,status,obs,created_by,paid_by,created_at,updated_at,deleted_at,comprovante'
        const ADDITIVE_COLS = 'id,contract_id,numero,data_aditivo,tipo,nova_data_fim,acrescimo_valor,descricao,created_by,created_at,updated_at,deleted_at,arquivo_contrato'
        const CERTIDAO_COLS = 'id,empresa_id,cnpj,uf,cidade,tipo,data_emissao,data_validade,status,arquivo_nome,arquivo_dados,observacoes,criado_em,updated_at,deleted_at'
        const LICITACAO_COLS = 'id,empresa_id,numero_licitacao,edital,nome_licitacao,cnpj,uf,cidade,objeto,contrato_id,valor,indice_reajuste,data_homologacao,data_inicio,data_fim,status,arquivos,observacoes,criado_em,updated_at,deleted_at'
        const DEST_COLS = 'id,email,nome,empresa_ids,setores,alertas,criado_em,updated_at,deleted_at'
        const ROLES_COLS = 'id,nome,descricao,is_system,created_at,updated_at,deleted_at'
        const ROLE_PERMS_COLS = 'id,role_id,resource,action,empresa_id,company_group_id,created_at,updated_at,deleted_at'
        const COMPANY_GROUPS_COLS = 'id,nome,descricao,created_at,updated_at,deleted_at'
        const COMPANY_GROUP_MEMBERS_COLS = 'group_id,empresa_id'
        const sq = (tbl, cols) => {
          let q = getSupabase().from(tbl).select(cols)
          if (since) {
            q = q.gt('updated_at', since)
          } else {
            q = q.is('deleted_at', null)
          }
          return q
        }
        const sqContracts = () => {
          let q = getSupabase().from('contracts').select(CONTRACT_COLS)
          if (since) {
            q = q.gt('updated_at', since)
          } else {
            q = q.eq('active', 1)
          }
          return q
        }
        console.log('[SYNC-GET] Iniciando queries... since:', since)
        const t0 = Date.now()
        const queries = [
          ['contracts', () => sqContracts().order('created_at', { ascending: false })],
          ['payments', () => sq('payments', PAYMENT_COLS).order('vencimento')],
          ['users', () => getSupabase().from('users').select('id, username, full_name, role, created_at').order('id')],
          ['additives', () => sq('additives', ADDITIVE_COLS).order('created_at')],
          ['companies', () => getSupabase().from('companies').select('*').order('nome')],
          ['destinatarios', () => sq('destinatarios', DEST_COLS).order('criado_em')],
          ['certidoes', () => sq('certidoes', CERTIDAO_COLS).order('criado_em', { ascending: false })],
          ['licitacoes', async () => {
            let r = await sq('licitacoes', LICITACAO_COLS).order('criado_em', { ascending: false })
            if (r.error && /column .* (uf|cidade)/i.test(r.error.message || '')) {
              console.warn('[SYNC-GET] Colunas uf/cidade ausentes em licitacoes, rode a migration no Supabase SQL Editor')
              r = await sq('licitacoes', LICITACAO_COLS.replace(',uf', '').replace(',cidade', '')).order('criado_em', { ascending: false })
            }
            return r
          }],
          ['sectors', () => getSupabase().from('sectors').select('*').order('nome')],
          ['user_setores', () => getSupabase().from('user_setores').select('*')],
          ['tipos_certidao', () => getSupabase().from('tipos_certidao').select('*').order('nome')],
          ['certificados_digitais', () => sq('certificados_digitais', 'id,empresa_id,cnpj,data_inclusao,data_vencimento,arquivo_nome,arquivo_base64,criado_em,updated_at,deleted_at').order('criado_em', { ascending: false })],
          ['roles', () => getSupabase().from('roles').select(ROLES_COLS).order('nome')],
          ['role_permissions', () => getSupabase().from('role_permissions').select(ROLE_PERMS_COLS).order('created_at')],
          ['company_groups', () => getSupabase().from('company_groups').select(COMPANY_GROUPS_COLS).order('nome')],
          ['company_group_members', () => getSupabase().from('company_group_members').select(COMPANY_GROUP_MEMBERS_COLS)],
        ]
        const results = []
        for (const [label, fn] of queries) {
          const tq = Date.now()
          const r = await safeQuery(label, fn)
          console.log(`[SYNC-GET] ${label}: ${r.length} rows (${Date.now() - tq}ms)`)
          results.push(r)
        }
        console.log('[SYNC-GET] Total queries:', Date.now() - t0, 'ms')
        const [contratos, pagamentos, usuarios, aditivos, empresas, destinatarios, certidoes, licitacoes, sectors, userSetores, tiposCertidao, certificadosDigitais, roles, rolePermissions, companyGroups, companyGroupMembers] = results
        const resp = {
          contratos, pagamentos, usuarios, aditivos, empresas,
          destinatarios, certidoes, licitacoes, sectors, user_setores: userSetores,
          tipos_certidao: tiposCertidao,
          certificados_digitais: certificadosDigitais,
          roles, role_permissions: rolePermissions,
          company_groups: companyGroups,
          company_group_members: companyGroupMembers,
          server_now: new Date().toISOString()
        }
        const respSize = Math.round(JSON.stringify(resp).length / 1024)
        console.log('[SYNC-GET] Respondendo:', contratos.length, 'contratos,', pagamentos.length, 'pagamentos,', respSize, 'KB')
        if (respSize > 3500) {
          console.warn('[SYNC-GET] Resposta muito grande, truncando...')
          resp.contratos = resp.contratos.slice(0, 200)
          resp.pagamentos = resp.pagamentos.slice(0, 200)
        }
        return json(resp)
      }

      if (httpMethod === 'POST') {
        const authErr = requireAuth(user)
        if (authErr) return authErr
        if (!validateCsrf(user, body.csrf_token)) {
          return json({ ok: false, erro: 'CSRF invalido' }, 403)
        }
        if (!body) return json({ ok: false, erro: 'JSON invalido ou vazio.' }, 400)
        const importados = { contratos: 0, pagamentos: 0, aditivos: 0, roles: 0, role_permissions: 0, company_groups: 0, company_group_members: 0, ignorados: 0 }
        const MAX_BASE64 = 4 * 1024 * 1024

        for (const c of (body.contratos || [])) {
          const cid = (c.id || '').trim()
          const numero = (c.numero || '').trim()
          if (!cid || !numero) { importados.ignorados++; continue }
          if (c.arquivo?.data?.length > MAX_BASE64) {
            console.warn(`[SYNC] Arquivo do contrato ${numero} excede 10MB, ignorando arquivo.`)
            c.arquivo = null
          }
          const cnpjVal = (c.doc || '').trim()
          if (cnpjVal && !validarCpfCnpj(cnpjVal)) {
            console.warn(`[SYNC] CPF/CNPJ invalido no contrato ${numero}: ${cnpjVal}, ignorando CNPJ.`)
            c.doc = ''
          }
          try {
            const pgto = c.pgtoConfig || {}
            const arquivoJson = c.arquivo ? JSON.stringify(c.arquivo) : null
            const incomingUpdated = c.updated_at || c.createdAt || new Date().toISOString()
            const incomingDeleted = c.deleted_at || null
            const { data: existing } = await getSupabase().from('contracts').select('id, updated_at').eq('id', cid).single()
            if (existing) {
              const existingUpdated = existing.updated_at || ''
              if (incomingUpdated <= existingUpdated && !incomingDeleted) {
                importados.contratos++
                if (c.aditivos?.length) { for (const a of c.aditivos) importados.aditivos++ }
                continue
              }
              if (incomingDeleted) {
                await getSupabase().from('contracts').update({ active: 0, updated_at: incomingUpdated }).eq('id', cid)
              } else {
                const vals = {
                  numero, fornecedor: (c.parte || '').trim(), cnpj: (c.doc || '').trim(),
                  objeto: (c.objeto || '').trim(), valor_total: parseFloat(c.valor || 0),
                  inicio: (c.inicio || '').trim(), fim: (c.fim || '').trim(),
                  tem_parcelas: c.temParcelas ? 1 : 0, qtd_parcelas: pgto.qtdParcelas,
                  valor_parcela: safeFloat(pgto.valorParcela), dia_vencimento: pgto.diaVenc,
                  responsavel: (c.responsavel || '').trim(), setor: (c.setor || '').trim(),
                  obs: (c.obs || '').trim(), tipo: c.tipo, empresa_id: c.empresaId,
                  active: c.active !== undefined ? (c.active ? 1 : 0) : 1,
                  forma_pagamento: pgto.forma,
                  updated_at: incomingUpdated
                }
                if (arquivoJson) vals.arquivo_contrato = arquivoJson
                const { error } = await getSupabase().from('contracts').update(vals).eq('id', cid)
                if (error) { await audit(user.id, 'SYNC_ERROR', 'contracts', cid, `Update: ${error.message}`); importados.ignorados++; continue }
              }
            } else {
              if (incomingDeleted) { importados.contratos++; continue }
              const { data: dupNum } = await getSupabase().from('contracts').select('id').eq('numero', numero).eq('active', 1).limit(1)
              if (dupNum && dupNum.length > 0) { importados.ignorados++; continue }
              const vals = {
                numero, fornecedor: (c.parte || '').trim(), cnpj: (c.doc || '').trim(),
                objeto: (c.objeto || '').trim(), valor_total: parseFloat(c.valor || 0),
                inicio: (c.inicio || '').trim(), fim: (c.fim || '').trim(),
                tem_parcelas: c.temParcelas ? 1 : 0, qtd_parcelas: pgto.qtdParcelas,
                valor_parcela: safeFloat(pgto.valorParcela), dia_vencimento: pgto.diaVenc,
                responsavel: (c.responsavel || '').trim(), setor: (c.setor || '').trim(),
                obs: (c.obs || '').trim(), tipo: c.tipo, empresa_id: c.empresaId,
                active: c.active !== undefined ? (c.active ? 1 : 0) : 1,
                forma_pagamento: pgto.forma, arquivo_contrato: arquivoJson,
                created_by: user.id, updated_at: incomingUpdated
              }
              const { error } = await getSupabase().from('contracts').insert({ id: cid, ...vals })
              if (error) { await audit(user.id, 'SYNC_ERROR', 'contracts', cid, `Insert: ${error.message}`); importados.ignorados++; continue }
            }
            importados.contratos++

          if (c.aditivos?.length) {
            for (const a of c.aditivos) {
              const aid = (a.id || '').trim()
              if (!aid) { importados.ignorados++; continue }
              if (a.arquivo?.data?.length > MAX_BASE64) {
                console.warn('[SYNC] Arquivo de aditivo excede 15MB, ignorando arquivo.')
                a.arquivo = null
              }
              try {
                const arqJson = a.arquivo ? JSON.stringify(a.arquivo) : null
                const incomingUpdatedA = a.updated_at || a.createdAt || new Date().toISOString()
                const incomingDeletedA = a.deleted_at || null
                const { data: existingA } = await getSupabase().from('additives').select('id, updated_at').eq('id', aid).single()
                if (existingA) {
                  const existingUpdatedA = existingA.updated_at || ''
                  if (incomingUpdatedA <= existingUpdatedA && !incomingDeletedA) {
                    importados.aditivos++
                    continue
                  }
                  if (incomingDeletedA) {
                    await getSupabase().from('additives').delete().eq('id', aid)
                  } else {
                    const { error } = await getSupabase().from('additives').update({
                      numero: a.numero, data_aditivo: a.data || '', tipo: a.tipo,
                      nova_data_fim: a.novaData, acrescimo_valor: a.novoValor,
                      descricao: a.objeto || '', arquivo_contrato: arqJson,
                      updated_at: incomingUpdatedA
                    }).eq('id', aid)
                    if (error) { await audit(user.id, 'SYNC_ERROR', 'additives', aid, error.message); importados.ignorados++; continue }
                  }
                } else {
                  if (incomingDeletedA) { importados.aditivos++; continue }
                  const { error } = await getSupabase().from('additives').insert({
                    id: aid, contract_id: cid, numero: a.numero,
                    data_aditivo: a.data || '', tipo: a.tipo, nova_data_fim: a.novaData,
                    acrescimo_valor: a.novoValor, descricao: a.objeto || '',
                    arquivo_contrato: arqJson, created_by: user.id,
                    updated_at: incomingUpdatedA
                  })
                  if (error) { await audit(user.id, 'SYNC_ERROR', 'additives', aid, error.message); importados.ignorados++; continue }
                }
                importados.aditivos++
              } catch (e) {
                await audit(user.id, 'SYNC_ERROR', 'additives', aid, e.message)
                importados.ignorados++
              }
            }
          }
          } catch (e) {
            await audit(user.id, 'SYNC_ERROR', 'contracts', cid, e.message)
            importados.ignorados++
          }
        }

        const pagDados = body.pagamentos || []
        for (const p of pagDados) {
          const pid = (p.id || '').trim() || crypto.randomUUID()
          const cid = (p.contratoId || '').trim()
          const descricao = (p.descricao || '').trim()
          const vencimento = (p.vencimento || '').trim()
          if (!cid || !vencimento) { importados.ignorados++; continue }
          if (p.comprovante?.data?.length > MAX_BASE64) {
            console.warn('[SYNC] Comprovante de pagamento excede 15MB, ignorando comprovante.')
            p.comprovante = null
          }
          try {
            const valor = parseFloat(p.valor || 0)
            const dataPag = (p.dataPagamento || '').trim() || null
            const comprovanteJson = p.comprovante ? JSON.stringify(p.comprovante) : null
            const incomingUpdated = p.updated_at || p.createdAt || new Date().toISOString()
            const incomingDeleted = p.deleted_at || null
            const { data: existing } = await getSupabase().from('payments').select('id, updated_at, deleted_at').eq('id', pid).single()
            if (existing) {
              const existingUpdated = existing.updated_at || ''
              if (incomingUpdated <= existingUpdated && !incomingDeleted) {
                importados.pagamentos++
                continue
              }
              if (incomingDeleted) {
                await getSupabase().from('payments').delete().eq('id', pid)
              } else {
                const vals = {
                  contract_id: cid, descricao, vencimento, valor,
                  contrato_num: (p.contratoNum || '').trim() || null,
                  data_pagamento: dataPag, valor_pago: safeFloat(p.valorPago) || (dataPag ? valor : null),
                  forma_pagamento: (p.formaPgto || '').trim() || null,
                  status: dataPag ? 'pago' : 'pendente', obs: (p.obs || '').trim(),
                  updated_at: incomingUpdated
                }
                if (comprovanteJson) vals.comprovante = comprovanteJson
                const { error } = await getSupabase().from('payments').update(vals).eq('id', pid)
                if (error) { await audit(user.id, 'SYNC_ERROR', 'payments', pid, error.message); importados.ignorados++; continue }
              }
            } else {
              if (incomingDeleted) { importados.pagamentos++; continue }
              const { error } = await getSupabase().from('payments').insert({
                id: pid, contract_id: cid, descricao, vencimento, valor,
                contrato_num: (p.contratoNum || '').trim() || null,
                data_pagamento: dataPag, valor_pago: safeFloat(p.valorPago) || (dataPag ? valor : null),
                forma_pagamento: (p.formaPgto || '').trim() || null,
                status: dataPag ? 'pago' : 'pendente', obs: (p.obs || '').trim(),
                comprovante: comprovanteJson, created_by: user.id,
                updated_at: incomingUpdated
              })
              if (error) { await audit(user.id, 'SYNC_ERROR', 'payments', pid, error.message); importados.ignorados++; continue }
            }
            importados.pagamentos++
          } catch (e) {
            await audit(user.id, 'SYNC_ERROR', 'payments', pid, e.message)
            importados.ignorados++
          }
        }

        for (const d of (body.destinatarios || [])) {
          const did = (d.id || '').trim()
          const email = (d.email || '').trim()
          if (!did || !email) { importados.ignorados++; continue }
          try {
            const incomingUpdatedD = d.updated_at || d.criadoEm || new Date().toISOString()
            const incomingDeletedD = d.deleted_at || null
            const { data: existing } = await getSupabase().from('destinatarios').select('id, updated_at').eq('id', did).single()
            if (existing) {
              const existingUpdatedD = existing.updated_at || ''
              if (incomingUpdatedD <= existingUpdatedD && !incomingDeletedD) {
                importados.destinatarios = (importados.destinatarios || 0) + 1
                continue
              }
              if (incomingDeletedD) {
                await getSupabase().from('destinatarios').delete().eq('id', did)
              } else {
                const { error } = await getSupabase().from('destinatarios').update({
                  email, nome: (d.nome || '').trim(),
                  empresa_ids: JSON.stringify(d.empresaIds || []),
                  setores: JSON.stringify(d.setores || []),
                  alertas: JSON.stringify(d.alertas || []),
                  updated_at: incomingUpdatedD
                }).eq('id', did)
                if (error) { await audit(user.id, 'SYNC_ERROR', 'destinatarios', did, error.message); importados.ignorados++; continue }
              }
            } else {
              if (incomingDeletedD) { importados.destinatarios = (importados.destinatarios || 0) + 1; continue }
              const { error } = await getSupabase().from('destinatarios').insert({
                id: did, email, nome: (d.nome || '').trim(),
                empresa_ids: JSON.stringify(d.empresaIds || []),
                setores: JSON.stringify(d.setores || []),
                alertas: JSON.stringify(d.alertas || []),
                updated_at: incomingUpdatedD
              })
              if (error) { await audit(user.id, 'SYNC_ERROR', 'destinatarios', did, error.message); importados.ignorados++; continue }
            }
            importados.destinatarios = (importados.destinatarios || 0) + 1
          } catch (e) {
            await audit(user.id, 'SYNC_ERROR', 'destinatarios', did, e.message)
            importados.ignorados++
          }
        }

        for (const ct of (body.certidoes || [])) {
          const ctid = (ct.id || '').trim()
          const tipo = (ct.tipo || '').trim()
          if (!ctid || !tipo) { importados.ignorados++; continue }
          try {
            let arquivoDadosStr = null
            let arquivoNomeStr = ''
            if (ct.arquivo) {
              const tmp = JSON.stringify(ct.arquivo)
              if (tmp.length <= MAX_BASE64) {
                arquivoDadosStr = tmp
                arquivoNomeStr = ct.arquivo.name || ''
              }
            }
            const incomingUpdatedCt = ct.updated_at || ct.criadoEm || new Date().toISOString()
            const incomingDeletedCt = ct.deleted_at || null
            const { data: existing } = await getSupabase().from('certidoes').select('id, updated_at, deleted_at').eq('id', ctid).single()
            const vals = {
              empresa_id: ct.empresaId || '',
              cnpj: (ct.cnpj || '').trim(),
              uf: (ct.uf || '').trim(),
              cidade: (ct.cidade || '').trim(),
              tipo, data_emissao: ct.dataEmissao || '',
              data_validade: ct.dataValidade || '', status: ct.status || 'pendente',
              observacoes: (ct.obs || '').trim(),
              updated_at: incomingUpdatedCt
            }
            if (arquivoNomeStr) vals.arquivo_nome = arquivoNomeStr
            if (arquivoDadosStr) vals.arquivo_dados = arquivoDadosStr
            if (existing) {
              if (existing.deleted_at) {
                importados.certidoes = (importados.certidoes || 0) + 1
                continue
              }
              const existingUpdatedCt = existing.updated_at || ''
              if (incomingUpdatedCt <= existingUpdatedCt && !incomingDeletedCt) {
                importados.certidoes = (importados.certidoes || 0) + 1
                continue
              }
              if (incomingDeletedCt) {
                await getSupabase().from('certidoes').update({ deleted_at: incomingDeletedCt, updated_at: incomingUpdatedCt }).eq('id', ctid)
              } else {
                const { error } = await getSupabase().from('certidoes').update(vals).eq('id', ctid)
                if (error) { await audit(user.id, 'SYNC_ERROR', 'certidoes', ctid, `Update: ${error.message}`); importados.ignorados++; continue }
              }
            } else {
              if (incomingDeletedCt) { importados.certidoes = (importados.certidoes || 0) + 1; continue }
              const { error } = await getSupabase().from('certidoes').insert({ id: ctid, ...vals })
              if (error) { await audit(user.id, 'SYNC_ERROR', 'certidoes', ctid, `Insert: ${error.message}`); importados.ignorados++; continue }
            }
            importados.certidoes = (importados.certidoes || 0) + 1
          } catch (e) {
            await audit(user.id, 'SYNC_ERROR', 'certidoes', ctid, e.message)
            importados.ignorados++
          }
        }

        for (const lc of (body.licitacoes || [])) {
          const lcid = (lc.id || '').trim()
          const numero = (lc.numeroLicitacao || '').trim()
          if (!lcid || !numero) { importados.ignorados++; continue }
          try {
            const incomingUpdatedLc = lc.updated_at || lc.criadoEm || new Date().toISOString()
            const incomingDeletedLc = lc.deleted_at || null
            const { data: existing } = await getSupabase().from('licitacoes').select('id, updated_at, deleted_at').eq('id', lcid).single()
            const arquivos = []
            if (lc.arquivoEdital) arquivos.push({ ...lc.arquivoEdital, tipo: 'edital' })
            if (lc.arquivoContrato) arquivos.push({ ...lc.arquivoContrato, tipo: 'contrato' })
            const vals = {
              numero_licitacao: numero, edital: (lc.edital || '').trim(),
              uf: (lc.uf || '').trim().toUpperCase(),
              cidade: (lc.cidade || '').trim(),
              objeto: (lc.objeto || '').trim(), empresa_id: lc.empresaId || '',
              contrato_id: lc.contratoId || '', valor: safeFloat(lc.valor),
              indice_reajuste: (lc.indiceReajuste || '').trim(),
              data_homologacao: lc.dataHomologacao || '',
              data_inicio: lc.dataInicio || '', data_fim: lc.dataFim || '',
              status: lc.status || 'em_andamento',
              observacoes: (lc.obs || '').trim(),
              updated_at: incomingUpdatedLc
            }
            if (arquivos.length > 0) vals.arquivos = JSON.stringify(arquivos)
            if (existing) {
              if (existing.deleted_at) {
                importados.licitacoes = (importados.licitacoes || 0) + 1
                continue
              }
              const existingUpdatedLc = existing.updated_at || ''
              if (incomingUpdatedLc <= existingUpdatedLc && !incomingDeletedLc) {
                importados.licitacoes = (importados.licitacoes || 0) + 1
                continue
              }
              if (incomingDeletedLc) {
                await getSupabase().from('licitacoes').update({ deleted_at: incomingDeletedLc, updated_at: incomingUpdatedLc }).eq('id', lcid)
              } else {
                const { error } = await getSupabase().from('licitacoes').update(vals).eq('id', lcid)
                if (error) { await audit(user.id, 'SYNC_ERROR', 'licitacoes', lcid, error.message); importados.ignorados++; continue }
              }
            } else {
              if (incomingDeletedLc) { importados.licitacoes = (importados.licitacoes || 0) + 1; continue }
              const { error } = await getSupabase().from('licitacoes').insert({ id: lcid, ...vals })
              if (error) { await audit(user.id, 'SYNC_ERROR', 'licitacoes', lcid, error.message); importados.ignorados++; continue }
            }
            importados.licitacoes = (importados.licitacoes || 0) + 1
          } catch (e) {
            await audit(user.id, 'SYNC_ERROR', 'licitacoes', lcid, e.message)
            importados.ignorados++
          }
        }

        for (const r of (body.roles || [])) {
          const rid = (r.id || '').trim()
          const nome = (r.nome || '').trim()
          if (!rid || !nome) { importados.ignorados++; continue }
          try {
            const incomingUpdated = r.updated_at || r.created_at || new Date().toISOString()
            const incomingDeleted = r.deleted_at || null
            const { data: existing } = await getSupabase().from('roles').select('id, updated_at').eq('id', rid).single()
            const vals = { nome, descricao: r.descricao || '', is_system: r.is_system || 0, updated_at: incomingUpdated }
            if (existing) {
              const existingUpdated = existing.updated_at || ''
              if (incomingUpdated <= existingUpdated && !incomingDeleted) {
                importados.roles = (importados.roles || 0) + 1
                continue
              }
              if (incomingDeleted) {
                await getSupabase().from('roles').delete().eq('id', rid)
              } else {
                const { error } = await getSupabase().from('roles').update(vals).eq('id', rid)
                if (error) { await audit(user.id, 'SYNC_ERROR', 'roles', rid, error.message); importados.ignorados++; continue }
              }
            } else {
              if (incomingDeleted) { importados.roles = (importados.roles || 0) + 1; continue }
              const { error } = await getSupabase().from('roles').insert({ id: rid, ...vals })
              if (error) { await audit(user.id, 'SYNC_ERROR', 'roles', rid, error.message); importados.ignorados++; continue }
            }
            importados.roles = (importados.roles || 0) + 1
          } catch (e) {
            await audit(user.id, 'SYNC_ERROR', 'roles', rid, e.message)
            importados.ignorados++
          }
        }

        for (const rp of (body.role_permissions || [])) {
          const rpid = String(rp.id ?? '').trim()
          const roleId = (rp.role_id || '').trim()
          const resource = (rp.resource || '').trim()
          const action = (rp.action || '').trim()
          if (!rpid || !roleId || !resource || !action) { importados.ignorados++; continue }
          try {
            const incomingUpdated = rp.updated_at || rp.created_at || new Date().toISOString()
            const incomingDeleted = rp.deleted_at || null
            const { data: existing } = await getSupabase().from('role_permissions').select('id, updated_at').eq('id', rpid).single()
            const vals = { role_id: roleId, resource, action, empresa_id: rp.empresa_id || null, company_group_id: rp.company_group_id || null, updated_at: incomingUpdated }
            if (existing) {
              const existingUpdated = existing.updated_at || ''
              if (incomingUpdated <= existingUpdated && !incomingDeleted) {
                importados.role_permissions = (importados.role_permissions || 0) + 1
                continue
              }
              if (incomingDeleted) {
                await getSupabase().from('role_permissions').delete().eq('id', rpid)
              } else {
                const { error } = await getSupabase().from('role_permissions').update(vals).eq('id', rpid)
                if (error) { await audit(user.id, 'SYNC_ERROR', 'role_permissions', rpid, error.message); importados.ignorados++; continue }
              }
            } else {
              if (incomingDeleted) { importados.role_permissions = (importados.role_permissions || 0) + 1; continue }
              const { error } = await getSupabase().from('role_permissions').insert({ id: rpid, ...vals })
              if (error) { await audit(user.id, 'SYNC_ERROR', 'role_permissions', rpid, error.message); importados.ignorados++; continue }
            }
            importados.role_permissions = (importados.role_permissions || 0) + 1
          } catch (e) {
            await audit(user.id, 'SYNC_ERROR', 'role_permissions', rpid, e.message)
            importados.ignorados++
          }
        }

        for (const cg of (body.company_groups || [])) {
          const cgid = (cg.id || '').trim()
          const nome = (cg.nome || '').trim()
          if (!cgid || !nome) { importados.ignorados++; continue }
          try {
            const incomingUpdated = cg.updated_at || cg.created_at || new Date().toISOString()
            const incomingDeleted = cg.deleted_at || null
            const { data: existing } = await getSupabase().from('company_groups').select('id, updated_at').eq('id', cgid).single()
            const vals = { nome, descricao: cg.descricao || '', updated_at: incomingUpdated }
            if (existing) {
              const existingUpdated = existing.updated_at || ''
              if (incomingUpdated <= existingUpdated && !incomingDeleted) {
                importados.company_groups = (importados.company_groups || 0) + 1
                continue
              }
              if (incomingDeleted) {
                await getSupabase().from('company_groups').delete().eq('id', cgid)
              } else {
                const { error } = await getSupabase().from('company_groups').update(vals).eq('id', cgid)
                if (error) { await audit(user.id, 'SYNC_ERROR', 'company_groups', cgid, error.message); importados.ignorados++; continue }
              }
            } else {
              if (incomingDeleted) { importados.company_groups = (importados.company_groups || 0) + 1; continue }
              const { error } = await getSupabase().from('company_groups').insert({ id: cgid, ...vals })
              if (error) { await audit(user.id, 'SYNC_ERROR', 'company_groups', cgid, error.message); importados.ignorados++; continue }
            }
            importados.company_groups = (importados.company_groups || 0) + 1
          } catch (e) {
            await audit(user.id, 'SYNC_ERROR', 'company_groups', cgid, e.message)
            importados.ignorados++
          }
        }

        for (const cgm of (body.company_group_members || [])) {
          const groupId = (cgm.group_id || '').trim()
          const empresaId = (cgm.empresa_id || '').trim()
          if (!groupId || !empresaId) { importados.ignorados++; continue }
          try {
            const incomingUpdated = cgm.updated_at || cgm.created_at || new Date().toISOString()
            const incomingDeleted = cgm.deleted_at || null
            const { data: existing } = await getSupabase().from('company_group_members').select('group_id, empresa_id').eq('group_id', groupId).eq('empresa_id', empresaId).single()
            if (existing) {
              if (incomingDeleted) {
                await getSupabase().from('company_group_members').delete().eq('group_id', groupId).eq('empresa_id', empresaId)
              }
            } else {
              if (!incomingDeleted) {
                const { error } = await getSupabase().from('company_group_members').insert({ group_id: groupId, empresa_id: empresaId })
                if (error) { await audit(user.id, 'SYNC_ERROR', 'company_group_members', groupId + '_' + empresaId, error.message); importados.ignorados++; continue }
              }
            }
            importados.company_group_members = (importados.company_group_members || 0) + 1
          } catch (e) {
            await audit(user.id, 'SYNC_ERROR', 'company_group_members', groupId + '_' + empresaId, e.message)
            importados.ignorados++
          }
        }

        clearRolePermCache()
        await audit(user.id, 'SYNC', 'system', '', `Sincronizacao concluida: ${JSON.stringify(importados)}`)
        return json({ ok: true, importados })
      }
    }

    // ─── ASSISTENTE VIRTUAL ─────────────────────────────────────────────────
    if (route === 'assistente' && httpMethod === 'POST') {
      const pergunta = (body.pergunta || '').trim()
      if (!pergunta) return json({ ok: false, erro: 'Pergunta vazia' }, 400)

      const geminiKey = process.env.GEMINI_API_KEY || ''
      if (!geminiKey) {
        return json({ ok: true, resposta: respostaOffline(pergunta) })
      }

      try {
        const prompt = SYSTEM_PROMPT_ASSISTENTE + '\n\nPERGUNTA DO USUARIO:\n' + pergunta.slice(0, 2000)
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 800 }
          })
        })
        const data = await resp.json()
        const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
        if (texto && texto.length > 10) {
          return json({ ok: true, resposta: texto })
        }
      } catch (e) {
        console.error('Gemini assistente falhou:', e.message)
      }
      return json({ ok: true, resposta: respostaOffline(pergunta) })
    }

    // ─── CERTIDOES ─────────────────────────────────────────────────────────
    if (route === 'certidoes' && httpMethod === 'GET') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const { data } = await getSupabase().from('certidoes').select('*').order('criado_em', { ascending: false })
      return json(data || [])
    }

    if (route === 'certidoes' && httpMethod === 'POST') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const cid = body.id || crypto.randomUUID()
      const empresaId = (body.empresa_id || '').trim()
      const tipo = (body.tipo || '').trim()
      if (!empresaId || !tipo) return json({ ok: false, erro: 'Empresa e tipo sao obrigatorios.' }, 400)
      const { error } = await getSupabase().from('certidoes').insert({
        id: cid, empresa_id: empresaId,
        cnpj: (body.cnpj || '').trim(),
        uf: (body.uf || '').trim(),
        cidade: (body.cidade || '').trim(),
        tipo,
        data_emissao: body.data_emissao || '',
        data_validade: body.data_validade || '',
        status: body.status || 'pendente',
        arquivo_nome: body.arquivo_nome || '',
        arquivo_dados: body.arquivo_dados || '',
        observacoes: (body.obs || '').trim()
      })
      if (error) return json({ ok: false, erro: error.message }, 500)
      await audit(user.id, 'CREATE', 'certidao', cid, `Certidao ${tipo} criada`)
      return json({ ok: true, id: cid })
    }

    if (parts[0] === 'certidoes' && parts[1] && httpMethod === 'PUT') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const upd = {}
      if (body.empresa_id !== undefined) upd.empresa_id = body.empresa_id
      if (body.cnpj !== undefined) upd.cnpj = (body.cnpj || '').trim()
      if (body.uf !== undefined) upd.uf = (body.uf || '').trim()
      if (body.cidade !== undefined) upd.cidade = (body.cidade || '').trim()
      if (body.tipo !== undefined) upd.tipo = body.tipo
      if (body.data_emissao !== undefined) upd.data_emissao = body.data_emissao
      if (body.data_validade !== undefined) upd.data_validade = body.data_validade
      if (body.status !== undefined) upd.status = body.status
      if (body.arquivo_nome !== undefined) upd.arquivo_nome = body.arquivo_nome
      if (body.arquivo_dados !== undefined) upd.arquivo_dados = body.arquivo_dados
      if (body.obs !== undefined) upd.observacoes = body.obs
      if (body.deleted_at !== undefined) upd.deleted_at = body.deleted_at || null
      upd.updated_at = new Date().toISOString()
      const { error } = await getSupabase().from('certidoes').update(upd).eq('id', parts[1])
      if (error) return json({ ok: false, erro: error.message }, 500)
      await audit(user.id, 'UPDATE', 'certidao', parts[1], `Certidao atualizada`)
      return json({ ok: true })
    }

    if (parts[0] === 'certidoes' && parts[1] && httpMethod === 'DELETE') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      await getSupabase().from('certidoes').delete().eq('id', parts[1])
      await audit(user.id, 'DELETE', 'certidao', parts[1], `Certidao excluida`)
      return json({ ok: true })
    }

    // ─── LICITACOES ────────────────────────────────────────────────────────
    if (route === 'licitacoes' && httpMethod === 'GET') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      const { data } = await getSupabase().from('licitacoes').select('*').order('criado_em', { ascending: false })
      return json(data || [])
    }

    if (route === 'licitacoes' && httpMethod === 'POST') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const lid = body.id || crypto.randomUUID()
      const numero = (body.numero_licitacao || '').trim()
      const objeto = (body.objeto || '').trim()
      if (!numero || !objeto) return json({ ok: false, erro: 'Numero da licitacao e objeto sao obrigatorios.' }, 400)
      const { error } = await getSupabase().from('licitacoes').insert({
        id: lid, numero_licitacao: numero, edital: (body.edital || '').trim(),
        nome_licitacao: (body.nome_licitacao || '').trim(),
        cnpj: (body.cnpj || '').trim(),
        uf: (body.uf || '').trim().toUpperCase(),
        cidade: (body.cidade || '').trim(),
        objeto, empresa_id: body.empresa_id || '',
        contrato_id: body.contrato_id || '', valor: safeFloat(body.valor),
        indice_reajuste: (body.indice_reajuste || '').trim(),
        data_homologacao: body.data_homologacao || '',
        data_inicio: body.data_inicio || '', data_fim: body.data_fim || '',
        status: body.status || 'em_andamento',
        arquivos: body.arquivos || '[]',
        observacoes: (body.obs || '').trim()
      })
      if (error && (error.code === '42703' || /column .* (uf|cidade)/i.test(error.message || ''))) {
        // Migração pendente (colunas uf/cidade): salva sem elas para não travar o usuário
        console.warn('[licitacoes] Colunas uf/cidade ausentes, rode a migration no Supabase SQL Editor:', error.message)
        const { error: error2 } = await getSupabase().from('licitacoes').insert({
          id: lid, numero_licitacao: numero, edital: (body.edital || '').trim(),
          nome_licitacao: (body.nome_licitacao || '').trim(),
          cnpj: (body.cnpj || '').trim(),
          objeto, empresa_id: body.empresa_id || '',
          contrato_id: body.contrato_id || '', valor: safeFloat(body.valor),
          indice_reajuste: (body.indice_reajuste || '').trim(),
          data_homologacao: body.data_homologacao || '',
          data_inicio: body.data_inicio || '', data_fim: body.data_fim || '',
          status: body.status || 'em_andamento',
          arquivos: body.arquivos || '[]',
          observacoes: (body.obs || '').trim()
        })
        if (error2) return json({ ok: false, erro: error2.message }, 500)
      } else if (error) {
        return json({ ok: false, erro: error.message }, 500)
      }
      await audit(user.id, 'CREATE', 'licitacao', lid, `Licitacao ${numero} criada`)
      return json({ ok: true, id: lid })
    }

    if (parts[0] === 'licitacoes' && parts[1] && httpMethod === 'PUT') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const upd = { updated_at: new Date().toISOString() }
      if (body.numero_licitacao !== undefined) upd.numero_licitacao = body.numero_licitacao
      if (body.edital !== undefined) upd.edital = body.edital
      if (body.nome_licitacao !== undefined) upd.nome_licitacao = body.nome_licitacao
      if (body.cnpj !== undefined) upd.cnpj = body.cnpj
      if (body.uf !== undefined) upd.uf = (body.uf || '').trim().toUpperCase()
      if (body.cidade !== undefined) upd.cidade = (body.cidade || '').trim()
      if (body.objeto !== undefined) upd.objeto = body.objeto
      if (body.empresa_id !== undefined) upd.empresa_id = body.empresa_id
      if (body.contrato_id !== undefined) upd.contrato_id = body.contrato_id
      if (body.valor !== undefined) upd.valor = safeFloat(body.valor)
      if (body.indice_reajuste !== undefined) upd.indice_reajuste = (body.indice_reajuste || '').trim()
      if (body.data_homologacao !== undefined) upd.data_homologacao = body.data_homologacao
      if (body.data_inicio !== undefined) upd.data_inicio = body.data_inicio
      if (body.data_fim !== undefined) upd.data_fim = body.data_fim
      if (body.status !== undefined) upd.status = body.status
      if (body.arquivos !== undefined) upd.arquivos = body.arquivos
      if (body.obs !== undefined) upd.observacoes = body.obs
      if (body.deleted_at !== undefined) upd.deleted_at = body.deleted_at
      let { error } = await getSupabase().from('licitacoes').update(upd).eq('id', parts[1])
      if (error && (error.code === '42703' || /column .* (uf|cidade)/i.test(error.message || ''))) {
        console.warn('[licitacoes] Colunas uf/cidade ausentes, rode a migration no Supabase SQL Editor:', error.message)
        delete upd.uf
        delete upd.cidade
        ;({ error } = await getSupabase().from('licitacoes').update(upd).eq('id', parts[1]))
      }
      if (error) return json({ ok: false, erro: error.message }, 500)
      await audit(user.id, 'UPDATE', 'licitacao', parts[1], `Licitacao atualizada`)
      return json({ ok: true })
    }

    if (parts[0] === 'licitacoes' && parts[1] && httpMethod === 'DELETE') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      await getSupabase().from('licitacoes').delete().eq('id', parts[1])
      await audit(user.id, 'DELETE', 'licitacao', parts[1], `Licitacao excluida`)
      return json({ ok: true })
    }

    // ─── CIDADES ───────────────────────────────────────────────────────────
    if (route === 'cidades' && httpMethod === 'GET') {
      try {
        let cidadesPath = nodePath.join(process.cwd(), 'api', 'cidades.json');
        if (!fs.existsSync(cidadesPath)) {
          cidadesPath = nodePath.join(process.cwd(), 'cidades.json');
        }
        if (fs.existsSync(cidadesPath)) {
          const cidadesData = JSON.parse(fs.readFileSync(cidadesPath, 'utf-8'));
          return json(cidadesData);
        }
      } catch (e) {
        console.error('[CIDADES] Erro ao ler cidades.json:', e);
      }
      return json({});
    }

    // ─── UPLOAD-FILE (upload individual de anexos) ───────────────────────────
    if (route === 'upload-file' && httpMethod === 'POST') {
      const authErr = requireAuth(user)
      if (authErr) return authErr
      if (!validateCsrf(user, body.csrf_token)) {
        return json({ ok: false, erro: 'CSRF invalido' }, 403)
      }
      const { table, id, field, data } = body
      console.log('[UPLOAD-FILE] table:', table, 'id:', id, 'field:', field, 'dataLen:', data ? String(data).length : 0)
      if (!table || !id || !field || data === undefined) {
        return json({ ok: false, erro: 'Campos obrigatorios: table, id, field, data' }, 400)
      }
      const allowed = {
        contracts: ['arquivo_contrato'],
        payments: ['comprovante'],
        certidoes: ['arquivo_dados'],
        licitacoes: ['arquivos']
      }
      if (!allowed[table] || !allowed[table].includes(field)) {
        return json({ ok: false, erro: 'Tabela/campo nao permitido' }, 400)
      }
      const upd = { updated_at: new Date().toISOString() }
      upd[field] = data
      if (field === 'arquivo_dados') {
        upd.arquivo_nome = body.filename || ''
      }
      const { error } = await getSupabase().from(table).update(upd).eq('id', id)
      if (error) return json({ ok: false, erro: error.message }, 500)
      await audit(user.id, 'UPLOAD_FILE', table, id, `${field} atualizado`)
      return json({ ok: true })
    }

    // ─── 404 ─────────────────────────────────────────────────────────────
    return json({ ok: false, erro: 'Rota nao encontrada' }, 404)

  } catch (e) {
    console.error('API Error:', e.message, e.stack)
    return json({ ok: false, erro: 'Erro interno: ' + e.message }, 500)
  }
}

// ─── VERCEL HANDLER (adapter) ─────────────────────────────────────────────
export default async function handler(req, res) {
  console.log(`[VERCEL] ${req.method} ${req.url} start=${Date.now()}`)
  try {
    let rawBody = ''
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {})
    }

    const slug = req.query?.path || req.query?.slug
    let apiPath = Array.isArray(slug) ? slug.join('/') : (slug || '')

    if (!apiPath && req.url) {
      const urlPath = req.url.split('?')[0]
      const cleaned = urlPath.replace(/^\/api\//, '').replace(/^\/+/, '')
      if (cleaned && !cleaned.includes('.')) apiPath = cleaned
    }

    console.log('[VERCEL] slug:', slug, 'apiPath:', apiPath, 'url:', req.url, 'query:', JSON.stringify(req.query))

    const event = {
      path: '/api/' + (apiPath || ''),
      httpMethod: req.method,
      headers: req.headers,
      body: rawBody || null,
      queryStringParameters: req.query || {},
      _rawParsedBody: typeof req.body === 'object' ? req.body : null
    }

    const result = await vercelHandler(event)

    if (result.headers) {
      for (const [k, v] of Object.entries(result.headers)) {
        if (k.toLowerCase() !== 'content-type') res.setHeader(k, v)
      }
    }

    const contentType = result.headers?.['Content-Type'] || 'application/json'
    res.setHeader('Content-Type', contentType)

    return res.status(result.statusCode || 200).send(result.body)

  } catch (e) {
    console.error('Vercel Adapter Error:', e.message, e.stack)
    return res.status(500).json({ ok: false, erro: 'Erro interno: ' + e.message })
  }
}
