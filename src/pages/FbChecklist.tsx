/**
 * Checklist da manhã do F&B.
 *
 * Esta página é usada de pé, com o telemóvel numa mão e um tabuleiro na outra.
 * Tudo o que aqui está obedece a isso:
 *
 *  - a linha inteira é o botão de marcar, com 56px de altura, porque acertar
 *    numa caixinha de 16px com o polegar a meio do serviço não acontece;
 *  - os blocos fecham, e abre-se sozinho o primeiro que ainda tem tarefas —
 *    quem pega no telemóvel vê onde vai, sem procurar;
 *  - a marcação vai para a base de dados na hora e o ecrã não espera por ela,
 *    senão cada toque tinha meio segundo de nada a acontecer;
 *  - as tarefas que não são de hoje não aparecem hoje.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../lib/appState'
import { useAuth } from '../lib/auth'
import {
  blocosDoDia, blocosExistentes, desactivarTarefa, fetchFeito, fetchTarefas,
  guardarNota, guardarTarefa, hhmm, horaAgora, juntarTarefa, marcar, quandoTexto,
  totalFeitas, totalTarefas, trocarOrdem,
  type Feito, type Tarefa,
} from '../lib/fbChecklist'
import { addDays, dataExtenso, todayISO } from '../lib/format'
import { Loading, Modal, useToast } from '../components/ui'

const DIAS = [
  { n: 1, r: 'S' }, { n: 2, r: 'T' }, { n: 3, r: 'Q' }, { n: 4, r: 'Q' },
  { n: 5, r: 'S' }, { n: 6, r: 'S' }, { n: 7, r: 'D' },
]

export default function FbChecklist() {
  const { hotelId, hotels } = useApp()
  const { email, canWrite, isAdmin } = useAuth()
  const toast = useToast()
  const podeEditarLista = isAdmin || canWrite('FB')

  const [dia, setDia] = useState(todayISO())
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [feito, setFeito] = useState<Record<string, Feito>>({})
  const [aCarregar, setACarregar] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [abertos, setAbertos] = useState<string[]>([])
  const [editarLista, setEditarLista] = useState(false)
  const [tocados, setTocados] = useState(false)

  const carregar = useCallback(async () => {
    if (!hotelId) return
    setACarregar(true)
    try {
      const [t, f] = await Promise.all([fetchTarefas(hotelId), fetchFeito(hotelId, dia)])
      setTarefas(t); setFeito(f); setErro(null)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setACarregar(false)
    }
  }, [hotelId, dia])

  useEffect(() => { void carregar() }, [carregar])

  const blocos = useMemo(() => blocosDoDia(tarefas, dia, feito), [tarefas, dia, feito])
  const feitas = totalFeitas(blocos)
  const total = totalTarefas(blocos)

  /*
   * Abre sozinho o primeiro bloco por acabar — mas só enquanto ninguém mexeu.
   * Depois de a pessoa abrir ou fechar alguma coisa, manda ela: um painel que
   * se reabre sozinho a meio do trabalho é das coisas mais irritantes que há.
   */
  useEffect(() => {
    if (tocados || !blocos.length) return
    const porAcabar = blocos.find(b => b.feitas < b.tarefas.length)
    setAbertos([(porAcabar ?? blocos[0]).nome])
  }, [blocos, tocados])

  const alternarBloco = (nome: string) => {
    setTocados(true)
    setAbertos(a => (a.includes(nome) ? a.filter(x => x !== nome) : [...a, nome]))
  }

  /*
   * O ecrã muda já e a gravação segue atrás. Se falhar, volta atrás e diz —
   * em vez de deixar um visto que não existe na base de dados, que é pior do
   * que não ter marcado nada.
   */
  const alternar = async (t: Tarefa) => {
    if (!hotelId) return
    const antes = feito[t.id]
    const hora = antes?.hora ? null : horaAgora()
    setFeito(f => ({ ...f, [t.id]: { tarefa_id: t.id, hora, nota: antes?.nota ?? null } }))
    try {
      await marcar(hotelId, dia, t.id, hora)
    } catch (e) {
      setFeito(f => ({ ...f, [t.id]: antes ?? { tarefa_id: t.id, hora: null, nota: null } }))
      toast((e as Error).message, 'erro')
    }
  }

  const mudarHora = async (t: Tarefa, hora: string) => {
    if (!hotelId || !hora) return
    const antes = feito[t.id]
    setFeito(f => ({ ...f, [t.id]: { ...(antes ?? { tarefa_id: t.id, nota: null }), tarefa_id: t.id, hora, nota: antes?.nota ?? null } }))
    try { await marcar(hotelId, dia, t.id, hora) } catch (e) { toast((e as Error).message, 'erro') }
  }

  const mudarNota = async (t: Tarefa, nota: string) => {
    if (!hotelId) return
    const antes = feito[t.id]
    const limpa = nota.trim() || null
    if ((antes?.nota ?? null) === limpa) return
    setFeito(f => ({ ...f, [t.id]: { tarefa_id: t.id, hora: antes?.hora ?? null, nota: limpa } }))
    try { await guardarNota(hotelId, dia, t.id, limpa) } catch (e) { toast((e as Error).message, 'erro') }
  }

  if (!hotelId) return <Loading />
  if (erro) {
    return (
      <div className="card p-5 text-sm">
        <h2 className="mb-1 font-semibold text-red-700">Não foi possível abrir a checklist</h2>
        <p className="text-slate-600">{erro}</p>
      </div>
    )
  }
  if (aCarregar) return <Loading />

  const hotel = hotels.find(h => h.id === hotelId)?.name ?? ''
  const hoje = dia === todayISO()
  const pct = total ? Math.round((feitas / total) * 100) : 0

  return (
    <div className="mx-auto max-w-2xl space-y-3">

      {/* ------------------------------------------------------- cabeçalho */}
      <div className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-slate-900">Checklist da manhã</h1>
            <p className="truncate text-sm text-slate-500">{hotel}</p>
          </div>
          {podeEditarLista && (
            <button className="btn-ghost shrink-0 text-sm" onClick={() => setEditarLista(true)}>
              Editar lista
            </button>
          )}
        </div>

        {/* o dia: setas grandes para o polegar, e «hoje» sempre a um toque */}
        <div className="mt-3 flex items-center gap-2">
          <button className="btn-ghost h-11 w-11 shrink-0 p-0 text-lg" title="Dia anterior"
                  onClick={() => setDia(d => addDays(d, -1))}>‹</button>
          <input type="date" className="input h-11 min-w-0 flex-1 text-center text-sm"
                 value={dia} onChange={e => e.target.value && setDia(e.target.value)} />
          <button className="btn-ghost h-11 w-11 shrink-0 p-0 text-lg" title="Dia seguinte"
                  disabled={hoje} onClick={() => setDia(d => addDays(d, 1))}>›</button>
        </div>
        <p className="mt-1.5 text-center text-xs text-slate-500">
          {dataExtenso(dia)}{!hoje && (
            <button className="ml-2 text-brand-700 underline" onClick={() => setDia(todayISO())}>
              voltar a hoje
            </button>
          )}
        </p>

        {/* o progresso: a primeira coisa que se quer saber ao pegar no telemóvel */}
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-slate-700">
              {feitas} de {total} feitas
            </span>
            <span className={`tabular-nums ${feitas === total && total > 0
              ? 'font-semibold text-brand-700' : 'text-slate-500'}`}>
              {feitas === total && total > 0 ? 'tudo feito' : `${pct}%`}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand-500 transition-[width] duration-300"
                 style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* --------------------------------------------------------- blocos */}
      {blocos.length === 0 && (
        <div className="card p-6 text-center text-sm text-slate-500">
          Ainda não há tarefas para este hotel.
          {podeEditarLista && ' Toca em «Editar lista» para as criar.'}
        </div>
      )}

      {blocos.map(b => {
        const aberto = abertos.includes(b.nome)
        const completo = b.feitas === b.tarefas.length
        return (
          <section key={b.nome} className="card overflow-hidden">
            <button
              onClick={() => alternarBloco(b.nome)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                completo ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {completo ? '✓' : b.tarefas.length - b.feitas}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-slate-800">{b.nome}</span>
                <span className="block text-xs text-slate-500">
                  {b.feitas} de {b.tarefas.length}
                  {!completo && ` · faltam ${b.tarefas.length - b.feitas}`}
                </span>
              </span>
              <span className={`shrink-0 text-slate-400 transition-transform ${aberto ? 'rotate-90' : ''}`}>›</span>
            </button>

            {aberto && (
              <ul className="border-t border-slate-100">
                {b.tarefas.map(t => (
                  <LinhaTarefa
                    key={t.id} t={t} feito={feito[t.id]}
                    onAlternar={() => alternar(t)}
                    onHora={h => mudarHora(t, h)}
                    onNota={n => mudarNota(t, n)}
                  />
                ))}
              </ul>
            )}
          </section>
        )
      })}

      {editarLista && hotelId && (
        <EditorDaLista
          hotelId={hotelId} tarefas={tarefas} email={email}
          onFechar={() => setEditarLista(false)}
          onMudou={carregar}
        />
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- a linha */

function LinhaTarefa({
  t, feito, onAlternar, onHora, onNota,
}: {
  t: Tarefa
  feito: Feito | undefined
  onAlternar: () => void
  onHora: (h: string) => void
  onNota: (n: string) => void
}) {
  const [notaAberta, setNotaAberta] = useState(false)
  const [nota, setNota] = useState(feito?.nota ?? '')
  useEffect(() => { setNota(feito?.nota ?? '') }, [feito?.nota])

  const feita = !!feito?.hora
  const quando = quandoTexto(t.dias_semana)

  return (
    <li className="border-t border-slate-100 first:border-t-0">
      <div className="flex items-stretch">
        {/*
          A linha inteira marca. 56px de altura e sem nada clicável por dentro
          além da hora: no telemóvel, dois alvos juntos é um alvo errado.
        */}
        <button
          onClick={onAlternar}
          className="flex min-h-[56px] min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left active:bg-slate-50"
        >
          <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 text-sm font-bold transition ${
            feita ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300 bg-white text-transparent'}`}>
            ✓
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block text-[15px] leading-snug ${
              feita ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
              {t.titulo}
            </span>
            {t.descricao && (
              <span className="mt-0.5 block text-xs leading-snug text-slate-500">{t.descricao}</span>
            )}
            {(quando || feito?.nota) && (
              <span className="mt-1 flex flex-wrap items-center gap-1">
                {quando && (
                  <span className="chip bg-amber-100 text-amber-800">{quando}</span>
                )}
                {feito?.nota && (
                  <span className="chip bg-slate-100 text-slate-600">nota</span>
                )}
              </span>
            )}
          </span>
        </button>

        {/*
          A hora e a nota ficam à direita, em alvos de 44px. O «—» tem a largura
          do campo da hora de propósito: sem isso as linhas por fazer encolhiam e
          a coluna dançava à medida que se ia marcando.
        */}
        <div className="flex shrink-0 items-center gap-0.5 pr-2">
          {feita ? (
            <input
              type="time" value={hhmm(feito!.hora)}
              onChange={e => e.target.value && onHora(e.target.value)}
              className="h-11 w-[78px] rounded-md border border-slate-200 bg-white px-1 text-center text-xs tabular-nums text-slate-600"
              title="Hora a que foi feita — corrige-se aqui"
            />
          ) : (
            <span className="grid h-11 w-[78px] place-items-center text-xs text-slate-300"
                  aria-hidden="true">—</span>
          )}
          <button
            onClick={() => setNotaAberta(v => !v)}
            title={feito?.nota ? 'Ver a nota' : 'Escrever uma nota'}
            aria-label={feito?.nota ? 'Ver a nota' : 'Escrever uma nota'}
            aria-expanded={notaAberta}
            className={`grid h-11 w-9 shrink-0 place-items-center rounded-md text-base ${
              notaAberta ? 'bg-slate-100 text-slate-700'
                : feito?.nota ? 'text-brand-600' : 'text-slate-300'}`}
          >
            ✎
          </button>
        </div>
      </div>

      {notaAberta && (
        <div className="px-4 pb-3">
          <textarea
            className="input min-h-[60px] text-sm" value={nota}
            placeholder="Ex.: faltavam chávenas, avisei a cozinha"
            onChange={e => setNota(e.target.value)}
            onBlur={() => onNota(nota)}
          />
        </div>
      )}
    </li>
  )
}

/* ------------------------------------------------------- editar a lista */

function EditorDaLista({
  hotelId, tarefas, email, onFechar, onMudou,
}: {
  hotelId: string
  tarefas: Tarefa[]
  email: string | null
  onFechar: () => void
  onMudou: () => Promise<void>
}) {
  const toast = useToast()
  const [ocupado, setOcupado] = useState(false)
  const [aEditar, setAEditar] = useState<Tarefa | 'nova' | null>(null)

  const activas = useMemo(
    () => tarefas.filter(t => t.ativa).sort((a, b) => a.ordem - b.ordem), [tarefas])

  const com = async (f: () => Promise<void>) => {
    setOcupado(true)
    try { await f(); await onMudou() } catch (e) { toast((e as Error).message, 'erro') }
    finally { setOcupado(false) }
  }

  const mover = (t: Tarefa, delta: number) => {
    const i = activas.findIndex(x => x.id === t.id)
    const outro = activas[i + delta]
    if (!outro) return
    void com(() => trocarOrdem(t, outro, email))
  }

  return (
    <Modal open onClose={onFechar} title="Checklist da manhã — a lista" wide>
      <p className="mb-3 text-sm text-slate-600">
        O que estiver aqui é o que a equipa vê de manhã. A ordem dos blocos sai
        da ordem das tarefas.
      </p>

      <ul className="space-y-1">
        {activas.map((t, i) => {
          const primeiroDoBloco = i === 0 || activas[i - 1].bloco !== t.bloco
          return (
            <li key={t.id}>
              {primeiroDoBloco && (
                <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t.bloco}
                </div>
              )}
              <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-2">
                <div className="flex shrink-0 flex-col">
                  <button className="h-5 px-1 text-xs text-slate-400 hover:text-slate-700"
                          disabled={ocupado || i === 0} onClick={() => mover(t, -1)}>▲</button>
                  <button className="h-5 px-1 text-xs text-slate-400 hover:text-slate-700"
                          disabled={ocupado || i === activas.length - 1} onClick={() => mover(t, 1)}>▼</button>
                </div>
                <button className="min-w-0 flex-1 text-left" onClick={() => setAEditar(t)}>
                  <span className="block truncate text-sm text-slate-800">{t.titulo}</span>
                  {(t.descricao || t.dias_semana) && (
                    <span className="block truncate text-xs text-slate-500">
                      {t.descricao}
                      {t.dias_semana && ` · ${quandoTexto(t.dias_semana)}`}
                    </span>
                  )}
                </button>
                <button
                  className="shrink-0 rounded px-2 py-1 text-slate-300 hover:bg-red-50 hover:text-red-600"
                  disabled={ocupado}
                  title="Tirar da lista. O histórico dos dias em que foi feita fica."
                  onClick={() => com(() => desactivarTarefa(t.id, email))}
                >✕</button>
              </div>
            </li>
          )
        })}
      </ul>

      <button className="btn-ghost mt-4 w-full" disabled={ocupado}
              onClick={() => setAEditar('nova')}>
        + Nova tarefa
      </button>

      {aEditar && (
        <FormularioTarefa
          hotelId={hotelId} email={email}
          tarefa={aEditar === 'nova' ? null : aEditar}
          blocos={blocosExistentes(tarefas)}
          proximaOrdem={(activas[activas.length - 1]?.ordem ?? 0) + 10}
          onFechar={() => setAEditar(null)}
          onGravado={async () => { setAEditar(null); await onMudou() }}
        />
      )}
    </Modal>
  )
}

function FormularioTarefa({
  hotelId, email, tarefa, blocos, proximaOrdem, onFechar, onGravado,
}: {
  hotelId: string
  email: string | null
  tarefa: Tarefa | null
  blocos: string[]
  proximaOrdem: number
  onFechar: () => void
  onGravado: () => Promise<void>
}) {
  const toast = useToast()
  const [titulo, setTitulo] = useState(tarefa?.titulo ?? '')
  const [descricao, setDescricao] = useState(tarefa?.descricao ?? '')
  const [bloco, setBloco] = useState(tarefa?.bloco ?? blocos[0] ?? 'Antes de abrir')
  const [blocoNovo, setBlocoNovo] = useState('')
  const [dias, setDias] = useState<number[]>(tarefa?.dias_semana ?? [])
  const [aGravar, setAGravar] = useState(false)

  const gravar = async () => {
    const nome = (blocoNovo.trim() || bloco).trim()
    if (!titulo.trim() || !nome) return
    setAGravar(true)
    try {
      const campos = {
        bloco: nome,
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        // vazio é «todos os dias», que é o caso normal e não precisa de regra
        dias_semana: dias.length && dias.length < 7 ? [...dias].sort((a, b) => a - b) : null,
      }
      if (tarefa) await guardarTarefa(tarefa.id, campos, email)
      else await juntarTarefa(hotelId, { ...campos, ordem: proximaOrdem }, email)
      await onGravado()
    } catch (e) {
      toast((e as Error).message, 'erro'); setAGravar(false)
    }
  }

  return (
    <Modal open onClose={onFechar} title={tarefa ? 'Tarefa' : 'Nova tarefa'}>
      <div className="space-y-3">
        <div>
          <label className="label">O que é preciso fazer</label>
          <input className="input" value={titulo} autoFocus
                 onChange={e => setTitulo(e.target.value)} />
        </div>
        <div>
          <label className="label">Detalhe <span className="text-slate-400">(opcional)</span></label>
          <input className="input" value={descricao} placeholder="Aparece em letra pequena por baixo"
                 onChange={e => setDescricao(e.target.value)} />
        </div>
        <div>
          <label className="label">Momento da manhã</label>
          <select className="input" value={bloco} onChange={e => setBloco(e.target.value)}>
            {blocos.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <input className="input mt-1.5 text-sm" value={blocoNovo}
                 placeholder="…ou escreve um momento novo"
                 onChange={e => setBlocoNovo(e.target.value)} />
        </div>
        <div>
          <label className="label">Em que dias</label>
          <div className="flex gap-1">
            {DIAS.map(d => {
              const on = dias.includes(d.n)
              return (
                <button
                  key={d.n}
                  onClick={() => setDias(v => on ? v.filter(x => x !== d.n) : [...v, d.n])}
                  className={`h-10 flex-1 rounded-lg border text-sm font-medium ${
                    on ? 'border-brand-500 bg-brand-500 text-white'
                       : 'border-slate-200 bg-white text-slate-500'}`}
                >{d.r}</button>
              )
            })}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {dias.length === 0 || dias.length === 7
              ? 'Nenhum escolhido: a tarefa é de todos os dias.'
              : `Só aparece ${quandoTexto([...dias].sort((a, b) => a - b))}.`}
          </p>
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onFechar}>Cancelar</button>
        <button className="btn-primary" disabled={aGravar || !titulo.trim()} onClick={gravar}>
          {aGravar ? 'A gravar…' : 'Gravar'}
        </button>
      </div>
    </Modal>
  )
}
