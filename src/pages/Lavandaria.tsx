import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../lib/appState'
import { useAuth } from '../lib/auth'
import {
  MESES_CURTOS, SECCOES, anoDe, apagarArtigo, linhasAGravar, problemaDasLinhas,
  type LinhaEdit, apagarFatura, corSeccao, criarArtigo,
  criarFatura, fetchArtigos, fetchLinhas, fetchPeriodos, garantirArtigos, guardarArtigo,
  guardarFatura, gravarLinhas, mesDe, ocupacaoDoPeriodo, parecidoCom, renomearArtigo,
  rotSeccao, semanaISO, somar, usosDoArtigo, variacao,
  type Artigo, type Linha, type Ocupacao, type Periodo, type Seccao,
} from '../lib/lavandaria'
import { dmy, money, qty } from '../lib/format'
import { Loading, Modal, NumInput, StatCard, useToast } from '../components/ui'
import BarrasAno from '../components/BarrasAno'

const eur2 = (v: number | null) =>
  v == null ? '—' : `${v.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const pct1 = (v: number) => `${(v * 100).toLocaleString('pt-PT', { maximumFractionDigits: 1 })}%`

export default function Lavandaria() {
  const { hotelId } = useApp()
  const { email, isAdmin } = useAuth()
  const toast = useToast()

  const [periodos, setPeriodos] = useState<Periodo[]>([])
  const [artigos, setArtigos] = useState<Artigo[]>([])
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [anos, setAnos] = useState<number[]>([])
  const [meses, setMeses] = useState<number[]>([])
  const [anosComp, setAnosComp] = useState<number[]>([])
  const [mesesComp, setMesesComp] = useState<number[]>([])
  const [detalhe, setDetalhe] = useState<string | null>(null)
  const [nova, setNova] = useState(false)
  const [catalogo, setCatalogo] = useState(false)

  const carregar = () => {
    if (!hotelId) return
    setLoading(true)
    fetchPeriodos(hotelId)
      .then(async ps => {
        setPeriodos(ps)
        const [as, ls] = await Promise.all([fetchArtigos(), fetchLinhas(ps.map(p => p.id))])
        setArtigos(as); setLinhas(ls)
      })
      .catch(e => setErro((e as Error).message))
      .finally(() => setLoading(false))
  }
  useEffect(carregar, [hotelId])

  const anosDisponiveis = useMemo(
    () => [...new Set(periodos.map(p => anoDe(p.periodo_fim)))].sort(), [periodos])

  // Sem filtro escolhido, mostra-se o ano mais recente — é o que interessa ao abrir.
  useEffect(() => {
    if (!anos.length && anosDisponiveis.length) setAnos([anosDisponiveis[anosDisponiveis.length - 1]])
  }, [anosDisponiveis])

  const filtrar = (as: number[], ms: number[]) => periodos.filter(p =>
    (!as.length || as.includes(anoDe(p.periodo_fim))) &&
    (!ms.length || ms.includes(mesDe(p.periodo_fim))))

  const seleccao = useMemo(() => filtrar(anos, meses), [periodos, anos, meses])
  const comparacao = useMemo(
    () => (anosComp.length || mesesComp.length
      ? filtrar(anosComp, mesesComp.length ? mesesComp : meses)
      : []),
    [periodos, anosComp, mesesComp, meses])

  const T = useMemo(() => somar(seleccao), [seleccao])
  const C = useMemo(() => somar(comparacao), [comparacao])
  const delta = variacao(T.custoQuarto, C.custoQuarto)

  const porArtigo = useMemo(() => {
    const ids = new Set(seleccao.map(p => p.id))
    const cat = Object.fromEntries(artigos.map(a => [a.nome, a]))
    const m: Record<string, { valor: number; pecas: number; seccao: Seccao }> = {}
    for (const l of linhas) {
      if (!ids.has(l.fatura_id)) continue
      const s = (cat[l.artigo]?.seccao ?? 'alojamento') as Seccao
      const e = (m[l.artigo] ??= { valor: 0, pecas: 0, seccao: s })
      e.valor += l.valor; e.pecas += l.quantidade
    }
    return Object.entries(m).map(([nome, v]) => ({ nome, ...v }))
      .filter(a => a.valor > 0)
      .sort((a, b) => b.valor - a.valor)
  }, [linhas, seleccao, artigos])

  /** Alinha selecção e comparação pela semana do ano, não pela data. */
  const semanas = useMemo(() => {
    const chave = (ps: Periodo[]) => {
      const m: Record<number, Periodo> = {}
      for (const p of ps) m[semanaISO(p.periodo_fim)] = p
      return m
    }
    const a = chave(seleccao), b = chave(comparacao)
    const todas = [...new Set([...Object.keys(a), ...Object.keys(b)].map(Number))].sort((x, y) => x - y)
    return todas.map(s => ({
      rot: `S${s}`,
      tit: a[s] ? `${dmy(a[s].periodo_inicio)} – ${dmy(a[s].periodo_fim)}` : `Semana ${s}`,
      subTit: a[s] ? `${a[s].quartos} quartos` : undefined,
      a: a[s]?.custo_quarto ?? null,
      b: b[s]?.custo_quarto ?? null,
    }))
  }, [seleccao, comparacao])

  const alternar = (v: number, lista: number[], set: (n: number[]) => void) =>
    set(lista.includes(v) ? lista.filter(x => x !== v) : [...lista, v].sort((a, b) => a - b))

  if (loading) return <Loading />
  if (erro) {
    return (
      <div className="card p-6 text-sm">
        <h2 className="mb-2 font-semibold text-red-600">Não foi possível abrir a lavandaria</h2>
        <p className="text-slate-600">{erro}</p>
      </div>
    )
  }

  const rotuloSeleccao = anos.length === 1 ? String(anos[0]) : 'selecção'
  const rotuloComp = anosComp.length === 1 ? String(anosComp[0]) : 'comparação'

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------------- filtros */}
      <div className="card space-y-2 p-4">
        <Filtro rot="Ano" valores={anosDisponiveis} activos={anos}
                onAlternar={v => alternar(v, anos, setAnos)}
                etiqueta={String} />
        <Filtro rot="Mês" valores={[1,2,3,4,5,6,7,8,9,10,11,12]} activos={meses}
                onAlternar={v => alternar(v, meses, setMeses)}
                etiqueta={m => MESES_CURTOS[m - 1]} />
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {(anos.length > 0 || meses.length > 0) && (
            <button className="btn-ghost text-sm" onClick={() => { setAnos([]); setMeses([]) }}>
              ✕ Limpar
            </button>
          )}
          <span className="ml-auto text-xs text-slate-400">
            {seleccao.length} de {periodos.length} períodos
          </span>
        </div>
      </div>

      <div className="card space-y-2 border-l-4 border-l-[#eb6834] p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-[#c9531f]">
          Comparar com
        </div>
        <Filtro rot="Ano" valores={anosDisponiveis} activos={anosComp}
                onAlternar={v => alternar(v, anosComp, setAnosComp)}
                etiqueta={String} cor="#eb6834" />
        <Filtro rot="Mês" valores={[1,2,3,4,5,6,7,8,9,10,11,12]} activos={mesesComp}
                onAlternar={v => alternar(v, mesesComp, setMesesComp)}
                etiqueta={m => MESES_CURTOS[m - 1]} cor="#eb6834" />
        <div className="flex items-center gap-2 pt-1">
          {(anosComp.length > 0 || mesesComp.length > 0) && (
            <button className="btn-ghost text-sm"
                    onClick={() => { setAnosComp([]); setMesesComp([]) }}>✕</button>
          )}
          <span className="ml-auto text-xs text-slate-400">
            {comparacao.length
              ? `${comparacao.length} períodos`
              : 'sem comparação — escolhe um ano'}
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------------- KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="€/quarto" value={eur2(T.custoQuarto)} tone="brand"
                  hint={`${T.periodos} períodos · ${qty(T.quartos)} quartos`} />
        <StatCard
          label="vs comparação"
          value={delta == null ? '—' : `${delta < 0 ? '▼' : '▲'} ${pct1(Math.abs(delta))}`}
          tone={delta == null ? 'default' : delta < 0 ? 'default' : 'warn'}
          hint={C.custoQuarto == null ? 'escolhe um período' : `${eur2(C.custoQuarto)}/quarto`}
        />
        <StatCard label="Total lavandaria" value={money(T.alojamento)}
                  hint="rouparia de alojamento" />
        <StatCard label="Peças/quarto" value={T.pecasQuarto == null ? '—' : qty(Math.round((T.pecasQuarto) * 10) / 10)}
                  hint={`${qty(T.pecas)} peças no total`} />
        <StatCard label="Restauração" value={money(T.restauracao)}
                  hint={T.restauracaoQuarto == null ? '' : `${eur2(T.restauracaoQuarto)} / quarto`} />
        <StatCard label="Períodos" value={T.periodos}
                  hint={T.de && T.ate ? `${dmy(T.de)} → ${dmy(T.ate)}` : ''} />
      </div>

      {/* ---------------------------------------------------------- gráficos */}
      {semanas.length > 0 && (
        <div className="card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-700">€/quarto por semana</h3>
            <span className="text-xs text-slate-400">
              {comparacao.length
                ? `${rotuloSeleccao} vs ${rotuloComp}, alinhado pela semana do ano`
                : rotuloSeleccao}
            </span>
          </div>
          <BarrasAno
            dados={semanas} ano={rotuloSeleccao} ant={rotuloComp}
            fmt={v => eur2(v)} altura={230} magro={semanas.length > 16}
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <CustoPorArtigo linhas={porArtigo} total={T.alojamento + T.restauracao + T.outros} />
        <div className="space-y-4">
          <Distribuicao t={T} />
          <QuartosPorMes periodos={seleccao} />
        </div>
      </div>

      {/* ---------------------------------------------------------- histórico */}
      <div className="card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-700">Histórico de períodos</h3>
          <div className="flex gap-2">
            <button className="btn-ghost text-sm" onClick={() => setCatalogo(true)}>
              Peças
            </button>
            <button className="btn-primary text-sm" onClick={() => setNova(true)}>
              + Adicionar fatura
            </button>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="th">Período</th>
                <th className="th text-right">Quartos</th>
                <th className="th text-right">Subtotal quartos</th>
                <th className="th text-right">€/quarto</th>
                <th className="th text-right">Peças/quarto</th>
                <th className="th text-right">vs anterior</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {[...seleccao].reverse().map((p, i, arr) => {
                const ant = arr[i + 1]
                const d = variacao(p.custo_quarto, ant?.custo_quarto ?? null)
                return (
                  <tr key={p.id} className="border-b border-slate-100">
                    <td className="td">
                      <div className="font-medium text-slate-800">
                        {dmy(p.periodo_inicio)} – {dmy(p.periodo_fim)}
                      </div>
                      {p.numero && <div className="text-[11px] text-slate-400">{p.numero}</div>}
                    </td>
                    <td className="td text-right tabular-nums">{qty(p.quartos)}</td>
                    <td className="td text-right tabular-nums">{money(p.sub_alojamento)}</td>
                    <td className="td text-right font-semibold tabular-nums">{eur2(p.custo_quarto)}</td>
                    <td className="td text-right tabular-nums text-slate-500">
                      {p.pecas_quarto == null ? '—' : qty(Math.round(p.pecas_quarto * 10) / 10)}
                    </td>
                    <td className="td text-right tabular-nums">
                      {d == null ? <span className="text-slate-300">—</span> : (
                        <span className={d < 0 ? 'text-[#0ca30c]' : 'text-[#d03b3b]'}>
                          {d < 0 ? '▼' : '▲'} {pct1(Math.abs(d))}
                        </span>
                      )}
                    </td>
                    <td className="td text-right">
                      <button className="text-sm text-brand-600 hover:underline"
                              onClick={() => setDetalhe(p.id)}>ver</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {seleccao.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">
              Nenhum período com estes filtros.
            </div>
          )}
        </div>
      </div>

      {detalhe && (
        <Detalhe
          periodo={periodos.find(p => p.id === detalhe)!}
          linhas={linhas.filter(l => l.fatura_id === detalhe)}
          artigos={artigos}
          podeApagar={isAdmin}
          onFechar={() => setDetalhe(null)}
          onApagar={async () => {
            if (!confirm('Apagar esta fatura e as suas linhas?')) return
            await apagarFatura(detalhe)
            setDetalhe(null); carregar(); toast('Fatura apagada')
          }}
          onGravado={() => { setDetalhe(null); carregar(); toast('Fatura corrigida') }}
        />
      )}

      {nova && hotelId && (
        <NovaFatura
          hotelId={hotelId} email={email} artigos={artigos}
          onFechar={() => setNova(false)}
          onGravado={() => { setNova(false); carregar(); toast('Fatura registada') }}
        />
      )}

      {catalogo && (
        <Catalogo artigos={artigos} onFechar={() => setCatalogo(false)}
                  onMudou={carregar} />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ filtros */

function Filtro<T extends number>({
  rot, valores, activos, onAlternar, etiqueta, cor = '#2a78d6',
}: {
  rot: string
  valores: T[]
  activos: T[]
  onAlternar: (v: T) => void
  etiqueta: (v: T) => string
  cor?: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-8 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {rot}
      </span>
      {valores.map(v => {
        const on = activos.includes(v)
        return (
          <button
            key={v}
            onClick={() => onAlternar(v)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              on ? 'text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            style={on ? { backgroundColor: cor } : undefined}
          >
            {etiqueta(v)}
          </button>
        )
      })}
    </div>
  )
}

/* ----------------------------------------------------------------- gráficos */

/**
 * Barras horizontais por artigo. Uma só série, por isso uma só cor — a ordem
 * já transmite a grandeza e um degradé seria redundante.
 */
function CustoPorArtigo({
  linhas, total,
}: {
  linhas: { nome: string; valor: number; pecas: number; seccao: Seccao }[]
  total: number
}) {
  const [tudo, setTudo] = useState(false)
  const visiveis = tudo ? linhas : linhas.slice(0, 10)
  const max = Math.max(...linhas.map(l => l.valor), 1)

  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-slate-700">Custo por artigo</h3>
      <p className="text-xs text-slate-400">acumulado no período seleccionado</p>

      <div className="mt-3 space-y-1.5">
        {visiveis.map(l => (
          <div key={l.nome}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-slate-700" title={l.nome}>{l.nome}</span>
              <span className="shrink-0 tabular-nums text-slate-500">
                {money(l.valor)}
                <span className="ml-1.5 text-slate-400">
                  {total > 0 ? `${Math.round((l.valor / total) * 100)}%` : ''}
                </span>
              </span>
            </div>
            <div className="mt-0.5 h-2 w-full rounded-sm bg-slate-100">
              <div
                className="h-2 rounded-sm"
                style={{ width: `${Math.max(1, (l.valor / max) * 100)}%`,
                         backgroundColor: corSeccao(l.seccao) }}
                title={`${qty(l.pecas)} peças · ${money(l.valor)}`}
              />
            </div>
          </div>
        ))}
      </div>

      {linhas.length > 10 && (
        <button className="mt-3 text-sm text-brand-700 hover:underline"
                onClick={() => setTudo(t => !t)}>
          {tudo ? 'Mostrar só os 10 maiores' : `Ver os outros ${linhas.length - 10}`}
        </button>
      )}
      {linhas.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-400">Sem linhas no período.</p>
      )}
    </div>
  )
}

/**
 * Onde vai o dinheiro, por secção. Uma barra empilhada em vez de um donut:
 * com três partes lê-se melhor a proporção e cabe o valor ao lado do nome.
 */
function Distribuicao({ t }: { t: ReturnType<typeof somar> }) {
  const total = t.alojamento + t.restauracao + t.outros
  const partes = [
    { s: 'alojamento' as Seccao, v: t.alojamento },
    { s: 'restauracao' as Seccao, v: t.restauracao },
    { s: 'outros' as Seccao, v: t.outros },
  ].filter(p => p.v > 0)

  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-slate-700">Distribuição por secção</h3>
      <p className="text-xs text-slate-400">{money(total)} no período seleccionado</p>

      <div className="mt-3 flex h-3 w-full gap-0.5 overflow-hidden rounded-sm">
        {partes.map(p => (
          <div key={p.s} style={{ width: `${(p.v / total) * 100}%`, backgroundColor: corSeccao(p.s) }}
               title={`${rotSeccao(p.s)}: ${money(p.v)}`} />
        ))}
      </div>

      <dl className="mt-3 space-y-1 text-sm">
        {SECCOES.map(s => {
          const v = s.v === 'alojamento' ? t.alojamento
            : s.v === 'restauracao' ? t.restauracao : t.outros
          if (v <= 0) return null
          return (
            <div key={s.v} className="flex items-baseline justify-between gap-2">
              <dt className="flex items-center gap-1.5 text-slate-600">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: s.cor }} />
                {s.rot}
              </dt>
              <dd className="tabular-nums text-slate-800">
                {money(v)}
                <span className="ml-1.5 text-xs text-slate-400">
                  {total > 0 ? `${Math.round((v / total) * 100)}%` : ''}
                </span>
              </dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}

function QuartosPorMes({ periodos }: { periodos: Periodo[] }) {
  const meses = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of periodos) {
      const k = p.periodo_fim.slice(0, 7)
      m[k] = (m[k] ?? 0) + p.quartos
    }
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b))
  }, [periodos])
  const max = Math.max(...meses.map(([, v]) => v), 1)

  if (!meses.length) return null
  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-slate-700">Quartos por mês</h3>
      <p className="text-xs text-slate-400">o denominador de tudo o resto</p>
      <div className="mt-3 space-y-1">
        {meses.map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-xs text-slate-500">
              {MESES_CURTOS[Number(k.slice(5)) - 1]} {k.slice(2, 4)}
            </span>
            <div className="h-2 flex-1 rounded-sm bg-slate-100">
              <div className="h-2 rounded-sm bg-[#2a78d6]"
                   style={{ width: `${(v / max) * 100}%` }} />
            </div>
            <span className="w-14 shrink-0 text-right text-xs tabular-nums text-slate-600">
              {qty(v)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- detalhe */

/**
 * Uma fatura já gravada: ver e corrigir.
 *
 * Era só de leitura, e por isso corrigir uma peça obrigava a apagar a fatura
 * inteira e a lançá-la outra vez — num lançamento de trinta linhas, por causa
 * de uma.
 *
 * Abre fechada, com os números a serem lidos; o botão «Corrigir» é que abre os
 * campos. Não é cerimónia: estes números reescrevem o €/quarto do período, e
 * uma tabela de campos editáveis convida a mexer em coisas que só se vieram
 * consultar.
 */
function Detalhe({
  periodo, linhas, artigos, podeApagar, onFechar, onApagar, onGravado,
}: {
  periodo: Periodo
  linhas: Linha[]
  artigos: Artigo[]
  podeApagar: boolean
  onFechar: () => void
  onApagar: () => void
  onGravado: () => void
}) {
  const toast = useToast()
  const cat = Object.fromEntries(artigos.map(a => [a.nome, a]))
  const ordenadas = [...linhas].sort((a, b) => b.valor - a.valor)

  const [aCorrigir, setACorrigir] = useState(false)
  const [ls, setLs] = useState<LinhaEdit[]>([])
  const [quartos, setQuartos] = useState(periodo.quartos)
  const [iva, setIva] = useState(periodo.total_com_iva ?? 0)
  const [aGravar, setAGravar] = useState(false)

  const abrirCorreccao = () => {
    setLs(ordenadas.map(l => ({ artigo: l.artigo, quantidade: l.quantidade, valor: l.valor })))
    setQuartos(periodo.quartos)
    setIva(periodo.total_com_iva ?? 0)
    setACorrigir(true)
  }

  const gravar = async () => {
    const mau = problemaDasLinhas(ls)
    if (mau) { toast(mau, 'erro'); return }
    if (quartos <= 0) { toast('Os quartos ocupados têm de ser mais do que zero', 'erro'); return }
    setAGravar(true)
    try {
      const usadas = linhasAGravar(ls)
      await garantirArtigos(usadas.map(l => l.artigo))
      await guardarFatura(periodo.id, {
        quartos, total_com_iva: iva > 0 ? iva : null,
      })
      // as linhas reescrevem-se todas: o `gravarLinhas` apaga e volta a pôr
      await gravarLinhas(periodo.id, usadas)
      onGravado()
    } catch (e) {
      // de propósito não se fecha nada: o que está no ecrã é o que falta gravar,
      // e fechar aqui era a única forma de o perder
      toast((e as Error).message, 'erro')
      setAGravar(false)
    }
  }

  const subtotal = ls.reduce((s, l) => s + l.valor, 0)
  const pecas = ls.reduce((s, l) => s + l.quantidade, 0)

  return (
    <Modal open onClose={onFechar} wide
           title={`${dmy(periodo.periodo_inicio)} – ${dmy(periodo.periodo_fim)}`}>
      <div className="grid gap-3 sm:grid-cols-4">
        <Mini rot="Quartos" v={qty(periodo.quartos)} />
        <Mini rot="€/quarto" v={eur2(periodo.custo_quarto)} />
        <Mini rot="Peças/quarto" v={periodo.pecas_quarto == null ? '—'
          : qty(Math.round(periodo.pecas_quarto * 10) / 10)} />
        <Mini rot="Total c/ IVA" v={periodo.total_com_iva == null ? '—'
          : money(periodo.total_com_iva)} />
      </div>

      {aCorrigir ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Quartos ocupados</label>
              <NumInput value={quartos} onChange={setQuartos} />
            </div>
            <div>
              <label className="label">Total c/ IVA (opcional)</label>
              <NumInput value={iva} onChange={setIva} />
            </div>
          </div>

          <TabelaLinhas ls={ls} setLs={setLs} artigos={artigos} />

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="text-sm text-slate-600">
              {qty(pecas)} peças · {money(subtotal)} sem IVA
              {quartos > 0 && <> · <strong>{eur2(subtotal / quartos)}/quarto</strong></>}
            </div>
            <div className="ml-auto flex gap-2">
              <button className="btn-ghost" disabled={aGravar}
                      onClick={() => setACorrigir(false)}>Cancelar</button>
              <button className="btn-primary" disabled={aGravar} onClick={gravar}>
                {aGravar ? 'A gravar…' : 'Gravar correcção'}
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="th">Artigo</th>
                <th className="th text-right">Peças</th>
                <th className="th text-right">Valor</th>
                <th className="th text-right">€/peça</th>
              </tr>
            </thead>
            <tbody>
              {ordenadas.map(l => (
                <tr key={l.id} className="border-b border-slate-100">
                  <td className="td">
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle"
                          style={{ backgroundColor: corSeccao(cat[l.artigo]?.seccao ?? 'alojamento') }} />
                    {l.artigo}
                    {/* uma peça que ficou sem entrada no catálogo conta como
                        alojamento por omissão, e isso não se devia adivinhar */}
                    {!cat[l.artigo] && (
                      <span className="ml-1.5 text-[11px] text-amber-700">fora do catálogo</span>
                    )}
                  </td>
                  <td className="td text-right tabular-nums">{qty(l.quantidade)}</td>
                  <td className="td text-right tabular-nums">{money(l.valor)}</td>
                  <td className="td text-right tabular-nums text-slate-500">
                    {l.quantidade > 0 ? eur2(l.valor / l.quantidade) : '—'}
                  </td>
                </tr>
              ))}
              {!ordenadas.length && (
                <tr><td colSpan={4} className="td py-6 text-center text-slate-400">
                  Esta fatura não tem peças lançadas.
                </td></tr>
              )}
            </tbody>
          </table>

          <div className="mt-4 flex items-center gap-4">
            <button className="btn-primary" onClick={abrirCorreccao}>Corrigir</button>
            {podeApagar && (
              <button className="text-sm text-red-600 hover:underline" onClick={onApagar}>
                Apagar esta fatura
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  )
}

const Mini = ({ rot, v }: { rot: string; v: string }) => (
  <div className="rounded-lg bg-slate-50 px-3 py-2">
    <div className="text-[10px] uppercase tracking-wide text-slate-500">{rot}</div>
    <div className="text-sm font-semibold tabular-nums text-slate-800">{v}</div>
  </div>
)

/**
 * O que os turnos dizem sobre o período escolhido. Mostra-se sempre de onde
 * veio o número e o que ficou de fora, porque um total silenciosamente
 * incompleto estraga o €/quarto sem ninguém dar por isso.
 */
function DosTurnos({
  o, aBuscar, manuais, onUsar,
}: {
  o: Ocupacao | null
  aBuscar: boolean
  manuais: boolean
  onUsar: () => void
}) {
  if (aBuscar) {
    return <p className="mt-2 text-xs text-slate-400">a ver os turnos…</p>
  }
  if (!o) return null

  if (o.quartos === 0) {
    return (
      <p className="mt-2 text-xs text-amber-700">
        Não há relatórios de turno para estas datas — escreve os quartos à mão.
      </p>
    )
  }

  const completo = o.faltam.length === 0 && o.suspeitos.length === 0
  return (
    <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${
      completo ? 'bg-slate-50 text-slate-600' : 'bg-amber-50 text-amber-800'}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>
          <strong>{qty(o.quartos)} quartos</strong> nas {o.noites.length} noites de{' '}
          {dmy(o.noites[0])} a {dmy(o.noites[o.noites.length - 1])}, somados dos turnos.
        </span>
        {manuais && (
          <button className="font-medium text-brand-700 hover:underline" onClick={onUsar}>
            usar este valor
          </button>
        )}
      </div>

      {o.faltam.length > 0 && (
        <div className="mt-1">
          Faltam {o.faltam.length} {o.faltam.length === 1 ? 'dia' : 'dias'} sem turno preenchido
          ({o.faltam.map(dmy).join(', ')}) — o total está por baixo do real.
        </div>
      )}
      {o.suspeitos.map(s => (
        <div key={s.dia} className="mt-1">
          {dmy(s.dia)} tem {qty(s.quartos)} quartos no turno, o que parece gralha.
          Convém corrigir antes de gravar.
        </div>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------- nova fatura */

function NovaFatura({
  hotelId, email, artigos, onFechar, onGravado,
}: {
  hotelId: string
  email: string | null
  artigos: Artigo[]
  onFechar: () => void
  onGravado: () => void
}) {
  const toast = useToast()
  const [f, setF] = useState({
    numero: '', inicio: '', fim: '', quartos: 0, iva: 0,
  })
  const [ocupacao, setOcupacao] = useState<Ocupacao | null>(null)
  const [aBuscar, setABuscar] = useState(false)
  // se escreveres o número à mão, a app deixa de o substituir
  const [quartosManuais, setQuartosManuais] = useState(false)

  /* Escolhidas as datas, os quartos vêm dos relatórios de turno. */
  useEffect(() => {
    if (!f.inicio || !f.fim || f.fim < f.inicio) { setOcupacao(null); return }
    let vivo = true
    setABuscar(true)
    ocupacaoDoPeriodo(hotelId, f.inicio, f.fim)
      .then(o => {
        if (!vivo) return
        setOcupacao(o)
        if (!quartosManuais && o.quartos > 0) setF(x => ({ ...x, quartos: o.quartos }))
      })
      .catch(() => { if (vivo) setOcupacao(null) })
      .finally(() => { if (vivo) setABuscar(false) })
    return () => { vivo = false }
  }, [f.inicio, f.fim, hotelId])
  const [ls, setLs] = useState<{ artigo: string; quantidade: number; valor: number }[]>(
    artigos.filter(a => a.conta_para_quarto)
      .map(a => ({ artigo: a.nome, quantidade: 0, valor: 0 })))
  const [aGravar, setAGravar] = useState(false)

  const subtotal = ls.reduce((s, l) => s + l.valor, 0)
  const pecas = ls.reduce((s, l) => s + l.quantidade, 0)

  const gravar = async () => {
    if (!f.inicio || !f.fim) { toast('Indica o período', 'erro'); return }
    if (f.quartos <= 0) { toast('Indica os quartos ocupados', 'erro'); return }
    const mau = problemaDasLinhas(ls)
    if (mau) { toast(mau, 'erro'); return }
    setAGravar(true)
    try {
      const usadas = linhasAGravar(ls)
      await garantirArtigos(usadas.map(l => l.artigo))
      const id = await criarFatura({
        hotel_id: hotelId,
        numero: f.numero.trim() || null,
        periodo_inicio: f.inicio,
        periodo_fim: f.fim,
        quartos: f.quartos,
        total_com_iva: f.iva > 0 ? f.iva : null,
        atualizado_por: email,
      })
      await gravarLinhas(id, usadas)
      onGravado()
    } catch (e) {
      toast((e as Error).message, 'erro')
      setAGravar(false)
    }
  }

  return (
    <Modal open onClose={onFechar} title="Nova fatura" wide>
      <div className="grid gap-3 sm:grid-cols-5">
        <div className="sm:col-span-2">
          <label className="label">Nº da fatura</label>
          <input className="input" value={f.numero}
                 onChange={e => setF({ ...f, numero: e.target.value })} />
        </div>
        <div>
          <label className="label">Início</label>
          <input type="date" className="input" value={f.inicio}
                 onChange={e => setF({ ...f, inicio: e.target.value })} />
        </div>
        <div>
          <label className="label">Fim</label>
          <input type="date" className="input" value={f.fim}
                 onChange={e => setF({ ...f, fim: e.target.value })} />
        </div>
        <div>
          <label className="label">Quartos ocupados</label>
          <NumInput
            value={f.quartos}
            onChange={n => { setQuartosManuais(true); setF({ ...f, quartos: n }) }}
          />
        </div>
      </div>

      <DosTurnos
        o={ocupacao} aBuscar={aBuscar} manuais={quartosManuais}
        onUsar={() => { setQuartosManuais(false)
                        if (ocupacao) setF(x => ({ ...x, quartos: ocupacao.quartos })) }}
      />

      <TabelaLinhas ls={ls} setLs={setLs} artigos={artigos} />

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Total c/ IVA (opcional)</label>
          <NumInput value={f.iva} onChange={n => setF({ ...f, iva: n })} />
        </div>
        <div className="text-sm text-slate-600">
          {qty(pecas)} peças · {money(subtotal)} sem IVA
          {f.quartos > 0 && <> · <strong>{eur2(subtotal / f.quartos)}/quarto</strong></>}
        </div>
        <button className="btn-primary ml-auto" disabled={aGravar} onClick={gravar}>
          {aGravar ? 'A gravar…' : 'Gravar fatura'}
        </button>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------- linhas da fatura */

/**
 * A tabela de peças de uma fatura, em modo de escrita.
 *
 * É a mesma nos dois sítios — ao lançar e ao corrigir — de propósito: eram duas
 * tabelas parecidas a divergir devagar, e quem corrige uma fatura espera
 * exactamente o ecrã onde a lançou.
 *
 * O nome da peça é um campo livre com sugestões, e não uma lista fechada. Tinha
 * de ser: a fatura da lavandaria traz peças que ainda não estão no catálogo, e
 * uma lista fechada obrigava a sair daqui para as acrescentar antes de poder
 * lançar. Em troca, avisa-se quando o que se escreveu já existe escrito de
 * outra maneira — é assim que nascem os duplicados.
 */
function TabelaLinhas({ ls, setLs, artigos }: {
  ls: LinhaEdit[]
  setLs: (f: (x: LinhaEdit[]) => LinhaEdit[]) => void
  artigos: Artigo[]
}) {
  const mudar = (i: number, patch: Partial<LinhaEdit>) =>
    setLs(x => x.map((y, k) => (k === i ? { ...y, ...patch } : y)))

  return (
    <>
      <datalist id="lav-artigos">
        {artigos.map(a => <option key={a.nome} value={a.nome} />)}
      </datalist>

      <div className="mt-4 max-h-[45vh] overflow-y-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="th">Artigo</th>
              <th className="th w-24 text-right">Peças</th>
              <th className="th w-28 text-right">Valor</th>
              <th className="th w-8" />
            </tr>
          </thead>
          <tbody>
            {ls.map((l, i) => {
              // o mesmo nome escrito de outra maneira ja existe no catalogo
              const igual = parecidoCom(l.artigo, artigos)
              const avisa = igual && igual !== l.artigo
              return (
                <tr key={i} className="border-t border-slate-100">
                  <td className="td">
                    <input className="input px-2 py-1 text-sm" list="lav-artigos"
                           value={l.artigo} placeholder="nome da peça"
                           onChange={e => mudar(i, { artigo: e.target.value })} />
                    {avisa && (
                      <button className="mt-1 block text-left text-[11px] text-amber-700 hover:underline"
                              onClick={() => mudar(i, { artigo: igual })}>
                        Já existe «{igual}» — usar essa?
                      </button>
                    )}
                  </td>
                  <td className="td">
                    <NumInput className="px-2 py-1 text-sm" value={l.quantidade}
                              onChange={n => mudar(i, { quantidade: n })} />
                  </td>
                  <td className="td">
                    <NumInput className="px-2 py-1 text-sm" value={l.valor}
                              onChange={n => mudar(i, { valor: n })} />
                  </td>
                  <td className="td text-center">
                    <button className="text-slate-300 hover:text-red-600"
                            title="tirar esta linha"
                            onClick={() => setLs(x => x.filter((_, k) => k !== i))}>✕</button>
                  </td>
                </tr>
              )
            })}
            {!ls.length && (
              <tr><td colSpan={4} className="td py-6 text-center text-slate-400">
                Ainda não há peças nesta fatura.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <button className="btn-ghost mt-2 text-sm"
              onClick={() => setLs(x => [...x, { artigo: '', quantidade: 0, valor: 0 }])}>
        + Acrescentar peça
      </button>
    </>
  )
}


/* ---------------------------------------------------------- o catálogo */

/**
 * O catálogo de peças: acrescentar, mudar o nome, arrumar por secção.
 *
 * Três coisas que convém ver antes de mexer aqui:
 *
 *  1. **A secção e o «conta por quarto» reescrevem o histórico.** Não são
 *     etiquetas: a secção decide em que barra a peça entra nos gráficos de
 *     todos os anos, e o «conta por quarto» decide se ela entra no €/quarto.
 *     Mudar uma peça muda números de 2021. Daí o aviso no fim.
 *  2. **Mudar o nome reescreve as linhas das faturas** — ver `renomearArtigo`.
 *     Sem isso, as linhas antigas ficavam a apontar para um nome que já não
 *     existe e passavam a contar como alojamento, caladas.
 *  3. **Mudar para um nome que já existe é uma junção.** É exactamente o que
 *     resolve os duplicados que a lista tem — «Fronha Classica» e «Fronha
 *     Clássica» são a mesma peça escrita duas vezes — mas junta dois
 *     históricos e não tem volta, por isso pergunta-se.
 */
function Catalogo({ artigos, onFechar, onMudou }: {
  artigos: Artigo[]
  onFechar: () => void
  onMudou: () => void
}) {
  const toast = useToast()
  const [nome, setNome] = useState('')
  const [seccao, setSeccao] = useState<Seccao>('alojamento')
  const [conta, setConta] = useState(true)
  const [aTrabalhar, setATrabalhar] = useState(false)
  const [aRenomear, setARenomear] = useState<string | null>(null)
  const [nomeNovo, setNomeNovo] = useState('')

  const igual = parecidoCom(nome, artigos)

  const correr = async (f: () => Promise<void>, msg: string) => {
    setATrabalhar(true)
    try { await f(); toast(msg); onMudou() }
    catch (e) { toast((e as Error).message, 'erro') }
    finally { setATrabalhar(false) }
  }

  const acrescentar = () => correr(async () => {
    const n = nome.trim()
    if (!n) throw new Error('Escreve o nome da peça.')
    await criarArtigo({ nome: n, seccao, conta_para_quarto: conta })
    setNome('')
  }, 'Peça acrescentada')

  const renomear = (a: Artigo) => correr(async () => {
    const alvo = nomeNovo.trim()
    if (!alvo) throw new Error('O nome não pode ficar vazio.')
    const jaExiste = artigos.some(x => x.nome === alvo)
    if (jaExiste && !confirm(
      `Já existe uma peça chamada «${alvo}».\n\n`
      + `Juntar as duas? As linhas de «${a.nome}» passam a contar como «${alvo}» `
      + `e «${a.nome}» desaparece do catálogo. Não tem volta.`)) return
    await renomearArtigo(a, alvo, jaExiste)
    setARenomear(null)
  }, 'Nome mudado')

  const remover = (a: Artigo) => correr(async () => {
    const usos = await usosDoArtigo(a.nome)
    if (usos > 0) {
      throw new Error(
        `«${a.nome}» está em ${usos} linha(s) de faturas. `
        + 'Muda-lhe o nome para a juntar a outra peça, em vez de a apagar.')
    }
    if (!confirm(`Apagar «${a.nome}» do catálogo? Não está em nenhuma fatura.`)) return
    await apagarArtigo(a.nome)
  }, 'Peça apagada')

  return (
    <Modal open onClose={onFechar} wide title="Peças de rouparia">
      {/* acrescentar */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
          <div>
            <label className="label">Peça nova</label>
            <input className="input" value={nome} placeholder="nome como vem na fatura"
                   onChange={e => setNome(e.target.value)} />
          </div>
          <div>
            <label className="label">Secção</label>
            <select className="input w-auto" value={seccao}
                    onChange={e => setSeccao(e.target.value as Seccao)}>
              {SECCOES.map(s => <option key={s.v} value={s.v}>{s.rot}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-1.5 pb-2 text-sm text-slate-700">
            <input type="checkbox" checked={conta}
                   onChange={e => setConta(e.target.checked)} />
            conta por quarto
          </label>
          <button className="btn-primary mb-0.5" disabled={aTrabalhar || !nome.trim()}
                  onClick={acrescentar}>Acrescentar</button>
        </div>
        {igual && igual !== nome.trim() && (
          <p className="mt-2 text-xs text-amber-700">
            Já existe <strong>«{igual}»</strong>, que é o mesmo nome escrito de outra
            maneira. Foi assim que a lista ganhou duplicados.
          </p>
        )}
      </div>

      {/* a lista */}
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className="th">Peça</th>
            <th className="th w-40">Secção</th>
            <th className="th w-32 text-center">Conta/quarto</th>
            <th className="th w-28" />
          </tr>
        </thead>
        <tbody>
          {artigos.map(a => (
            <tr key={a.nome} className="border-b border-slate-100">
              <td className="td">
                {aRenomear === a.nome ? (
                  <div className="flex gap-2">
                    <input className="input px-2 py-1 text-sm" autoFocus value={nomeNovo}
                           list="lav-artigos"
                           onChange={e => setNomeNovo(e.target.value)} />
                    <button className="btn-primary px-2 py-1 text-xs" disabled={aTrabalhar}
                            onClick={() => renomear(a)}>Gravar</button>
                    <button className="btn-ghost px-2 py-1 text-xs"
                            onClick={() => setARenomear(null)}>Cancelar</button>
                  </div>
                ) : (
                  <>
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle"
                          style={{ backgroundColor: corSeccao(a.seccao) }} />
                    {a.nome}
                  </>
                )}
              </td>
              <td className="td">
                <select className="input px-2 py-1 text-sm" value={a.seccao} disabled={aTrabalhar}
                        onChange={e => correr(
                          () => guardarArtigo(a.nome, { seccao: e.target.value as Seccao }),
                          'Secção mudada')}>
                  {SECCOES.map(s => <option key={s.v} value={s.v}>{s.rot}</option>)}
                </select>
              </td>
              <td className="td text-center">
                <input type="checkbox" checked={a.conta_para_quarto} disabled={aTrabalhar}
                       onChange={e => correr(
                         () => guardarArtigo(a.nome, { conta_para_quarto: e.target.checked }),
                         e.target.checked ? 'Passa a contar por quarto' : 'Deixa de contar por quarto')} />
              </td>
              <td className="td text-right">
                {aRenomear !== a.nome && (
                  <>
                    <button className="text-xs text-slate-500 hover:text-slate-800"
                            onClick={() => { setARenomear(a.nome); setNomeNovo(a.nome) }}>
                      nome
                    </button>
                    <button className="ml-2 text-xs text-slate-400 hover:text-red-600"
                            onClick={() => remover(a)}>apagar</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        A secção e o «conta por quarto» não são etiquetas: decidem em que barra a
        peça entra nos gráficos e se ela conta para o €/quarto — em todos os anos,
        não só neste. Mudar uma peça muda números de 2021.
      </p>
    </Modal>
  )
}
