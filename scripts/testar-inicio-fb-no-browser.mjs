/**
 * O quadro de F&B do Início, desenhado a sério num browser.
 *
 * Correr:  TZ=Europe/Lisbon node scripts/testar-inicio-fb-no-browser.mjs
 * Fica em .render-inicio/ : desktop.png, telemovel.png
 *
 * O que só um browser prova:
 *
 *  - que a última coluna é **ontem** e que hoje não aparece. É a regra toda do
 *    quadro, e é texto calculado em tempo de execução: nenhum teste de unidade
 *    a vê, porque depende do relógio de quem abre a página.
 *  - que o quadro tem mesmo as oito linhas de serviço e a linha de totais, com
 *    nove colunas de dados. Uma grelha com uma coluna a menos continua a
 *    compilar e mostra os dias debaixo do cabeçalho errado.
 *  - que no telemóvel a página não desliza ao lado. A tabela tem 980px de
 *    largura mínima e desliza dentro do seu próprio contentor; se esse
 *    contentor falhasse, arrastava a página inteira.
 *
 * Os números são de uma semana real do Gravity, com o fim-de-semana por lançar
 * — o caso que tem de mostrar traços e não zeros.
 */
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const TMP = '.render-inicio'
const PORTA = 4482

/* ------------------------------------------- os sete dias, a contar de hoje */
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-`
  + String(d.getDate()).padStart(2, '0')
const maisDias = (base, n) => {
  const d = new Date(base); d.setDate(d.getDate() + n); return d
}
const HOJE = new Date()
const DIAS = Array.from({ length: 7 }, (_, i) => iso(maisDias(HOJE, i - 7)))  // -7 … -1
const ONTEM = DIAS[6]
const HOJE_ISO = iso(HOJE)

/* Cinco dias lançados e dois por lançar, como uma semana a meio. */
const L = (d, coluna, pax, eur) =>
  ({ report_date: d, coluna, total_pax: pax, total_eur: eur, ins: pax, outs: 0,
     id: `${d}-${coluna}`, hotel_id: 'h1' })
const FB_NUMBERS = [
  L(DIAS[0], 'pequeno_almoco', 84, 871.41), L(DIAS[0], 'jantar', 20, 590.65),
  L(DIAS[0], 'bar', 22, 85.05),
  L(DIAS[1], 'pequeno_almoco', 90, 952.58), L(DIAS[1], 'jantar', 31, 943.02),
  L(DIAS[1], 'bar', 29, 183.85),
  L(DIAS[2], 'pequeno_almoco', 84, 869.75), L(DIAS[2], 'jantar', 27, 942.85),
  L(DIAS[2], 'bar', 36, 400.50),
  L(DIAS[3], 'pequeno_almoco', 92, 954.43), L(DIAS[3], 'jantar', 42, 1606.20),
  L(DIAS[3], 'bar', 34, 296.30),
  // o dia de ontem traz tudo, para a última coluna não ser a vazia
  L(DIAS[6], 'pequeno_almoco', 80, 820.00), L(DIAS[6], 'jantar', 25, 700.00),
  // DIAS[4] e DIAS[5] ficam por lançar de propósito
]
const TOTAL_PAX = FB_NUMBERS.reduce((a, l) => a + l.total_pax, 0)
const TOTAL_EUR = Math.round(FB_NUMBERS.reduce((a, l) => a + l.total_eur, 0) * 100) / 100

const DUPLO = `
const FB_NUMBERS = ${JSON.stringify(FB_NUMBERS)}
const resposta = (data, count = null) => Promise.resolve({ data, error: null, count })
function builder(tabela) {
  const dados = () => {
    if (tabela === 'user_roles') return [{ role: 'admin' }]
    if (tabela === 'profiles') return { full_name: 'Diogo', senha_temporaria: false }
    if (tabela === 'hotels') return [{ id:'h1', name:'chic&basic Gravity', slug:'gravity', active:true }]
    if (tabela === 'fb_numbers') return FB_NUMBERS
    return []
  }
  const b = {
    select: () => b, eq: () => b, in: () => b, neq: () => b, is: () => b,
    gte: () => b, lte: () => b, lt: () => b, gt: () => b, or: () => b,
    order: () => b, limit: () => b,
    maybeSingle: () => resposta(dados()), single: () => resposta(dados()),
    then: (f) => resposta(dados(), 0).then(f),
    insert: () => b, update: () => b, upsert: () => b, delete: () => b,
  }
  return b
}
export const supabase = {
  from: (t) => builder(t),
  rpc: () => resposta(null),
  auth: {
    getSession: () => resposta({ session: { user: { id:'u1', email:'diogo@chicandbasic.com' } } }),
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
execFileSync('npx', ['@tailwindcss/cli', '-i', 'src/index.css',
  '-o', join(TMP, 'app.css'), '--content', './src/**/*.tsx'], { stdio: 'inherit' })
writeFileSync(join(TMP, 'index.html'),
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<link rel="stylesheet" href="app.css"><div id="root"></div><script src="app.js"></script>')

const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
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

let avisos = 0
const conferir = (nome, cond, det = '') => {
  if (cond) console.log(`  . ${nome}`)
  else { avisos++; console.log(`  x ${nome} ${det}`) }
}

async function abrir(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'pt-PT' })
  const p = await ctx.newPage()
  await p.goto(`http://localhost:${PORTA}/#/`)
  await p.waitForFunction(() => !document.body.innerText.includes('A carregar')
    && !document.body.innerText.includes('A iniciar'), null, { timeout: 15000 })
  await p.waitForTimeout(400)
  return { ctx, p }
}

/** A grelha do quadro de F&B, como texto, linha a linha. */
const lerQuadro = p => p.evaluate(() => {
  const cartao = [...document.querySelectorAll('.card')]
    .find(c => /F&B — últimos 7 dias/.test(c.textContent ?? ''))
  if (!cartao) return null
  const tabela = cartao.querySelector('table')
  if (!tabela) return null
  return {
    cabecalho: [...tabela.querySelectorAll('thead th')].map(c => c.textContent.trim()),
    linhas: [...tabela.querySelectorAll('tbody tr')]
      .map(r => [...r.cells].map(c => c.textContent.trim())),
  }
})

const dm = s => `${s.slice(8, 10)}/${s.slice(5, 7)}`

console.log('\no quadro no ecra grande')
{
  const { ctx, p } = await abrir(1280, 1600)
  const q = await lerQuadro(p)
  conferir('o cartao existe', q != null)
  conferir('tem nove colunas (serviço + 7 dias + total)', q?.cabecalho.length === 9,
    String(q?.cabecalho.length))
  // A regra toda do quadro: acaba ontem.
  conferir('a ultima coluna de dia e ontem', q?.cabecalho[7]?.includes(dm(ONTEM)),
    `${q?.cabecalho[7]} vs ${dm(ONTEM)}`)
  conferir('hoje NAO aparece', !q?.cabecalho.some(c => c.includes(dm(HOJE_ISO))),
    `hoje e ${dm(HOJE_ISO)}`)
  conferir('a coluna do total chama-se «7 dias»', q?.cabecalho[8] === '7 dias', q?.cabecalho[8])

  conferir('tem as oito linhas de servico mais o total', q?.linhas.length === 9,
    String(q?.linhas.length))
  conferir('mantem a ordem dos servicos',
    JSON.stringify(q?.linhas.map(l => l[0])) === JSON.stringify([
      'Pequeno-almoço', 'Pensões', 'Delivery (Bolt/UBER)', 'Room Service',
      'Almoço', 'Jantar', 'Bar', 'VIPS + Lanche', 'Total dia']),
    JSON.stringify(q?.linhas.map(l => l[0])))

  const pa = q?.linhas[0]
  conferir('o primeiro dia do pequeno-almoco', /84 pax/.test(pa?.[1] ?? ''), pa?.[1])
  conferir('um dia por lancar escreve travessao', pa?.[5] === '—', pa?.[5])
  const pensoes = q?.linhas[1]
  conferir('um servico sem nada e so travessoes',
    pensoes?.slice(1, 8).every(c => c === '—'), JSON.stringify(pensoes))

  const total = q?.linhas[8]
  conferir('o total geral traz os pax certos', total?.[8]?.includes(`${TOTAL_PAX} pax`),
    `${total?.[8]} — esperado ${TOTAL_PAX} pax`)
  // A célula traz as duas linhas coladas — «696 pax10 216,59 €». O dinheiro é
  // o que vem depois de «pax»; limpar a célula inteira dava 69610216,59.
  const euros = Number(((total?.[8] ?? '').split('pax')[1] ?? '')
    .replace(/[^\d,]/g, '').replace(',', '.'))
  conferir('o total geral traz o dinheiro certo', Math.abs(euros - TOTAL_EUR) < 0.5,
    `${euros} vs ${TOTAL_EUR}`)

  conferir('cada dia liga ao relatorio desse dia',
    await p.evaluate(d => {
      const cartao = [...document.querySelectorAll('.card')]
        .find(c => /F&B — últimos 7 dias/.test(c.textContent ?? ''))
      return [...cartao.querySelectorAll('thead a')].some(a => a.getAttribute('href')?.includes(`/turno/${d}`))
    }, ONTEM))

  await p.screenshot({ path: join(TMP, 'desktop.png'), fullPage: true })
  await ctx.close()
}

console.log('\no telemovel')
{
  const { ctx, p } = await abrir(390, 844)
  const q = await lerQuadro(p)
  conferir('o quadro tambem la esta', q != null && q.linhas.length === 9)
  const largo = await p.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  conferir('a pagina nao desliza ao lado', !largo)
  await p.screenshot({ path: join(TMP, 'telemovel.png'), fullPage: true })
  await ctx.close()
}

await browser.close()
servidor.close()
console.log(`\n${avisos} aviso(s). Imagens em ${TMP}/`)
process.exit(avisos ? 1 : 0)
