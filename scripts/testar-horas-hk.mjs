/**
 * Testes do campo de horas dos ajustes do housekeeping.
 *
 * Correr:  node scripts/testar-horas-hk.mjs
 *
 * O campo e escrito a mao, todos os dias, por quem esta a despachar outra coisa.
 * Um «2» lido como 2 minutos em vez de 2 horas falseia o balanco do dia inteiro
 * e ninguem repara, porque o numero continua a parecer plausivel. Dai estes
 * testes serem sobre o que uma pessoa escreve depressa, e nao sobre o formato
 * ideal.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = mkdtempSync(join(tmpdir(), 'hk-'))
writeFileSync(join(tmp, 'supabase.ts'), 'export const supabase = {}\n')
writeFileSync(join(tmp, 'housekeeping.ts'), readFileSync('src/lib/housekeeping.ts', 'utf8'))
execFileSync('npx', ['esbuild', join(tmp, 'housekeeping.ts'),
  '--bundle', '--format=esm', '--platform=node', '--log-level=error',
  `--outfile=${join(tmp, 'hk.mjs')}`], { stdio: 'inherit' })
const H = await import(join(tmp, 'hk.mjs'))

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
const le = (t) => H.minutosDeTexto(t)

console.log('\nminutosDeTexto - o formato que se pediu')
ok('1:30', le('1:30'), 90)
ok('0:45', le('0:45'), 45)
ok('2:00', le('2:00'), 120)
ok('10:15', le('10:15'), 615)

console.log('\nas formas que uma pessoa escreve sem pensar')
ok('1.30 com ponto', le('1.30'), 90)
ok('1,30 com virgula', le('1,30'), 90)
ok('1h30', le('1h30'), 90)
ok('1h 30 com espaco', le('1h 30'), 90)
ok('2h', le('2h'), 120)
ok('2h00', le('2h00'), 120)
ok(':45 sem a hora', le(':45'), 45)
ok('1:5 abreviado sao 50 minutos', le('1:5'), 110)

console.log('\num numero sozinho sao HORAS - a regra que importa')
ok('2 sao duas horas', le('2'), 120)
ok('1 e uma hora', le('1'), 60)
ok('8 sao oito horas', le('8'), 480)
ok('0 e zero', le('0'), 0)

console.log('\nminutos explicitos, para quem os quiser')
ok('45m', le('45m'), 45)
ok('45min', le('45min'), 45)
ok('90min', le('90min'), 90)

console.log('\no que nao se entende devolve null, em vez de inventar')
ok('vazio e zero, nao null', le(''), 0)
ok('espacos sao zero', le('   '), 0)
ok('texto', le('duas horas'), null)
ok('1:75 com minutos impossiveis', le('1:75'), null)
ok('1:2:3', le('1:2:3'), null)
ok('abc', le('abc'), null)
ok('-1', le('-1'), null)

console.log('\ntextoDeMinutos - o caminho de volta')
ok('90 -> 1:30', H.textoDeMinutos(90), '1:30')
ok('45 -> 0:45', H.textoDeMinutos(45), '0:45')
ok('120 -> 2:00', H.textoDeMinutos(120), '2:00')
ok('615 -> 10:15', H.textoDeMinutos(615), '10:15')
ok('0 fica vazio', H.textoDeMinutos(0), '')

console.log('\nida e volta, que e o que a Governanta ve ao escrever')
for (const t of ['1:30', '0:45', '2:00', '7:30', '10:15']) {
  ok(`${t} -> minutos -> ${t}`, H.textoDeMinutos(le(t)), t)
}

console.log('\no efeito no balanco do dia')
const dia = {
  id: 'x', dia: '2026-10-01', quartos_ocupados: 10, saidas: 5, staff: 3,
  min_por_quarto: 20, min_por_saida: 45, horas_por_turno: 7, nota: null,
}
// 3 pessoas x 7h = 21h = 1260 min disponiveis, antes de ajustes
ok('sem ajustes, 3 pessoas dao 21h', H.balanco(dia, 0).disponiveis, 1260)
ok('com 1:30 de ajustes sobram 19h30', H.balanco(dia, 90).disponiveis, 1170)
ok('a fazer sao 10x20 + 5x45 = 425', H.balanco(dia, 90).necessarios, 425)
ok('o ajuste aparece no balanco', H.balanco(dia, 90).ajustesMenosMin, 90)
// os ajustes nunca empurram as disponiveis para negativo
ok('ajustes maiores que o turno dao zero, nao negativo',
  H.balanco(dia, 5000).disponiveis, 0)

console.log('\nos dois lados do ajuste')
// 3 pessoas x 7h = 1260. menos 1:30 (90), mais 2:00 (120) -> 1290
ok('o lado + acrescenta horas', H.balanco(dia, 90, 120).disponiveis, 1290)
ok('so com ajuda, sem nada a tirar', H.balanco(dia, 0, 120).disponiveis, 1380)
ok('os dois lados aparecem no balanco separados',
  [H.balanco(dia, 90, 120).ajustesMenosMin, H.balanco(dia, 90, 120).ajustesMaisMin], [90, 120])
ok('o outsourcing continua a somar por fora',
  H.balanco(dia, 90, 120, 60).disponiveis, 1350)
// o que o TypeScript nao podia apanhar: tres numeros na ordem errada
ok('a ordem dos argumentos e menos, mais, outsourcing',
  H.balanco(dia, 0, 0, 120).disponiveis, H.balanco(dia, 0, 120, 0).disponiveis)
ok('e tirar 120 nao e o mesmo que acrescentar 120',
  H.balanco(dia, 120, 0).disponiveis === H.balanco(dia, 0, 120).disponiveis, false)
// a ajuda nao salva um dia em que se tirou tudo
ok('tirar tudo e ajudar pouco ainda da pouco',
  H.balanco(dia, 5000, 120).disponiveis, 0)

console.log('\no sinal do «Pessoas ±» — + e gente a MAIS')
/*
 * O caso que deu origem a isto: um dia com 45 minutos a sobrar aparecia como
 * -0,1 numa coluna chamada «Pessoas ±», com a celula azul. O numero dizia
 * «menos» e a cor dizia «sobra». Quem leu a tabela leu o numero.
 *
 * 36 quartos x 15 + 7 saidas x 45 = 855 a fazer; 2 pessoas x 7h30 = 900
 * disponiveis; sobram 45 minutos, que num turno de 7h30 sao 0,1 pessoas.
 */
const d1 = { ...dia, quartos_ocupados: 36, saidas: 7, staff: 2,
             min_por_quarto: 15, min_por_saida: 45, horas_por_turno: 7.5 }
ok('o dia que sobra - a fazer', H.balanco(d1, 0).necessarios, 855)
ok('o dia que sobra - disponivel', H.balanco(d1, 0).disponiveis, 900)
ok('o dia que sobra - sobram 45 min', H.balanco(d1, 0).diferenca, -45)
ok('o dia que sobra - pessoas e POSITIVO', H.balanco(d1, 0).pessoas > 0, true)
ok('o dia que sobra - mostra +0,1', H.pessoasTexto(H.balanco(d1, 0).pessoas), '+0,1')
// e a cor desse dia continua azul, como sempre esteve: so o sinal mudou
ok('o dia que sobra - continua azul',
  H.corDoBalanco(H.balanco(d1, 0).pessoas).startsWith('rgba(57, 135, 229'), true)

// um dia a que falta gente a serio: 850 a fazer, 1 pessoa x 7h = 420
const d2 = { ...dia, quartos_ocupados: 20, saidas: 10, staff: 1 }
ok('o dia que falta - diferenca de tempo e positiva (falta tempo)',
  H.balanco(d2, 0).diferenca, 430)
ok('o dia que falta - pessoas e NEGATIVO', H.balanco(d2, 0).pessoas < 0, true)
ok('o dia que falta - mostra -1,0', H.pessoasTexto(H.balanco(d2, 0).pessoas), '−1,0')
ok('o dia que falta - fica vermelho',
  H.corDoBalanco(H.balanco(d2, 0).pessoas).startsWith('rgba(227, 73, 72'), true)

// uma diferenca pequena nao pinta nada, e isso nao e falta de cor: e um dia
// que fechou praticamente certo
ok('5 minutos de diferenca ficam cinzentos',
  H.corDoBalanco(H.balanco({ ...dia, staff: 1 }, 0).pessoas), '#f0efec')

// a regra em bruto: diferenca e pessoas tem sinais opostos, de proposito
ok('diferenca e pessoas apontam para lados contrarios',
  Math.sign(H.balanco(d2, 0).diferenca) === -Math.sign(H.balanco(d2, 0).pessoas), true)
// uma pessoa inteira a mais da exactamente +1,0
const d3 = { ...dia, staff: 2, quartos_ocupados: 0, saidas: 0 }
// 2 x 7h = 840 disponivel, 0 a fazer -> 840/420 = 2 pessoas a mais
ok('duas pessoas sem trabalho dao +2,0',
  H.pessoasTexto(H.balanco(d3, 0).pessoas), '+2,0')
ok('fechar certo da zero, sem sinal',
  H.pessoasTexto(H.balanco({ ...dia, staff: 1, quartos_ocupados: 0, saidas: 0,
                              horas_por_turno: 0 }, 0).pessoas), '0,0')
ok('fechar certo fica cinzento',
  H.corDoBalanco(0), '#f0efec')

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${feitos} verificacoes, ${falhas} falha(s)`)
process.exit(falhas ? 1 : 0)
