import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { Empty, Loading, Modal, useToast } from '../components/ui'
import { useLembrado } from '../lib/lembrar'
import {
  type Categoria, type Codigo, type Dia, type Horarios as Dados, type Importacao,
  type Pessoa, type Resumo, type Hotel,
  CATEGORIAS, HOTEIS, PERIODOS,
  blocosTexto, carregarHorarios, chaveDia, corDoCodigo, corDoHotel, diasDoIntervalo, diasDoMes,
  estaDeServico, fetchDias, gravarImportacao, guardarDia, apagarDia, horasDoCodigo, horasNoiteDoCodigo,
  horasTexto, iso, lerColagem, lerJson, mapaDeDias, mensagemDeErro, periodoDoCodigo, resumir, totais,
} from '../lib/horarios'

/**
 * Os horários do pessoal.
 *
 * O Excel de onde isto vem responde bem a «escreve o mês» e muito mal a tudo o
 * resto. As quatro vistas aqui são as quatro perguntas que se fazem de facto:
 *
 * - **Dia** — quem está hoje, a que horas, e quem falta. É o que a receção abre.
 * - **Semana** — a grelha curta, para trocar um turno sem perder o contexto.
 * - **Mês** — a folha como ela é, para conferir contra o Excel.
 * - **Totais** — horas, horas de noite e dias por categoria, que é o que o RH
 *   precisa de levar para o processamento.
 *
 * Lê quem tiver qualquer função atribuída; escreve o admin e o RH. A diferença
 * não está só nas políticas da base de dados: sem permissão de escrita as
 * células não são clicáveis, para ninguém pensar que mudou algo que não mudou.
 */

type Vista = 'dia' | 'semana' | 'mes' | 'totais'

const hojeIso = () => {
  const d = new Date()
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

const somaDias = (base: string, n: number) => {
  const d = new Date(base + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

const segundaDe = (base: string) => {
  const d = new Date(base + 'T12:00:00')
  const dia = d.getDay()
  return somaDias(base, dia === 0 ? -6 : 1 - dia)
}

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

const diaSemana = (d: string) => DIAS_CURTOS[new Date(d + 'T12:00:00').getDay()]
const fimDeSemana = (d: string) => [0, 6].includes(new Date(d + 'T12:00:00').getDay())
const dataLonga = (d: string) => {
  const x = new Date(d + 'T12:00:00')
  return `${DIAS_CURTOS[x.getDay()]}, ${x.getDate()} de ${MESES[x.getMonth()]} de ${x.getFullYear()}`
}

export default function Horarios() {
  const toast = useToast()
  const { email, podeVerRh } = useAuth()

  const [vista, setVista] = useLembrado<Vista>('horarios.vista', 'dia')
  const [ancora, setAncora] = useState(hojeIso)
  const [anoTotais, setAnoTotais] = useLembrado('horarios.ambito', 'mes')
  const [seccaoF, setSeccaoF] = useLembrado('horarios.seccao', 'todas')
  const [hotelF, setHotelF] = useLembrado('horarios.hotel', 'todos')
  const [busca, setBusca] = useState('')
  const [soActivos, setSoActivos] = useLembrado('horarios.activos', true)

  const [dados, setDados] = useState<Dados | null>(null)
  const [loading, setLoading] = useState(true)
  const [aCarregarDias, setACarregarDias] = useState(false)

  const [aEditar, setAEditar] = useState<{ pessoa: Pessoa; data: string } | null>(null)
  const [ficha, setFicha] = useState<Pessoa | null>(null)
  const [importar, setImportar] = useState(false)
  const [verLegenda, setVerLegenda] = useState(false)

  const ano = Number(ancora.slice(0, 4))
  const mes = Number(ancora.slice(5, 7))

  /* --------------------------- o intervalo a ler --------------------------- */

  const [de, ate] = useMemo<[string, string]>(() => {
    if (vista === 'semana') {
      const s = segundaDe(ancora)
      return [s, somaDias(s, 6)]
    }
    if (vista === 'totais' && anoTotais === 'ano') return [iso(ano, 1, 1), iso(ano, 12, 31)]
    // Dia e Mês leem o mês inteiro: é o mesmo pedido e evita ir à base de dados
    // outra vez quando se salta de dia em dia.
    return [iso(ano, mes, 1), iso(ano, mes, diasDoMes(ano, mes))]
  }, [vista, ancora, anoTotais, ano, mes])

  const carregado = useRef<string>('')

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const d = await carregarHorarios(de, ate)
        if (!vivo) return
        setDados(d)
        carregado.current = `${de}|${ate}`
      } catch (e) {
        if (vivo) toast(mensagemDeErro(e), 'erro')
      } finally {
        if (vivo) setLoading(false)
      }
    })()
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Troca só os dias quando o intervalo muda — as pessoas e a legenda ficam. */
  useEffect(() => {
    if (loading || !dados) return
    if (carregado.current === `${de}|${ate}`) return
    let vivo = true
    setACarregarDias(true)
    ;(async () => {
      try {
        const dias = await fetchDias(de, ate)
        if (!vivo) return
        setDados(d => d && { ...d, dias: mapaDeDias(dias) })
        carregado.current = `${de}|${ate}`
      } catch (e) {
        if (vivo) toast(mensagemDeErro(e), 'erro')
      } finally {
        if (vivo) setACarregarDias(false)
      }
    })()
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [de, ate, loading])

  async function recarregarTudo() {
    try {
      const d = await carregarHorarios(de, ate)
      setDados(d)
      carregado.current = `${de}|${ate}`
    } catch (e) { toast(mensagemDeErro(e), 'erro') }
  }

  /* -------------------------------- derivados ------------------------------- */

  const porId = useMemo(
    () => new Map((dados?.codigos ?? []).map(c => [c.id, c])),
    [dados?.codigos],
  )

  const codigoDe = (p: Pessoa, d: string): Codigo | undefined => {
    const reg = dados?.dias.get(chaveDia(p.id, d))
    return reg ? porId.get(reg.codigo_id) : undefined
  }

  const datas = useMemo(() => diasDoIntervalo(de, ate), [de, ate])

  /** As pessoas que passam os filtros, já na ordem das secções. */
  const pessoas = useMemo(() => {
    if (!dados) return []
    const ordemSeccao = new Map(dados.seccoes.map((s, i) => [s.nome, i]))
    const q = busca.trim().toLowerCase()
    return dados.pessoas
      .filter(p => (!soActivos || p.activo))
      .filter(p => seccaoF === 'todas' || p.seccao === seccaoF)
      .filter(p => !q || p.nome.toLowerCase().includes(q))
      .filter(p => {
        if (hotelF === 'todos') return true
        // Uma pessoa pertence ao hotel onde tem turnos no intervalo visível.
        return datas.some(d => codigoDe(p, d)?.hotel === hotelF)
      })
      .sort((a, b) =>
        (ordemSeccao.get(a.seccao) ?? 99) - (ordemSeccao.get(b.seccao) ?? 99)
        || a.ordem - b.ordem || a.nome.localeCompare(b.nome))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados, seccaoF, hotelF, busca, soActivos, datas])

  /** Pessoas agrupadas por secção, para os cabeçalhos das grelhas. */
  const grupos = useMemo(() => {
    const out: { seccao: string; pessoas: Pessoa[] }[] = []
    for (const p of pessoas) {
      const ultimo = out[out.length - 1]
      if (ultimo && ultimo.seccao === p.seccao) ultimo.pessoas.push(p)
      else out.push({ seccao: p.seccao, pessoas: [p] })
    }
    return out
  }, [pessoas])

  /* -------------------------------- escrever -------------------------------- */

  async function definirDia(pessoa: Pessoa, data: string, codigoId: string | null) {
    try {
      if (codigoId) await guardarDia(pessoa.id, data, codigoId, null, email)
      else await apagarDia(pessoa.id, data)
      setDados(d => {
        if (!d) return d
        const dias = new Map(d.dias)
        const k = chaveDia(pessoa.id, data)
        if (codigoId) {
          dias.set(k, { pessoa_id: pessoa.id, data, codigo_id: codigoId, nota: null, atualizado_por: email })
        } else dias.delete(k)
        return { ...d, dias }
      })
      setAEditar(null)
    } catch (e) { toast(mensagemDeErro(e), 'erro') }
  }

  if (loading) return <Loading />
  if (!dados) return <Empty>Não consegui carregar os horários.</Empty>

  /* --------------------------------- barra --------------------------------- */

  const tituloPeriodo =
    vista === 'dia' ? dataLonga(ancora)
      : vista === 'semana' ? `${ancora === segundaDe(ancora) ? '' : ''}${segundaDe(ancora).slice(8)} – ${somaDias(segundaDe(ancora), 6).slice(8)} ${MESES[mes - 1]} ${ano}`
        : vista === 'totais' && anoTotais === 'ano' ? `Ano ${ano}`
          : `${MESES[mes - 1]} ${ano}`

  const passo = vista === 'dia' ? 1 : vista === 'semana' ? 7 : 0

  const andar = (n: number) => {
    if (vista === 'totais' && anoTotais === 'ano') { setAncora(iso(ano + n, 1, 1)); return }
    if (passo) { setAncora(somaDias(ancora, passo * n)); return }
    const m = mes + n
    const a = ano + Math.floor((m - 1) / 12)
    const mm = ((m - 1) % 12 + 12) % 12 + 1
    setAncora(iso(a, mm, Math.min(Number(ancora.slice(8)), diasDoMes(a, mm))))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-300 bg-white p-0.5">
          {(['dia', 'semana', 'mes', 'totais'] as Vista[]).map(v => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                vista === v ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              {v === 'mes' ? 'Mês' : v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button className="btn btn-ghost px-2" onClick={() => andar(-1)}>‹</button>
          <span className="min-w-[14rem] text-center text-sm font-semibold">{tituloPeriodo}</span>
          <button className="btn btn-ghost px-2" onClick={() => andar(1)}>›</button>
          <button className="btn btn-ghost text-xs" onClick={() => setAncora(hojeIso())}>Hoje</button>
        </div>

        {aCarregarDias && <span className="text-xs text-slate-400">a carregar…</span>}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            className="input w-40" placeholder="Procurar pessoa"
            value={busca} onChange={e => setBusca(e.target.value)}
          />
          <select className="input w-auto" value={seccaoF} onChange={e => setSeccaoF(e.target.value)}>
            <option value="todas">Todas as secções</option>
            {dados.seccoes.map(s => <option key={s.nome} value={s.nome}>{s.nome}</option>)}
          </select>
          <select className="input w-auto" value={hotelF} onChange={e => setHotelF(e.target.value)}>
            <option value="todos">Os dois hotéis</option>
            {(Object.keys(HOTEIS) as Hotel[]).map(h => <option key={h} value={h}>{HOTEIS[h]}</option>)}
          </select>
          {vista === 'totais' && (
            <select className="input w-auto" value={anoTotais} onChange={e => setAnoTotais(e.target.value)}>
              <option value="mes">Mês</option>
              <option value="ano">Ano inteiro</option>
            </select>
          )}
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <input type="checkbox" checked={soActivos} onChange={e => setSoActivos(e.target.checked)} />
            Só activos
          </label>
          <button className="btn btn-ghost text-xs" onClick={() => setVerLegenda(true)}>Legenda</button>
          {podeVerRh && (
            <button className="btn btn-primary text-xs" onClick={() => setImportar(true)}>Importar</button>
          )}
        </div>
      </div>

      {pessoas.length === 0 ? (
        <Empty>
          {dados.pessoas.length === 0
            ? podeVerRh
              ? 'Ainda não há horários. Usa «Importar» para carregar o ficheiro do Excel.'
              : 'Ainda não há horários carregados.'
            : 'Nenhuma pessoa com estes filtros.'}
        </Empty>
      ) : vista === 'dia' ? (
        <VistaDia
          data={ancora} grupos={grupos} codigoDe={codigoDe}
          onPessoa={setFicha}
          onCelula={podeVerRh ? (p, d) => setAEditar({ pessoa: p, data: d }) : undefined}
        />
      ) : vista === 'totais' ? (
        <VistaTotais
          pessoas={pessoas} codigos={dados.codigos} dias={dados.dias} datas={datas}
          onPessoa={setFicha} titulo={tituloPeriodo}
        />
      ) : (
        <Grelha
          datas={vista === 'semana' ? datas : diasDoIntervalo(iso(ano, mes, 1), iso(ano, mes, diasDoMes(ano, mes)))}
          grupos={grupos} codigoDe={codigoDe} compacta={vista === 'mes'}
          hoje={hojeIso()} onPessoa={setFicha}
          onCelula={podeVerRh ? (p, d) => setAEditar({ pessoa: p, data: d }) : undefined}
        />
      )}

      {aEditar && (
        <EscolherCodigo
          pessoa={aEditar.pessoa} data={aEditar.data}
          actual={codigoDe(aEditar.pessoa, aEditar.data)}
          codigos={dados.codigos}
          onClose={() => setAEditar(null)}
          onEscolher={id => definirDia(aEditar.pessoa, aEditar.data, id)}
        />
      )}

      {ficha && (
        <Ficha
          pessoa={ficha} ano={ano} codigos={dados.codigos}
          onClose={() => setFicha(null)}
        />
      )}

      {verLegenda && (
        <Legenda codigos={dados.codigos} onClose={() => setVerLegenda(false)} />
      )}

      {importar && (
        <Importador
          dados={dados} ano={ano} mes={mes} quem={email}
          onClose={() => setImportar(false)}
          onFeito={async msg => { setImportar(false); await recarregarTudo(); toast(msg, 'ok') }}
        />
      )}
    </div>
  )
}

/* ================================== Dia ================================== */

/**
 * O dia, hora a hora.
 *
 * A barra de cada pessoa está desenhada sobre a mesma régua de 24 horas, por
 * isso basta um olhar vertical para ver quem se sobrepõe a quem — que é a
 * pergunta de quem tem de cobrir um turno. Em cima, quantas pessoas estão em
 * casa a cada hora; em baixo, quem não vem e porquê.
 */
function VistaDia({
  data, grupos, codigoDe, onPessoa, onCelula,
}: {
  data: string
  grupos: { seccao: string; pessoas: Pessoa[] }[]
  codigoDe: (p: Pessoa, d: string) => Codigo | undefined
  onPessoa: (p: Pessoa) => void
  onCelula?: (p: Pessoa, d: string) => void
}) {
  const todas = grupos.flatMap(g => g.pessoas)
  const aTrabalhar = todas.filter(p => horasDoCodigo(codigoDe(p, data)) > 0)
  const ausentes = todas.filter(p => {
    const c = codigoDe(p, data)
    return c && horasDoCodigo(c) === 0
  })
  const sem = todas.filter(p => !codigoDe(p, data))

  const cobertura = useMemo(() => {
    const v: number[] = []
    for (let h = 0; h < 24; h++) {
      v.push(aTrabalhar.filter(p => estaDeServico(codigoDe(p, data), h)).length)
    }
    return v
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aTrabalhar, data])

  const pico = Math.max(1, ...cobertura)
  const horasTotal = aTrabalhar.reduce((s, p) => s + horasDoCodigo(codigoDe(p, data)), 0)

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Numero titulo="A trabalhar" valor={String(aTrabalhar.length)} />
        <Numero titulo="Horas no dia" valor={horasTexto(horasTotal)} />
        <Numero titulo="Ausentes" valor={String(ausentes.length)} />
        <Numero titulo="Sem registo" valor={String(sem.length)} />
      </div>

      <div className="card p-3">
        <div className="mb-2 text-xs font-medium text-slate-500">Pessoas em casa, por hora</div>
        <div className="flex items-end gap-px" style={{ height: 64 }}>
          {cobertura.map((n, h) => (
            <div key={h} className="flex-1" title={`${String(h).padStart(2, '0')}h — ${n} pessoa(s)`}>
              <div
                className={`w-full rounded-t ${n === 0 ? 'bg-slate-100' : 'bg-brand-400'}`}
                style={{ height: Math.max(2, (n / pico) * 56) }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-px text-[9px] text-slate-400">
          {cobertura.map((_, h) => (
            <div key={h} className="flex-1 text-center">{h % 3 === 0 ? h : ''}</div>
          ))}
        </div>
      </div>

      {grupos.map(g => {
        const linhas = g.pessoas.filter(p => horasDoCodigo(codigoDe(p, data)) > 0)
        if (!linhas.length) return null
        return (
          <div key={g.seccao} className="card overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
              {g.seccao} · {linhas.length}
            </div>
            <div className="divide-y divide-slate-100">
              {linhas
                .slice()
                .sort((a, b) => {
                  const ca = codigoDe(a, data), cb = codigoDe(b, data)
                  return (ca?.blocos[0]?.[0] ?? 99) - (cb?.blocos[0]?.[0] ?? 99)
                })
                .map(p => {
                  const c = codigoDe(p, data)!
                  return (
                    <div key={p.id} className="flex items-center gap-2 px-3 py-1.5">
                      <button
                        className="w-40 shrink-0 truncate text-left text-sm font-medium hover:text-brand-600"
                        onClick={() => onPessoa(p)}
                      >
                        {p.nome}
                      </button>
                      <div className="relative h-6 flex-1 rounded bg-slate-100">
                        {[6, 12, 18].map(h => (
                          <div key={h} className="absolute top-0 h-full w-px bg-white"
                               style={{ left: `${(h / 24) * 100}%` }} />
                        ))}
                        {c.blocos.map((b, i) => {
                          const inicio = Math.min(b[0], 24)
                          const fim = Math.min(b[1], 24)
                          return (
                            <button
                              key={i}
                              onClick={onCelula ? () => onCelula(p, data) : undefined}
                              className={`absolute top-0 flex h-full items-center justify-center overflow-hidden rounded text-[10px] font-semibold ${corDoCodigo(c)} ${onCelula ? 'cursor-pointer' : 'cursor-default'}`}
                              style={{ left: `${(inicio / 24) * 100}%`, width: `${Math.max(2, ((fim - inicio) / 24) * 100)}%` }}
                              title={`${c.codigo} — ${c.descricao}`}
                            >
                              {c.codigo}
                            </button>
                          )
                        })}
                        {c.blocos.some(b => b[1] > 24) && (
                          <div className="absolute right-0 top-0 h-full w-1 rounded-r bg-indigo-400"
                               title="Entra no dia seguinte" />
                        )}
                      </div>
                      <span className={`chip shrink-0 ${corDoHotel(c.hotel)}`}>
                        {c.hotel ? HOTEIS[c.hotel] : '—'}
                      </span>
                      <span className="w-28 shrink-0 text-right text-xs text-slate-500">
                        {blocosTexto(c)}
                      </span>
                      <span className="w-12 shrink-0 text-right text-xs font-semibold">
                        {horasTexto(horasDoCodigo(c))}
                      </span>
                    </div>
                  )
                })}
            </div>
          </div>
        )
      })}

      {ausentes.length > 0 && (
        <div className="card p-3">
          <div className="mb-2 text-xs font-medium text-slate-500">Não vêm</div>
          <div className="flex flex-wrap gap-1.5">
            {ausentes.map(p => {
              const c = codigoDe(p, data)!
              return (
                <button
                  key={p.id}
                  onClick={() => onPessoa(p)}
                  className={`chip ${corDoCodigo(c)}`}
                  title={`${p.seccao} — ${c.descricao || CATEGORIAS[c.categoria]}`}
                >
                  {p.nome} · {c.codigo}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Numero({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="card p-3">
      <div className="text-xs text-slate-500">{titulo}</div>
      <div className="text-xl font-semibold">{valor}</div>
    </div>
  )
}

/* =============================== Semana / Mês =============================== */

/**
 * A grelha: pessoas em linha, dias em coluna. É a folha do Excel, com a
 * diferença de que a cor diz o período do turno — é o que deixa ver o padrão de
 * rotação sem ler os códigos um a um.
 */
function Grelha({
  datas, grupos, codigoDe, compacta, hoje, onPessoa, onCelula,
}: {
  datas: string[]
  grupos: { seccao: string; pessoas: Pessoa[] }[]
  codigoDe: (p: Pessoa, d: string) => Codigo | undefined
  compacta: boolean
  hoje: string
  onPessoa: (p: Pessoa) => void
  onCelula?: (p: Pessoa, d: string) => void
}) {
  const largura = compacta ? 'w-8' : 'w-16'
  return (
    <div className="card overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white px-2 py-1 text-left font-semibold">Pessoa</th>
            {datas.map(d => (
              <th
                key={d}
                className={`${largura} border-l border-slate-100 px-0 py-1 text-center font-semibold ${
                  d === hoje ? 'bg-brand-50 text-brand-700' : fimDeSemana(d) ? 'bg-slate-50 text-slate-500' : ''}`}
              >
                <div>{Number(d.slice(8))}</div>
                <div className="text-[9px] font-normal text-slate-400">{diaSemana(d)}</div>
              </th>
            ))}
            <th className="w-14 border-l border-slate-200 px-1 py-1 text-right font-semibold">h</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map(g => (
            <Fragment key={g.seccao}>
              <tr>
                <td
                  colSpan={datas.length + 2}
                  className="sticky left-0 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600"
                >
                  {g.seccao}
                </td>
              </tr>
              {g.pessoas.map(p => {
                const h = datas.reduce((s, d) => s + horasDoCodigo(codigoDe(p, d)), 0)
                return (
                  <tr key={p.id} className="hover:bg-slate-50/60">
                    <td className="sticky left-0 z-10 max-w-[11rem] truncate bg-white px-2 py-0.5">
                      <button className="truncate text-left hover:text-brand-600" onClick={() => onPessoa(p)}>
                        {p.lider && <span className="mr-1 text-amber-500" title="Responsável">★</span>}
                        {p.nome}
                      </button>
                    </td>
                    {datas.map(d => {
                      const c = codigoDe(p, d)
                      return (
                        <td key={d} className={`border-l border-slate-100 p-px text-center ${fimDeSemana(d) ? 'bg-slate-50/60' : ''}`}>
                          <button
                            disabled={!onCelula}
                            onClick={onCelula ? () => onCelula(p, d) : undefined}
                            title={c ? `${c.codigo} — ${c.descricao}${c.hotel ? ` (${HOTEIS[c.hotel]})` : ''}` : 'Sem registo'}
                            className={`block w-full rounded ${compacta ? 'px-0 py-1 text-[9px]' : 'px-1 py-1 text-[10px]'} font-semibold leading-tight ${corDoCodigo(c)} ${onCelula ? 'hover:ring-1 hover:ring-brand-400' : ''}`}
                          >
                            {c ? (compacta ? c.codigo.slice(0, 4) : c.codigo) : '·'}
                          </button>
                        </td>
                      )
                    })}
                    <td className="border-l border-slate-200 px-1 text-right font-semibold">{horasTexto(h)}</td>
                  </tr>
                )
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ================================= Totais ================================= */

/**
 * O que o RH leva para o processamento: dias, horas, horas de noite e os dias
 * por categoria. O botão de copiar põe a tabela na área de transferência em
 * formato de folha de cálculo, porque é onde a conta acaba por ser fechada.
 */
function VistaTotais({
  pessoas, codigos, dias, datas, onPessoa, titulo,
}: {
  pessoas: Pessoa[]
  codigos: Codigo[]
  dias: Map<string, Dia>
  datas: string[]
  onPessoa: (p: Pessoa) => void
  titulo: string
}) {
  const toast = useToast()
  const [ordem, setOrdem] = useState<'nome' | 'horas' | 'noite' | 'dias'>('nome')

  const linhas = useMemo(() => {
    const t = totais(pessoas, codigos, dias, datas)
    return t.sort((a, b) =>
      ordem === 'nome'
        ? a.pessoa.seccao.localeCompare(b.pessoa.seccao) || a.pessoa.nome.localeCompare(b.pessoa.nome)
        : ordem === 'horas' ? b.horas - a.horas
          : ordem === 'noite' ? b.noite - a.noite : b.dias - a.dias)
  }, [pessoas, codigos, dias, datas, ordem])

  const cats: Categoria[] = ['folga', 'ferias', 'feriado', 'rec', 'baixa', 'falta', 'licenca']

  const somas = linhas.reduce(
    (s, l) => ({ dias: s.dias + l.dias, horas: s.horas + l.horas, noite: s.noite + l.noite }),
    { dias: 0, horas: 0, noite: 0 },
  )

  function copiar() {
    const cab = ['Secção', 'Pessoa', 'Dias', 'Horas', 'Horas noite',
      ...cats.map(c => CATEGORIAS[c])]
    const corpo = linhas.map(l => [
      l.pessoa.seccao, l.pessoa.nome, l.dias,
      l.horas.toFixed(2).replace('.', ','), l.noite.toFixed(2).replace('.', ','),
      ...cats.map(c => l.cats[c] ?? 0),
    ])
    const tsv = [cab, ...corpo].map(r => r.join('\t')).join('\n')
    navigator.clipboard.writeText(tsv)
      .then(() => toast('Tabela copiada — cola no Excel.', 'ok'))
      .catch(() => toast('Não consegui copiar.', 'erro'))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">{titulo} · {linhas.length} pessoas</span>
        <select className="input w-auto" value={ordem} onChange={e => setOrdem(e.target.value as typeof ordem)}>
          <option value="nome">Por secção e nome</option>
          <option value="horas">Mais horas primeiro</option>
          <option value="noite">Mais horas de noite</option>
          <option value="dias">Mais dias de trabalho</option>
        </select>
        <button className="btn btn-ghost ml-auto text-xs" onClick={copiar}>Copiar para Excel</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-2 py-1.5 text-left font-semibold">Secção</th>
              <th className="px-2 py-1.5 text-left font-semibold">Pessoa</th>
              <th className="px-2 py-1.5 text-right font-semibold">Dias</th>
              <th className="px-2 py-1.5 text-right font-semibold">Horas</th>
              <th className="px-2 py-1.5 text-right font-semibold">Noite</th>
              {(['manha', 'meio', 'tarde', 'noite'] as const).map(p => (
                <th key={p} className="px-2 py-1.5 text-right font-semibold">{PERIODOS[p]}</th>
              ))}
              {cats.map(c => (
                <th key={c} className="px-2 py-1.5 text-right font-semibold">{CATEGORIAS[c]}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {linhas.map(l => (
              <tr key={l.pessoa.id} className="hover:bg-slate-50">
                <td className="px-2 py-1 text-slate-500">{l.pessoa.seccao}</td>
                <td className="px-2 py-1">
                  <button className="font-medium hover:text-brand-600" onClick={() => onPessoa(l.pessoa)}>
                    {l.pessoa.nome}
                  </button>
                </td>
                <td className="px-2 py-1 text-right">{l.dias || '—'}</td>
                <td className="px-2 py-1 text-right font-semibold">{horasTexto(l.horas)}</td>
                <td className="px-2 py-1 text-right">{horasTexto(l.noite)}</td>
                {(['manha', 'meio', 'tarde', 'noite'] as const).map(p => (
                  <td key={p} className="px-2 py-1 text-right text-slate-500">{l.periodos[p] ?? '—'}</td>
                ))}
                {cats.map(c => (
                  <td key={c} className="px-2 py-1 text-right text-slate-500">{l.cats[c] ?? '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
            <tr>
              <td className="px-2 py-1.5" colSpan={2}>Total</td>
              <td className="px-2 py-1.5 text-right">{somas.dias}</td>
              <td className="px-2 py-1.5 text-right">{horasTexto(somas.horas)}</td>
              <td className="px-2 py-1.5 text-right">{horasTexto(somas.noite)}</td>
              <td colSpan={4 + cats.length} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

/* ============================== escolher código ============================== */

/**
 * A troca de um turno. A lista está ordenada pelos códigos que a secção da
 * pessoa de facto usa — num universo de 105 códigos, oferecer todos por ordem
 * alfabética seria oferecer nada.
 */
function EscolherCodigo({
  pessoa, data, actual, codigos, onClose, onEscolher,
}: {
  pessoa: Pessoa
  data: string
  actual: Codigo | undefined
  codigos: Codigo[]
  onClose: () => void
  onEscolher: (id: string | null) => void
}) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string>('todas')

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase()
    return codigos
      .filter(c => c.activo)
      .filter(c => cat === 'todas' || c.categoria === cat)
      .filter(c => !t || c.codigo.toLowerCase().includes(t) || c.descricao.toLowerCase().includes(t))
      .sort((a, b) =>
        (a.categoria === 'trab' ? 0 : 1) - (b.categoria === 'trab' ? 0 : 1)
        || (a.blocos[0]?.[0] ?? 99) - (b.blocos[0]?.[0] ?? 99)
        || a.codigo.localeCompare(b.codigo))
  }, [codigos, q, cat])

  return (
    <Modal open onClose={onClose} title={`${pessoa.nome} — ${dataLonga(data)}`} wide>
      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            autoFocus className="input" placeholder="Código ou horas"
            value={q} onChange={e => setQ(e.target.value)}
          />
          <select className="input w-auto" value={cat} onChange={e => setCat(e.target.value)}>
            <option value="todas">Todas</option>
            {(Object.keys(CATEGORIAS) as Categoria[]).map(c => (
              <option key={c} value={c}>{CATEGORIAS[c]}</option>
            ))}
          </select>
        </div>

        {actual && (
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 text-xs">
            <span className="text-slate-500">Agora:</span>
            <span className={`chip ${corDoCodigo(actual)}`}>{actual.codigo}</span>
            <span>{actual.descricao}</span>
            <button className="btn btn-danger ml-auto text-xs" onClick={() => onEscolher(null)}>
              Apagar o dia
            </button>
          </div>
        )}

        <div className="max-h-80 overflow-y-auto">
          <div className="grid gap-1 sm:grid-cols-2">
            {lista.map(c => (
              <button
                key={c.id}
                onClick={() => onEscolher(c.id)}
                className={`flex items-center gap-2 rounded-lg border p-1.5 text-left text-xs hover:ring-1 hover:ring-brand-400 ${
                  c.id === actual?.id ? 'border-brand-400 bg-brand-50' : 'border-slate-200'}`}
              >
                <span className={`chip ${corDoCodigo(c)} min-w-[3.5rem] justify-center`}>{c.codigo}</span>
                <span className="flex-1 truncate">{c.descricao || CATEGORIAS[c.categoria]}</span>
                {c.hotel && <span className={`chip ${corDoHotel(c.hotel)}`}>{c.hotel}</span>}
                {horasDoCodigo(c) > 0 && (
                  <span className="text-slate-400">{horasTexto(horasDoCodigo(c))}</span>
                )}
              </button>
            ))}
          </div>
          {!lista.length && <Empty>Nenhum código com esse texto.</Empty>}
        </div>
      </div>
    </Modal>
  )
}

/* ================================== ficha ================================== */

/** O ano de uma pessoa, mês a mês. A pergunta é sempre «quando é que ele folga». */
function Ficha({
  pessoa, ano, codigos, onClose,
}: { pessoa: Pessoa; ano: number; codigos: Codigo[]; onClose: () => void }) {
  const toast = useToast()
  const [dias, setDias] = useState<Map<string, Dia> | null>(null)
  const porId = useMemo(() => new Map(codigos.map(c => [c.id, c])), [codigos])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const todos = await fetchDias(iso(ano, 1, 1), iso(ano, 12, 31))
        if (vivo) setDias(mapaDeDias(todos.filter(d => d.pessoa_id === pessoa.id)))
      } catch (e) { if (vivo) toast(mensagemDeErro(e), 'erro') }
    })()
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pessoa.id, ano])

  const linhas = useMemo(() => {
    if (!dias) return []
    return MESES.map((nome, i) => {
      const mes = i + 1
      const n = diasDoMes(ano, mes)
      const cels = Array.from({ length: 31 }, (_, j) => {
        if (j >= n) return null
        const reg = dias.get(chaveDia(pessoa.id, iso(ano, mes, j + 1)))
        return reg ? porId.get(reg.codigo_id) ?? null : null
      })
      const horas = cels.reduce((s, c) => s + horasDoCodigo(c ?? undefined), 0)
      const noite = cels.reduce((s, c) => s + horasNoiteDoCodigo(c ?? undefined), 0)
      return { nome, mes, cels, horas, noite }
    })
  }, [dias, ano, pessoa.id, porId])

  const anual = linhas.reduce(
    (s, l) => ({ horas: s.horas + l.horas, noite: s.noite + l.noite }),
    { horas: 0, noite: 0 },
  )

  return (
    <Modal open onClose={onClose} title={`${pessoa.nome} — ${pessoa.seccao} · ${ano}`} wide>
      {!dias ? <Loading /> : (
        <div className="space-y-3">
          <div className="flex gap-4 text-sm">
            <span>Horas no ano: <b>{horasTexto(anual.horas)}</b></span>
            <span>Das quais de noite: <b>{horasTexto(anual.noite)}</b></span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-[10px]">
              <thead>
                <tr>
                  <th className="px-1 py-0.5 text-left font-semibold">Mês</th>
                  {Array.from({ length: 31 }, (_, i) => (
                    <th key={i} className="w-6 px-0 py-0.5 text-center font-normal text-slate-400">{i + 1}</th>
                  ))}
                  <th className="px-1 text-right font-semibold">h</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => (
                  <tr key={l.mes}>
                    <td className="whitespace-nowrap px-1 py-px font-medium">{l.nome.slice(0, 3)}</td>
                    {l.cels.map((c, i) => (
                      <td key={i} className="p-px">
                        {c === null ? <div className="h-4" /> : (
                          <div
                            className={`flex h-4 items-center justify-center rounded text-[8px] font-semibold ${corDoCodigo(c)}`}
                            title={`${c.codigo} — ${c.descricao}`}
                          >
                            {c.codigo.slice(0, 3)}
                          </div>
                        )}
                      </td>
                    ))}
                    <td className="px-1 text-right">{l.horas ? horasTexto(l.horas) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  )
}

/* ================================= legenda ================================= */

function Legenda({ codigos, onClose }: { codigos: Codigo[]; onClose: () => void }) {
  const [q, setQ] = useState('')
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase()
    return codigos
      .filter(c => !t || c.codigo.toLowerCase().includes(t) || c.descricao.toLowerCase().includes(t))
      .sort((a, b) => a.ordem - b.ordem)
  }, [codigos, q])

  /** Os códigos repetidos são legítimos: avisar é melhor do que esconder. */
  const repetidos = useMemo(() => {
    const n = new Map<string, number>()
    for (const c of codigos) n.set(c.codigo, (n.get(c.codigo) ?? 0) + 1)
    return new Set([...n].filter(([, v]) => v > 1).map(([k]) => k))
  }, [codigos])

  return (
    <Modal open onClose={onClose} title={`Legenda · ${codigos.length} códigos`} wide>
      <div className="space-y-3">
        <input className="input" placeholder="Procurar código" value={q} onChange={e => setQ(e.target.value)} />
        <p className="text-xs text-slate-500">
          Alguns códigos aparecem mais de uma vez com horas diferentes — é como está no Excel.
          Cada um é uma linha própria, por isso o que já está marcado não muda de significado.
        </p>
        <div className="max-h-96 overflow-y-auto">
          <table className="min-w-full text-xs">
            <tbody className="divide-y divide-slate-100">
              {lista.map(c => (
                <tr key={c.id}>
                  <td className="py-1 pr-2">
                    <span className={`chip ${corDoCodigo(c)}`}>{c.codigo}</span>
                    {repetidos.has(c.codigo) && <span className="ml-1 text-amber-500" title="Repetido com outras horas">!</span>}
                  </td>
                  <td className="py-1 pr-2">{c.descricao}</td>
                  <td className="py-1 pr-2 text-slate-500">{CATEGORIAS[c.categoria]}</td>
                  <td className="py-1 pr-2">{c.hotel && <span className={`chip ${corDoHotel(c.hotel)}`}>{HOTEIS[c.hotel]}</span>}</td>
                  <td className="py-1 pr-2 text-slate-500">{periodoDoCodigo(c) !== 'nenhum' ? PERIODOS[periodoDoCodigo(c)] : ''}</td>
                  <td className="py-1 text-right">{horasDoCodigo(c) ? horasTexto(horasDoCodigo(c)) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  )
}

/* =============================== importação =============================== */

/**
 * Dois caminhos para a mesma coisa.
 *
 * O ficheiro é para carregar de uma vez o que já existe — o `data.json` tirado
 * das folhas traz a legenda, as pessoas e todos os meses. A colagem é para o
 * mês seguinte: abre-se o Excel, marca-se o bloco, cola-se aqui.
 *
 * Nada vai para a base de dados antes de se ver o resumo. E tudo é idempotente:
 * importar duas vezes o mesmo mês não duplica nada, substitui.
 */
function Importador({
  dados, ano, mes, quem, onClose, onFeito,
}: {
  dados: Dados
  ano: number
  mes: number
  quem: string | null
  onClose: () => void
  onFeito: (msg: string) => void
}) {
  const toast = useToast()
  const [modo, setModo] = useState<'ficheiro' | 'colagem'>(
    dados.pessoas.length ? 'colagem' : 'ficheiro',
  )
  const [texto, setTexto] = useState('')
  const [seccao, setSeccao] = useState(dados.seccoes[0]?.nome ?? '')
  const [a, setA] = useState(ano)
  const [m, setM] = useState(mes)
  const [imp, setImp] = useState<Importacao | null>(null)
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [aGravar, setAGravar] = useState(false)
  const [feito, setFeito] = useState<{ n: number; total: number } | null>(null)

  function preparar(conteudo: string, deFicheiro: boolean) {
    try {
      const i = deFicheiro
        ? lerJson(conteudo)
        : lerColagem(conteudo, seccao, a, m, dados.codigos)
      setImp(i)
      setResumo(resumir(i, dados))
    } catch (e) {
      setImp(null); setResumo(null)
      toast(mensagemDeErro(e), 'erro')
    }
  }

  async function gravar() {
    if (!imp) return
    setAGravar(true)
    try {
      const r = await gravarImportacao(imp, dados, quem, (n, total) => setFeito({ n, total }))
      onFeito(
        `${r.dias} dia(s) gravado(s)`
        + (r.pessoasNovas ? `, ${r.pessoasNovas} pessoa(s) nova(s)` : '')
        + (r.codigosNovos ? `, ${r.codigosNovos} código(s) novo(s)` : '')
        + '.',
      )
    } catch (e) {
      toast(mensagemDeErro(e), 'erro')
    } finally {
      setAGravar(false); setFeito(null)
    }
  }

  return (
    <Modal open onClose={onClose} title="Importar horários" wide>
      <div className="space-y-3">
        <div className="flex rounded-lg border border-slate-300 bg-white p-0.5">
          {([['ficheiro', 'Ficheiro (ano inteiro)'], ['colagem', 'Colar do Excel (um mês)']] as const).map(([v, l]) => (
            <button
              key={v}
              onClick={() => { setModo(v); setImp(null); setResumo(null); setTexto('') }}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${
                modo === v ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              {l}
            </button>
          ))}
        </div>

        {modo === 'ficheiro' ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">
              Escolhe o <b>data.json</b> ou o <b>horarios-2026.html</b>. Traz a legenda, as pessoas
              e todos os meses que lá estiverem.
            </p>
            <input
              type="file" accept=".json,.html,.htm,.txt"
              className="input"
              onChange={async e => {
                const f = e.target.files?.[0]
                if (!f) return
                preparar(await f.text(), true)
              }}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">
              No Excel, marca o bloco com a linha dos dias e as linhas das pessoas (o nome na
              primeira coluna) e cola aqui. Os códigos têm de já existir na legenda.
            </p>
            <div className="flex gap-2">
              <select className="input w-auto" value={seccao} onChange={e => setSeccao(e.target.value)}>
                {dados.seccoes.map(s => <option key={s.nome} value={s.nome}>{s.nome}</option>)}
              </select>
              <select className="input w-auto" value={m} onChange={e => setM(Number(e.target.value))}>
                {MESES.map((nome, i) => <option key={i} value={i + 1}>{nome}</option>)}
              </select>
              <input
                type="number" className="input w-24" value={a}
                onChange={e => setA(Number(e.target.value))}
              />
            </div>
            <textarea
              className="input h-40 font-mono text-[11px]"
              placeholder={'\t1\t2\t3\t4…\nMaria\tM\tM\tFG\tT…'}
              value={texto}
              onChange={e => setTexto(e.target.value)}
            />
            <button
              className="btn btn-ghost text-xs"
              disabled={!texto.trim() || !seccao}
              onClick={() => preparar(texto, false)}
            >
              Ver o que vai entrar
            </button>
          </div>
        )}

        {resumo && (
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
            <div className="font-semibold">O que vai entrar</div>
            <ul className="space-y-0.5 text-slate-600">
              <li>{resumo.dias} dias, de {resumo.de || '—'} a {resumo.ate || '—'}</li>
              <li>{resumo.pessoas.length} pessoas ({resumo.pessoasNovas} novas)</li>
              {resumo.codigosNovos > 0 && <li>{resumo.codigosNovos} códigos novos na legenda</li>}
              {resumo.seccoesNovas > 0 && <li>{resumo.seccoesNovas} secções novas</li>}
            </ul>
            {resumo.avisos.length > 0 && (
              <div className="rounded border border-amber-200 bg-amber-50 p-2 text-amber-800">
                <div className="font-semibold">Atenção</div>
                <ul className="mt-1 max-h-32 list-disc space-y-0.5 overflow-y-auto pl-4">
                  {resumo.avisos.slice(0, 40).map((v, i) => <li key={i}>{v}</li>)}
                  {resumo.avisos.length > 40 && <li>… e mais {resumo.avisos.length - 40}.</li>}
                </ul>
              </div>
            )}
            <p className="text-slate-500">
              Os dias que já existirem nestas datas são substituídos. O resto fica como está.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2">
          {feito && (
            <span className="text-xs text-slate-500">
              {feito.n} de {feito.total}…
            </span>
          )}
          <button className="btn btn-ghost ml-auto" onClick={onClose} disabled={aGravar}>Cancelar</button>
          <button
            className="btn btn-primary"
            disabled={!imp || aGravar || !resumo?.dias}
            onClick={gravar}
          >
            {aGravar ? 'A gravar…' : 'Gravar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
