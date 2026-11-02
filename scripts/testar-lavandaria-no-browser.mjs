/**
 * A lavandaria desenhada a sério num browser.
 *
 * Correr:  node scripts/testar-lavandaria-no-browser.mjs
 * Fica em .render-lav/ : catalogo.png, nova.png, corrigir.png
 *
 * Três coisas mudaram de uma vez — a página passou para o Housekeeping, a
 * tabela de peças deixou de ser fechada, e uma fatura já gravada passou a
 * poder ser corrigida. É código a mais para confiar em ler.
 *
 * Os nomes das peças são os verdadeiros, duplicados incluídos, porque é contra
 * eles que o aviso de parecença tem de disparar.
 */
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const TMP = '.render-lav'
const PORTA = 4483

const DUPLO = `
const ARTIGOS = [
  { nome:'Banho LJF XL branca', seccao:'alojamento', conta_para_quarto:true },
  { nome:'Fronha Classica branca 46x71', seccao:'alojamento', conta_para_quarto:true },
  { nome:'Lençol Classico 200x320', seccao:'alojamento', conta_para_quarto:true },
  { nome:'Guardanapos', seccao:'restauracao', conta_para_quarto:false },
  { nome:'Acondicionamento', seccao:'outros', conta_para_quarto:false },
]
const PERIODOS = [{
  id:'f1', hotel_id:'h1', numero:'FT 2026/114',
  periodo_inicio:'2026-10-05', periodo_fim:'2026-10-11',
  quartos:420, total_com_iva:1230.45, nota:null, dias:7,
  sub_alojamento:900.10, pecas_alojamento:1680, sub_restauracao:100.00,
  total_sem_iva:1000.10, custo_quarto:2.38, pecas_quarto:4.0,
}]
const LINHAS = [
  { id:'l1', fatura_id:'f1', artigo:'Lençol Classico 200x320', quantidade:420, valor:500.10 },
  { id:'l2', fatura_id:'f1', artigo:'Banho LJF XL branca', quantidade:1260, valor:400.00 },
  { id:'l3', fatura_id:'f1', artigo:'Guardanapos', quantidade:200, valor:100.00 },
  // uma peca que ficou fora do catalogo: tem de se ver que esta orfa
  { id:'l4', fatura_id:'f1', artigo:'Fronha Clássica branca 46x71', quantidade:90, valor:33.00 },
]
const resposta = (data) => Promise.resolve({ data, error: null })
function builder(t) {
  const dados = () => {
    if (t === 'user_roles') return [{ role: 'hsk' }]
    if (t === 'profiles') return { full_name:'Ana Mourão', senha_temporaria:false }
    if (t === 'hotels') return [{ id:'h1', name:'chic&basic Gravity', slug:'gravity', active:true }]
    if (t === 'v_lav_periodos') return PERIODOS
    if (t === 'lav_artigos') return ARTIGOS
    if (t === 'lav_linhas') return LINHAS
    if (t === 'hsk_reports') return []
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
  rpc: () => resposta(null),
  auth: {
    getSession: () => resposta({ session: { user: { id:'u1', email:'ana.opo@hotmail.com' } } }),
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

async function abrir(w = 1280, h = 1000) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'pt-PT' })
  const p = await ctx.newPage()
  await p.goto(`http://localhost:${PORTA}/#/lavandaria`)
  await p.waitForFunction(() => !document.body.innerText.includes('A carregar')
    && !document.body.innerText.includes('A iniciar'), null, { timeout: 15000 })
  await p.waitForTimeout(400)
  return { ctx, p }
}

console.log('\na pagina mudou de casa')
{
  const { ctx, p } = await abrir()
  const t = await p.innerText('body')
  conferir('abre a lavandaria', /Histórico de períodos/.test(t))
  // o separador aceso tem de ser o Housekeeping, e nao as Contas
  const aceso = await p.evaluate(() => {
    const n = [...document.querySelectorAll('nav')].find(x => x.className.includes('bg-slate-100'))
    return [...(n?.querySelectorAll('button') ?? [])]
      .find(b => b.className.includes('bg-white'))?.textContent?.trim()
  })
  conferir('o separador aceso e o Housekeeping', aceso === 'Housekeeping', String(aceso))
  // e a Lavandaria tem de estar na fila de paginas do Housekeeping
  const paginas = await p.evaluate(() =>
    [...document.querySelectorAll('a')].map(a => a.textContent?.trim()))
  conferir('a Lavandaria esta nas paginas do HSK', paginas.includes('Lavandaria'),
    JSON.stringify(paginas))
  conferir('e a Produção do mês tambem', paginas.includes('Produção do mês'))
  await ctx.close()
}

console.log('\no catalogo de pecas')
{
  const { ctx, p } = await abrir()
  await p.getByRole('button', { name: 'Peças', exact: true }).click()
  await p.waitForTimeout(300)
  const t = await p.innerText('body')
  conferir('abre com as pecas todas', /Banho LJF XL branca/.test(t) && /Guardanapos/.test(t))
  conferir('avisa do que a seccao faz ao historico', /muda números de 2021/.test(t))
  // escrever um nome que ja existe com outro acento tem de avisar
  await p.getByPlaceholder('nome como vem na fatura').fill('Lençol Clássico 200x320')
  await p.waitForTimeout(250)
  const t2 = await p.innerText('body')
  conferir('avisa que o nome ja existe escrito de outra maneira',
    /Já existe .*Lençol Classico 200x320/s.test(t2))
  await p.screenshot({ path: join(TMP, 'catalogo.png'), fullPage: true })
  await ctx.close()
}

console.log('\nacrescentar uma peca a fatura nova')
{
  const { ctx, p } = await abrir()
  await p.getByRole('button', { name: '+ Adicionar fatura' }).click()
  await p.waitForTimeout(300)
  const antes = await p.locator('input[list="lav-artigos"]').count()
  await p.getByRole('button', { name: '+ Acrescentar peça' }).click()
  await p.waitForTimeout(200)
  const depois = await p.locator('input[list="lav-artigos"]').count()
  conferir('o botao acrescenta mesmo uma linha', depois === antes + 1, `${antes} -> ${depois}`)
  // e a linha nova aceita um nome que nao esta no catalogo
  await p.locator('input[list="lav-artigos"]').last().fill('Toalha de piscina nova')
  await p.waitForTimeout(200)
  const t = await p.innerText('body')
  conferir('aceita uma peca que nao existe no catalogo',
    !/Já existe .*Toalha de piscina/.test(t))
  await p.screenshot({ path: join(TMP, 'nova.png'), fullPage: true })
  await ctx.close()
}

console.log('\ncorrigir uma fatura ja gravada')
{
  const { ctx, p } = await abrir()
  // o detalhe abre pelo «ver» no fim da linha, e nao pelo numero da fatura
  await p.getByRole('button', { name: 'ver', exact: true }).first().click()
  await p.waitForTimeout(300)
  let t = await p.innerText('body')
  conferir('abre o detalhe', /Lençol Classico 200x320/.test(t))
  // a peca orfa tem de se ver, porque conta como alojamento sem ninguem saber
  conferir('marca a peca que esta fora do catalogo', /fora do catálogo/.test(t))
  conferir('comeca fechado, so de leitura',
    (await p.locator('input[list="lav-artigos"]').count()) === 0)

  await p.getByRole('button', { name: 'Corrigir' }).click()
  await p.waitForTimeout(300)
  conferir('o botao Corrigir abre os campos',
    (await p.locator('input[list="lav-artigos"]').count()) === 4)
  t = await p.innerText('body')
  conferir('da para acrescentar uma peca aqui tambem', /\+ Acrescentar peça/.test(t))
  conferir('e mostra o que vai dar por quarto', /\/quarto/.test(t))
  await p.screenshot({ path: join(TMP, 'corrigir.png'), fullPage: true })
  await ctx.close()
}

console.log('\no telemovel')
{
  const { ctx, p } = await abrir(390, 844)
  const largo = await p.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  conferir('a pagina nao desliza ao lado', !largo)
  await ctx.close()
}

await browser.close()
servidor.close()
console.log(`\n${avisos} aviso(s). Imagens em ${TMP}/`)
process.exit(avisos ? 1 : 0)
