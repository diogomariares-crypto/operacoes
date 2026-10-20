/**
 * Desenha a Sala de eventos a sério num browser e fotografa-a.
 *
 * Correr:  node scripts/testar-sala-no-browser.mjs
 * Fica em .render-sala/ : desktop.png, telemovel.png, formulario.png
 *
 * Os testes de `testar-eventos.mjs` provam as contas; este prova o desenho, que
 * é outra coisa. Uma barra pode estar na fracção certa e na mesma sair do
 * cartão, ficar com dois pixels de altura ou tapar a do lado — e isso só se vê
 * olhando.
 *
 * Carrega com os casos que desmancham a faixa: dois eventos no mesmo dia, um a
 * passar da meia-noite, um que começa às 00:30 (e que por isso pertence à
 * coluna da véspera) e um cancelado, que não pode ocupar nada.
 */
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const TMP = '.render-sala'
const PORTA = 4478

const DUPLO = `
const H = (dia, hora) => {
  const [a,m,d] = dia.split('-').map(Number)
  const [hh,mi] = hora.split(':').map(Number)
  return new Date(a, m-1, d, hh, mi).toISOString()
}
const ESPACO = {
  id:'s1', hotel_id:'h1', nome:'Sala Douro', capacidade:80,
  abre:'08:00:00', fecha:'01:00:00', ordem:1, ativo:true,
}
const RESERVAS = [
  { id:'r1', space_id:'s1', cliente:'Reunião — Câmara do Porto', contacto:'222 000 111',
    pax:25, estado:'confirmado', valor:350, necessidades:['projector'], notas:null,
    inicio:H('2026-10-21','14:00'), fim:H('2026-10-21','18:00') },
  { id:'r2', space_id:'s1', cliente:'Aniversário — Sofia Mendes', contacto:'931 447 220',
    pax:45, estado:'confirmado', valor:780, necessidades:['catering','som'], notas:null,
    inicio:H('2026-10-23','19:30'), fim:H('2026-10-23','23:30') },
  // dois no mesmo dia: o que a grelha por dias nao conseguia mostrar
  { id:'r3', space_id:'s1', cliente:'Workshop Nortada', contacto:'geral@nortada.pt',
    pax:18, estado:'pedido', valor:240, necessidades:['projector','coffee break'], notas:null,
    inicio:H('2026-10-24','10:00'), fim:H('2026-10-24','13:00') },
  // passa da meia-noite: tem de chegar ao fundo da coluna do dia 24
  { id:'r4', space_id:'s1', cliente:'Jantar de empresa — Imperium', contacto:'eventos@imperium.pt',
    pax:60, estado:'confirmado', valor:1450, necessidades:['catering','som'], notas:null,
    inicio:H('2026-10-24','20:00'), fim:H('2026-10-25','01:00') },
  // comeca as 00:30: e da noite de 27 para quem esta a trabalhar, e e na
  // coluna do 27 que tem de aparecer, nao na do 28
  { id:'r5', space_id:'s1', cliente:'After party — Nos Primavera', contacto:'—',
    pax:50, estado:'confirmado', valor:600, necessidades:['som'], notas:null,
    inicio:H('2026-10-28','00:30'), fim:H('2026-10-28','03:00') },
  { id:'r6', space_id:'s1', cliente:'Formação interna — Housekeeping', contacto:'—',
    pax:12, estado:'confirmado', valor:null, necessidades:['projector'], notas:null,
    inicio:H('2026-10-29','09:30'), fim:H('2026-10-29','17:00') },
  { id:'r7', space_id:'s1', cliente:'Lançamento — Editora Asa', contacto:'925 110 884',
    pax:70, estado:'pedido', valor:1100, necessidades:['som','catering'], notas:null,
    inicio:H('2026-10-30','18:00'), fim:H('2026-10-30','22:00') },
  // cancelado: nao pode ocupar o dia nem entrar nas contas
  { id:'r8', space_id:'s1', cliente:'Casamento Antunes', contacto:'917 332 018',
    pax:80, estado:'cancelado', valor:null, necessidades:[], notas:null,
    inicio:H('2026-10-31','15:00'), fim:H('2026-10-31','19:00') },
]
const PAPEIS = globalThis.__PAPEIS__ ?? ['fo']
const resposta = (data) => Promise.resolve({ data, error: null })
function builder(tabela) {
  const dados = () => {
    if (tabela === 'user_roles') return PAPEIS.map(role => ({ role }))
    if (tabela === 'profiles') return { full_name:'Receção', senha_temporaria:false }
    if (tabela === 'hotels') return [{ id:'h1', name:'chic&basic Gravity', slug:'gravity', active:true }]
    if (tabela === 'event_spaces') return globalThis.__SEM_SALA__ ? [] : [ESPACO]
    if (tabela === 'event_bookings') return RESERVAS
    return []
  }
  const b = {
    select: () => b, eq: () => b, in: () => b, neq: () => b, is: () => b,
    gte: () => b, lte: () => b, lt: () => b, gt: () => b, or: () => b,
    order: () => b, limit: () => b,
    maybeSingle: () => resposta(dados()), single: () => resposta(dados()),
    then: (f) => resposta(dados()).then(f),
    insert: () => b, update: () => b, upsert: () => b, delete: () => b,
  }
  return b
}
export const supabase = {
  from: (t) => builder(t),
  auth: {
    getSession: () => resposta({ session: { user: { id:'u1', email:'gravity@chicandbasic.com' } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: () => resposta(null),
    mfa: { getAuthenticatorAssuranceLevel: () => resposta({ currentLevel:'aal1', nextLevel:'aal1' }) },
  },
  storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl:'' } }) }) },
}
export const erroDoLink = null
export const sessaoDoLink = Promise.resolve()
`

rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true })
cpSync('src', join(TMP, 'src'), { recursive: true })
writeFileSync(join(TMP, 'src/lib/supabase.ts'), DUPLO)
execFileSync('npx', ['esbuild', join(TMP, 'src/main.tsx'), '--bundle',
  '--format=iife', '--jsx=automatic', '--loader:.css=empty',
  '--define:__APP_VERSION__="teste"', `--outfile=${join(TMP, 'app.js')}`,
  '--log-level=error'], { stdio: 'inherit' })
// o CSS a sério, para o desenho ser o desenho e não HTML cru
execFileSync('npx', ['@tailwindcss/cli', '-i', 'src/index.css',
  '-o', join(TMP, 'app.css'), '--content', './src/**/*.tsx'], { stdio: 'inherit' })
writeFileSync(join(TMP, 'index.html'),
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<link rel="stylesheet" href="app.css"><div id="root"></div><script src="app.js"></script>')

const tipos = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' }
const servidor = createServer((req, res) => {
  const p = req.url === '/' ? '/index.html' : req.url.split('?')[0]
  try {
    const b = readFileSync(join(TMP, p))
    res.writeHead(200, { 'content-type': tipos[p.slice(p.lastIndexOf('.'))] ?? 'text/plain' })
    res.end(b)
  } catch { res.writeHead(404); res.end('nao ha') }
})
await new Promise(r => servidor.listen(PORTA, r))

const exigir = createRequire(import.meta.url)
let chromium
try { chromium = exigir('playwright').chromium }
catch { chromium = exigir('/opt/npm-tools/node_modules/playwright/index.js').chromium }
const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})

async function abrir(largura, altura, antes) {
  const ctx = await browser.newContext({
    viewport: { width: largura, height: altura },
    timezoneId: 'Europe/Lisbon',   // a app conta horas: o fuso faz parte do teste
    locale: 'pt-PT',
  })
  const pagina = await ctx.newPage()
  if (antes) await pagina.addInitScript(antes)
  await pagina.goto(`http://localhost:${PORTA}/#/eventos`)
  await pagina.waitForFunction(
    () => !document.body.innerText.includes('A carregar')
       && !document.body.innerText.includes('A iniciar'), null, { timeout: 15000 })
  await pagina.waitForTimeout(500)
  return { ctx, pagina }
}

let avisos = 0
const conferir = (nome, condicao, detalhe = '') => {
  if (condicao) console.log(`  . ${nome}`)
  else { avisos++; console.log(`  x ${nome} ${detalhe}`) }
}

console.log('\no desenho')
{
  const { ctx, pagina } = await abrir(1280, 900)
  await pagina.screenshot({ path: join(TMP, 'desktop.png'), fullPage: true })

  const texto = await pagina.innerText('body')
  conferir('mostra o nome da sala', texto.includes('Sala Douro'))
  conferir('mostra as horas de abertura', texto.includes('das 08:00 às 01:00'))
  // o cancelado nao conta: 7 reservas ocupam, a oitava esta cancelada
  // innerText devolve o rotulo JA em maiusculas (text-transform), por isso o /i
  conferir('conta 7 eventos e nao 8, porque o cancelado nao ocupa',
    /eventos no período\s*\n\s*7\b/i.test(texto),
    JSON.stringify(texto.match(/eventos no período[\s\S]{0,12}/i)?.[0]))
  conferir('8 dias livres: o cancelado devolveu o dia 31',
    /dias livres\s*\n\s*8\b/i.test(texto),
    JSON.stringify(texto.match(/dias livres[\s\S]{0,12}/i)?.[0]))
  conferir('nao mostra o cancelado na lista', !texto.includes('Casamento Antunes'))

  // as barras: uma por reserva que ocupa, dentro das pistas
  const barras = await pagina.$$eval('[style*="top:"]', els => els.length)
  conferir('ha barras desenhadas', barras > 0, `(${barras})`)

  // a faixa nao pode sair do cartao
  const fuga = await pagina.evaluate(() => {
    const faixa = [...document.querySelectorAll('div')].find(
      d => d.className.includes('overflow-x-auto') && d.className.includes('flex-1'))
    if (!faixa) return 'nao encontrei a faixa'
    const cartao = faixa.closest('.card')
    return faixa.getBoundingClientRect().right <= cartao.getBoundingClientRect().right + 1
      ? null : 'a faixa passa do cartao'
  })
  conferir('a faixa fica dentro do cartao', fuga === null, String(fuga))
  await ctx.close()
}

console.log('\no telemovel')
{
  const { ctx, pagina } = await abrir(390, 844)
  await pagina.screenshot({ path: join(TMP, 'telemovel.png'), fullPage: true })
  const largo = await pagina.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  conferir('a pagina nao desliza ao lado', !largo)
  await ctx.close()
}

console.log('\no formulario')
{
  const { ctx, pagina } = await abrir(1280, 900)
  await pagina.getByText('Jantar de empresa — Imperium').click()
  await pagina.waitForTimeout(400)
  await pagina.screenshot({ path: join(TMP, 'formulario.png') })
  const texto = await pagina.innerText('body')
  conferir('abre com as horas da reserva', texto.includes('Editar reserva'))
  // o jantar passa da meia-noite: o aviso tem de aparecer
  conferir('avisa que acaba no dia seguinte', /Acaba já no dia seguinte/.test(texto))
  await ctx.close()
}

console.log('\nsem sala criada')
{
  const { ctx, pagina } = await abrir(1280, 700, 'globalThis.__SEM_SALA__ = true')
  const texto = await pagina.innerText('body')
  conferir('diz que nao ha espaco em vez de mostrar uma faixa vazia',
    /Não há nenhum espaço de eventos configurado/.test(texto))
  await ctx.close()
}

console.log('\nquem so le nao vê convites para marcar')
{
  const { ctx, pagina } = await abrir(1280, 700, "globalThis.__PAPEIS__ = ['financeiro']")
  const texto = await pagina.innerText('body')
  conferir('sem botao Reservar', !texto.includes('Reservar'))
  conferir('sem a dica de clicar no dia', !texto.includes('clica num dia'))
  conferir('mas vê a sala na mesma', texto.includes('Sala Douro'))
  await ctx.close()
}

await browser.close()
servidor.close()
console.log(`\n${avisos} aviso(s). Imagens em ${TMP}/`)
process.exit(avisos ? 1 : 0)
