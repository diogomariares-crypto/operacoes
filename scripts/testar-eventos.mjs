/**
 * As horas da sala de eventos.
 *
 * Correr:  TZ=Europe/Lisbon node scripts/testar-eventos.mjs
 *
 * O fuso é obrigatório e está verificado lá em baixo: estes testes são sobre
 * mudanças de hora, e num container a UTC passavam todos sem provar nada.
 *
 * O que se testa aqui não é aritmética por desporto. É o que distingue esta
 * página do parque: o parque conta noites e pode somar datas à vontade; aqui
 * conta-se tempo, e tempo tem dias com 23 e com 25 horas.
 */
process.env.TZ = 'Europe/Lisbon'

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = mkdtempSync(join(tmpdir(), 'ev-'))
writeFileSync(join(tmp, 'supabase.ts'), 'export const supabase = {}\n')
writeFileSync(join(tmp, 'eventos.ts'), readFileSync('src/lib/eventos.ts', 'utf8'))
execFileSync('npx', ['esbuild', join(tmp, 'eventos.ts'),
  '--bundle', '--format=esm', '--platform=node', '--log-level=error',
  `--outfile=${join(tmp, 'ev.mjs')}`], { stdio: 'inherit' })
const E = await import(join(tmp, 'ev.mjs'))

let feitos = 0, falhas = 0
function ok(nome, obtido, esperado) {
  feitos++
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) {
    falhas++
    console.log(`  x ${nome}: esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(obtido)}`)
  } else console.log(`  . ${nome}`)
}
const perto = (nome, obtido, esperado, tol = 0.0005) => {
  feitos++
  if (Math.abs(obtido - esperado) > tol) {
    falhas++
    console.log(`  x ${nome}: esperado ~${esperado}, obtido ${obtido}`)
  } else console.log(`  . ${nome}`)
}

/* ------------------------------------------------------------- o fuso */
console.log('\no fuso, que e o que faz estes testes valerem')
// 2026-10-25 e o domingo em que os relogios recuam em Portugal
const antes = new Date(2026, 9, 25, 0, 30).getTimezoneOffset()
const depois = new Date(2026, 9, 25, 12, 0).getTimezoneOffset()
ok('o relogio muda a 25 de Outubro de 2026', antes !== depois, true)
if (antes === depois) {
  console.log('\n  >> O fuso nao esta em Europe/Lisbon. Correr com TZ=Europe/Lisbon.')
  process.exit(1)
}

/* ----------------------------------------------------- dia mais hora */
console.log('\nde «dia 24, das 20:00 a 01:00» para dois instantes')
{
  const { inicio, fim } = E.intervalo('2026-10-24', '20:00', '01:00')
  ok('comeca no dia 24 as 20:00', [E.diaDe(inicio), E.horaDe(inicio)], ['2026-10-24', '20:00'])
  ok('acaba no dia 25 a 01:00',   [E.diaDe(fim),    E.horaDe(fim)],    ['2026-10-25', '01:00'])
  perto('sao cinco horas', E.horasEntre(inicio, fim), 5)
  ok('passa a meia-noite', E.passaMeiaNoite({ inicio, fim }), true)
}
{
  const { inicio, fim } = E.intervalo('2026-10-21', '14:00', '18:00')
  ok('um evento normal fica no mesmo dia',
    [E.diaDe(inicio), E.diaDe(fim)], ['2026-10-21', '2026-10-21'])
  perto('quatro horas', E.horasEntre(inicio, fim), 4)
  ok('nao passa a meia-noite', E.passaMeiaNoite({ inicio, fim }), false)
}
{
  // o caso mais traicoeiro: acaba exactamente a meia-noite
  const { inicio, fim } = E.intervalo('2026-11-07', '23:00', '00:30')
  ok('23:00 as 00:30 acaba no dia seguinte', E.diaDe(fim), '2026-11-08')
  perto('hora e meia', E.horasEntre(inicio, fim), 1.5)
}

console.log('\no dia em que o relogio recua — a razao de isto serem instantes')
{
  // 00:30 ainda e hora de Verao; as 02:00 volta-se as 01:00 e a hora repete-se.
  // No relogio da parede sao duas horas e meia; de tempo a serio sao tres e meia.
  const { inicio, fim } = E.intervalo('2026-10-25', '00:30', '03:00')
  perto('00:30 as 03:00 no dia da mudanca sao 3h30 reais', E.horasEntre(inicio, fim), 3.5)
  // e a conta ingenua — subtrair as horas do relogio — daria 2h30
  const ingenua = (E.minutosDaHora('03:00') - E.minutosDaHora('00:30')) / 60
  ok('a conta pelo relogio da 2h30, e por isso e que nao se usa', ingenua, 2.5)
}
{
  // e no dia em que o relogio avanca, uma hora desaparece
  const { inicio, fim } = E.intervalo('2026-03-29', '00:30', '03:00')
  perto('a 29 de Marco as mesmas horas sao 1h30', E.horasEntre(inicio, fim), 1.5)
}

/* ------------------------------------------------------ o dia da casa */
console.log('\no dia a que a reserva pertence para quem esta a trabalhar')
const SALA = { abre: '08:00:00', fecha: '01:00:00' }
ok('as 09:00 e do proprio dia',
  E.diaOperacional(E.instante('2026-10-24', '09:00').toISOString(), SALA.abre), '2026-10-24')
ok('as 20:00 e do proprio dia',
  E.diaOperacional(E.instante('2026-10-24', '20:00').toISOString(), SALA.abre), '2026-10-24')
// uma festa que comeca as 00:30 e a noite anterior, e nao a madrugada de hoje
ok('as 00:30 e da noite anterior',
  E.diaOperacional(E.instante('2026-10-25', '00:30').toISOString(), SALA.abre), '2026-10-24')
ok('as 07:59 ainda e da vespera',
  E.diaOperacional(E.instante('2026-10-25', '07:59').toISOString(), SALA.abre), '2026-10-24')
ok('as 08:00 ja e do dia',
  E.diaOperacional(E.instante('2026-10-25', '08:00').toISOString(), SALA.abre), '2026-10-25')

/* --------------------------------------------------------- a pista */
console.log('\na pista de horas')
ok('das 08:00 a 01:00 sao 17 horas', E.pista(SALA).minutos, 17 * 60)
ok('das 08:00 as 23:00 sao 15 horas',
  E.pista({ abre: '08:00:00', fecha: '23:00:00' }).minutos, 15 * 60)
ok('um espaco aberto 24h nao da zero',
  E.pista({ abre: '00:00:00', fecha: '00:00:00' }).minutos, 24 * 60)

console.log('\nonde e que a barra fica na pista')
{
  const r = E.intervalo('2026-10-21', '14:00', '18:00')
  const p = E.posicaoNaPista(r, SALA)
  perto('14:00 comeca a 35% da pista', p.topo, (14 * 60 - 480) / 1020)
  perto('18:00 acaba a 59%', p.base, (18 * 60 - 480) / 1020)
}
{
  // o jantar que passa da meia-noite tem de chegar ao fundo, e nao dar a volta
  const r = E.intervalo('2026-10-24', '20:00', '01:00')
  const p = E.posicaoNaPista(r, SALA)
  perto('20:00 comeca a 71%', p.topo, (20 * 60 - 480) / 1020)
  ok('01:00 acaba exactamente no fundo', Math.round(p.base * 1000) / 1000, 1)
  ok('a barra nao da a volta', p.base > p.topo, true)
}
{
  // a festa das 00:30 fica no fundo da coluna da vespera
  const r = E.intervalo('2026-11-07', '00:30', '02:00')
  const p = E.posicaoNaPista(r, SALA)
  ok('00:30 fica na parte de baixo da pista', p.topo > 0.9, true)
  ok('e passa do fundo, para o ecra a cortar', p.base > 1, true)
}

/* ------------------------------------------------------- o formulario */
console.log('\no que o formulario recusa antes de chegar a base de dados')
const base = { cliente: 'Festa', dia: '2026-10-24', horaInicio: '20:00', horaFim: '01:00' }
ok('um rascunho bom passa', E.problemaDoRascunho(base), null)
ok('sem cliente nao passa',
  E.problemaDoRascunho({ ...base, cliente: '  ' }), 'Falta o nome de quem reserva.')
ok('sem dia nao passa', E.problemaDoRascunho({ ...base, dia: '' }), 'Falta o dia.')
ok('sem horas nao passa', E.problemaDoRascunho({ ...base, horaFim: '' }), 'Faltam as horas.')
// horas iguais: sem isto, o `intervalo` lia-as como 24 horas certas
ok('horas iguais nao passam',
  E.problemaDoRascunho({ ...base, horaInicio: '14:00', horaFim: '14:00' }),
  'A hora de fim tem de ser diferente da de início.')

/* ------------------------------------------------------------- erros */
console.log('\nas mensagens, que e o que a pessoa ve')
const conflito = { message: 'conflicting key value violates exclusion constraint "eventos_sem_sobreposicao"' }
ok('o conflito normal diz que a sala esta ocupada',
  E.mensagemDeErro(conflito), 'A sala já está ocupada em parte desse horário.')
// reactivar um cancelado cuja hora ja foi dada a outro da o MESMO erro cru,
// e «viola a restricao de exclusao» nao explica isso a ninguem
ok('ao reactivar, a mensagem explica o que fazer',
  /muda primeiro o dia ou as horas/.test(E.mensagemDeErro(conflito, true)), true)
ok('o fim antes do inicio tem frase propria',
  E.mensagemDeErro({ message: 'violates check constraint "eventos_fim_depois_do_inicio"' }),
  'A hora de fim tem de ser depois da de início.')
ok('a falta de permissao nao mostra SQL',
  E.mensagemDeErro({ message: 'new row violates row-level security policy' }),
  'Não tens permissão para alterar reservas da sala.')

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${feitos} verificacoes, ${falhas} falha(s)`)
process.exit(falhas ? 1 : 0)
