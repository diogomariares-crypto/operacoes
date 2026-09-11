import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useApp } from '../lib/appState'
import { Empty, Loading, Modal, useToast } from '../components/ui'
import { useLembrado } from '../lib/lembrar'
import {
  type Dia, type Grupo, type GrupoNovo,
  ESTADOS, criarGrupo, dataCurta, dataLonga, diaSemana, fetchDias, fetchGrupos,
  hojeIso, mensagemDeErro, noites, quando, quartosDoDia, somaDias,
} from '../lib/grupos'

/**
 * A lista de grupos do hotel.
 *
 * Ordena-se pela chegada e mostra primeiro o que está a caminho, porque é essa
 * a pergunta de quem abre isto ao balcão: o que é que nos entra esta semana.
 * Os grupos passados continuam lá, num filtro à parte — servem de histórico
 * quando o mesmo operador volta no ano seguinte.
 */
export default function Grupos() {
  const toast = useToast()
  const nav = useNavigate()
  const { canWrite, email } = useAuth()
  const { hotelId, hotels } = useApp()
  const podeEscrever = canWrite('FO')

  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [dias, setDias] = useState<Record<string, Dia[]>>({})
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useLembrado('grupos.filtro', 'por-vir')
  const [novo, setNovo] = useState<GrupoNovo | null>(null)
  const [aGuardar, setAGuardar] = useState(false)

  const hoje = hojeIso()

  const carregar = async () => {
    if (!hotelId) return
    setLoading(true)
    try {
      // os passados só se buscam quando se pedem: são muitos e quase nunca
      // é isso que se quer ver ao abrir a página
      const gs = await fetchGrupos(hotelId, filtro === 'todos' ? undefined : hoje)
      setGrupos(gs)
      const pares = await Promise.all(gs.map(async g => [g.id, await fetchDias(g.id)] as const))
      setDias(Object.fromEntries(pares))
    } catch (e) {
      toast(mensagemDeErro(e), 'erro')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { carregar() }, [hotelId, filtro])

  const abrirNovo = () => {
    if (!hotelId) return
    setNovo({
      hotel_id: hotelId,
      nome: '',
      codigo: null,
      organizador: null,
      tour_leader: null,
      telefone: null,
      email: null,
      chegada: hoje,
      saida: somaDias(hoje, 1),
      hora_chegada: null,
      hora_saida: null,
      paga_quarto: 'empresa',
      paga_city_tax: 'empresa',
      paga_eventos: 'empresa',
      paga_extras: 'individual',
      pedir_cartao: true,
      deposito: null,
      vips: null,
      estado: 'confirmado',
    })
  }

  const gravarNovo = async () => {
    if (!novo) return
    if (!novo.nome.trim()) { toast('O grupo precisa de um nome', 'erro'); return }
    if (novo.saida <= novo.chegada) { toast('A saída tem de ser depois da chegada', 'erro'); return }
    setAGuardar(true)
    try {
      const g = await criarGrupo({ ...novo, nome: novo.nome.trim() }, email)
      setNovo(null)
      nav(`/grupos/${g.id}`)
    } catch (e) {
      toast(mensagemDeErro(e), 'erro')
    } finally {
      setAGuardar(false)
    }
  }

  const linhas = useMemo(() => grupos.map(g => {
    const ds = dias[g.id] ?? []
    return {
      g,
      quartos: ds.reduce((m, d) => Math.max(m, quartosDoDia(d)), 0),
      pax: ds.reduce((m, d) => Math.max(m, d.pax ?? 0), 0),
      onde: quando(g, hoje),
    }
  }), [grupos, dias, hoje])

  const hotel = hotels.find(h => h.id === hotelId)

  if (loading) return <Loading />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Grupos · {hotel?.name}</h1>
          <p className="text-sm text-slate-500">
            O que vem a caminho e o que cada departamento precisa de saber.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input w-auto" value={filtro} onChange={e => setFiltro(e.target.value)}>
            <option value="por-vir">Em casa e por vir</option>
            <option value="todos">Todos, incluindo passados</option>
          </select>
          {podeEscrever && (
            <button className="btn-primary" onClick={abrirNovo}>+ Novo grupo</button>
          )}
        </div>
      </div>

      {linhas.length === 0 ? (
        <Empty>
          {filtro === 'todos'
            ? 'Ainda não há grupos lançados neste hotel.'
            : 'Não há grupos em casa nem por vir. Os passados estão no filtro acima.'}
        </Empty>
      ) : (
        <div className="space-y-2">
          {linhas.map(({ g, quartos, pax, onde }) => {
            const est = ESTADOS.find(e => e.id === g.estado)
            const emCasa = onde === 'em casa'
            return (
              <button
                key={g.id}
                onClick={() => nav(`/grupos/${g.id}`)}
                className={`card flex w-full flex-wrap items-center gap-x-4 gap-y-2 p-4 text-left transition hover:border-brand-200 hover:shadow ${
                  g.estado === 'cancelado' ? 'opacity-60' : ''}`}
              >
                <div className="min-w-[180px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{g.nome}</span>
                    {est && <span className={`chip ${est.tom}`}>{est.label}</span>}
                    {emCasa && <span className="chip bg-brand-500 text-white">em casa</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {[g.codigo, g.organizador].filter(Boolean).join(' · ') || 'sem código'}
                  </div>
                </div>

                <div className="min-w-[190px] text-sm">
                  <div className="font-medium">
                    {diaSemana(g.chegada)}, {dataCurta(g.chegada)} → {dataCurta(g.saida)}
                  </div>
                  <div className="text-xs text-slate-500">
                    {noites(g.chegada, g.saida)} noite(s)
                    {!emCasa && g.chegada > hoje && ` · chega em ${noites(hoje, g.chegada)} dia(s)`}
                  </div>
                </div>

                <div className="text-right text-sm tabular-nums">
                  <div className="font-medium">{quartos || '—'} quartos</div>
                  <div className="text-xs text-slate-500">{pax || '—'} pax</div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* novo grupo: só o indispensável, o resto afina-se na ficha */}
      <Modal open={!!novo} onClose={() => setNovo(null)} title="Novo grupo">
        {novo && (
          <div className="space-y-3">
            <div>
              <label className="label">Nome do grupo</label>
              <input className="input" autoFocus value={novo.nome}
                     placeholder="Veneta"
                     onChange={e => setNovo({ ...novo, nome: e.target.value })} />
            </div>
            <div>
              <label className="label">Código (opcional)</label>
              <input className="input" value={novo.codigo ?? ''}
                     placeholder="Veneta-20-5-DCC0"
                     onChange={e => setNovo({ ...novo, codigo: e.target.value || null })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Chegada</label>
                <input className="input" type="date" value={novo.chegada}
                       onChange={e => {
                         const d = e.target.value
                         setNovo({
                           ...novo, chegada: d,
                           saida: novo.saida <= d ? somaDias(d, 1) : novo.saida,
                         })
                       }} />
              </div>
              <div>
                <label className="label">Saída</label>
                <input className="input" type="date" value={novo.saida}
                       min={somaDias(novo.chegada, 1)}
                       onChange={e => setNovo({ ...novo, saida: e.target.value })} />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              {noites(novo.chegada, novo.saida)} noite(s) —{' '}
              {dataLonga(novo.chegada)} a {dataLonga(novo.saida)}. Os quartos por dia,
              as notas e a rooming list preenchem-se a seguir.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={() => setNovo(null)}>Cancelar</button>
              <button className="btn-primary" onClick={gravarNovo} disabled={aGuardar}>
                {aGuardar ? 'A criar…' : 'Criar grupo'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
