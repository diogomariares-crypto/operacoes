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
ok('o ajuste aparece no balanco', H.balanco(dia, 90).ajustesMin, 90)
// os ajustes nunca empurram as disponiveis para negativo
ok('ajustes maiores que o turno dao zero, nao negativo',
  H.balanco(dia, 5000).disponiveis, 0)

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${feitos} verificacoes, ${falhas} falha(s)`)
process.exit(falhas ? 1 : 0)
