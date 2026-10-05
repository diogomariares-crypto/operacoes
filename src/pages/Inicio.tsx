/**
 * Início.
 *
 * A primeira coisa que se vê ao entrar. Responde a uma pergunta — «o que é que
 * eu preciso de saber e de resolver agora?» — e não a «que módulos existem»,
 * que é o que a lista de separadores já faz.
 *
 * Três andares, de cima para baixo pela ordem em que se olha: os quatro números
 * do dia, a semana ao lado do que precisa de atenção, e os atalhos de área.
 * Tudo clicável: nenhum número fica num beco sem saída.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../lib/appState'
import { useAuth } from '../lib/auth'
import { carregarInicio, type Alerta, type Inicio as Dados } from '../lib/inicio'
import { Loading } from '../components/ui'
import { dataExtenso, diaSemanaCurto, dm, dmy, hojeLocal, money } from '../lib/format'

/* As cores dos níveis ficam juntas para o vermelho e o âmbar nunca se
   aproximarem: lado a lado numa lista, um âmbar claro e um vermelho vivo
   confundem-se, sobretudo em quem não distingue bem as duas pontas do
   espectro. Daí o vermelho escuro e o âmbar puxado para o ocre. */
/** Altura, em pixéis, da barra mais alta do gráfico de ocupação. */
const ALTURA = 150

const NIVEL = {
  critico: { texto: 'text-red-800', fundo: 'bg-red-800' },
  aviso: { texto: 'text-amber-700', fundo: 'bg-amber-700' },
  ok: { texto: 'text-brand-600', fundo: 'bg-brand-500' },
} as const

function IconeNivel({ nivel }: { nivel: Alerta['nivel'] }) {
  const c = NIVEL[nivel].texto
  if (nivel === 'ok') {
    return (
      <svg className={`h-4 w-4 shrink-0 ${c}`} viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    )
  }
  if (nivel === 'critico') {
    return (
      <svg className={`h-4 w-4 shrink-0 ${c}`} viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M12 8v4" /><path d="M12 16h.01" />
      </svg>
    )
  }
  return (
    <svg className={`h-4 w-4 shrink-0 ${c}`} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M14.7 6.3a4 4 0 0 0 5 5L21 21H3l9.7-15.7a4 4 0 0 1 2-.7z" />
    </svg>
  )
}

function Numero({
  to, rotulo, valor, sufixo, nota,
}: { to: string; rotulo: string; valor: string; sufixo?: string; nota: string }) {
  return (
    <Link
      to={to}
      className="card block p-4 transition hover:-translate-y-0.5 hover:border-brand-200
                 hover:shadow-md focus-visible:outline focus-visible:outline-2
                 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
    >
      <div className="text-xs font-medium text-slate-500">{rotulo}</div>
      <div className="mt-1.5 text-3xl font-semibold tabular-nums text-slate-900">
        {valor}{sufixo && <span className="text-xl font-medium">{sufixo}</span>}
      </div>
      <div className="mt-0.5 text-[13px] text-slate-500">{nota}</div>
    </Link>
  )
}

export default function Inicio() {
  const { hotelId, hotels } = useApp()
  const { podeVerHk, podeVerRh, podeVerPainel, canWrite } = useAuth()
  const [d, setD] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  // Estas três tabelas têm leitura restrita na base de dados e uma consulta sem
  // permissão devolve vazio em vez de erro — ver a nota em src/lib/inicio.ts.
  const podeFb = podeVerPainel || canWrite('FB')

  useEffect(() => {
    if (!hotelId) return
    setD(null)
    setErro(null)
    carregarInicio(hotelId, { hk: podeVerHk, rh: podeVerRh, fb: podeFb })
      .then(setD)
      .catch(e => setErro((e as Error).message))
  }, [hotelId, podeVerHk, podeVerRh, podeFb])

  if (erro) {
    return (
      <div className="card p-6 text-sm">
        <h2 className="mb-1 font-semibold text-red-700">Não foi possível carregar o início</h2>
        <p className="text-slate-600">{erro}</p>
      </div>
    )
  }
  if (!d) return <Loading />

  const hotel = hotels.find(h => h.id === hotelId)?.name ?? ''
  const maxOcup = Math.max(100, ...d.previsao.map(p => p.ocupacao ?? 0))
  const cheio = d.previsao.reduce<number | null>(
    (a, p) => (p.ocupacao !== null && (a === null || p.ocupacao > a) ? p.ocupacao : a), null)
  const vazio = d.previsao.reduce<number | null>(
    (a, p) => (p.ocupacao !== null && (a === null || p.ocupacao < a) ? p.ocupacao : a), null)

  return (
    <div className="space-y-4">

      {/* ---------------------------- título ---------------------------- */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{dataExtenso(hojeLocal())}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{hotel}</p>
        </div>
      </div>

      {/* ------------------------ números do dia ------------------------ */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero
          to="/turno" rotulo="Ocupação hoje"
          valor={d.hoje?.ocupacao !== null && d.hoje !== null ? `${Math.round(d.hoje.ocupacao)}` : '—'}
          sufixo={d.hoje?.ocupacao !== null && d.hoje !== null ? '%' : undefined}
          nota={d.hoje?.quartos !== null && d.hoje !== null
            ? `${d.hoje.quartos} quartos ocupados` : 'sem lançamento de hoje'}
        />
        <Numero
          to="/turno" rotulo="Tarifa média hoje"
          valor={d.hoje?.tarifa != null ? money(d.hoje.tarifa) : '—'}
          nota={d.tarifaMedia7 != null ? `média 7 dias ${money(d.tarifaMedia7)}` : 'sem dados'}
        />
        <Numero
          to="/turno" rotulo="Movimento de hoje"
          valor={d.hoje ? `${d.hoje.chegadas ?? 0} / ${d.hoje.saidas ?? 0}` : '—'}
          nota="chegadas / saídas"
        />
        {podeFb && (
          <Numero
            to="/fb" rotulo="F&B últimos 7 dias"
            valor={d.fb7dias != null ? money(d.fb7dias) : '—'}
            nota={d.fb7dias != null ? `média ${money(d.fb7dias / 7)}/dia` : 'sem lançamentos'}
          />
        )}
      </div>

      {/* --------------------- semana + atenção ------------------------- */}
      <div className="flex flex-wrap gap-4">

        <section className="card min-w-0 flex-[999_1_34rem] p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold text-slate-900">Ocupação prevista</h2>
            {d.previsao.length > 1 && (
              <p className="text-xs text-slate-500">
                {dm(d.previsao[0].data)} a {dm(d.previsao[d.previsao.length - 1].data)}
              </p>
            )}
          </div>

          {d.previsao.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              Ainda não há previsão lançada para este hotel.
            </p>
          ) : (
            <>
              {/*
                Cada barra é a casa toda e enche-se até à ocupação, em vez de ser
                uma barra solta a partir do zero. A ocupação aqui anda sempre
                entre 89% e 99%, e barras desde o zero davam sete blocos iguais:
                verdadeiros e inúteis. Assim o que salta à vista é o vazio no
                topo — que é a pergunta de quem olha, quantos quartos sobram.

                As alturas vão em pixéis e não em percentagem porque a coluna é
                alinhada ao fundo e não tem altura definida; uma percentagem sobre
                altura indefinida resolve-se como zero e o gráfico saía vazio.
              */}
              {/* O gráfico e a tabela partilham o mesmo contentor com barra de
                  deslocamento e a mesma coluna vazia à esquerda, senão os dias da
                  tabela não ficam debaixo das respetivas barras — e um gráfico
                  desalinhado da sua legenda faz ler o dia errado. */}
              <div className="mt-5 overflow-x-auto">
               <div className="min-w-[34rem]">
                <div className="flex items-end">
                  <div className="w-24 shrink-0" aria-hidden="true" />
                  {d.previsao.map(p => {
                  const alt = p.ocupacao === null ? 0 : Math.round((p.ocupacao / maxOcup) * ALTURA)
                  const destaque = p.ocupacao !== null && (p.ocupacao === cheio || p.ocupacao === vazio)
                  const livres = p.quartos !== null && p.ocupacao
                    ? Math.max(0, Math.round(p.quartos / (p.ocupacao / 100)) - p.quartos)
                    : null
                  return (
                    <div key={p.data} className="flex min-w-0 flex-1 flex-col justify-end px-1">
                      <div className="mb-1 text-center text-xs font-semibold tabular-nums text-slate-600">
                        {destaque ? `${Math.round(p.ocupacao as number)}%` : ' '}
                      </div>
                      <div
                        className="relative rounded bg-brand-50"
                        style={{ height: `${ALTURA}px` }}
                        title={`${dmy(p.data)} · ${p.ocupacao ?? '—'}% · ${p.quartos ?? '—'} ocupados`
                          + (livres !== null ? ` · ${livres} livres` : '')}
                      >
                        <div
                          className="absolute inset-x-0 bottom-0 rounded bg-brand-500"
                          style={{ height: `${alt}px` }}
                        />
                      </div>
                    </div>
                  )
                })}
                </div>

                <table className="mt-3 w-full table-fixed text-xs">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="w-24 py-1 text-left font-medium"> </th>
                      {d.previsao.map(p => (
                        <th key={p.data} className="py-1 text-center font-medium">
                          {diaSemanaCurto(p.data)}<br />
                          <span className="tabular-nums text-slate-700">{dm(p.data)}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    <tr className="border-t border-slate-100">
                      <th className="py-1 text-left font-medium text-slate-500">Ocupação</th>
                      {d.previsao.map(p => (
                        <td key={p.data} className="py-1 text-center">
                          {p.ocupacao !== null ? `${Math.round(p.ocupacao)}%` : '—'}
                        </td>
                      ))}
                    </tr>
                    <tr className="border-t border-slate-100">
                      <th className="py-1 text-left font-medium text-slate-500">Tarifa</th>
                      {d.previsao.map(p => (
                        <td key={p.data} className="py-1 text-center">
                          {p.tarifa !== null ? Math.round(p.tarifa) : '—'}
                        </td>
                      ))}
                    </tr>
                    <tr className="border-t border-slate-100">
                      <th className="py-1 text-left font-medium text-slate-500">Chegadas</th>
                      {d.previsao.map(p => (
                        <td key={p.data} className="py-1 text-center">{p.chegadas ?? '—'}</td>
                      ))}
                    </tr>
                    <tr className="border-t border-slate-100">
                      <th className="py-1 text-left font-medium text-slate-500">Saídas</th>
                      {d.previsao.map(p => (
                        <td key={p.data} className="py-1 text-center">{p.saidas ?? '—'}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
               </div>
              </div>
            </>
          )}
        </section>

        <section className="card min-w-0 flex-[1_1_20rem] p-5">
          <h2 className="font-semibold text-slate-900">Precisa de atenção</h2>
          <p className="mt-0.5 text-[13px] text-slate-500">Por ordem de urgência.</p>

          {d.alertas.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Nada em aberto. Está tudo em dia.</p>
          ) : (
            <div className="mt-2">
              {d.alertas.map(a => (
                <Link
                  key={a.chave} to={a.to}
                  className="flex items-center gap-2.5 border-t border-slate-100 py-2.5
                             first:border-t-0 hover:bg-slate-50
                             focus-visible:outline focus-visible:outline-2
                             focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                >
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${NIVEL[a.nivel].fundo}`} />
                  <IconeNivel nivel={a.nivel} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium text-slate-800">{a.titulo}</span>
                    <span className="block text-xs text-slate-500">{a.detalhe}</span>
                  </span>
                  {a.valor
                    ? <span className={`text-base font-semibold tabular-nums ${NIVEL[a.nivel].texto}`}>{a.valor}</span>
                    : <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none"
                           stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M9 6l6 6-6 6" />
                      </svg>}
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* -------------------------- áreas ------------------------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">

        <Link to="/turno" className="card block p-4 transition hover:border-brand-200 hover:shadow-md">
          <div className="font-semibold text-slate-900">Hoje na receção</div>
          <div className="mt-3 flex gap-5">
            <div>
              <div className="text-xl font-semibold tabular-nums">{d.vips}</div>
              <div className="text-xs text-slate-500">VIP</div>
            </div>
            <div>
              <div className="text-xl font-semibold tabular-nums">{d.transfers}</div>
              <div className="text-xs text-slate-500">transfers</div>
            </div>
            <div>
              <div className="text-xl font-semibold tabular-nums">{d.perdidos}</div>
              <div className="text-xs text-slate-500">perdidos</div>
            </div>
          </div>
        </Link>

        <Link to="/grupos" className="card block p-4 transition hover:border-brand-200 hover:shadow-md">
          <div className="font-semibold text-slate-900">Grupos</div>
          <div className="mt-3 text-xl font-semibold tabular-nums">{d.gruposProximos}</div>
          <div className="text-xs text-slate-500">nos próximos 30 dias</div>
          {d.primeiroGrupo && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-brand-50 px-2 py-1
                            text-xs text-brand-700">
              o primeiro entra a <span className="tabular-nums">{dmy(d.primeiroGrupo)}</span>
            </div>
          )}
        </Link>

        <Link to="/historico" className="card block p-4 transition hover:border-brand-200 hover:shadow-md">
          <div className="font-semibold text-slate-900">Stock</div>
          {d.stockUltimaContagem ? (
            <>
              <div className="mt-3 text-xl font-semibold tabular-nums">
                {dmy(d.stockUltimaContagem.data)}
              </div>
              <div className="text-xs text-slate-500">última contagem fechada</div>
            </>
          ) : (
            <div className="mt-3 text-sm text-slate-500">ainda sem contagens fechadas</div>
          )}
        </Link>

        {d.empregados !== null && (
          <Link to="/rh" className="card block p-4 transition hover:border-brand-200 hover:shadow-md">
            <div className="font-semibold text-slate-900">Pessoas</div>
            <div className="mt-3 text-xl font-semibold tabular-nums">{d.empregados}</div>
            <div className="text-xs text-slate-500">colaboradores registados</div>
          </Link>
        )}
      </div>
    </div>
  )
}
