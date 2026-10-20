/**
 * Monta a app a sério num browser e vai ver o que cada papel alcança.
 *
 * Correr:  node scripts/testar-acesso-no-browser.mjs
 *
 * POR QUE É QUE ISTO EXISTE
 *
 * Os outros testes leem o código e confirmam que a regra está escrita. Este
 * abre a app, escreve o endereço à mão e vê o que acontece — que é a única
 * forma de provar o que importa numa permissão. Nesta app já aconteceu o
 * contrário: os horários foram fechados no menu e continuaram a abrir a quem
 * escrevesse `#/horarios`, porque esconder a entrada não é fechar a porta.
 *
 * COMO FUNCIONA
 *
 * Copia o `src` para uma pasta temporária DENTRO do projeto (para o esbuild
 * encontrar o node_modules), troca `lib/supabase.ts` por um duplo que devolve
 * a sessão e os papéis que o teste quiser, e serve o resultado ao Chromium.
 * Não toca na base de dados nem na app publicada.
 *
 * A outra metade da permissão — as políticas de RLS — não se vê daqui: está em
 * sql/acesso-checklist.sql, com a consulta que a confirma no fim.
 */
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const TMP = '.render-acesso'
const PORTA = 4477

/* ---------------------------------------------------------------- montar */

const DUPLO = `
const PAPEIS = globalThis.__PAPEIS__ ?? ['fb_checklist']
const resposta = (data) => Promise.resolve({ data, error: null })
function builder(tabela) {
  const dados = () => {
    if (tabela === 'user_roles') return PAPEIS.map(role => ({ role }))
    if (tabela === 'profiles') return { full_name: 'Conta de teste', senha_temporaria: false }
    if (tabela === 'hotels') return [{ id: 'h1', name: 'Gravity', active: true }]
    return []
  }
  const b = {
    select: () => b, eq: () => b, in: () => b, neq: () => b, is: () => b,
    gte: () => b, lte: () => b, order: () => b, limit: () => b,
    maybeSingle: () => resposta(dados()), single: () => resposta(dados()),
    then: (f) => resposta(dados()).then(f),
    insert: () => b, update: () => b, upsert: () => b, delete: () => b,
  }
  return b
}
export const supabase = {
  from: (t) => builder(t),
  auth: {
    getSession: () => resposta({ session: { user: { id: 'u1', email: 'teste@exemplo.pt' } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: () => resposta(null),
    mfa: { getAuthenticatorAssuranceLevel: () => resposta({ currentLevel: 'aal1', nextLevel: 'aal1' }) },
  },
  storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
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
writeFileSync(join(TMP, 'index.html'),
  '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="app.js"></script>')

const tipos = { '.html': 'text/html', '.js': 'text/javascript' }
const servidor = createServer((req, res) => {
  const p = req.url === '/' ? '/index.html' : req.url.split('?')[0]
  try {
    const b = readFileSync(join(TMP, p))
    res.writeHead(200, { 'content-type': tipos[p.slice(p.lastIndexOf('.'))] ?? 'text/plain' })
    res.end(b)
  } catch { res.writeHead(404); res.end('nao ha') }
})
await new Promise(r => servidor.listen(PORTA, r))

// O playwright está instalado fora do projeto, e o caminho muda de máquina
// para máquina — por isso pergunta-se, em vez de se escrever à mão.
const exigir = createRequire(import.meta.url)
let chromium
try {
  chromium = exigir('playwright').chromium
} catch {
  chromium = exigir('/opt/npm-tools/node_modules/playwright/index.js').chromium
}
const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})

/* ---------------------------------------------------------------- testar */

let feitos = 0, falhas = 0
function ok(nome, obtido, esperado) {
  feitos++
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) {
    falhas++
    console.log(`  x ${nome}: esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(obtido)}`)
  } else console.log(`  . ${nome}`)
}

async function abrir(papeis, hash) {
  const pagina = await browser.newPage()
  await pagina.addInitScript(`globalThis.__PAPEIS__ = ${JSON.stringify(papeis)}`)
  await pagina.goto(`http://localhost:${PORTA}/#${hash}`)
  await pagina.waitForFunction(
    () => !document.body.innerText.includes('A iniciar'), null, { timeout: 15000 })
  await pagina.waitForTimeout(350)
  return pagina
}
const onde = async (papeis, hash) => {
  const p = await abrir(papeis, hash)
  const h = new URL(p.url()).hash
  await p.close()
  return h
}

console.log('\nfb_checklist: o endereco escrito a mao nao abre nada')
for (const e of ['/', '/caixa', '/horarios', '/utilizadores', '/grupos', '/stock',
                 '/turno', '/turno-historico', '/fb', '/fb-painel', '/fb-pa',
                 '/rh', '/rh-custos', '/lavandaria', '/entrada', '/hk-mes', '/eventos',
                 '/hk-mapa', '/itens', '/dados', '/contagem', '/parque']) {
  ok(`${e} vai dar a checklist`, await onde(['fb_checklist'], e), '#/fb-checklist')
}

console.log('\no que essa conta tem de ter')
ok('a checklist abre', await onde(['fb_checklist'], '/fb-checklist'), '#/fb-checklist')
// a conta propria e dela: e onde muda a palavra-passe e liga o autenticador,
// e a base de dados so lhe da a sua propria linha
ok('a conta propria abre', await onde(['fb_checklist'], '/conta'), '#/conta')

console.log('\no cabecalho nao oferece o que ela nao tem')
{
  const pagina = await abrir(['fb_checklist'], '/fb-checklist')
  const texto = await pagina.innerText('body')
  ok('sem «Trocar de departamento»', texto.includes('Trocar de departamento'), false)
  for (const rotulo of ['Início', 'Stock', 'Housekeeping', 'Contas', 'Front Office',
                        'Recursos Humanos', 'Gestão', 'Turno']) {
    ok(`sem separador «${rotulo}»`, texto.includes(rotulo), false)
  }
  ok('mostra a checklist', /[Cc]hecklist/.test(texto), true)
  ok('mostra o hotel', texto.includes('Gravity'), true)
  ok('sem barras de navegacao de modulos', await pagina.locator('nav').count(), 0)
  await pagina.close()
}

console.log('\nos outros papeis nao perderam nada — e esta e a parte que pode falhar')
ok('fb entra na faturacao', await onde(['fb'], '/fb'), '#/fb')
ok('fb entra no turno', await onde(['fb'], '/turno'), '#/turno')
ok('fo entra nos grupos', await onde(['fo'], '/grupos'), '#/grupos')
ok('fo entra na sala de eventos', await onde(['fo'], '/eventos'), '#/eventos')
ok('fb entra na sala de eventos', await onde(['fb'], '/eventos'), '#/eventos')
ok('hsk entra na producao do mes', await onde(['hsk'], '/hk-mes'), '#/hk-mes')
ok('financeiro entra na caixa', await onde(['financeiro'], '/caixa'), '#/caixa')
ok('rh entra nas pessoas', await onde(['rh'], '/rh'), '#/rh')
ok('admin entra nos utilizadores', await onde(['admin'], '/utilizadores'), '#/utilizadores')
// o papel pequeno nao pode castigar quem o recebe por cima do que ja tinha
ok('fb + fb_checklist continua a ser fb',
  await onde(['fb', 'fb_checklist'], '/turno'), '#/turno')
ok('admin + fb_checklist continua admin',
  await onde(['admin', 'fb_checklist'], '/utilizadores'), '#/utilizadores')

console.log('\ne quem nao tem papel nenhum tambem nao entra pela checklist')
// roles vazio nao e «so checklist»: e uma conta sem permissoes, que a app
// trata noutro sitio. O que nao pode e cair na porta pequena por omissao.
ok('sem papeis, a checklist nao e a casa', await onde([], '/caixa'), '#/')

await browser.close()
servidor.close()
rmSync(TMP, { recursive: true, force: true })
console.log(`\n${feitos} verificacoes, ${falhas} falha(s)`)
process.exit(falhas ? 1 : 0)
