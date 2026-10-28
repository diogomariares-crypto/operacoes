/**
 * O quadro «um dia, serviço a serviço» do painel de F&B.
 *
 * Correr:  node scripts/testar-fb-dia.mjs
 *
 * Os números não são inventados: são dois dias a sério do Gravity, tirados da
 * `v_fb_dia` — 15 de Outubro de 2026 e o seu homólogo, 16 de Outubro de 2025.
 * As duas são quintas-feiras, que é o que o homólogo desta app quer dizer: o
 * mesmo dia da semana 52 semanas antes, e não a mesma data.
 *
 * Os valores esperados foram calculados à mão a partir desses dois arrays, e
 * não pela mesma função que estão a verificar — senão o teste só provava que o
 * código concorda consigo próprio.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = mkdtempSync(join(tmpdir(), 'fb-'))
writeFileSync(join(tmp, 'supabase.ts'), 'export const supabase = {}\n')
writeFileSync(join(tmp, 'fbDash.ts'), readFileSync('src/lib/fbDash.ts', 'utf8'))
execFileSync('npx', ['esbuild', join(tmp, 'fbDash.ts'),
  '--bundle', '--format=esm', '--platform=node', '--log-level=error',
  `--outfile=${join(tmp, 'fb.mjs')}`], { stdio: 'inherit' })
const F = await import(join(tmp, 'fb.mjs'))

let feitos = 0, falhas = 0
function ok(nome, obtido, esperado) {
  feitos++
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) {
    falhas++
    console.log(`  x ${nome}: esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(obtido)}`)
  } else console.log(`  . ${nome}`)
}
const perto = (nome, obtido, esperado, tol = 0.005) => {
  feitos++
  if (obtido == null || Math.abs(obtido - esperado) > tol) {
    falhas++
    console.log(`  x ${nome}: esperado ~${esperado}, obtido ${obtido}`)
  } else console.log(`  . ${nome}`)
}

/* ----------------------------------------------------------- os dois dias */
// ordem dos servicos: bf, vip, lunch, dinner, bar, hh, oth
const DIA = {
  d: '2026-10-15', dow: 4, bData: '2025-10-16',
  aEur: [990.64, 35.39, 112.20, 2116.20, 150.60, 36.00, 0],
  aPax: [97, 120, 4, 69, 24, 10, 0],
  bEur: [976.32, 39.41, 202.80, 1587.80, 292.05, 40.00, 29.00],
  bPax: [96, 120, 9, 54, 36, 10, 0],
}

const linhas = F.linhasPorServico(F.serieDoDia(DIA), 'servico')
const total = F.totalDasLinhas(linhas)
const porNome = (k) => linhas.find(l => l.k === k)

console.log('\na ordem das linhas e a do dia, e nao a do pior')
ok('sete servicos', linhas.length, 7)
ok('pela ordem do servico',
  linhas.map(l => l.k), ['bf', 'vip', 'lunch', 'dinner', 'bar', 'hh', 'oth'])
// o painel do periodo ordena pelo que mais caiu; aqui isso tornava impossivel
// comparar dois dias a seguir um ao outro
const pior = F.linhasPorServico(F.serieDoDia(DIA), 'pior')
ok('a ordem «pior» comeca pelo que mais caiu', pior[0].k, 'bar')
ok('e as duas ordens nao sao a mesma', pior.map(l => l.k) === linhas.map(l => l.k), false)

console.log('\nlinha a linha, com as contas feitas a mao')
// jantar: 2116,20 contra 1587,80 -> +528,40, que sao +33,3%
perto('jantar 2026', porNome('dinner').aEur, 2116.20)
perto('jantar 2025', porNome('dinner').bEur, 1587.80)
perto('jantar varia +33,3%', porNome('dinner').pEur, 528.40 / 1587.80 * 100)
// 69 covers contra 54 -> +27,8%
perto('jantar covers +27,8%', porNome('dinner').pPax, 15 / 54 * 100)
// ticket medio: 2116,20/69 = 30,67 contra 1587,80/54 = 29,40
perto('ticket medio do jantar 2026', porNome('dinner').aTm, 2116.20 / 69)
perto('ticket medio do jantar 2025', porNome('dinner').bTm, 1587.80 / 54)

// o bar caiu quase para metade: 150,60 contra 292,05
perto('o bar caiu 48,4%', porNome('bar').pEur, (150.60 - 292.05) / 292.05 * 100)

// «outros» tem zero covers nos dois anos: o ticket medio nao existe, e isso
// tem de ser nulo e nao zero nem infinito
ok('sem covers, o ticket medio e nulo e nao zero',
  [porNome('oth').aTm, porNome('oth').bTm], [null, null])
// e teve 29 € em 2025 contra 0 em 2026: a variacao e -100%
perto('outros caiu 100%', porNome('oth').pEur, -100)

// o pequeno-almoco tem covers quase iguais e e o teste de que nada se baralhou
perto('pequeno-almoco 2026', porNome('bf').aEur, 990.64)
ok('pequeno-almoco covers', [porNome('bf').aPax, porNome('bf').bPax], [97, 96])

console.log('\no total — e a armadilha do ticket medio')
perto('faturacao total de 2026', total.aEur, 3441.03)
perto('faturacao total de 2025', total.bEur, 3167.38)
ok('covers totais', [total.aPax, total.bPax], [324, 325])
perto('a faturacao subiu 8,6%', total.pEur, (3441.03 - 3167.38) / 3167.38 * 100)
perto('os covers desceram 0,3%', total.pPax, -1 / 325 * 100)

// ESTA e a que interessa: o ticket medio do total e a faturacao toda a dividir
// pelos covers todos (10,62 €), e nao a media dos sete ticket medios
perto('ticket medio do total = 3441,03 / 324', total.aTm, 3441.03 / 324)
perto('ticket medio do total de 2025', total.bTm, 3167.38 / 325)
const mediaDasMedias = linhas.filter(l => l.aTm != null)
  .reduce((s, l) => s + l.aTm, 0) / linhas.filter(l => l.aTm != null).length
ok('a media das medias daria outra coisa, e esta errada',
  Math.abs(mediaDasMedias - total.aTm) > 1, true)
perto('o ticket medio subiu 9,0%', total.pTm,
  (3441.03 / 324 - 3167.38 / 325) / (3167.38 / 325) * 100)

console.log('\num dia sem homologo — Tokyo e Casa Teva so tem dados de 2026')
const SO_ESTE_ANO = { ...DIA, bEur: null, bPax: null }
const l2 = F.linhasPorServico(F.serieDoDia(SO_ESTE_ANO), 'servico')
const t2 = F.totalDasLinhas(l2)
ok('o ano anterior fica nulo, e nao zero',
  [l2[3].bEur, l2[3].bPax, l2[3].bTm], [null, null, null])
ok('as variacoes ficam nulas em vez de -100%',
  [l2[3].pEur, l2[3].pPax, l2[3].pTm], [null, null, null])
ok('o total deste ano continua certo', Math.round(t2.aEur * 100) / 100, 3441.03)
ok('e o total do ano anterior e nulo', [t2.bEur, t2.bPax, t2.pEur], [null, null, null])

console.log('\ncomo e que os nulos aparecem no ecra')
ok('uma variacao nula escreve-se com um travessao', F.pct(null), '—')
ok('zero covers escreve-se 0, nao travessao', F.num(0), '0')
ok('uma variacao positiva leva sinal', F.pct(8.639).startsWith('+'), true)
ok('uma negativa leva o menos tipografico', F.pct(-0.31).startsWith('−'), true)
// 120 covers contra 120 covers nao desceu nada: «−0,0%» lia-se como quebra
ok('zero nao leva sinal nenhum', F.pct(0), '0,0%')
ok('e um arredondamento a zero por cima tambem nao', F.pct(0.004), '0,0%')
ok('mas uma descida mesmo pequena leva', F.pct(-0.06), '−0,1%')

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${feitos} verificacoes, ${falhas} falha(s)`)
process.exit(falhas ? 1 : 0)
