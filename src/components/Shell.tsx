import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useApp } from '../lib/appState'
import { moduloDoCaminho } from '../lib/modulos'
import { deptGuardado, esquecerDept, modulosDoDept } from '../lib/departamentos'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'

export default function Shell({ children }: { children: ReactNode }) {
  const { podeVerModulo, podeVerPagina, email, fullName, roles, signOut } = useAuth()
  const { hotels, hotelId, setHotelId } = useApp()
  const nav = useNavigate()
  const { pathname } = useLocation()
  const [menu, setMenu] = useState(false)
  const cabecalho = useRef<HTMLElement>(null)

  // Publica a altura do cabeçalho para as páginas poderem fixar barras por baixo dele.
  useEffect(() => {
    const el = cabecalho.current
    if (!el) return
    const medir = () =>
      document.documentElement.style.setProperty('--cab-h', `${el.offsetHeight}px`)
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    window.addEventListener('resize', medir)
    return () => { obs.disconnect(); window.removeEventListener('resize', medir) }
  }, [])

  const dept = deptGuardado()
  const ativo = moduloDoCaminho(pathname)

  /*
   * A barra mostra os módulos do departamento escolhido. O módulo da página em
   * que se está entra sempre, mesmo que seja de outro departamento — senão ir a
   * uma página por link deixava a barra sem nada aceso e sem forma de voltar.
   */
  const doDept = modulosDoDept(dept).filter(podeVerModulo)
  const modulos = doDept.some(m => m.id === ativo.id) || !podeVerModulo(ativo)
    ? doDept
    : [...doDept, ativo]

  const paginas = ativo.paginas.filter(podeVerPagina)

  // Quando várias páginas correspondem (ex.: /turno e /turno/2026-08-24),
  // só a mais específica fica destacada.
  const bate = (to: string) =>
    to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(to + '/')
  const maisEspecifica = paginas
    .filter(p => bate(p.to))
    .sort((a, b) => b.to.length - a.to.length)[0]?.to
  const ativoNaPagina = (to: string) => to === maisEspecifica

  return (
    <div className="min-h-full">
      <header ref={cabecalho} className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        {/* linha 1: identidade, hotel, módulos, conta */}
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2.5 sm:px-5">
          {/*
            Voltar à entrada. Era só o logótipo, que é igual a um logótipo que
            não faz nada — ninguém adivinha que se clica. Passa a ter seta,
            moldura e o nome do departamento à vista, e há o mesmo caminho pelo
            menu da conta para quem procura lá.
          */}
          <button
            onClick={() => { esquecerDept(); nav('/entrada') }}
            title="Trocar de departamento"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 py-1 pl-1 pr-2 hover:border-brand-200 hover:bg-brand-50/60"
          >
            <span className="text-base leading-none text-slate-400">‹</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-sm font-bold text-white">
              cb
            </span>
            <span className="max-w-[28vw] truncate text-sm font-semibold sm:max-w-none">
              {dept ? dept.label : 'Departamentos'}
            </span>
          </button>

          <select
            className="input h-9 w-auto max-w-[42vw] py-1 text-sm"
            value={hotelId ?? ''}
            onChange={e => setHotelId(e.target.value)}
          >
            {hotels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>

          {/* separadores de módulo */}
          <nav className="ml-auto hidden items-center gap-1 rounded-xl bg-slate-100 p-1 md:flex">
            {modulos.map(m => {
              const sel = m.id === ativo.id
              return (
                <button
                  key={m.id}
                  onClick={() => nav(m.paginas[0].to)}
                  className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
                    sel ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <span className="mr-1.5 opacity-70">{m.icone}</span>{m.label}
                </button>
              )
            })}
          </nav>

          <div className="relative ml-auto md:ml-0">
            <button
              onClick={() => setMenu(m => !m)}
              className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700"
              title={email ?? ''}
            >
              {(fullName ?? email ?? '?').slice(0, 1).toUpperCase()}
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <div className="absolute right-0 z-20 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                  <div className="px-2 py-1.5">
                    <div className="truncate text-sm font-medium">{fullName ?? email}</div>
                    <div className="truncate text-xs text-slate-500">{email}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {roles.length === 0 && (
                        <span className="chip bg-amber-100 text-amber-800">sem permissões</span>
                      )}
                      {roles.map(r => (
                        <span key={r} className="chip bg-slate-100 text-slate-700">{r.toUpperCase()}</span>
                      ))}
                    </div>
                  </div>
                  <div className="my-1 border-t border-slate-100" />
                  <button
                    onClick={() => { setMenu(false); esquecerDept(); nav('/entrada') }}
                    className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
                  >
                    Trocar de departamento
                    {dept && <span className="text-slate-400"> · {dept.label}</span>}
                  </button>
                  <button
                    onClick={() => { setMenu(false); nav('/conta') }}
                    className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
                  >
                    A minha conta
                  </button>
                  <button
                    onClick={signOut}
                    className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    Terminar sessão
                  </button>
                  <div className="px-2 pt-2 text-[11px] text-slate-400">
                    Versão {__APP_VERSION__}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* linha 2: páginas do módulo ativo */}
        {paginas.length > 1 && (
          <div className="mx-auto max-w-7xl px-3 sm:px-5">
            <nav className="flex gap-1 overflow-x-auto">
              {paginas.map(p => (
                <NavLink
                  key={p.to}
                  to={p.to}
                  className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition ${
                    ativoNaPagina(p.to)
                      ? 'border-brand-500 text-brand-700'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {p.label}
                </NavLink>
              ))}
            </nav>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-3 py-4 pb-24 sm:px-5 sm:py-6">{children}</main>

      {/* telemóvel: os módulos em baixo */}
      <nav className="fixed bottom-0 z-30 flex w-full border-t border-slate-200 bg-white md:hidden">
        {modulos.map(m => {
          const sel = m.id === ativo.id
          return (
            <button
              key={m.id}
              onClick={() => nav(m.paginas[0].to)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                sel ? 'text-brand-600' : 'text-slate-500'
              }`}
            >
              <span className="text-base leading-none">{m.icone}</span>
              {m.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
