/**
 * O quadro do dia no painel de F&B, desenhado a sério num browser.
 *
 * Correr:  node scripts/testar-fb-no-browser.mjs
 * Fica em .render-fb/ : desktop.png, telemovel.png
 *
 * Os dias são reais, do Gravity, escolhidos pelos casos que desmancham um
 * quadro destes:
 *
 *   15/10  um dia normal, com os dois anos cheios
 *   10/10  um dia só com pequenos-almoços — cinco serviços a zero
 *   17/10  o bar faturou 226,65 € com ZERO covers: o ticket médio não existe
 *   28/10  ainda não aconteceu: homólogo cheio e este ano vazio. É o caso que
 *          mostrava sete variações de −100% antes de haver guarda.
 */
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const TMP = '.render-fb'
const PORTA = 4481

/* ---------------------------------------------------- dados verdadeiros */
const D = (d, dow, bData, aEur, aPax, bEur, bPax) => ({ d, dow, bData, aEur, aPax, bEur, bPax })
const DIARIO = [
  D('2026-10-10', 6, '2025-10-11',
    [1190.53, 17.67, 0, 0, 0, 0, 0], [115, 130, 0, 0, 0, 0, 0],
    [1057.17, 28.78, 810.72, 2080.45, 680.83, 14.00, 325.00], [103, 122, 29, 70, 52, 4, 9]),
  D('2026-10-15', 4, '2025-10-16',
    [990.64, 35.39, 112.20, 2116.20, 150.60, 36.00, 0], [97, 120, 4, 69, 24, 10, 0],
    [976.32, 39.41, 202.80, 1587.80, 292.05, 40.00, 29.00], [96, 120, 9, 54, 36, 10, 0]),
  D('2026-10-17', 6, '2025-10-18',
    [968.64, 12.32, 126.50, 3127.65, 226.65, 128.50, 44.50], [95, 112, 4, 106, 0, 16, 0],
    [1068.17, 16.12, 435.70, 2814.50, 314.90, 33.50, 480.00], [104, 122, 16, 96, 33, 8, 12]),
  D('2026-10-27', 2, '2025-10-28',
    [978.45, 85.92, 108.90, 968.30, 110.95, 68.50, 0], [95, 128, 6, 34, 19, 14, 0],
    [872.86, 13.39, 316.00, 676.55, 185.10, 53.00, 0], [86, 89, 18, 21, 28, 12, 0]),
  // ainda nao aconteceu
  D('2026-10-28', 3, '2025-10-29', null, null,
    [815.33, 20.38, 290.60, 1014.90, 191.81, 91.50, 0], [80, 84, 16, 35, 19, 16, 0]),
  D('2026-10-29', 4, '2025-10-30', null, null,
    [747.50, 12.40, 134.30, 812.65, 128.35, 40.50, 10.00], [74, 80, 8, 26, 9, 13, 0]),
]
const PERIODO = {
  aEur: [27092.42, 826.91, 5854.11, 36228.08, 6579.90, 1531.35, 726.00],
  aPax: [2630, 3377, 271, 1212, 684, 277, 14],
  bEur: [27768.93, 606.99, 9765.17, 45020.52, 8216.02, 1315.20, 3517.20],
  bPax: [2723, 3230, 438, 1481, 840, 276, 99],
}
const PAYLOAD = {
  ate: '2026-10-27', alinhado: true, mesAtual: 10, anoAtual: 2026,
  periodo: PERIODO, acumulado: PERIODO,
  mensal: Array.from({ length: 12 }, (_, i) => ({
    m: i + 1, aEur: PERIODO.aEur, aPax: PERIODO.aPax,
    bEur: PERIODO.bEur, bPax: PERIODO.bPax })),
  semana: Array.from({ length: 7 }, (_, i) => ({
    dow: i + 1, aEur: PERIODO.aEur, aPax: PERIODO.aPax,
    bEur: PERIODO.bEur, bPax: PERIODO.bPax })),
  diario: DIARIO, off: [], offNomes: [],
}

const DUPLO = `
const PAYLOAD = ${JSON.stringify(PAYLOAD)}
const resposta = (data) => Promise.resolve({ data, error: null })
function builder(tabela) {
  const dados = () => {
    if (tabela === 'user_roles') return [{ role: 'admin' }]
    if (tabela === 'profiles') return { full_name: 'Diogo', senha_temporaria: false }
    if (tabela === 'hotels') return [{ id:'h1', name:'chic&basic Gravity', slug:'gravity', active:true }]
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
  rpc: () => resposta(PAYLOAD),
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

let avisos = 0
const conferir = (nome, cond, det = '') => {
  if (cond) console.log(`  . ${nome}`)
  else { avisos++; console.log(`  x ${nome} ${det}`) }
}

async function abrir(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'pt-PT' })
  const p = await ctx.newPage()
  await p.goto(`http://localhost:${PORTA}/#/fb-painel`)
  await p.waitForFunction(() => !document.body.innerText.includes('A carregar')
    && !document.body.innerText.includes('A iniciar'), null, { timeout: 15000 })
  await p.waitForTimeout(400)
  return { ctx, p }
}

/** Clica na barra n do gráfico do dia a dia (o terceiro BarrasAno da página). */
async function clicarDia(p, i) {
  await p.evaluate(n => {
    const svgs = [...document.querySelectorAll('svg')]
    const svg = svgs[svgs.length - 2]        // o do dia a dia; o último é a semana
    const gs = [...svg.querySelectorAll('g')].filter(g => g.querySelector('rect'))
    gs[n]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }, i)
  await p.waitForTimeout(300)
}

console.log('\nantes de clicar')
{
  const { ctx, p } = await abrir(1280, 1000)
  const t = await p.innerText('body')
  conferir('convida a clicar num dia', /Clica num dia no gráfico/.test(t))
  conferir('nao inventa um dia', !/o mesmo dia da semana, 52 semanas antes/.test(t))
  await ctx.close()
}

console.log('\num dia normal — 15 de outubro contra 16 de outubro de 2025')
{
  const { ctx, p } = await abrir(1280, 1400)
  await clicarDia(p, 1)
  const t = await p.innerText('body')
  conferir('diz o dia e o homologo',
    /Quinta.*15 de outubro de 2026/s.test(t) && /16 de outubro de 2025/.test(t))
  // os totais calculados a mao: 3441,03 contra 3167,38 -> +8,6%
  conferir('o total deste ano', t.includes('3441') || t.includes('3.441'), t.slice(0, 0))
  conferir('o total do homologo', t.includes('3167') || t.includes('3.167'))
  conferir('a variacao da faturacao', /\+8,6%/.test(t))
  conferir('a variacao dos covers', /−0,3%/.test(t))
  conferir('o ticket medio do total', /10,62/.test(t))
  conferir('os sete servicos aparecem',
    ['Pequeno-almoço', 'VIPs + Lanche', 'Almoço', 'Jantar', 'Bar', 'Happy Hour', 'Outros']
      .every(s => t.includes(s)))
  await p.screenshot({ path: join(TMP, 'desktop.png'), fullPage: true })
  await ctx.close()
}

console.log('\num dia que ainda nao aconteceu — 28 de outubro')
{
  const { ctx, p } = await abrir(1280, 1400)
  await clicarDia(p, 4)
  const t = await p.innerText('body')
  conferir('diz que ainda nao ha faturacao', /Ainda não há faturação lançada/.test(t))
  // a armadilha: sem guarda, isto mostrava sete linhas a −100%
  conferir('NAO mostra variacoes de -100%', !/−100,0%/.test(t))
  conferir('mas diz o que o homologo fez', /No homólogo/.test(t))
  await ctx.close()
}

console.log('\num servico que faturou sem covers — o bar a 17 de outubro')
{
  const { ctx, p } = await abrir(1280, 1400)
  await clicarDia(p, 2)
  const t = await p.innerText('body')
  conferir('a pagina aguenta covers a zero', /17 de outubro de 2026/.test(t))
  // 226,65 € com 0 covers. A faturacao mostra-se sem decimais — 227 € — e o
  // ticket medio NAO existe: tem de ser um travessao e nao zero nem infinito.
  // A pagina tem duas tabelas com uma linha «Bar»: a do periodo, la em cima, e
  // a do dia. Sem limitar ao cartao certo, o teste lia a do periodo e passava
  // a verificar outra coisa qualquer.
  const bar = await p.evaluate(() => {
    // «52 semanas antes» tambem aparece no cartao do grafico, que vem primeiro
    // e nao tem tabela nenhuma. Por isso procura-se pelo cartao com tabela que
    // fala de um dia concreto.
    const cartao = [...document.querySelectorAll('.card')]
      .filter(c => c.querySelector('table') && /de outubro de 2026/.test(c.textContent ?? ''))
      .pop()
    if (!cartao) return null
    const tr = [...cartao.querySelectorAll('tr')]
      .find(r => r.cells[0]?.textContent?.trim() === 'Bar')
    return tr ? [...tr.cells].map(c => c.textContent.trim()) : null
  })
  conferir('encontra a linha do Bar', bar != null, String(bar))
  conferir('a faturacao do bar, arredondada', bar?.[1]?.includes('227'), String(bar?.[1]))
  conferir('zero covers escreve-se 0', bar?.[4] === '0', String(bar?.[4]))
  conferir('e o ticket medio fica travessao', bar?.[7] === '—', String(bar?.[7]))
  await p.screenshot({ path: join(TMP, 'bar-sem-covers.png'), fullPage: true })
  await ctx.close()
}

console.log('\no telemovel')
{
  const { ctx, p } = await abrir(390, 844)
  await clicarDia(p, 1)
  await p.screenshot({ path: join(TMP, 'telemovel.png'), fullPage: true })
  const largo = await p.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  conferir('a pagina nao desliza ao lado', !largo)
  const t = await p.innerText('body')
  conferir('ha botoes de metrica', /Faturação/.test(t) && /Covers/.test(t))
  await ctx.close()
}

await browser.close()
servidor.close()
console.log(`\n${avisos} aviso(s). Imagens em ${TMP}/`)
process.exit(avisos ? 1 : 0)
