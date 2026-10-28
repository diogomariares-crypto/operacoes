import { Fragment, useEffect, useMemo, useState } from 'react'
import { useApp } from '../lib/appState'
import { Loading, useToast } from '../components/ui'
import { useLembrado } from '../lib/lembrar'
import BarrasAno, { Legenda, type Ponto } from '../components/BarrasAno'
import {
  type Dash, type Dia, type LinhaServico, type Metrica, SERVICOS, METRICAS,
  fetchDash, linhasPorServico, serieDoDia, totalDasLinhas, valor, variacao,
  eur, num, pct, seta, corDelta, MESES, MESES3, DIAS_SEMANA, diaDoIso, rotuloPeriodo,
} from '../lib/fbDash'

const ANO_INICIAL = 2022

export default function FbDashboard() {
  const toast = useToast()
  const { hotels, hotelId, setHotelId } = useApp()

  // O painel abre no mês em que estamos. A escolha guarda-se enquanto se anda
  // a trabalhar, mas caduca à meia-noite: um mês escolhido na semana passada
  // não devia ser o que aparece hoje por defeito.
  const [ano, setAno] = useLembrado(
    'fb.ano', () => new Date().getFullYear(), { doDia: true })
  const [mes, setMes] = useLembrado<number | null>(
    'fb.mes', () => new Date().getMonth() + 1, { doDia: true })
  const [svc, setSvc] = useState('all')
  const [met, setMet] = useState<Metrica>('eur')
  // O dia que o quadro comparativo está a mostrar. Escolhe-se clicando no
  // gráfico do dia a dia; muda de mês e deixa de fazer sentido, por isso
  // limpa-se.
  const [diaSel, setDiaSel] = useState<string | null>(null)
  const [d, setD] = useState<Dash | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!hotelId) return
    setLoading(true)
    // o dia escolhido é de outro mês ou de outra casa: deixa de querer dizer nada
    setDiaSel(null)
    fetchDash(hotelId, ano, mes)
      .then(setD)
      .catch(e => toast((e as Error).message, 'erro'))
      .finally(() => setLoading(false))
  }, [hotelId, ano, mes])

  const anos = useMemo(() => {
    const fim = d?.anoAtual ?? new Date().getFullYear()
    return Array.from({ length: fim - ANO_INICIAL + 1 }, (_, i) => fim - i)
  }, [d])

  const ant = String(ano - 1)
  const fmt = (v: number) => met === 'eur' ? eur(v) : met === 'pax' ? num(v) : eur(v, 2)
  const nomeSvc = svc === 'all' ? 'todos os serviços' : SERVICOS.find(s => s.k === svc)!.rot.toLowerCase()

  if (!hotelId) return <Loading />
  if (loading && !d) return <Loading />
  if (d?.vazio) {
    return (
      <div className="card p-6 text-sm text-slate-600">
        Ainda não há faturação registada neste hotel. Começa em
        <strong> Faturação F&amp;B → Dia</strong>.
      </div>
    )
  }
  if (!d) return <Loading />

  const rot = rotuloPeriodo(d, ano, mes)
  const linhas = linhasPorServico(d.periodo)

  /* ------------------------------- KPIs -------------------------------- */
  const ea = valor('eur', d.periodo.aEur, d.periodo.aPax, svc)
  const eb = valor('eur', d.periodo.bEur, d.periodo.bPax, svc)
  const pa = valor('pax', d.periodo.aEur, d.periodo.aPax, svc)
  const pb = valor('pax', d.periodo.bEur, d.periodo.bPax, svc)
  const ta = valor('tm', d.periodo.aEur, d.periodo.aPax, svc)
  const tb = valor('tm', d.periodo.bEur, d.periodo.bPax, svc)
  const ya = valor('eur', d.acumulado.aEur, d.acumulado.aPax, svc)
  const yb = valor('eur', d.acumulado.bEur, d.acumulado.bPax, svc)
  const mostraAcumulado = mes != null || ano !== d.anoAtual

  /* ------------------------------ gráficos ------------------------------ */
  const pontosMensal: Ponto[] = d.mensal.map(m => ({
    rot: MESES3[m.m - 1],
    tit: MESES[m.m - 1],
    a: valor(met, m.aEur, m.aPax, svc),
    b: valor(met, m.bEur, m.bPax, svc),
    parcial: ano === d.anoAtual && m.m === d.mesAtual,
    destaque: mes === m.m,
  }))

  const pontosSemana: Ponto[] = d.semana.map(s => ({
    rot: DIAS_SEMANA[s.dow - 1].slice(0, 3),
    tit: DIAS_SEMANA[s.dow - 1],
    a: valor(met, s.aEur, s.aPax, svc),
    b: valor(met, s.bEur, s.bPax, svc),
  }))

  // A mesma lista que dá as barras, para o índice do clique bater com o dia.
  const diasDoMes = d.diario ?? []

  const pontosDia: Ponto[] = diasDoMes.map(x => ({
    rot: String(diaDoIso(x.d)),
    tit: `${DIAS_SEMANA[x.dow - 1]}, ${diaDoIso(x.d)} de ${MESES[(mes ?? 1) - 1]}`,
    subTit: `${DIAS_SEMANA[x.dow - 1]}, ${diaDoIso(x.bData)} ${MESES3[Number(x.bData.slice(5, 7)) - 1]} ${ant}`,
    a: valor(met, x.aEur, x.aPax, svc),
    b: valor(met, x.bEur, x.bPax, svc),
    fds: x.dow >= 6,
  }))

  /* leitura do dia a dia: só os dias com os dois anos preenchidos */
  const pares = (d.diario ?? [])
    .map(x => ({
      x,
      a: valor('eur', x.aEur, x.aPax, svc),
      b: valor('eur', x.bEur, x.bPax, svc),
    }))
    .filter(p => p.a != null && p.b != null)
    .map(p => ({ ...p, dif: (p.a as number) - (p.b as number) }))
  const totA = pares.reduce((s, p) => s + (p.a as number), 0)
  const totB = pares.reduce((s, p) => s + (p.b as number), 0)
  const ordenados = [...pares].sort((x, y) => x.dif - y.dif)
  const piores = ordenados.slice(0, 3)
  const melhor = ordenados[ordenados.length - 1]
  const rotDia = (p: typeof pares[number]) =>
    `${diaDoIso(p.x.d)} ${DIAS_SEMANA[p.x.dow - 1].slice(0, 3).toLowerCase()}`

  const maxDif = Math.max(...linhas.map(l => Math.abs(l.dEur ?? 0)), 1)

  return (
    <div className="space-y-4">
      {/* filtros */}
      {/* -mx-3 e nao -mx-4: o <main> tem px-3 no telemovel, e a margem negativa
          maior do que ela punha a pagina a deslizar 4px para o lado. */}
      <div className="sticky z-20 -mx-3 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4"
           style={{ top: 'var(--cab-h, 57px)' }}>
        <select className="input w-auto" value={ano} onChange={e => setAno(Number(e.target.value))}>
          {anos.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="input w-auto" value={mes ?? ''}
                onChange={e => setMes(e.target.value === '' ? null : Number(e.target.value))}>
          <option value="">Ano até à data</option>
          {MESES.map((m, i) => (
            <option key={m} value={i + 1}>{m[0].toUpperCase() + m.slice(1)}</option>
          ))}
        </select>
        <select className="input w-auto" value={svc} onChange={e => setSvc(e.target.value)}>
          <option value="all">Todos os serviços</option>
          {SERVICOS.map(s => <option key={s.k} value={s.k}>{s.rot}</option>)}
        </select>
        <select className="input w-auto" value={met} onChange={e => setMet(e.target.value as Metrica)}>
          {Object.entries(METRICAS).map(([k, m]) => <option key={k} value={k}>{m.rot}</option>)}
        </select>
        {hotels.length > 1 && (
          <select className="input w-auto" value={hotelId} onChange={e => setHotelId(e.target.value)}>
            {hotels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        )}
        <span className="ml-auto text-xs text-slate-500">
          <strong className="text-slate-800">{rot}</strong> · {nomeSvc}
          {d.alinhado && ' · homólogo alinhado'}
          {loading && ' · a atualizar…'}
        </span>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi rot={`Faturação · ${rot}`} valor={eur(ea)} a={ea} b={eb} fmt={v => eur(v)} ant={ant} />
        <Kpi rot={`Covers · ${rot}`} valor={num(pa)} a={pa} b={pb} fmt={num} ant={ant} />
        <Kpi rot={`Preço médio · ${rot}`} valor={eur(ta, 2)} a={ta} b={tb} fmt={v => eur(v, 2)} ant={ant} />
        {mostraAcumulado && (
          <Kpi rot={`Acumulado ${ano}`} valor={eur(ya)} a={ya} b={yb} fmt={v => eur(v)} ant={ant} />
        )}
      </div>

      {/* por serviço */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold">Por serviço — {rot.toLowerCase()} contra {ant}</h2>
        <p className="mb-3 text-sm text-slate-500">
          Clica numa linha para ver só esse serviço nos gráficos abaixo.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="th">Serviço</th>
                <th className="th text-right">Faturação</th>
                <th className="th text-right">vs {ant}</th>
                <th className="th text-right">Covers</th>
                <th className="th text-right">vs {ant}</th>
                <th className="th text-right">Preço médio</th>
                <th className="th text-right">vs {ant}</th>
                <th className="th text-center">Diferença €</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {linhas.map(l => {
                const larg = Math.abs(l.dEur ?? 0) / maxDif * 46
                const positivo = (l.dEur ?? 0) >= 0
                return (
                  <tr key={l.k}
                      onClick={() => setSvc(svc === l.k ? 'all' : l.k)}
                      className={`cursor-pointer ${svc === l.k ? 'bg-brand-50' : 'hover:bg-slate-50'}`}>
                    <td className="td">{l.rot}</td>
                    <td className="td text-right tabular-nums">{eur(l.aEur)}</td>
                    <td className={`td text-right tabular-nums ${corDelta(l.pEur)}`}>
                      {seta(l.pEur)} {pct(l.pEur)}
                    </td>
                    <td className="td text-right tabular-nums">{num(l.aPax)}</td>
                    <td className={`td text-right tabular-nums ${corDelta(l.pPax)}`}>
                      {seta(l.pPax)} {pct(l.pPax)}
                    </td>
                    <td className="td text-right tabular-nums">{eur(l.aTm, 2)}</td>
                    <td className={`td text-right tabular-nums ${corDelta(l.pTm)}`}>
                      {seta(l.pTm)} {pct(l.pTm)}
                    </td>
                    <td className="td">
                      <div className="relative mx-auto h-3 w-24">
                        <div className="absolute inset-y-0 left-1/2 w-px bg-slate-300" />
                        <div className="absolute inset-y-0 rounded-sm"
                             style={{
                               width: `${Math.max(larg, 1.5)}%`,
                               left: positivo ? '50%' : `${50 - Math.max(larg, 1.5)}%`,
                               background: positivo ? '#0ca30c' : '#d03b3b',
                             }} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Uma quebra pode vir de menos gente ou de cada pessoa gastar menos — as duas colunas
          do meio dizem qual dos dois.
        </p>
      </div>

      {/* evolução mensal */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold">
          Evolução mensal — {nomeSvc} · {METRICAS[met].rot.toLowerCase()}
        </h2>
        <p className="mb-2 text-sm text-slate-500">
          Cada mês de {ano} contra o mesmo mês de {ant}.
        </p>
        <Legenda ano={String(ano)} ant={ant} />
        <BarrasAno dados={pontosMensal} ano={String(ano)} ant={ant} fmt={fmt} altura={230} />
        {ano === d.anoAtual && (
          <p className="mt-2 text-xs text-slate-500">
            {MESES[d.mesAtual - 1]} de {ano} só tem {diaDoIso(d.ate)} dias — a barra está tracejada por isso.
          </p>
        )}
      </div>

      {/* dia a dia */}
      <div className={`card p-4 ${mes == null ? 'opacity-60' : ''}`}>
        <h2 className="text-sm font-semibold">
          Dia a dia — {nomeSvc} · {METRICAS[met].rot.toLowerCase()}
        </h2>
        {mes == null ? (
          <p className="text-sm text-slate-500">Escolhe um mês em cima para abrir o detalhe diário.</p>
        ) : !pontosDia.length ? (
          <p className="text-sm text-slate-500">Não há registos neste mês nem no homólogo.</p>
        ) : (
          <>
            <p className="mb-2 text-sm text-slate-500">
              Cada dia contra o mesmo dia da semana de {ant} — 52 semanas antes, não a mesma
              data. Fim de semana com fundo sombreado.
            </p>
            <Legenda ano={String(ano)} ant={ant} />
            <BarrasAno dados={pontosDia} ano={String(ano)} ant={ant} fmt={fmt} altura={210} magro
                       seleccionado={diasDoMes.findIndex(x => x.d === diaSel)}
                       aoClicar={(_, i) => setDiaSel(diasDoMes[i]?.d ?? null)} />
            {pares.length > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                Nos {pares.length} dias com os dois anos preenchidos:{' '}
                <strong>{eur(totA)}</strong> contra {eur(totB)},{' '}
                <span className={corDelta(variacao(totA, totB))}>{pct(variacao(totA, totB))}</span>.
                {piores.length > 0 && (
                  <> Os que mais pesaram: {piores.map(p =>
                    `${rotDia(p)} (${p.dif > 0 ? '+' : '−'}${eur(Math.abs(p.dif))})`).join(', ')}.
                    O melhor foi {rotDia(melhor)} ({melhor.dif > 0 ? '+' : '−'}
                    {eur(Math.abs(melhor.dif))}).</>
                )}
              </p>
            )}
          </>
        )}
      </div>

      {/* o dia escolhido, serviço a serviço */}
      {mes != null && pontosDia.length > 0 && (
        <QuadroDoDia dia={diasDoMes.find(x => x.d === diaSel) ?? null}
                     ano={ano} mes={mes} />
      )}

      {/* sazonalidade semanal */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold">
          Sazonalidade semanal — {nomeSvc} · {METRICAS[met].rot.toLowerCase()}
        </h2>
        <p className="mb-2 text-sm text-slate-500">
          Média por dia da semana, de 1 de janeiro até ao mesmo ponto de cada ano.
        </p>
        <Legenda ano={String(ano)} ant={ant} />
        <BarrasAno dados={pontosSemana} ano={String(ano)} ant={ant} fmt={fmt} altura={200} />
      </div>

      {/* off checks */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold">Off checks</h2>
        <p className="mb-3 text-sm text-slate-500">
          Consumos oferecidos ou internos. Não dependem do serviço escolhido.
        </p>
        {!d.off?.length ? (
          <p className="text-sm text-slate-500">Sem off checks registados neste período.</p>
        ) : (
          <BarrasAno
            dados={d.off.map(o => ({
              rot: `${MESES3[Number(o.m.slice(5, 7)) - 1]} ${o.m.slice(2, 4)}`,
              tit: `${MESES[Number(o.m.slice(5, 7)) - 1]} de ${o.m.slice(0, 4)}`,
              a: o.v, b: null,
            }))}
            ano="valor" ant="" fmt={v => eur(v)} altura={190} />
        )}
        {!!d.offNomes?.length && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-slate-500">
              Quem aparece mais nos off checks de refeições
            </summary>
            <table className="mt-2 w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="th">Nome</th>
                  <th className="th text-right">Vezes</th>
                  <th className="th text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {d.offNomes.map(n => (
                  <tr key={n.n}>
                    <td className="td">{n.n}</td>
                    <td className="td text-right tabular-nums">{n.x}</td>
                    <td className="td text-right tabular-nums">{eur(n.v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>
    </div>
  )
}

function Kpi({ rot, valor: v, a, b, fmt, ant }: {
  rot: string; valor: string; a: number | null; b: number | null
  fmt: (n: number) => string; ant: string
}) {
  const dp = variacao(a, b)
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{rot}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{v}</div>
      <div className="mt-0.5 text-xs text-slate-500">
        {dp == null ? 'sem homólogo' : (
          <>
            <span className={`font-semibold ${corDelta(dp)}`}>{seta(dp)} {pct(dp)}</span>
            {' '}vs {fmt(b as number)} em {ant}
          </>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ o dia escolhido */

/**
 * Um dia, serviço a serviço, contra o homólogo.
 *
 * É o quadro que responde a «como correu ontem, e como tinha corrido no ano
 * passado?» — a pergunta que os gráficos ao lado não respondem, porque mostram
 * um serviço de cada vez.
 *
 * O homólogo é o **mesmo dia da semana** 52 semanas antes, e não a mesma data
 * do calendário: num restaurante, comparar uma quarta com uma terça explica
 * sozinho metade da variação. É a convenção que o resto do painel já usa e a
 * data exacta está escrita no cabeçalho, para nunca haver dúvida sobre contra
 * o que se está a comparar.
 *
 * As nove colunas não cabem num telemóvel. Em vez de as encolher até não se
 * lerem, mostra-se uma métrica de cada vez e os três botões escolhem qual; no
 * computador aparecem as três.
 */
function QuadroDoDia({ dia, ano, mes }: { dia: Dia | null; ano: number; mes: number }) {
  const [metDia, setMetDia] = useState<Metrica>('eur')

  if (!dia) {
    return (
      <div className="card border-dashed p-4">
        <h2 className="text-sm font-semibold">Um dia, serviço a serviço</h2>
        <p className="mt-1 text-sm text-slate-500">
          Clica num dia no gráfico aqui em cima para ver a faturação, os covers e o
          preço médio desse dia em todos os serviços, contra o mesmo dia da semana
          do ano passado.
        </p>
      </div>
    )
  }

  const semHomologo = dia.bEur == null
  const semEsteAno = dia.aEur == null

  const dA = `${diaDoIso(dia.d)} de ${MESES[mes - 1]} de ${ano}`
  const dB = `${DIAS_SEMANA[dia.dow - 1].toLowerCase()}, ${diaDoIso(dia.bData)} de ` +
             `${MESES[Number(dia.bData.slice(5, 7)) - 1]} de ${dia.bData.slice(0, 4)}`

  /*
   * Um dia que ainda não aconteceu — ou que ainda não foi lançado — tem o
   * homólogo preenchido e este ano vazio. Mostrar a tabela aqui dava uma coluna
   * de zeros e sete variações de −100%: não é uma quebra, é um dia que ainda
   * não existe, e a diferença entre as duas coisas é tudo.
   */
  if (semEsteAno) {
    const h = totalDasLinhas(linhasPorServico(
      { aEur: [], aPax: [], bEur: dia.bEur ?? [], bPax: dia.bPax ?? [] }, 'servico'))
    return (
      <div className="card p-4">
        <h2 className="text-sm font-semibold">{DIAS_SEMANA[dia.dow - 1]}, {dA}</h2>
        <p className="mt-1 text-sm text-slate-500">
          Ainda não há faturação lançada neste dia.
          {h.bEur != null && (
            <> No homólogo — {dB} — fizeram-se <strong>{eur(h.bEur)}</strong> com{' '}
            {num(h.bPax)} covers, a {eur(h.bTm ?? 0, 2)} cada.</>
          )}
        </p>
      </div>
    )
  }

  const linhas = linhasPorServico(serieDoDia(dia), 'servico')
  const total = totalDasLinhas(linhas)

  // No telemóvel só se vê a métrica escolhida; no computador vêem-se as três.
  const grupo = (m: Metrica) => metDia === m ? '' : 'hidden sm:table-cell'

  const celulas = (l: LinhaServico) => {
    const vazia = l.aEur === 0 && l.aPax === 0 && (l.bEur ?? 0) === 0 && (l.bPax ?? 0) === 0
    const c = vazia ? 'text-slate-300' : 'text-slate-700'
    return (
      <>
        <td className={`td text-right tabular-nums ${c} ${grupo('eur')}`}>{eur(l.aEur)}</td>
        <td className={`td text-right tabular-nums text-slate-500 ${grupo('eur')}`}>
          {l.bEur == null ? '—' : eur(l.bEur)}
        </td>
        <td className={`td text-right tabular-nums ${corDelta(l.pEur)} ${grupo('eur')}`}>
          {pct(l.pEur)}
        </td>

        <td className={`td text-right tabular-nums ${c} ${grupo('pax')}`}>{num(l.aPax)}</td>
        <td className={`td text-right tabular-nums text-slate-500 ${grupo('pax')}`}>
          {l.bPax == null ? '—' : num(l.bPax)}
        </td>
        <td className={`td text-right tabular-nums ${corDelta(l.pPax)} ${grupo('pax')}`}>
          {pct(l.pPax)}
        </td>

        <td className={`td text-right tabular-nums ${c} ${grupo('tm')}`}>
          {l.aTm == null ? '—' : eur(l.aTm, 2)}
        </td>
        <td className={`td text-right tabular-nums text-slate-500 ${grupo('tm')}`}>
          {l.bTm == null ? '—' : eur(l.bTm, 2)}
        </td>
        <td className={`td text-right tabular-nums ${corDelta(l.pTm)} ${grupo('tm')}`}>
          {pct(l.pTm)}
        </td>
      </>
    )
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
        <div>
          <h2 className="text-sm font-semibold">
            {DIAS_SEMANA[dia.dow - 1]}, {dA}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            contra {dB} — o mesmo dia da semana, 52 semanas antes
          </p>
        </div>
        {/* só no telemóvel: no computador as três métricas estão todas à vista */}
        <div className="flex gap-1 sm:hidden">
          {(Object.keys(METRICAS) as Metrica[]).map(m => (
            <button key={m} onClick={() => setMetDia(m)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                      metDia === m ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {METRICAS[m].rot}
            </button>
          ))}
        </div>
      </div>

      {semHomologo && (
        <p className="mx-4 mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Não há registo de {dB}. Esta casa ainda não tem um ano inteiro de
          faturação lançada, por isso as variações ficam por calcular.
        </p>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            {/* a linha dos grupos não cabe no telemóvel, onde há uma métrica só */}
            <tr className="hidden border-b border-slate-100 sm:table-row">
              <th className="th" />
              <th className="th !text-center" colSpan={3}>Faturação</th>
              <th className="th !text-center" colSpan={3}>Covers</th>
              <th className="th !text-center" colSpan={3}>Preço médio</th>
            </tr>
            <tr className="border-b border-slate-200">
              <th className="th">Serviço</th>
              {(['eur', 'pax', 'tm'] as Metrica[]).map(m => (
                <Fragment key={m}>
                  <th className={`th !text-right ${grupo(m)}`}>{ano}</th>
                  <th className={`th !text-right ${grupo(m)}`}>{ano - 1}</th>
                  <th className={`th !text-right ${grupo(m)}`}>Var.</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map(l => (
              <tr key={l.k} className="border-b border-slate-50">
                <td className="td whitespace-nowrap font-medium">{l.rot}</td>
                {celulas(l)}
              </tr>
            ))}
            <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
              <td className="td whitespace-nowrap">{total.rot}</td>
              {celulas(total)}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="px-4 py-3 text-xs text-slate-400">
        O preço médio do total é a faturação toda a dividir pelos covers todos — e
        não a média dos preços médios de cada serviço.
      </p>
    </div>
  )
}
