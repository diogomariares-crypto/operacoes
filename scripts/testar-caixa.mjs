/**
 * Testes das contas da caixa.
 *
 * Correr:  node scripts/testar-caixa.mjs
 *
 * Isto é código de dinheiro: uma conta errada aqui aparece como «faltam 40 €»
 * no fecho de alguém, e a pessoa vai procurar notas que nunca faltaram. Por
 * isso os casos são os reais, incluindo o envelope do Gravity que atravessa
 * setembro e outubro, e não exemplos redondos.
 *
 * A regra que estes testes guardam: **o dinheiro de um mês fica nesse mês.**
 * Um turno que atravessa o fim do mês fica em dois fechos, cada um com os seus
 * pagamentos e o seu depósito, e não passa nada de um para o outro.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/* --------------------- compilar o módulo e importá-lo ---------------------- */

const tmp = mkdtempSync(join(tmpdir(), 'caixa-'))
/*
 * Copia-se o módulo para junto de um duplo do Supabase, em vez de o substituir
 * por um alias: assim o `./supabase` do próprio ficheiro resolve para o duplo e
 * o que se testa é o ficheiro tal como vai para a app, sem lhe tocar.
 */
writeFileSync(join(tmp, 'supabase.ts'), 'export const supabase = {}\n')
writeFileSync(join(tmp, 'caixa.ts'), readFileSync('src/lib/caixa.ts', 'utf8'))
execFileSync('npx', ['esbuild', join(tmp, 'caixa.ts'),
  '--bundle', '--format=esm', '--platform=node', '--log-level=error',
  `--outfile=${join(tmp, 'caixa.mjs')}`], { stdio: 'inherit' })

const C = await import(join(tmp, 'caixa.mjs'))

/* ------------------------------- utensílios -------------------------------- */

let feitos = 0, falhas = 0
const quase = (a, b) => Math.abs(a - b) < 0.005

function ok(nome, obtido, esperado) {
  feitos++
  const bate = typeof esperado === 'number' && typeof obtido === 'number'
    ? quase(obtido, esperado)
    : JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!bate) {
    falhas++
    console.log(`  x ${nome}`)
    console.log(`      esperado ${JSON.stringify(esperado)}`)
    console.log(`      obtido   ${JSON.stringify(obtido)}`)
  } else {
    console.log(`  . ${nome}`)
  }
}

let n = 0
const pag = (momento, valor) => ({
  id: `p${++n}`, dia: momento.slice(0, 10), valor, origem: 'pms',
  cliente: null, criador: null, documento: null, momento,
})
const fat = (dia, valor, envelope_id = null) => ({
  id: `f${++n}`, dia, data_fatura: null, fornecedor: null, descricao: null,
  documento: null, valor, ficheiro: null, envelope_id,
})
const envelopeDe = (seg, extra = {}) => ({
  id: extra.id ?? `e${++n}`, responsavel: null, nota: null,
  abertura: null, ...seg, ...extra,
})

/* ================================ os cortes =============================== */

console.log('\ncortesDeMes - onde o mes corta um turno')

ok('turno normal da noite, sem corte',
  C.cortesDeMes('2026-09-15T23:00', '2026-09-16T07:00'), [])
ok('turno que atravessa a meia-noite do mes',
  C.cortesDeMes('2026-09-30T23:00', '2026-10-01T07:00'), ['2026-10-01T00:00:00'])
ok('o envelope real do Gravity, 28/09 a 05/10',
  C.cortesDeMes('2026-09-28 11:28:00', '2026-10-05 12:08:00'), ['2026-10-01T00:00:00'])
ok('turno que atravessa dois meses',
  C.cortesDeMes('2026-08-28T10:00', '2026-10-03T10:00'),
  ['2026-09-01T00:00:00', '2026-10-01T00:00:00'])
ok('fim do ano',
  C.cortesDeMes('2026-12-31T22:00', '2027-01-01T06:00'), ['2027-01-01T00:00:00'])
// a meia-noite e ja do turno seguinte, pela mesma regra que decide os pagamentos
ok('turno que acaba exactamente na meia-noite do mes nao corta',
  C.cortesDeMes('2026-09-30T16:00', '2026-10-01T00:00'), [])

console.log('\ndiaDoFecho - em que mes o fecho e arrumado')
ok('fecho as 07:00 do dia 1', C.diaDoFecho('2026-10-01T07:00'), '2026-10-01')
ok('corte a meia-noite do dia 1 fica em setembro', C.diaDoFecho('2026-10-01T00:00'), '2026-09-30')
ok('corte na meia-noite de janeiro fica em dezembro', C.diaDoFecho('2027-01-01T00:00'), '2026-12-31')

/* ============================== partir o turno ============================ */

console.log('\npartirPorMes - a contagem fisica fica no ultimo segmento')

const inteiro = {
  inicio: '2026-09-28T11:28', fim: '2026-10-05T12:08',
  valor: 15, denominacoes: { '10': 1, '5': 1 }, transporte: 4.19,
}
const segs = C.partirPorMes(inteiro)
ok('da dois fechos', segs.length, 2)
ok('o de setembro vai ate a meia-noite', segs[0].fim, '2026-10-01T00:00:00')
ok('e fica arrumado em setembro', segs[0].dia, '2026-09-30')
ok('e um corte', segs[0].corte, true)
ok('sem dinheiro contado', segs[0].valor, 0)
ok('e sem denominacoes', segs[0].denominacoes, {})
ok('e sem transporte - nao passa nada para outubro', segs[0].transporte, 0)
ok('o de outubro comeca na meia-noite', segs[1].inicio, '2026-10-01T00:00:00')
ok('arrumado no dia do fecho real', segs[1].dia, '2026-10-05')
ok('nao e corte', segs[1].corte, false)
ok('leva a contagem toda', segs[1].valor, 15)
ok('leva as denominacoes', segs[1].denominacoes, { '10': 1, '5': 1 })
ok('leva o troco que ficou', segs[1].transporte, 4.19)

const umSo = C.partirPorMes({
  inicio: '2026-09-15T23:00', fim: '2026-09-16T07:00',
  valor: 100, denominacoes: { '50': 2 }, transporte: 20,
})
ok('um turno que nao atravessa mes da um fecho so', umSo.length, 1)
ok('e esse nao e corte', umSo[0].corte, false)
ok('com o valor intacto', umSo[0].valor, 100)

/* ========================== as contas de um corte ======================== */

console.log('\ncontasDoEnvelope - num corte o dinheiro fica no mes')

const recebidoSet = [pag('2026-09-28T12:00:00', 100), pag('2026-09-30T20:00:00', 20)]
const recebidoOut = [pag('2026-10-02T10:00:00', 50)]
const todos = [...recebidoSet, ...recebidoOut]

const cSet = C.contasDoEnvelope(segs[0], 30, todos, [])
ok('o corte so ve os pagamentos de setembro', cSet.recebido, 120)
ok('nao tem contagem - nulo, que nao e zero', cSet.contado, null)
ok('e por isso a diferenca fica em aberto', cSet.diferenca, null)
ok('o apurado e a abertura mais o recebido', cSet.esperado, 150)
ok('e e isso que setembro tem para depositar', cSet.paraDepositar, 150)
ok('nao passa nada para outubro', cSet.transporte, 0)

const cSetFat = C.contasDoEnvelope(segs[0], 30, todos, [fat('2026-09-29', 40)])
ok('uma fatura paga em setembro sai do que ha para depositar', cSetFat.paraDepositar, 110)

// outubro abre a zero: o dinheiro de setembro ficou em setembro
const cOut = C.contasDoEnvelope(segs[1], 0, todos, [])
ok('outubro abre a zero', cOut.abertura, 0)
ok('e so ve os pagamentos de outubro', cOut.recebido, 50)
ok('apurado = 0 + 50 - 0 - 4,19', cOut.esperado, 45.81)
ok('contaram-se 15, logo faltam 30,81', cOut.diferenca, -30.81)
ok('e tem 15 para depositar, o que foi contado', cOut.paraDepositar, 15)

/* ===================== o balanco, mes a mes, sem passagens ================ */

console.log('\nbalanco - cada mes fica com o seu')

const eSet = envelopeDe(segs[0], { id: 'set' })
const eOut = envelopeDe(segs[1], { id: 'out' })
const antesDoCorte = envelopeDe({
  inicio: '2026-09-20T10:00', fim: '2026-09-28T11:28', dia: '2026-09-28',
  corte: false, valor: 500, denominacoes: {}, transporte: 30,
}, { id: 'ant' })

const bSet = C.balanco({
  mes: '2026-09', recebido: todos, saidas: [],
  envelopes: [antesDoCorte, eSet], depositos: [],
})
ok('setembro mostra so o recebido de setembro', bSet.recebidoDoMes, 120)
ok('o recebido largo e maior, e e de proposito', bSet.recebido, 170)
ok('o corte nao apura diferenca', bSet.linhas[1].contas.diferenca, null)
ok('e conta-se como fecho sem contagem', bSet.semContagem, 1)
// 500 contados no fecho fisico + 150 apurados no corte
ok('setembro tem para depositar o contado mais o apurado do corte',
  bSet.paraDepositar, 650)
// o acumulado e so o do fecho fisico: o corte nao lhe acrescenta nada
ok('o acumulado do mes e so a diferenca do fecho fisico',
  bSet.diferenca, bSet.linhas[0].contas.diferenca)
ok('e a linha do corte repete o acumulado em vez de o mexer',
  bSet.linhas[1].acumulado, bSet.linhas[0].acumulado)

const bOut = C.balanco({
  mes: '2026-10', recebido: todos, saidas: [], envelopes: [eOut], depositos: [],
})
ok('outubro mostra so o recebido de outubro', bOut.recebidoDoMes, 50)
ok('e abre a zero - nada veio de setembro', bOut.linhas[0].contas.abertura, 0)
ok('a diferenca de outubro e so a de outubro', bOut.linhas[0].contas.diferenca, -30.81)
ok('e tem 15 para depositar', bOut.paraDepositar, 15)
ok('nenhum pagamento fica fora de turno', bOut.foraDeTurno.length, 0)

// a soma dos dois e o recebido do turno todo: nada se perdeu nem se contou duas vezes
ok('setembro + outubro = o recebido do turno inteiro',
  bSet.linhas[1].contas.recebido + bOut.linhas[0].contas.recebido, 170)

/* --------- pagamentos importados depois de o fecho ja existir ------------- */

console.log('\npagamentos importados depois de o fecho ja existir')

const maisTarde = [...todos, pag('2026-09-29T09:00:00', 200)]
const bSet2 = C.balanco({
  mes: '2026-09', recebido: maisTarde, saidas: [],
  envelopes: [antesDoCorte, eSet], depositos: [],
})
ok('setembro acompanha o pagamento novo', bSet2.recebidoDoMes, 320)
ok('e o que ha para depositar em setembro sobe sozinho', bSet2.paraDepositar, 850)
const bOut2 = C.balanco({
  mes: '2026-10', recebido: maisTarde, saidas: [], envelopes: [eOut], depositos: [],
})
ok('outubro nao se mexe - e o ponto de tudo isto', bOut2.linhas[0].contas.abertura, 0)
ok('nem o seu recebido', bOut2.recebidoDoMes, 50)
ok('nem o que tem para depositar', bOut2.paraDepositar, 15)

/* ------------------- o que estava mal antes desta mudanca ----------------- */

console.log('\no defeito que comecou isto: dias de fora no total do mes')

const soOutubro = C.balanco({
  mes: '2026-10',
  // tal como vem da base de dados: a janela traz 30/09 para as contas do turno
  recebido: [pag('2026-09-30T23:30:00', 45.15), pag('2026-10-02T10:00:00', 882)],
  saidas: [], envelopes: [], depositos: [],
})
ok('outubro ja nao conta os 45,15 de 30 de setembro', soOutubro.recebidoDoMes, 882)
ok('mas a soma larga continua disponivel para os turnos', soOutubro.recebido, 927.15)

/* ---------------------------------- fim ----------------------------------- */

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${feitos} verificacoes, ${falhas} falha(s)`)
process.exit(falhas ? 1 : 0)
