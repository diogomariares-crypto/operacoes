import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Loading, Modal, NumInput, useToast } from '../components/ui'
import {
  type Dia, type DeptNota, type Estado, type Grupo, type GrupoNovo, type Nota,
  type QuartoGrupo, type QuemPaga,
  ESTADOS, PAGAMENTOS, SECCOES,
  alinharDias, apagarGrupo, apagarQuarto, dataCurta, dataLonga, diaSemana, euros,
  fetchDias, fetchGrupo, fetchNotas, fetchQuartos, guardarDia, guardarGrupo,
  guardarNota, lerRooming, mensagemDeErro, noites, quartosDoDia, somaDias,
  substituirQuartos, totais, valorDoDia,
} from '../lib/grupos'

/**
 * A ficha de um grupo — o que era o Tour Movement em Word.
 *
 * A ordem é a do documento, para quem já o conhece não ter de reaprender:
 * resumo, quartos por dia, quem paga o quê, VIPs, notas por departamento e
 * rooming list.
 *
 * Quem escreve o quê não é igual em toda a página: as datas, os quartos e as
 * tarifas são de quem trata dos grupos (receção e direção); a nota de cada
 * departamento é de quem lá trabalha. A governanta corrige a sua nota sem poder
 * mexer nas tarifas, e isso está garantido na base de dados e não só aqui.
 */
export default function GrupoFicha() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { canWrite, email } = useAuth()
  const podeEscrever = canWrite('FO')

  const [grupo, setGrupo] = useState<Grupo | null>(null)
  const [dias, setDias] = useState<Dia[]>([])
  const [notas, setNotas] = useState<Nota[]>([])
  const [quartos, setQuartos] = useState<QuartoGrupo[]>([])
  const [loading, setLoading] = useState(true)
  const [editar, setEditar] = useState<Partial<GrupoNovo> | null>(null)
  const [aColar, setAColar] = useState<string | null>(null)
  const [aGuardar, setAGuardar] = useState(false)

  const carregar = async () => {
    if (!id) return
    try {
      const g = await fetchGrupo(id)
      setGrupo(g)
      if (!g) return
      // os dias podem estar desalinhados se alguém mudou as datas noutro sítio
      const ds = await fetchDias(id)
      if (await alinharDias(g, ds).catch(() => false)) {
        setDias(await fetchDias(id))
      } else {
        setDias(ds)
      }
      setNotas(await fetchNotas(id))
      setQuartos(await fetchQuartos(id))
    } catch (e) {
      toast(mensagemDeErro(e), 'erro')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { carregar() }, [id])

  const t = useMemo(() => totais(dias), [dias])

  /* ------------------------------- ações ------------------------------- */
  const mudarDia = (data: string, patch: Partial<Dia>) =>
    setDias(ds => ds.map(d => (d.data === data ? { ...d, ...patch } : d)))

  const gravarDia = async (data: string) => {
    const d = dias.find(x => x.data === data)
    if (!d || !podeEscrever) return
    try { await guardarDia(d) } catch (e) { toast(mensagemDeErro(e), 'erro') }
  }

  const gravarCampo = async (patch: Partial<GrupoNovo>) => {
    if (!grupo || !podeEscrever) return
    const antes = grupo
    setGrupo({ ...grupo, ...patch } as Grupo)
    try {
      await guardarGrupo(grupo.id, patch, email)
    } catch (e) {
      setGrupo(antes)
      toast(mensagemDeErro(e), 'erro')
    }
  }

  const gravarEdicao = async () => {
    if (!grupo || !editar) return
    if (editar.nome !== undefined && !editar.nome.trim()) {
      toast('O grupo precisa de um nome', 'erro'); return
    }
    if (editar.chegada && editar.saida && editar.saida <= editar.chegada) {
      toast('A saída tem de ser depois da chegada', 'erro'); return
    }
    setAGuardar(true)
    try {
      await guardarGrupo(grupo.id, editar, email)
      setEditar(null)
      await carregar()
    } catch (e) {
      toast(mensagemDeErro(e), 'erro')
    } finally {
      setAGuardar(false)
    }
  }

  const gravarNotaDe = async (dep: DeptNota, texto: string) => {
    if (!grupo) return
    try {
      await guardarNota(grupo.id, dep, texto, email)
      setNotas(await fetchNotas(grupo.id))
    } catch (e) {
      toast(mensagemDeErro(e), 'erro')
    }
  }

  const colar = async () => {
    if (!grupo || aColar == null) return
    const linhas = lerRooming(aColar)
    if (!linhas.length) { toast('Não reconheci nenhum quarto nesse texto', 'erro'); return }
    setAGuardar(true)
    try {
      await substituirQuartos(grupo.id, linhas)
      setQuartos(await fetchQuartos(grupo.id))
      setAColar(null)
      toast(`${linhas.length} quarto(s) na rooming list`)
    } catch (e) {
      toast(mensagemDeErro(e), 'erro')
    } finally {
      setAGuardar(false)
    }
  }

  const apagar = async () => {
    if (!grupo) return
    if (!confirm(`Apagar o grupo ${grupo.nome}? Leva consigo os dias, as notas e a rooming list.`)) return
    try {
      await apagarGrupo(grupo.id)
      nav('/grupos')
    } catch (e) { toast(mensagemDeErro(e), 'erro') }
  }

  /* ------------------------------- ecrã -------------------------------- */
  if (loading) return <Loading />
  if (!grupo) {
    return (
      <div className="space-y-3">
        <button className="btn-ghost" onClick={() => nav('/grupos')}>‹ Grupos</button>
        <div className="card p-6 text-sm text-slate-600">
          Este grupo já não existe. Pode ter sido apagado por outra pessoa.
        </div>
      </div>
    )
  }

  const est = ESTADOS.find(e => e.id === grupo.estado)
  const notaDe = (d: DeptNota) => notas.find(n => n.departamento === d)
  const podeNota = (d: DeptNota) =>
    d === 'HSK' ? canWrite('HSK') : d === 'FB' ? canWrite('FB') : canWrite('FO')

  return (
    <div className="space-y-5">
      {/* cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button className="mb-1 text-sm text-slate-500 hover:text-slate-800"
                  onClick={() => nav('/grupos')}>
            ‹ Grupos
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{grupo.nome}</h1>
            {est && <span className={`chip ${est.tom}`}>{est.label}</span>}
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {[grupo.codigo, grupo.organizador && `Organizador: ${grupo.organizador}`]
              .filter(Boolean).join(' · ') || 'sem código'}
          </p>
        </div>
        {podeEscrever && (
          <div className="flex items-center gap-2">
            <select className="input w-auto" value={grupo.estado}
                    onChange={e => gravarCampo({ estado: e.target.value as Estado })}>
              {ESTADOS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
            <button className="btn-ghost" onClick={() => setEditar({
              nome: grupo.nome, codigo: grupo.codigo, organizador: grupo.organizador,
              tour_leader: grupo.tour_leader, telefone: grupo.telefone, email: grupo.email,
              chegada: grupo.chegada, saida: grupo.saida,
              hora_chegada: grupo.hora_chegada, hora_saida: grupo.hora_saida,
            })}>
              Editar
            </button>
          </div>
        )}
      </div>

      {/* resumo */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Bloco titulo="Chegada"
               valor={`${diaSemana(grupo.chegada)}, ${dataCurta(grupo.chegada)}`}
               nota={grupo.hora_chegada ? `às ${grupo.hora_chegada}` : 'hora não definida'} />
        <Bloco titulo="Saída"
               valor={`${diaSemana(grupo.saida)}, ${dataCurta(grupo.saida)}`}
               nota={grupo.hora_saida ? `às ${grupo.hora_saida}` : 'hora não definida'} />
        <Bloco titulo="Quartos" valor={t.quartosMax ? String(t.quartosMax) : '—'}
               nota={`${t.noites} noite(s) · ${t.quartosNoite} quarto-noite(s)`} />
        <Bloco titulo="Pax" valor={t.paxMax ? String(t.paxMax) : '—'}
               nota={t.valor ? `${euros(t.valor)} em alojamento` : 'sem tarifas lançadas'} />
      </div>

      {/* contactos */}
      {(grupo.tour_leader || grupo.telefone || grupo.email) && (
        <div className="card flex flex-wrap gap-x-8 gap-y-2 p-4 text-sm">
          {grupo.tour_leader && (
            <div><span className="text-slate-500">Tour leader: </span>{grupo.tour_leader}</div>
          )}
          {grupo.telefone && (
            <div><span className="text-slate-500">Tel.: </span>
              <a className="text-brand-700 hover:underline" href={`tel:${grupo.telefone}`}>{grupo.telefone}</a>
            </div>
          )}
          {grupo.email && (
            <div><span className="text-slate-500">Email: </span>
              <a className="text-brand-700 hover:underline" href={`mailto:${grupo.email}`}>{grupo.email}</a>
            </div>
          )}
        </div>
      )}

      {/* quartos por dia */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Quartos por dia</h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[680px]">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="th">Dia</th>
                <th className="th text-right">Single</th>
                <th className="th text-right">€</th>
                <th className="th text-right">Double</th>
                <th className="th text-right">€</th>
                <th className="th text-right">Twin</th>
                <th className="th text-right">€</th>
                <th className="th text-right">Pax</th>
                <th className="th text-right">Quartos</th>
                <th className="th text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {dias.map(d => (
                <tr key={d.data} className="border-b border-slate-100 last:border-0">
                  <td className="td whitespace-nowrap">
                    <span className="font-medium">{dataCurta(d.data)}</span>
                    <span className="ml-1.5 text-xs text-slate-400">{diaSemana(d.data)}</span>
                  </td>
                  {(['s', 'd', 't'] as const).map(k => (
                    <Celulas key={k} dia={d} tipo={k} editavel={podeEscrever}
                             mudar={mudarDia} gravar={gravarDia} />
                  ))}
                  <td className="td w-20">
                    <NumInput value={d.pax ?? 0} disabled={!podeEscrever}
                              onChange={n => mudarDia(d.data, { pax: n || null })}
                              onBlur={() => gravarDia(d.data)} />
                  </td>
                  <td className="td text-right tabular-nums font-medium">{quartosDoDia(d)}</td>
                  <td className="td text-right tabular-nums">{euros(valorDoDia(d))}</td>
                </tr>
              ))}
              {dias.length === 0 && (
                <tr><td className="td text-slate-500" colSpan={10}>
                  Sem dias — verifica as datas do grupo.
                </td></tr>
              )}
            </tbody>
            {dias.length > 0 && (
              <tfoot className="border-t border-slate-200 bg-slate-50">
                <tr>
                  <td className="td font-medium" colSpan={7}>
                    {t.noites} noite(s)
                  </td>
                  <td className="td text-right tabular-nums font-medium">{t.paxMax}</td>
                  <td className="td text-right tabular-nums font-medium">{t.quartosNoite}</td>
                  <td className="td text-right tabular-nums font-medium">{euros(t.valor)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="text-xs text-slate-500">
          Uma linha por noite: o dia da saída não conta. O total de quartos é a soma
          das noites, e o «Quartos» no resumo é o dia mais cheio.
        </p>
      </section>

      {/* pagamento */}
      <section className="grid gap-3 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Pagamento</h2>
          <div className="space-y-2">
            {PAGAMENTOS.map(p => (
              <div key={p.chave} className="flex items-center justify-between gap-3">
                <span className="text-sm">{p.label}</span>
                {podeEscrever ? (
                  <select className="input w-auto !py-1.5 text-sm"
                          value={grupo[p.chave] as QuemPaga}
                          onChange={e => gravarCampo({ [p.chave]: e.target.value } as Partial<GrupoNovo>)}>
                    <option value="empresa">Empresa</option>
                    <option value="individual">Individualmente</option>
                    <option value="misto">Misto</option>
                  </select>
                ) : (
                  <span className="chip bg-slate-100 text-slate-700">
                    {grupo[p.chave] === 'empresa' ? 'Empresa'
                      : grupo[p.chave] === 'individual' ? 'Individualmente' : 'Misto'}
                  </span>
                )}
              </div>
            ))}
            <label className="flex items-center gap-2 pt-1 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-[#1a6b4a]"
                     checked={grupo.pedir_cartao} disabled={!podeEscrever}
                     onChange={e => gravarCampo({ pedir_cartao: e.target.checked })} />
              Pedir cartão de crédito no check-in
            </label>
          </div>
          <div className="mt-3">
            <label className="label">Depósito</label>
            <Texto valor={grupo.deposito ?? ''} editavel={podeEscrever} linhas={2}
                   placeholder="Tudo pago / 30% adiantado"
                   aoGravar={v => gravarCampo({ deposito: v || null })} />
          </div>
        </div>

        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">VIPs</h2>
          <Texto valor={grupo.vips ?? ''} editavel={podeEscrever} linhas={5}
                 placeholder="Um por linha"
                 aoGravar={v => gravarCampo({ vips: v || null })} />
          <p className="mt-2 text-xs text-slate-500">
            Um por linha. Estes são os nomes a quem se atribuem os melhores quartos.
          </p>
        </div>
      </section>

      {/* notas por departamento */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Notas por departamento</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {SECCOES.map(s => {
            const n = notaDe(s.id)
            const meu = podeNota(s.id)
            return (
              <div key={s.id} className="card p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{s.label}</h3>
                  {!meu && (
                    <span className="text-[11px] text-slate-400">escreve {s.quem}</span>
                  )}
                </div>
                <Texto valor={n?.texto ?? ''} editavel={meu} linhas={4}
                       placeholder={meu ? 'Nada a salientar' : '—'}
                       aoGravar={v => gravarNotaDe(s.id, v)} />
                {n?.atualizado_por && (
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    última alteração: {n.atualizado_por}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* rooming list */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            Rooming list{quartos.length > 0 && ` · ${quartos.length} quarto(s)`}
          </h2>
          {podeEscrever && (
            <button className="btn-ghost" onClick={() => setAColar('')}>
              {quartos.length ? 'Colar nova lista' : 'Colar do PMS'}
            </button>
          )}
        </div>
        {quartos.length === 0 ? (
          <div className="card px-4 py-6 text-sm text-slate-500">
            Ainda sem rooming list. {podeEscrever
              ? 'Copia a tabela do PMS (quarto e nome) e cola aqui.'
              : 'A receção cola-a quando o PMS tiver os quartos atribuídos.'}
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
              {quartos.map(q => (
                <div key={q.id}
                     className="flex items-center gap-3 border-b border-slate-100 px-4 py-2">
                  <span className="w-12 shrink-0 text-sm font-semibold tabular-nums">{q.quarto}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{q.hospede ?? '—'}</span>
                  {podeEscrever && (
                    <button
                      className="text-xs text-slate-400 hover:text-red-600"
                      title="Tirar da lista"
                      onClick={async () => {
                        try {
                          await apagarQuarto(q.id)
                          setQuartos(qs => qs.filter(x => x.id !== q.id))
                        } catch (e) { toast(mensagemDeErro(e), 'erro') }
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {podeEscrever && (
        <div className="flex justify-end border-t border-slate-200 pt-4">
          <button className="btn-danger" onClick={apagar}>Apagar grupo</button>
        </div>
      )}

      {/* editar cabeçalho */}
      <Modal open={!!editar} onClose={() => setEditar(null)} title="Editar grupo" wide>
        {editar && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Nome" valor={editar.nome ?? ''}
                     ao={v => setEditar({ ...editar, nome: v })} />
              <Campo rotulo="Código" valor={editar.codigo ?? ''}
                     ao={v => setEditar({ ...editar, codigo: v || null })} />
              <Campo rotulo="Organizador" valor={editar.organizador ?? ''}
                     ao={v => setEditar({ ...editar, organizador: v || null })} />
              <Campo rotulo="Tour leader" valor={editar.tour_leader ?? ''}
                     ao={v => setEditar({ ...editar, tour_leader: v || null })} />
              <Campo rotulo="Telefone" valor={editar.telefone ?? ''}
                     ao={v => setEditar({ ...editar, telefone: v || null })} />
              <Campo rotulo="Email" valor={editar.email ?? ''}
                     ao={v => setEditar({ ...editar, email: v || null })} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Chegada</label>
                <input className="input" type="date" value={editar.chegada ?? ''}
                       onChange={e => {
                         const d = e.target.value
                         setEditar({
                           ...editar, chegada: d,
                           saida: (editar.saida ?? d) <= d ? somaDias(d, 1) : editar.saida,
                         })
                       }} />
              </div>
              <div>
                <label className="label">Saída</label>
                <input className="input" type="date" value={editar.saida ?? ''}
                       min={editar.chegada ? somaDias(editar.chegada, 1) : undefined}
                       onChange={e => setEditar({ ...editar, saida: e.target.value })} />
              </div>
              <Campo rotulo="Hora de chegada" valor={editar.hora_chegada ?? ''}
                     placeholder="16:30"
                     ao={v => setEditar({ ...editar, hora_chegada: v || null })} />
              <Campo rotulo="Hora de saída" valor={editar.hora_saida ?? ''}
                     placeholder="14:00"
                     ao={v => setEditar({ ...editar, hora_saida: v || null })} />
            </div>

            {editar.chegada && editar.saida && (
              <p className="text-xs text-slate-500">
                {noites(editar.chegada, editar.saida)} noite(s) — {dataLonga(editar.chegada)} a{' '}
                {dataLonga(editar.saida)}. Mudar as datas acrescenta ou tira linhas
                nos quartos por dia; as que ficam mantêm o que lá está.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={() => setEditar(null)}>Cancelar</button>
              <button className="btn-primary" onClick={gravarEdicao} disabled={aGuardar}>
                {aGuardar ? 'A guardar…' : 'Guardar'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* colar rooming list */}
      <Modal open={aColar != null} onClose={() => setAColar(null)} title="Colar rooming list" wide>
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            Copia do PMS as colunas do quarto e do nome e cola aqui. Aceita tabelas,
            «106 Jara Schakelaar» ou «106 - Jara Schakelaar», e salta os cabeçalhos.
            A lista que estiver na app é substituída por esta.
          </p>
          <textarea
            className="input h-56 font-mono text-xs"
            autoFocus
            value={aColar ?? ''}
            onChange={e => setAColar(e.target.value)}
            placeholder={'106\tJara Schakelaar\n118\tMarlijne Snijder\n119\tEsther Zaman'}
          />
          {aColar && lerRooming(aColar).length > 0 && (
            <p className="text-sm text-brand-700">
              Reconheci {lerRooming(aColar).length} quarto(s):{' '}
              {lerRooming(aColar).slice(0, 6).map(l => l.quarto).join(', ')}
              {lerRooming(aColar).length > 6 && '…'}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setAColar(null)}>Cancelar</button>
            <button className="btn-primary" onClick={colar}
                    disabled={aGuardar || !aColar || lerRooming(aColar).length === 0}>
              {aGuardar ? 'A gravar…' : 'Substituir lista'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

/* ----------------------------- pedaços ------------------------------ */
function Bloco({ titulo, valor, nota }: { titulo: string; valor: string; nota: string }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{titulo}</div>
      <div className="mt-0.5 text-lg font-semibold">{valor}</div>
      <div className="text-xs text-slate-500">{nota}</div>
    </div>
  )
}

function Campo({
  rotulo, valor, ao, placeholder,
}: { rotulo: string; valor: string; ao: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="label">{rotulo}</label>
      <input className="input" value={valor} placeholder={placeholder}
             onChange={e => ao(e.target.value)} />
    </div>
  )
}

/**
 * Caixa de texto que só grava quando se sai dela.
 *
 * Gravar a cada tecla numa nota de quatro linhas seria uma escrita por letra,
 * e com duas pessoas na mesma ficha a última tecla ganhava sempre.
 */
function Texto({
  valor, editavel, linhas, placeholder, aoGravar,
}: {
  valor: string; editavel: boolean; linhas: number
  placeholder?: string; aoGravar: (v: string) => void
}) {
  const [txt, setTxt] = useState(valor)
  useEffect(() => { setTxt(valor) }, [valor])

  if (!editavel) {
    return (
      <p className="whitespace-pre-wrap text-sm text-slate-700">
        {valor || <span className="text-slate-400">{placeholder ?? '—'}</span>}
      </p>
    )
  }
  return (
    <textarea
      className="input resize-y leading-snug"
      rows={linhas}
      value={txt}
      placeholder={placeholder}
      onChange={e => setTxt(e.target.value)}
      onBlur={() => { if (txt !== valor) aoGravar(txt.trim()) }}
    />
  )
}

/** As duas células de um tipo de quarto: quantos e a que tarifa. */
function Celulas({
  dia, tipo, editavel, mudar, gravar,
}: {
  dia: Dia
  tipo: 's' | 'd' | 't'
  editavel: boolean
  mudar: (data: string, patch: Partial<Dia>) => void
  gravar: (data: string) => void
}) {
  const qt = `${tipo}_quartos` as 's_quartos' | 'd_quartos' | 't_quartos'
  const tf = `${tipo}_tarifa` as 's_tarifa' | 'd_tarifa' | 't_tarifa'
  return (
    <>
      <td className="td w-20">
        <NumInput value={dia[qt]} disabled={!editavel}
                  onChange={n => mudar(dia.data, { [qt]: Math.max(0, Math.round(n)) } as Partial<Dia>)}
                  onBlur={() => gravar(dia.data)} />
      </td>
      <td className="td w-24">
        <NumInput value={dia[tf] ?? 0} disabled={!editavel}
                  onChange={n => mudar(dia.data, { [tf]: n || null } as Partial<Dia>)}
                  onBlur={() => gravar(dia.data)} />
      </td>
    </>
  )
}
