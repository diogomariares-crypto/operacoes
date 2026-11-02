/**
 * As regras das peças de rouparia.
 *
 * Correr:  node scripts/testar-lavandaria.mjs
 *
 * Os nomes são os que estão mesmo no catálogo do Gravity, incluindo os
 * duplicados que lá vivem — «Fronha Classica branca 46x71» e «Fronha Clássica
 * branca 46x71» são a mesma peça escrita duas vezes, cada uma com o seu
 * histórico. Nasceram porque as linhas das faturas se ligam ao catálogo só pelo
 * texto, sem chave estrangeira nenhuma, e nada impedia a segunda.
 *
 * Agora que se pode escrever o nome à mão, o aviso de parecença é o que impede
 * a lista de continuar a crescer assim. Estes testes são sobre ele.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = mkdtempSync(join(tmpdir(), 'lav-'))
writeFileSync(join(tmp, 'supabase.ts'), 'export const supabase = {}\n')
writeFileSync(join(tmp, 'format.ts'),
  'export const addDays = (s, n) => s\nexport const dmy = s => s\n'
  + 'export const money = v => String(v)\nexport const qty = v => String(v)\n')
writeFileSync(join(tmp, 'lavandaria.ts'), readFileSync('src/lib/lavandaria.ts', 'utf8'))
execFileSync('npx', ['esbuild', join(tmp, 'lavandaria.ts'),
  '--bundle', '--format=esm', '--platform=node', '--log-level=error',
  `--outfile=${join(tmp, 'lav.mjs')}`], { stdio: 'inherit' })
const L = await import(join(tmp, 'lav.mjs'))

let feitos = 0, falhas = 0
function ok(nome, obtido, esperado) {
  feitos++
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) {
    falhas++
    console.log(`  x ${nome}: esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(obtido)}`)
  } else console.log(`  . ${nome}`)
}

/* ------------------------------------------- o catalogo verdadeiro */
const A = (nome, seccao = 'alojamento', conta = true) =>
  ({ nome, seccao, conta_para_quarto: conta })
const CATALOGO = [
  A('Banho LJF XL branca'),
  A('Fronha Classica branca 45x71'),
  A('Fronha Classica branca 46x71'),
  A('Fronha Clássica branca 46x71'),          // o duplicado, com acento
  A('Lençol Classico 200x320'),
  A('Roupão S/luxo CHIC&BASIC br'),
  A('Guardanapos', 'restauracao', false),
  A('Acondicionamento', 'outros', false),
]

console.log('\nnormalizar um nome para o comparar')
ok('tira os acentos', L.normalizarNome('Fronha Clássica'), 'fronha classica')
ok('baixa as maiusculas', L.normalizarNome('LENÇOL'), 'lencol')
ok('encolhe os espacos a mais', L.normalizarNome('Banho   LJF  XL'), 'banho ljf xl')
ok('apara as pontas', L.normalizarNome('  Tapete  '), 'tapete')
ok('o cedilha conta como c', L.normalizarNome('Roupão'), 'roupao')
ok('vazio da vazio', L.normalizarNome('   '), '')

console.log('\no aviso que impede o proximo duplicado')
// este e o caso verdadeiro: o acento foi a unica diferenca
ok('«Fronha Clássica branca 46x71» ja existe sem acento',
  L.parecidoCom('Fronha Clássica branca 46x71', CATALOGO.filter(a => !a.nome.includes('á'))),
  'Fronha Classica branca 46x71')
ok('maiusculas a mais nao fazem peca nova',
  L.parecidoCom('LENÇOL CLASSICO 200X320', CATALOGO), 'Lençol Classico 200x320')
ok('espacos a mais tambem nao',
  L.parecidoCom('Banho  LJF  XL branca', CATALOGO), 'Banho LJF XL branca')
// 45x71 e 46x71 sao medidas diferentes: sao pecas diferentes a serio
ok('uma medida diferente e outra peca',
  L.parecidoCom('Fronha Classica branca 47x71', CATALOGO), null)
ok('uma peca mesmo nova nao avisa',
  L.parecidoCom('Toalha de banho nova', CATALOGO), null)
ok('nome vazio nao avisa', L.parecidoCom('   ', CATALOGO), null)
// ao mudar o nome de uma peca, ela propria nao conta como parecida
ok('a propria nao se avisa a si mesma',
  L.parecidoCom('Guardanapos', CATALOGO, 'Guardanapos'), null)

console.log('\no que impede de gravar uma fatura')
const linha = (artigo, q, v) => ({ artigo, quantidade: q, valor: v })
ok('uma fatura normal passa', L.problemaDasLinhas([
  linha('Lençol Classico 200x320', 120, 85.2),
  linha('Guardanapos', 40, 12),
]), null)
// uma linha preenchida sem nome e o erro mais provavel de quem acrescenta
ok('pecas sem nome nao passa',
  L.problemaDasLinhas([linha('', 30, 20)]), 'Há uma linha com peças ou valor e sem nome.')
ok('so valor e tambem sem nome nao passa',
  L.problemaDasLinhas([linha('  ', 0, 15)]), 'Há uma linha com peças ou valor e sem nome.')
// uma linha vazia a meio e so uma linha a mais, nao um erro
ok('uma linha completamente vazia e ignorada',
  L.problemaDasLinhas([linha('Guardanapos', 10, 5), linha('', 0, 0)]), null)
// a mesma peca duas vezes somava mal e ninguem dava por isso
ok('a mesma peca duas vezes nao passa',
  L.problemaDasLinhas([linha('Guardanapos', 10, 5), linha('Guardanapos', 2, 1)]),
  'A peça «Guardanapos» aparece duas vezes na mesma fatura.')
ok('e os espacos nao a disfarcam',
  L.problemaDasLinhas([linha('Guardanapos', 10, 5), linha('Guardanapos ', 2, 1)]),
  'A peça «Guardanapos» aparece duas vezes na mesma fatura.')
ok('um numero impossivel nao passa',
  L.problemaDasLinhas([linha('Guardanapos', Number.NaN, 5)]),
  'Há um número que não se entende.')

console.log('\no que vai mesmo para a base de dados')
ok('as linhas vazias ficam de fora', L.linhasAGravar([
  linha('Guardanapos', 10, 5), linha('', 0, 0), linha('Acondicionamento', 0, 0),
]), [linha('Guardanapos', 10, 5)])
ok('os espacos do nome sao aparados',
  L.linhasAGravar([linha('  Guardanapos  ', 10, 5)])[0].artigo, 'Guardanapos')
// uma peca com valor e zero pecas existe: e um acerto da lavandaria
ok('valor sem pecas conta na mesma',
  L.linhasAGravar([linha('Roupa danificada', 0, 42.5)]).length, 1)
// e uma com pecas e valor zero tambem: ha peças que vao sem custo
ok('pecas sem valor contam na mesma',
  L.linhasAGravar([linha('Acondicionamento', 7, 0)]).length, 1)

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${feitos} verificacoes, ${falhas} falha(s)`)
process.exit(falhas ? 1 : 0)
