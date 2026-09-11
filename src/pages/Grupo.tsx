import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Loading, Modal, NumInput, useToast } from '../components/ui'
import {
  type DeptNota, type Estado, type Grupo, type GrupoNovo, type Linha,
  type Nota, type QuartoGrupo, type QuemPaga,
  ESTADOS, PAGAMENTOS, SECCOES, TIPOLOGIAS,
  apagarGrupo, apagarLinha, apagarQuarto, composicao, copiarNoite, criarLinha,
  dataCurta, dataLonga, diaSemana, euros, fetchGrupo, fetchLinhas, fetchNotas,
  fetchQuartos, guardarGrupo, guardarLinha, guardarNota, lerRooming,
  limparLinhasFora, mensagemDeErro, noites, noitesDoGrupo, paxDaLinha,
  paxDaTipologia, somaDias, substituirQuartos, tipologiaLabel, totais, valorDaLinha,
} from '../lib/grupos'

/**
 * A ficha de um grupo — o que era o Tour Movement em Word.
 *
 * A ordem é a do documento, para quem já o conhece não ter de reaprender:
 * resumo, contactos, quartos por noite, quem paga o quê, VIPs, notas (gerais e
 * depois por departamento) e rooming list.
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
  const [linhas, setLinhas] = useState<Linha[]>([])
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
      // pode ter sobrado alguma linha fora das datas se alguém as encurtou
      const ls = await fetchLinhas(id)
      if (await limparLinhasFora(g, ls).catch(() => false)) {
        setLinhas(await fetchLinhas(id))
      } else {
        setLinhas(ls)
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

  const noitesG = useMemo(
    () => (grupo ? noitesDoGrupo(grupo, linhas) : []),
    [grupo, linhas],
  )
  const t = useMemo(() => totais(noitesG), [noitesG])
  const comp = useMemo(() => composicao(noitesG), [noitesG])

  /* ------------------------------- ações ------------------------------- */
  const mudarLinha = (id: string, patch: Partial<Linha>) =>
    setLinhas(ls => ls.map(l => (l.id === id ? { ...l, ...patch } : l)))

  const gravarLinhaAgora = async (id: string, patch: Partial<Linha>) => {
    if (!podeEscrever) return
    mudarLinha(id, patch)
    try { await guardarLinha(id, patch) } catch (e) { toast(mensagemDeErro(e), 'erro') }
  }

  const juntarLinha = async (data: string, molde?: Linha) => {
    if (!grupo || !podeEscrever) return
    const doDia = linhas.filter(l => l.data === data)
    try {
      const nova = await criarLinha({
        grupo_id: grupo.id,
        data,
        tipologia: molde?.tipologia ?? 'single',
        quartos: molde?.quartos ?? 1,
        tarifa: molde?.tarifa ?? null,
        pax: null,
        nota: null,
        ordem: doDia.length,
      })
      setLinhas(ls => [...ls, nova])
    } catch (e) { toast(mensagemDeErro(e), 'erro') }
  }

  const tirarLinha = async (id: string) => {
    if (!podeEscrever) return
    try {
      await apagarLinha(id)
      setLinhas(ls => ls.filter(l => l.id !== id))
    } catch (e) { toast(mensagemDeErro(e), 'erro') }
  }

  const repetirNoite = async (data: string) => {
    if (!grupo || !podeEscrever) return
    const outras = t.noites - 1
    if (outras < 1) return
    if (!confirm(
      `Copiar a composição de ${dataCurta(data)} para as outras ${outras} noite(s)? ` +
      'O que estiver lançado nessas noites é substituído.',
    )) return
    try {
      await copiarNoite(grupo, linhas, data)
      setLinhas(await fetchLinhas(grupo.id))
      toast(`Composição de ${dataCurta(data)} aplicada a ${outras} noite(s)`)
    } catch (e) { toast(mensagemDeErro(e), 'erro') }
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
              lider_telefone: grupo.lider_telefone, lider_email: grupo.lider_email,
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
               nota={comp.length
                 ? comp.map(c => `${c.quartos} ${tipologiaLabel(c.tipologia).toLowerCase()}`).join(' · ')
                 : `${t.noites} noite(s) por preencher`} />
        <Bloco titulo="Pax" valor={t.paxMax ? String(t.paxMax) : '—'}
               nota={t.valor ? `${euros(t.valor)} em alojamento` : 'sem tarifas lançadas'} />
      </div>

      {/*
        Dois contactos porque são duas pessoas: a agência que contratou (para
        faturação e alterações) e quem vem com o grupo (a quem a receção liga
        às 23h). Aparecem sempre, mesmo em branco, senão ninguém se lembra de
        os preencher.
      */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Contacto
          titulo="Responsável do grupo"
          sub="o ponto de contacto, vem com o grupo"
          nome={grupo.tour_leader}
          telefone={grupo.lider_telefone}
          email={grupo.lider_email}
        />
        <Contacto
          titulo="Organizador"
          sub="quem contratou o grupo"
          nome={grupo.organizador}
          telefone={grupo.telefone}
          email={grupo.email}
        />
      </div>

      {/* quartos por noite */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Quartos por noite</h2>
          {t.vazias > 0 && (
            <span className="chip bg-amber-100 text-amber-800">
              {t.vazias} noite(s) por preencher
            </span>
          )}
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="th">Tipologia</th>
                <th className="th text-right">Quartos</th>
                <th className="th text-right">Tarifa</th>
                <th className="th text-right">Pax</th>
                <th className="th text-right">Valor</th>
                <th className="th" />
              </tr>
            </thead>
            {noitesG.map(n => (
              <tbody key={n.data}>
                {/* a noite como cabeçalho: é por noite que se lê o quadro */}
                <tr className="border-y border-slate-200 bg-slate-50/80">
                  <td className="td" colSpan={2}>
                    <span className="font-semibold">{dataCurta(n.data)}</span>
                    <span className="ml-1.5 text-xs text-slate-500">{diaSemana(n.data)}</span>
                  </td>
                  <td className="td text-right text-xs tabular-nums text-slate-500">
                    {n.quartos} quarto(s)
                  </td>
                  <td className="td text-right text-xs tabular-nums text-slate-500">
                    {n.pax == null ? '—' : `${n.pax} pax`}
                  </td>
                  <td className="td text-right text-xs tabular-nums text-slate-500">
                    {n.valor ? euros(n.valor) : '—'}
                  </td>
                  <td className="td whitespace-nowrap text-right">
                    {podeEscrever && (
                      <>
                        <button className="text-xs text-brand-700 hover:underline"
                                onClick={() => juntarLinha(n.data, n.linhas[n.linhas.length - 1])}>
                          + linha
                        </button>
                        {n.linhas.length > 0 && t.noites > 1 && (
                          <button className="ml-3 text-xs text-slate-500 hover:underline"
                                  title="Copiar esta composição para as outras noites"
                                  onClick={() => repetirNoite(n.data)}>
                            repetir
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>

                {n.linhas.length === 0 ? (
                  <tr className="border-b border-slate-100">
                    <td className="td text-sm text-slate-400" colSpan={6}>
                      {podeEscrever
                        ? 'Nada lançado nesta noite — «+ linha» acrescenta a primeira.'
                        : 'Nada lançado nesta noite.'}
                    </td>
                  </tr>
                ) : n.linhas.map(l => {
                  const pax = paxDaLinha(l)
                  const porTipologia = l.pax == null && paxDaTipologia(l.tipologia) != null
                  return (
                    <tr key={l.id} className="border-b border-slate-100">
                      <td className="td">
                        {podeEscrever ? (
                          <>
                            <input
                              className="input"
                              list="tipologias"
                              value={l.tipologia}
                              onChange={e => mudarLinha(l.id, { tipologia: e.target.value })}
                              onBlur={e => gravarLinhaAgora(l.id, {
                                tipologia: e.target.value.trim() || 'single',
                              })}
                            />
                            {paxDaTipologia(l.tipologia) == null && (
                              <span className="mt-0.5 block text-[11px] text-slate-400">
                                tipologia livre — escreve o pax
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-sm font-medium">{tipologiaLabel(l.tipologia)}</span>
                        )}
                      </td>
                      <td className="td w-24">
                        <NumInput value={l.quartos} disabled={!podeEscrever}
                                  onChange={n2 => mudarLinha(l.id, { quartos: Math.max(0, Math.round(n2)) })}
                                  onBlur={() => gravarLinhaAgora(l.id, { quartos: l.quartos })} />
                      </td>
                      <td className="td w-28">
                        <NumInput value={l.tarifa ?? 0} disabled={!podeEscrever}
                                  onChange={n2 => mudarLinha(l.id, { tarifa: n2 || null })}
                                  onBlur={() => gravarLinhaAgora(l.id, { tarifa: l.tarifa })} />
                      </td>
                      <td className="td w-24">
                        {podeEscrever ? (
                          <NumInput
                            value={l.pax ?? 0}
                            placeholder={pax != null ? String(pax) : ''}
                            title={porTipologia ? 'Em branco = o que a tipologia leva' : undefined}
                            onChange={n2 => mudarLinha(l.id, { pax: n2 || null })}
                            onBlur={() => gravarLinhaAgora(l.id, { pax: l.pax })}
                          />
                        ) : (
                          <div className="text-right text-sm tabular-nums">{pax ?? '—'}</div>
                        )}
                      </td>
                      <td className="td text-right tabular-nums">{euros(valorDaLinha(l))}</td>
                      <td className="td text-right">
                        {podeEscrever && (
                          <button className="text-xs text-slate-400 hover:text-red-600"
                                  title="Tirar esta linha" onClick={() => tirarLinha(l.id)}>
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            ))}
            <tfoot className="border-t-2 border-slate-200 bg-slate-50">
              <tr>
                <td className="td font-medium">{t.noites} noite(s)</td>
                <td className="td text-right tabular-nums font-medium">{t.quartosNoite}</td>
                <td className="td text-right text-xs text-slate-500">quarto-noites</td>
                <td className="td text-right tabular-nums font-medium">{t.paxMax}</td>
                <td className="td text-right tabular-nums font-medium">{euros(t.valor)}</td>
                <td className="td" />
              </tr>
            </tfoot>
          </table>
        </div>
        <datalist id="tipologias">
          {TIPOLOGIAS.map(x => <option key={x.id} value={x.label} />)}
        </datalist>
        <p className="text-xs text-slate-500">
          Tantas linhas por noite quantas forem precisas: tipologias diferentes na
          mesma noite, e o mesmo tipo de quarto a preços diferentes, são linhas
          separadas. O pax em branco assume o que a tipologia leva (single 1,
          double e twin 2, triplo 3) — escreve-o à mão quando for outro. O dia da
          saída não é noite, e o «Quartos» no resumo é a noite mais cheia.
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

      {/* notas */}
      <section className="space-y-3">
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Notas gerais</h2>
            {!canWrite('FO') && (
              <span className="text-[11px] text-slate-400">escreve a receção</span>
            )}
          </div>
          <div className="card p-4">
            <Texto valor={notaDe('GERAL')?.texto ?? ''} editavel={canWrite('FO')} linhas={4}
                   placeholder={canWrite('FO')
                     ? 'O que toda a casa precisa de saber sobre este grupo'
                     : '—'}
                   aoGravar={v => gravarNotaDe('GERAL', v)} />
            {notaDe('GERAL')?.atualizado_por && (
              <p className="mt-1.5 text-[11px] text-slate-400">
                última alteração: {notaDe('GERAL')!.atualizado_por}
              </p>
            )}
          </div>
        </div>

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
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Responsável do grupo · ponto de contacto
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Campo rotulo="Nome" valor={editar.tour_leader ?? ''}
                       ao={v => setEditar({ ...editar, tour_leader: v || null })} />
                <Campo rotulo="Telefone" valor={editar.lider_telefone ?? ''}
                       ao={v => setEditar({ ...editar, lider_telefone: v || null })} />
                <Campo rotulo="Email" valor={editar.lider_email ?? ''}
                       ao={v => setEditar({ ...editar, lider_email: v || null })} />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Organizador · quem contratou
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Campo rotulo="Nome ou empresa" valor={editar.organizador ?? ''}
                       ao={v => setEditar({ ...editar, organizador: v || null })} />
                <Campo rotulo="Telefone" valor={editar.telefone ?? ''}
                       ao={v => setEditar({ ...editar, telefone: v || null })} />
                <Campo rotulo="Email" valor={editar.email ?? ''}
                       ao={v => setEditar({ ...editar, email: v || null })} />
              </div>
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
                {dataLonga(editar.saida)}. Encurtar apaga as noites que ficam de
                fora; esticar acrescenta noites vazias, que se preenchem com
                «+ linha» ou copiando outra noite com «repetir».
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

/** Um contacto: nome, telefone e email, com o telefone e o email clicáveis. */
function Contacto({
  titulo, sub, nome, telefone, email,
}: {
  titulo: string; sub: string
  nome: string | null; telefone: string | null; email: string | null
}) {
  const vazio = !nome && !telefone && !email
  return (
    <div className="card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {titulo}
      </div>
      {vazio ? (
        <p className="mt-1 text-sm text-slate-400">
          sem contacto — preenche em «Editar»
        </p>
      ) : (
        <>
          <div className="mt-0.5 text-sm font-semibold">{nome ?? 'sem nome'}</div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {telefone && (
              <a className="text-brand-700 hover:underline" href={`tel:${telefone}`}>{telefone}</a>
            )}
            {email && (
              <a className="truncate text-brand-700 hover:underline" href={`mailto:${email}`}>{email}</a>
            )}
          </div>
        </>
      )}
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
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
