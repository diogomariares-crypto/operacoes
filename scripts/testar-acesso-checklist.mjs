/**
 * O acesso `fb_checklist` vê uma página, e mais nada.
 *
 * Correr:  node scripts/testar-acesso-checklist.mjs
 *
 * Este teste existe porque esta permissão falha em silêncio nos dois sentidos:
 *
 *  - se ficar larga de mais, ninguém repara — a pessoa vê uma página que não
 *    devia e nunca se queixa de ver demasiado;
 *  - se ficar apertada de mais, a checklist aparece vazia, o que parece avaria
 *    e não permissão.
 *
 * Por isso percorre-se a lista real de páginas da app (src/lib/modulos.ts) em
 * vez de uma lista escrita à mão aqui: uma página nova entra neste teste no
 * dia em que é criada, sem ninguém se lembrar dela.
 *
 * A outra metade — a base de dados — não se testa daqui; está em
 * sql/acesso-checklist.sql, com a consulta que a confirma no fim.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = mkdtempSync(join(tmpdir(), 'chk-'))
writeFileSync(join(tmp, 'modulos.ts'), readFileSync('src/lib/modulos.ts', 'utf8'))
execFileSync('npx', ['esbuild', join(tmp, 'modulos.ts'),
  '--bundle', '--format=esm', '--platform=node', '--log-level=error',
  `--outfile=${join(tmp, 'm.mjs')}`], { stdio: 'inherit' })
const M = await import(join(tmp, 'm.mjs'))

let feitos = 0, falhas = 0
function ok(nome, obtido, esperado) {
  feitos++
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) {
    falhas++
    console.log(`  x ${nome}: esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(obtido)}`)
  } else {
    console.log(`  . ${nome}`)
  }
}

/* A mesma regra de auth.tsx, escrita aqui para o teste a poder exercer sem
 * montar o React todo. Se as duas discordarem, o teste de baixo apanha-o. */
const podeVerPagina = (p) => p.to === M.CAMINHO_CHECKLIST

const todas = M.MODULOS.flatMap(m => m.paginas)

console.log('\na unica pagina que se ve')
ok('o caminho da checklist esta definido', M.CAMINHO_CHECKLIST, '/fb-checklist')
ok('a checklist existe na lista de paginas da app',
  todas.some(p => p.to === M.CAMINHO_CHECKLIST), true)
ok('ve a checklist', podeVerPagina({ to: M.CAMINHO_CHECKLIST }), true)

console.log('\ntodas as outras paginas da app ficam fechadas')
const abertas = todas.filter(podeVerPagina).map(p => p.to)
ok('so uma pagina passa, em toda a lista', abertas, [M.CAMINHO_CHECKLIST])
// nomeadas uma a uma, para o relatorio dizer o que se fechou
for (const to of ['/', '/turno', '/turno-historico', '/stock', '/contagem',
                  '/encomendas', '/historico', '/itens', '/grupos', '/parque',
                  '/fb', '/fb-painel', '/fb-pa', '/eventos', '/hk-mes', '/caixa',
                  '/lavandaria', '/rh', '/horarios', '/utilizadores']) {
  ok(`nao ve ${to}`, podeVerPagina({ to }), false)
}

console.log('\nso aparece o separador do F&B')
const visiveis = M.MODULOS
  .filter(m => M.temPaginaVisivel(m, podeVerPagina))
  .map(m => m.id)
ok('um separador so, e e o fb', visiveis, ['fb'])

console.log('\no separador abre na pagina certa, e nao na primeira da lista')
// o F&B comeca no «Dia», que e faturacao: clicar no separador nao pode
// atirar esta conta para uma pagina que ela nao ve
const fb = M.MODULOS.find(m => m.id === 'fb')
ok('a primeira pagina do fb continua a ser a faturacao', fb.paginas[0].to, '/fb')
ok('a primeira VISIVEL e a checklist',
  (fb.paginas.find(podeVerPagina) ?? fb.paginas[0]).to, M.CAMINHO_CHECKLIST)

console.log('\nas duas pontas dizem o mesmo')
// a regra da app
const auth = readFileSync('src/lib/auth.tsx', 'utf8')
ok('auth.tsx decide pela lista de um caminho, nao por excecoes',
  /soChecklist \? p\.to === CAMINHO_CHECKLIST/.test(auth), true)
ok('soChecklist exige que seja o unico papel',
  /roles\.every\(r => r === 'fb_checklist'\)/.test(auth), true)
// a rota: nao chega esconder no menu
const app = readFileSync('src/App.tsx', 'utf8')
ok('App.tsx monta um conjunto de rotas proprio',
  /if \(soChecklist\) \{/.test(app), true)
ok('e manda tudo o resto para a checklist',
  /path="\*" element=\{<Navigate to=\{CAMINHO_CHECKLIST\}/.test(app), true)
// o SQL tem de existir, e tem de reabrir o que a checklist precisa
const sql = readdirSync('sql').includes('acesso-checklist.sql')
  ? readFileSync('sql/acesso-checklist.sql', 'utf8') : ''
ok('ha ficheiro SQL para a outra ponta', sql.length > 0, true)
ok('fecha o has_any_role a esta conta', /not public\.so_checklist\(\)/.test(sql), true)
for (const pol of ['hotels_read', 'fb_chk_tarefas_read',
                   'fb_chk_feito_read', 'fb_chk_feito_write']) {
  ok(`reabre ${pol}`, new RegExp(`alter policy ${pol}`).test(sql), true)
}

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${feitos} verificacoes, ${falhas} falha(s)`)
process.exit(falhas ? 1 : 0)
