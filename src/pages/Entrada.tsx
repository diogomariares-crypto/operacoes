import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { DEPARTAMENTOS, guardarDept, modulosDoDept } from '../lib/departamentos'

/**
 * A entrada da app: um cartão por departamento.
 *
 * Serve para o telemóvel não abrir com nove separadores em baixo. Escolhe-se
 * por onde se vai trabalhar, fica guardado no aparelho, e a app passa a mostrar
 * só esses módulos — com um «‹» no cabeçalho para voltar aqui.
 *
 * Só aparecem os departamentos onde a conta tem alguma coisa: um departamento
 * cujas páginas estão todas fechadas a esta pessoa seria um cartão que não abre
 * nada.
 */
export default function Entrada() {
  const nav = useNavigate()
  const { fullName, email, podeVerModulo, podeVerPagina, loading } = useAuth()

  const cartoes = DEPARTAMENTOS.map(d => {
    const modulos = modulosDoDept(d).filter(podeVerModulo)
    const paginas = modulos.flatMap(m => m.paginas).filter(podeVerPagina)
    // um departamento com módulos definidores só aparece a quem vê algum deles
    const cumpre = !d.essenciais || modulos.some(m => d.essenciais!.includes(m.id))
    return { d, paginas, cumpre }
  }).filter(c => c.cumpre && c.paginas.length > 0)

  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 20 ? 'Boa tarde' : 'Boa noite'
  const nome = (fullName ?? email ?? '').split(' ')[0]

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <div className="mb-6 flex items-center gap-2.5">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500 text-sm font-bold text-white">
          cb
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Operações</div>
          <div className="text-xs text-slate-500">chic&amp;basic</div>
        </div>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">
        {saudacao}{nome ? `, ${nome}` : ''}.
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Escolhe por onde vais trabalhar. Podes trocar a qualquer momento.
      </p>

      {loading ? (
        <div className="mt-6 h-28 animate-pulse rounded-xl bg-slate-100" />
      ) : cartoes.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center text-sm text-slate-500">
          A tua conta ainda não tem acessos. Fala com quem gere a app.
        </div>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {cartoes.map(({ d, paginas }) => (
            <button
              key={d.id}
              onClick={() => { guardarDept(d.id); nav(paginas[0].to) }}
              className="card flex min-h-[112px] flex-col gap-2 p-4 text-left transition hover:border-brand-200 hover:shadow"
            >
              <div className="flex items-center justify-between">
                <span className={`grid h-9 w-9 place-items-center rounded-xl text-lg ${d.tom}`}>
                  {d.icone}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {paginas.length} {paginas.length === 1 ? 'página' : 'páginas'}
                </span>
              </div>
              <div>
                <div className="text-sm font-semibold">{d.label}</div>
                <div className="mt-0.5 text-xs leading-snug text-slate-500">{d.desc}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      <p className="mt-5 text-xs leading-relaxed text-slate-400">
        Isto é só um atalho para não teres a app toda à frente ao mesmo tempo — não
        muda o que podes ver nem o que podes escrever.
      </p>
    </div>
  )
}
