import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import { useApp } from '../lib/appState'
import { Loading, Modal, StatCard, useToast } from '../components/ui'
import { useLembrado } from '../lib/lembrar'
import {
  type Espaco, type Estado, type Reserva,
  ESTADOS, NECESSIDADES, chipDoEstado,
  criarEspaco, fetchEspacos, fetchReservas, guardarEspaco, guardarReserva, apagarReserva,
  dataCurta, diaOperacional, diaSemana, eFimDeSemana, horaDe, horasEntre, hojeIso,
  intervalo, mensagemDeErro, minutosDaHora, passaMeiaNoite, pista, posicaoNaPista, somaDias,
} from '../lib/eventos'

/**
 * Sala de eventos — ver e reservar.
 *
 * **Não é um calendário, e isso foi a decisão.** Uma semana de calendário são
 * sete colunas por dezassete horas: cento e dezanove casas para mostrar dois ou
 * três eventos, quase tudo vazio, e no telemóvel ilegível. Aqui cada dia é uma
 * coluna estreita com as horas de cima para baixo — catorze dias cabem num ecrã
 * e a pergunta que se faz ao telefone, «tem a sala no dia 24 à tarde?»,
 * responde-se sem abrir nada.
 *
 * É a faixa do parque virada de lado para caber as horas. O que o parque não
 * conseguia mostrar — dois eventos no mesmo dia, um de manhã e outro à noite —
 * é exactamente o que aqui se vê.
 *
 * Três regras que valem a pena saber antes de mexer:
 *
 *  1. **O cancelado não ocupa.** Sai da faixa e das contas, e o dia volta a
 *     ficar livre; fica na lista para quem a quiser ver. Quem garante que não
 *     há dois eventos à mesma hora é a base de dados, não este ficheiro.
 *  2. **O dia é o da casa, não o do calendário** — ver `diaOperacional`. Uma
 *     festa que começa às 00:30 fica na coluna da véspera.
 *  3. **A pista vem do espaço.** As horas de abertura não são decoração: são a
 *     escala vertical. Mudá-las no editor muda o desenho de todos os dias.
 */

const NDIAS = 14
const ALT_PISTA = 180          // px; a pista de um dia
const LARG_DIA = 56            // px
// altura minima de uma barra para ela se ler: a hora cabe la dentro
const MIN_BARRA = 16           // px

type Rascunho = {
  id?: string
  cliente: string
  contacto: string
  pax: string
  estado: Estado
  valor: string
  necessidades: string[]
  notas: string
  dia: string
  horaInicio: string
  horaFim: string
  /** O estado com que a reserva estava quando se abriu. Serve a mensagem de erro. */
  estadoOriginal?: Estado
}

const vazio = (dia: string): Rascunho => ({
  cliente: '', contacto: '', pax: '', estado: 'pedido', valor: '',
  necessidades: [], notas: '', dia, horaInicio: '14:00', horaFim: '18:00',
})

/**
 * O dia que o formulário mostra é o dia da casa, e não o do calendário: é o que
 * a pessoa escreveu quando marcou. Daí o `abre` vir de fora — uma festa da
 * 01:00 tem de reabrir no dia em que foi marcada, não no seguinte.
 */
const daReserva = (r: Reserva, abre: string): Rascunho => ({
  id: r.id,
  cliente: r.cliente,
  contacto: r.contacto ?? '',
  pax: r.pax == null ? '' : String(r.pax),
  estado: r.estado,
  estadoOriginal: r.estado,
  valor: r.valor == null ? '' : String(r.valor).replace('.', ','),
  necessidades: r.necessidades ?? [],
  notas: r.notas ?? '',
  dia: diaOperacional(r.inicio, abre),
  horaInicio: horaDe(r.inicio),
  horaFim: horaDe(r.fim),
})

const eur = (v: number) =>
  v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const numero = (t: string) => {
  const n = Number(t.replace(',', '.').trim())
  return Number.isFinite(n) ? n : null
}

export default function SalaEventos() {
  const toast = useToast()
  const { email, canWrite, isAdmin } = useAuth()
  const { hotelId, hotels } = useApp()
  // a receção atende o telefone, o F&B monta a sala: escrevem os dois
  const podeEscrever = canWrite('FO') || canWrite('FB')

  const [inicio, setInicio] = useLembrado('eventos.inicio', () => somaDias(hojeIso(), -1),
    { doDia: true })
  const [espacos, setEspacos] = useState<Espaco[]>([])
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [loading, setLoading] = useState(true)
  const [verCancelados, setVerCancelados] = useLembrado('eventos.clx', false)

  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [editarEspaco, setEditarEspaco] = useState(false)

  const espaco = espacos[0] ?? null

  /* ------------------------------------------------------------- dados */
  const carregar = async () => {
    if (!hotelId) return
    setLoading(true)
    try {
      const es = await fetchEspacos(hotelId)
      setEspacos(es)
      setReservas(es.length
        ? await fetchReservas(es.map(e => e.id), inicio, somaDias(inicio, NDIAS))
        : [])
    } catch (e) {
      toast(mensagemDeErro(e), 'erro')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void carregar() }, [hotelId, inicio])

  /* ------------------------------------------------------------ contas */
  const dias = useMemo(
    () => Array.from({ length: NDIAS }, (_, i) => somaDias(inicio, i)), [inicio])

  const { porDia, doPeriodo, ocupam } = useMemo(() => {
    const abre = espaco?.abre ?? '08:00:00'
    const dentro = new Set(dias)
    const comDia = reservas.map(r => ({ r, dia: diaOperacional(r.inicio, abre) }))
    const doPeriodo = comDia.filter(x => dentro.has(x.dia))
    // o cancelado não ocupa a sala: sai da faixa e das contas
    const ocupam = doPeriodo.filter(x => x.r.estado !== 'cancelado')
    const porDia: Record<string, Reserva[]> = {}
    for (const x of ocupam) (porDia[x.dia] ??= []).push(x.r)
    for (const k of Object.keys(porDia)) porDia[k].sort((a, b) => a.inicio.localeCompare(b.inicio))
    return { porDia, doPeriodo, ocupam }
  }, [reservas, dias, espaco])

  const T = useMemo(() => {
    const rs = ocupam.map(x => x.r)
    const pedidos = rs.filter(r => r.estado === 'pedido')
    const confirmados = rs.filter(r => r.estado === 'confirmado')
    return {
      n: rs.length,
      horas: rs.reduce((s, r) => s + horasEntre(r.inicio, r.fim), 0),
      pedidos: pedidos.length,
      porFechar: pedidos.reduce((s, r) => s + (r.valor ?? 0), 0),
      fechado: confirmados.reduce((s, r) => s + (r.valor ?? 0), 0),
      livres: NDIAS - Object.keys(porDia).length,
    }
  }, [ocupam, porDia])

  /* ---------------------------------------------------------- guardar */
  async function gravar() {
    if (!rascunho || !espaco) return
    const { cliente, dia, horaInicio, horaFim } = rascunho
    if (!cliente.trim()) { setErro('Falta o nome de quem reserva.'); return }
    if (!dia) { setErro('Falta o dia.'); return }
    if (!horaInicio || !horaFim) { setErro('Faltam as horas.'); return }
    if (horaInicio === horaFim) {
      setErro('A hora de fim tem de ser diferente da de início.'); return
    }
    setAGuardar(true); setErro(null)
    const { inicio: ini, fim } = intervalo(dia, horaInicio, horaFim)
    try {
      await guardarReserva({
        id: rascunho.id,
        space_id: espaco.id,
        cliente: cliente.trim(),
        contacto: rascunho.contacto.trim() || null,
        pax: rascunho.pax.trim() ? Math.round(Number(rascunho.pax)) || null : null,
        estado: rascunho.estado,
        valor: rascunho.valor.trim() ? numero(rascunho.valor) : null,
        necessidades: rascunho.necessidades,
        notas: rascunho.notas.trim() || null,
        inicio: ini, fim,
      }, email)
      setRascunho(null)
      toast(rascunho.id ? 'Reserva guardada' : 'Sala reservada')
      await carregar()
    } catch (e) {
      // reactivar um cancelado cuja hora já foi dada a outro dá o mesmo erro
      // cru de uma sobreposição qualquer, e precisa de outra frase
      const aReactivar = rascunho.estadoOriginal === 'cancelado' && rascunho.estado !== 'cancelado'
      setErro(mensagemDeErro(e, aReactivar))
    } finally {
      setAGuardar(false)
    }
  }

  async function remover() {
    if (!rascunho?.id) return
    setAGuardar(true)
    try {
      await apagarReserva(rascunho.id)
      setRascunho(null)
      toast('Reserva apagada')
      await carregar()
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setAGuardar(false)
    }
  }

  /* ------------------------------------------------------------- ecrã */
  if (loading) return <Loading />

  const nomeHotel = hotels.find(h => h.id === hotelId)?.name ?? 'este hotel'

  // Sem espaço criado não há faixa nenhuma para desenhar. Dizê-lo é melhor do
  // que mostrar catorze colunas vazias a fingir que há sala.
  if (!espaco) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-slate-600">
          Não há nenhum espaço de eventos configurado no {nomeHotel}.
        </p>
        {isAdmin
          ? <button className="btn btn-primary mt-4"
              onClick={async () => {
                try {
                  await criarEspaco(hotelId!, 'Sala de eventos')
                  toast('Sala criada. Agora dá-lhe o nome certo.')
                  await carregar()
                  setEditarEspaco(true)
                } catch (e) { toast(mensagemDeErro(e), 'erro') }
              }}>
              Criar a sala neste hotel
            </button>
          : <p className="mt-2 text-xs text-slate-400">
              Um administrador pode criá-lo nesta página.
            </p>}
      </div>
    )
  }

  const marcas = marcasDeHora(espaco)

  return (
    <div className="space-y-4">
      {/* Dois a dois já no telemóvel: quatro cartões em coluna eram um ecrã
          inteiro de números antes de se chegar à sala, que é ao que se vem. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Eventos no período" value={T.n}
                  hint={`${T.horas.toLocaleString('pt-PT', { maximumFractionDigits: 1 })} h de sala ocupada`} />
        <StatCard label="Por confirmar" value={T.pedidos}
                  tone={T.pedidos ? 'warn' : 'default'}
                  hint={T.pedidos ? `${eur(T.porFechar)} à espera de resposta` : 'nada pendente'} />
        <StatCard label="Confirmado" value={eur(T.fechado)}
                  hint="receita dos eventos fechados" />
        <StatCard label="Dias livres" value={T.livres} hint={`em ${NDIAS}`} />
      </div>

      {/* --------------------------------------------------------- faixa */}
      <div className="card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">{espaco.nome}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {espaco.capacidade ? `até ${espaco.capacidade} pessoas · ` : ''}
              das {espaco.abre.slice(0, 5)} às {espaco.fecha.slice(0, 5)}
              {isAdmin && (
                <button className="ml-2 text-brand-700 underline-offset-2 hover:underline"
                        onClick={() => setEditarEspaco(true)}>editar</button>
              )}
            </p>
          </div>
          {/* flex-wrap e o Reservar a ocupar a linha toda no telemovel: os
              quatro controlos em linha davam 381px de conteudo num ecra de 390,
              e a pagina deslizava para o lado. Como efeito util, o botao fica
              com a largura toda para o dedo. */}
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-ghost" onClick={() => setInicio(somaDias(inicio, -7))}>
              ‹ semana
            </button>
            <span className="min-w-[104px] text-center text-xs tabular-nums text-slate-500">
              {dataCurta(inicio)} – {dataCurta(somaDias(inicio, NDIAS - 1))}
            </span>
            <button className="btn btn-ghost" onClick={() => setInicio(somaDias(inicio, 7))}>
              semana ›
            </button>
            {podeEscrever && (
              <button className="btn btn-primary w-full sm:w-auto"
                      onClick={() => { setErro(null); setRascunho(vazio(hojeIso())) }}>
                Reservar
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          {/* As horas à esquerda. A posição sai da mesma conta que posiciona as
              barras, para não haver duas versões da mesma escala. */}
          <div className="relative w-[30px] shrink-0" style={{ paddingTop: 34 }}>
            {marcas.map(m => (
              <div key={m.hora}
                   className="absolute right-0 -translate-y-1/2 text-[10px] tabular-nums text-slate-400"
                   style={{ top: 34 + m.fracao * ALT_PISTA }}>
                {m.hora}
              </div>
            ))}
          </div>

          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-1">
            {dias.map(dia => {
              const doDia = porDia[dia] ?? []
              const hoje = dia === hojeIso()
              const fds = eFimDeSemana(dia)
              return (
                <button
                  key={dia}
                  onClick={() => {
                    if (!podeEscrever) return
                    setErro(null)
                    setRascunho(doDia.length === 1 ? daReserva(doDia[0], espaco.abre) : vazio(dia))
                  }}
                  className="shrink-0 text-left"
                  style={{ width: LARG_DIA }}
                  title={doDia.length
                    ? doDia.map(r => `${horaDe(r.inicio)}–${horaDe(r.fim)} ${r.cliente}`).join('\n')
                    : `${diaSemana(dia)}, ${dataCurta(dia)} — livre`}
                >
                  <div className="text-center text-[10px] uppercase leading-[14px] text-slate-400">
                    {diaSemana(dia)}
                  </div>
                  <div className={`text-center text-sm font-semibold leading-5 ${
                    hoje ? 'text-brand-700' : 'text-slate-800'}`}>
                    {Number(dia.slice(8, 10))}
                  </div>
                  <div className={`relative mt-1 overflow-hidden rounded-md border ${
                      hoje ? 'border-brand-500' : 'border-slate-200'} ${
                      fds ? 'bg-slate-100' : 'bg-slate-50'}`}
                       style={{ height: ALT_PISTA }}>
                    {marcas.slice(1).map(m => (
                      <div key={m.hora} className="absolute inset-x-0 border-t border-slate-200/70"
                           style={{ top: m.fracao * ALT_PISTA }} />
                    ))}
                    {doDia.map(r => {
                      const pos = posicaoNaPista(r, espaco)
                      /*
                       * Uma reserva que comece quase à hora de fecho — uma
                       * festa à 01:00 numa sala que fecha à 01:00 — deixava
                       * dois pixels de barra: ficava no sítio certo e na mesma
                       * não se via. Aqui a barra é empurrada para cima o
                       * suficiente para se ler, à custa de mentir uns minutos
                       * na posição. A hora exacta está escrita dentro dela e a
                       * seta diz que continua, por isso não se perde nada do
                       * que importa — e uma reserva invisível perdia tudo.
                       */
                      const cortada = pos.base > 1 || pos.topo < 0
                      const minimo = MIN_BARRA / ALT_PISTA
                      const topo = Math.min(
                        Math.max(0, pos.topo), 1 - minimo) * ALT_PISTA
                      const base = Math.max(
                        Math.min(1, pos.base) * ALT_PISTA, topo + MIN_BARRA)
                      return (
                        <div key={r.id}
                             className={`absolute inset-x-0.5 overflow-hidden rounded px-0.5 pt-px ${
                               r.estado === 'confirmado'
                                 ? 'bg-brand-500 text-white'
                                 : 'border border-amber-400 bg-amber-100 text-amber-900'}`}
                             style={{ top: topo, height: base - topo }}>
                          <span className="block text-[9px] font-semibold leading-tight">
                            {horaDe(r.inicio)}
                          </span>
                          {cortada && (
                            <span className="absolute bottom-0 right-0.5 text-[9px] leading-none">↓</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-1 text-center text-[10px] text-slate-400">
                    {doDia.length ? `${doDia.length} ev.` : '·'}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-brand-500" />confirmado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-amber-400 bg-amber-100" />por confirmar
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-slate-50 ring-1 ring-inset ring-slate-300" />livre
          </span>
          {podeEscrever && (
            <span className="ml-auto">clica num dia para marcar nesse dia</span>
          )}
        </div>
      </div>

      {/* --------------------------------------------------------- lista */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-700">Eventos do período</h2>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
            <input type="checkbox" checked={verCancelados}
                   onChange={e => setVerCancelados(e.target.checked)} />
            mostrar cancelados
          </label>
        </div>
        {(() => {
          const mostrar = (verCancelados ? doPeriodo : ocupam)
            .slice().sort((a, b) => a.r.inicio.localeCompare(b.r.inicio))
          if (!mostrar.length) {
            return <div className="px-4 py-8 text-center text-sm text-slate-400">
              Nenhum evento neste período.
            </div>
          }
          return mostrar.map(({ r, dia }) => {
            const clx = r.estado === 'cancelado'
            return (
              <button key={r.id}
                      onClick={() => { if (podeEscrever) { setErro(null); setRascunho(daReserva(r, espaco.abre)) } }}
                      className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${
                        clx ? 'opacity-55' : ''}`}>
                <div className="w-[58px] shrink-0">
                  <div className="text-[10px] uppercase text-slate-400">{diaSemana(dia)}</div>
                  <div className="text-sm font-semibold tabular-nums">{dataCurta(dia)}</div>
                </div>
                <div className="w-[100px] shrink-0 text-sm tabular-nums text-slate-600">
                  {horaDe(r.inicio)}–{horaDe(r.fim)}
                  {passaMeiaNoite(r) && <span className="text-slate-400"> ↓</span>}
                </div>
                {/* No telemovel o nome passa para a linha de baixo, com a
                    largura toda. Em linha com o resto sobravam-lhe 60px e
                    «Jantar de empresa — Imperium» aparecia «Janta…» — cortado
                    justamente no campo que mais importa. */}
                <div className="order-last min-w-0 basis-full sm:order-none sm:basis-auto sm:flex-1">
                  <div className={`truncate text-sm font-medium ${clx ? 'line-through' : ''}`}>
                    {r.cliente}
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    {r.pax ? `${r.pax} pessoas` : 'sem nº de pessoas'}
                    {r.necessidades.length ? ` · ${r.necessidades.join(', ')}` : ''}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span className={`chip ${chipDoEstado(r.estado)}`}>{r.estado}</span>
                  <div className="mt-0.5 text-xs tabular-nums text-slate-500">
                    {r.valor ? eur(r.valor) : 'interno'}
                  </div>
                </div>
              </button>
            )
          })
        })()}
      </div>

      {/* ----------------------------------------------------- formulário */}
      <Modal open={!!rascunho} onClose={() => setRascunho(null)}
             title={rascunho?.id ? 'Editar reserva' : 'Reservar a sala'}>
        {rascunho && (
          <div className="space-y-3">
            <div>
              <label className="label">Cliente</label>
              <input className="input" autoFocus value={rascunho.cliente}
                     placeholder="nome de quem reserva"
                     onChange={e => setRascunho({ ...rascunho, cliente: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Contacto</label>
                <input className="input" value={rascunho.contacto} placeholder="telefone ou email"
                       onChange={e => setRascunho({ ...rascunho, contacto: e.target.value })} />
              </div>
              <div>
                <label className="label">Pessoas</label>
                <input className="input" inputMode="numeric" value={rascunho.pax}
                       placeholder={espaco.capacidade ? `até ${espaco.capacidade}` : '40'}
                       onChange={e => setRascunho({ ...rascunho, pax: e.target.value })} />
              </div>
              <div>
                <label className="label">Dia</label>
                <input className="input" type="date" value={rascunho.dia}
                       onChange={e => setRascunho({ ...rascunho, dia: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Início</label>
                  <input className="input px-2" type="time" value={rascunho.horaInicio}
                         onChange={e => setRascunho({ ...rascunho, horaInicio: e.target.value })} />
                </div>
                <div>
                  <label className="label">Fim</label>
                  <input className="input px-2" type="time" value={rascunho.horaFim}
                         onChange={e => setRascunho({ ...rascunho, horaFim: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">Estado</label>
                <select className="input" value={rascunho.estado}
                        onChange={e => setRascunho({ ...rascunho, estado: e.target.value as Estado })}>
                  {ESTADOS.map(x => <option key={x.valor} value={x.valor}>{x.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Valor acordado</label>
                <input className="input" inputMode="decimal" value={rascunho.valor}
                       placeholder="0,00 €"
                       onChange={e => setRascunho({ ...rascunho, valor: e.target.value })} />
              </div>
            </div>

            {/* quando as horas se invertem, o fim é no dia seguinte — dizê-lo
                aqui evita a pergunta «marquei no dia errado?» */}
            {minutosDaHora(rascunho.horaFim) < minutosDaHora(rascunho.horaInicio) && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Acaba já no dia seguinte, {dataCurta(somaDias(rascunho.dia, 1))}.
              </p>
            )}

            <div>
              <label className="label">Montagem e necessidades</label>
              <div className="flex flex-wrap gap-3 pb-2 text-sm text-slate-700">
                {NECESSIDADES.map(n => (
                  <label key={n} className="flex items-center gap-1.5">
                    <input type="checkbox" checked={rascunho.necessidades.includes(n)}
                           onChange={e => setRascunho({
                             ...rascunho,
                             necessidades: e.target.checked
                               ? [...rascunho.necessidades, n]
                               : rascunho.necessidades.filter(x => x !== n),
                           })} />
                    {n}
                  </label>
                ))}
              </div>
              <textarea className="input" rows={2} value={rascunho.notas}
                        placeholder="disposição da sala, horas de montagem, o que o F&B precisa de saber"
                        onChange={e => setRascunho({ ...rascunho, notas: e.target.value })} />
            </div>

            {erro && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{erro}</p>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              {rascunho.id
                ? <button className="btn btn-ghost text-red-600" disabled={aGuardar}
                          onClick={remover}>Apagar</button>
                : <span />}
              <div className="flex gap-2">
                <button className="btn btn-ghost" onClick={() => setRascunho(null)}>Cancelar</button>
                <button className="btn btn-primary" disabled={aGuardar} onClick={gravar}>
                  {aGuardar ? 'A guardar…' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ------------------------------------------------- editar o espaço */}
      <Modal open={editarEspaco} onClose={() => setEditarEspaco(false)} title="O espaço">
        <EditorDoEspaco espaco={espaco}
                        aoGuardar={async patch => {
                          try {
                            await guardarEspaco(espaco.id, patch)
                            setEditarEspaco(false)
                            toast('Espaço guardado')
                            await carregar()
                          } catch (e) { toast(mensagemDeErro(e), 'erro') }
                        }} />
      </Modal>
    </div>
  )
}

/**
 * As horas a marcar na régua, de quatro em quatro.
 *
 * A fracção sai da mesma conta que posiciona as barras — não de pixels escritos
 * à mão. Era assim que as horas ficavam desalinhadas da pista mal alguém
 * mudasse a hora de abertura.
 */
function marcasDeHora(e: Espaco) {
  const p = pista(e)
  const out: { hora: string; fracao: number }[] = []
  for (let m = p.de; m <= p.ate; m += 240) {
    out.push({
      hora: String(Math.floor((m / 60) % 24)).padStart(2, '0'),
      fracao: (m - p.de) / p.minutos,
    })
  }
  return out
}

function EditorDoEspaco({ espaco, aoGuardar }: {
  espaco: Espaco
  aoGuardar: (patch: Partial<Espaco>) => Promise<void>
}) {
  const [nome, setNome] = useState(espaco.nome)
  const [cap, setCap] = useState(espaco.capacidade == null ? '' : String(espaco.capacidade))
  const [abre, setAbre] = useState(espaco.abre.slice(0, 5))
  const [fecha, setFecha] = useState(espaco.fecha.slice(0, 5))
  const [aGuardar, setAGuardar] = useState(false)

  return (
    <div className="space-y-3">
      <div>
        <label className="label">Nome</label>
        <input className="input" value={nome} onChange={e => setNome(e.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label">Lotação</label>
          <input className="input" inputMode="numeric" value={cap} placeholder="80"
                 onChange={e => setCap(e.target.value)} />
        </div>
        <div>
          <label className="label">Abre</label>
          <input className="input px-2" type="time" value={abre}
                 onChange={e => setAbre(e.target.value)} />
        </div>
        <div>
          <label className="label">Fecha</label>
          <input className="input px-2" type="time" value={fecha}
                 onChange={e => setFecha(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-slate-500">
        As horas não são só informação: são a escala vertical da faixa. Se fechar
        depois da meia-noite, escreve a hora de fecho na mesma — 01:00 — que o
        desenho trata disso.
      </p>
      <div className="flex justify-end gap-2 pt-1">
        <button className="btn btn-primary" disabled={aGuardar || !nome.trim()}
                onClick={async () => {
                  setAGuardar(true)
                  await aoGuardar({
                    nome: nome.trim(),
                    capacidade: cap.trim() ? Math.round(Number(cap)) || null : null,
                    abre: `${abre}:00`,
                    fecha: `${fecha}:00`,
                  })
                  setAGuardar(false)
                }}>
          {aGuardar ? 'A guardar…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}
