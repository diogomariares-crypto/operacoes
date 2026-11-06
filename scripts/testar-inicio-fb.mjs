/**
 * O quadro de F&B do Início: a janela de sete dias e as somas.
 *
 * Correr:  TZ=Europe/Lisbon node scripts/testar-inicio-fb.mjs
 *
 * Duas coisas podem partir aqui, e nenhuma delas dá erro no TypeScript.
 *
 * A primeira é a janela. O quadro tem de acabar **ontem**: hoje, a meio da
 * manhã, só tem os pequenos-almoços lançados, e uma coluna assim no fim da
 * linha lê-se como uma quebra quando é só um dia por acabar. Nos dias 1 do mês
 * e a seguir à mudança da hora é onde a conta dos dias costuma escorregar, por
 * isso são esses os casos abaixo.
 *
 * A segunda são as somas. A grelha tem de ter sempre sete colunas mesmo que não
 * haja lançamento nenhum — se um dia vazio desaparecesse, os dias seguintes
 * deslizavam para debaixo do cabeçalho errado e o quadro mentia sem avisar.
 *
 * Os números vêm de uma semana real do Gravity (2 a 8 de novembro de 2026), a
 * mesma que se vê na passagem de turno.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = mkdtempSync(join(tmpdir(), 'inicio-fb-'))
writeFileSync(join(tmp, 'supabase.ts'), 'export const supabase = {}\n')
// O `format` e o `turno` vão inteiros e verdadeiros: é o `addDays` real que se
// quer testar, e a lista de serviços real que tem de aparecer no quadro.
for (const f of ['format', 'turno', 'inicio']) {
  writeFileSync(join(tmp, `${f}.ts`), readFileSync(`src/lib/${f}.ts`, 'utf8'))
}
execFileSync('npx', ['esbuild', join(tmp, 'inicio.ts'),
  '--bundle', '--format=esm', '--platform=node', '--log-level=error',
  `--outfile=${join(tmp, 'inicio.mjs')}`], { stdio: 'inherit' })
const I = await import(join(tmp, 'inicio.mjs'))

let feitos = 0, falhas = 0

/* Somar em vírgula flutuante por ordens diferentes dá 3626,5599999999995 num
   lado e 3626,56 no outro. O quadro escreve o dinheiro ao cêntimo, por isso é
   ao cêntimo que se compara — exigir mais seria inventar um erro que ninguém
   vê e que nenhuma ordem de soma evita. */
const aoCentimo = v =>
  typeof v === 'number' ? Math.round(v * 100) / 100
  : Array.isArray(v) ? v.map(aoCentimo)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, aoCentimo(x)]))
  : v

function ok(nome, obtidoCru, esperadoCru) {
  const [obtido, esperado] = [aoCentimo(obtidoCru), aoCentimo(esperadoCru)]
  feitos++
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) {
    falhas++
    console.log(`  x ${nome}\n      esperado ${JSON.stringify(esperado)}\n      obtido   ${JSON.stringify(obtido)}`)
  } else console.log(`  . ${nome}`)
}

/* ============================== a janela ================================= */
console.log('\njanela de sete dias')

ok('acaba no dia que se pede', I.seteDiasAte('2026-11-05').at(-1), '2026-11-05')
ok('são sete', I.seteDiasAte('2026-11-05').length, 7)
ok('começa seis dias antes', I.seteDiasAte('2026-11-05')[0], '2026-10-30')

// Dia 1: a janela tem de atravessar o mês para trás sem cair no dia 1 do
// próprio mês, que é o erro de quem subtrai só ao número do dia.
ok('atravessa o fim do mês',
  I.seteDiasAte('2026-11-01'),
  ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'])

// Em 2026 o relógio em Portugal atrasa na madrugada de 25 de outubro. Uma
// janela construída com milissegundos repetiria o dia 25 e perdia o 24.
ok('atravessa a mudança da hora',
  I.seteDiasAte('2026-10-27'),
  ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'])

ok('atravessa o fim do ano',
  I.seteDiasAte('2027-01-02').slice(0, 3),
  ['2026-12-27', '2026-12-28', '2026-12-29'])

/* ============================== as somas ================================= */
console.log('\nsomas do quadro')

const DIAS = I.seteDiasAte('2026-11-08')   // 02/11 a 08/11
const L = (d, coluna, pax, eur) =>
  ({ report_date: d, coluna, total_pax: pax, total_eur: eur })

// Segunda e terça do Gravity, com o fim-de-semana por lançar.
const LINHAS = [
  L('2026-11-02', 'pequeno_almoco', 84, 871.41),
  L('2026-11-02', 'jantar', 20, 590.65),
  L('2026-11-02', 'bar', 22, 85.05),
  L('2026-11-03', 'pequeno_almoco', 90, 952.58),
  L('2026-11-03', 'jantar', 31, 943.02),
  L('2026-11-03', 'bar', 29, 183.85),
]

const q = I.montarQuadroFb(DIAS, LINHAS)

ok('a grelha tem sempre sete colunas', q.dias.length, 7)
ok('tem uma linha por serviço', q.linhas.length, 8)
ok('mantém a ordem dos serviços', q.linhas.map(l => l.id), [
  'pequeno_almoco', 'pensoes', 'delivery', 'room_service',
  'almoco', 'jantar', 'bar', 'vips_lanche'])

const pa = q.linhas.find(l => l.id === 'pequeno_almoco')
ok('o dia lançado traz o seu valor', pa.dias[0], { pax: 84, eur: 871.41 })
ok('o dia por lançar fica a zero', pa.dias[4], { pax: 0, eur: 0 })
ok('o total da linha soma os dias', pa.total, { pax: 174, eur: 871.41 + 952.58 })

const pensoes = q.linhas.find(l => l.id === 'pensoes')
ok('um serviço sem lançamentos aparece na mesma', pensoes.total, { pax: 0, eur: 0 })

ok('o total do dia soma os serviços', q.totalDia[0], { pax: 126, eur: 871.41 + 590.65 + 85.05 })
ok('o fim-de-semana por lançar fica a zero', q.totalDia.slice(4), [
  { pax: 0, eur: 0 }, { pax: 0, eur: 0 }, { pax: 0, eur: 0 }])

const esperado = LINHAS.reduce((a, l) => ({ pax: a.pax + l.total_pax, eur: a.eur + l.total_eur }),
  { pax: 0, eur: 0 })
ok('o total geral bate com o que entrou', q.total, esperado)
ok('o total geral é também a soma dos dias',
  q.total, q.totalDia.reduce((a, c) => ({ pax: a.pax + c.pax, eur: a.eur + c.eur }), { pax: 0, eur: 0 }))

/* ---------------------------- casos que já mordem ------------------------ */
console.log('\ncasos que já morderam noutras tabelas')

// O mesmo serviço pode vir em mais do que uma linha no mesmo dia. Guardar em
// vez de somar perdia a segunda, calado.
const duplo = I.montarQuadroFb(DIAS, [
  L('2026-11-02', 'bar', 10, 40),
  L('2026-11-02', 'bar', 12, 45.05),
])
ok('duas linhas do mesmo serviço no mesmo dia somam-se',
  duplo.linhas.find(l => l.id === 'bar').dias[0], { pax: 22, eur: 85.05 })

// O Supabase devolve `numeric` como texto. Concatenar em vez de somar daria
// «87.41871.41» — e o quadro mostrava NaN.
const texto = I.montarQuadroFb(DIAS, [
  { report_date: '2026-11-02', coluna: 'bar', total_pax: 22, total_eur: '85.05' },
])
ok('o dinheiro em texto soma como número',
  texto.linhas.find(l => l.id === 'bar').dias[0], { pax: 22, eur: 85.05 })

// Uma linha de um dia fora da janela não pode entrar pela porta do lado.
const fora = I.montarQuadroFb(DIAS, [
  L('2026-11-01', 'bar', 99, 999),
  L('2026-11-09', 'bar', 99, 999),
])
ok('um dia fora da janela fica de fora', fora.total, { pax: 0, eur: 0 })

// Nem todas as linhas trazem pax e dinheiro preenchidos.
const nulos = I.montarQuadroFb(DIAS, [
  { report_date: '2026-11-02', coluna: 'bar', total_pax: null, total_eur: 40 },
])
ok('um pax em branco conta como zero',
  nulos.linhas.find(l => l.id === 'bar').dias[0], { pax: 0, eur: 40 })

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${feitos} verificações, ${falhas} falhas`)
process.exit(falhas ? 1 : 0)
