import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, sessaoDoLink } from './supabase'
import type { AppRole, Department } from './types'
import { CAMINHO_CHECKLIST } from './modulos'

interface AuthState {
  session: Session | null
  /** Tem autenticador configurado mas ainda não introduziu o código nesta sessão. */
  precisaCodigo: boolean
  revalidarMfa: () => Promise<void>
  email: string | null
  fullName: string | null
  /** Um administrador definiu esta palavra-passe: tem de ser mudada antes de entrar. */
  senhaTemporaria: boolean
  roles: AppRole[]
  loading: boolean
  isAdmin: boolean
  /** Vê o painel de faturação e o resto dos números do negócio. */
  podeVerPainel: boolean
  /** Vê o controlo de pequenos-almoços: receção, F&B, financeiro e admin. */
  podeVerPa: boolean
  podeVerRh: boolean
  podeVerLavandaria: boolean
  podeVerHk: boolean
  /** Vê e conta o dinheiro das caixas: direção e financeiro. */
  podeVerCaixa: boolean
  /**
   * Vê a faturação do F&B — a página do Dia e os números do restaurante.
   *
   * Existe por causa do acesso `fb_checklist`, que entra no F&B só para a
   * checklist da manhã. Sem isto, a página do Dia aparecia-lhe no menu (vazia,
   * porque a base de dados não lha dá) e parecia uma avaria em vez de uma
   * permissão.
   */
  podeVerFaturacao: boolean
  /**
   * Esta conta entra na app só para marcar a checklist da manhã.
   *
   * É o acesso mais pequeno que existe: uma página, e mais nada. Quem o tem
   * não vê o Início, o stock, os grupos, o parque, o turno nem a faturação —
   * e a base de dados recusa-lhe essas tabelas, não é só o menu a esconder.
   */
  soChecklist: boolean
  /** Este módulo aparece a esta conta? */
  podeVerModulo: (m: { soAdmin?: boolean; soRh?: boolean; soLav?: boolean
                       soHk?: boolean; soCaixa?: boolean }) => boolean
  /** Esta página aparece a esta conta? */
  podeVerPagina: (p: { to?: string
                       soAdmin?: boolean; soPainel?: boolean; soPa?: boolean; soRh?: boolean
                       soLav?: boolean; soHk?: boolean; soCaixa?: boolean
                       soEscrita?: boolean; soFaturacao?: boolean }) => boolean
  canWrite: (d: Department) => boolean
  allowedDepartments: Department[]
  signOut: () => Promise<void>
  refreshRoles: () => Promise<void>
}

const Ctx = createContext<AuthState>(null as unknown as AuthState)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [roles, setRoles] = useState<AppRole[]>([])
  const [fullName, setFullName] = useState<string | null>(null)
  const [senhaTemporaria, setSenhaTemporaria] = useState(false)
  const [loading, setLoading] = useState(true)
  const [precisaCodigo, setPrecisaCodigo] = useState(false)

  /**
   * O Supabase distingue dois níveis de garantia: aal1 (só palavra-passe) e
   * aal2 (palavra-passe + código). Se a conta tem autenticador configurado,
   * a sessão só está completa em aal2.
   */
  const verificarMfa = async () => {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    setPrecisaCodigo(data?.nextLevel === 'aal2' && data.nextLevel !== data.currentLevel)
  }

  const loadRoles = async (uid: string | undefined) => {
    if (!uid) { setRoles([]); setFullName(null); setSenhaTemporaria(false); return }
    const [{ data: r }, { data: p }] = await Promise.all([
      supabase.from('user_roles').select('role').eq('user_id', uid),
      supabase.from('profiles').select('full_name, senha_temporaria').eq('id', uid).maybeSingle(),
    ])
    setRoles((r ?? []).map(x => x.role as AppRole))
    setFullName(p?.full_name ?? null)
    setSenhaTemporaria(p?.senha_temporaria === true)
  }

  useEffect(() => {
    // Se viemos de um link de recuperação ou de convite, esperamos que a
    // sessão desse link fique instalada antes de perguntar quem está ligado.
    sessaoDoLink
      .then(() => supabase.auth.getSession())
      .then(async ({ data }) => {
        setSession(data.session)
        if (data.session) await verificarMfa()
        await loadRoles(data.session?.user.id)
        setLoading(false)
      })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      loadRoles(s?.user.id)
      if (s) verificarMfa(); else setPrecisaCodigo(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const isAdmin = roles.includes('admin')
  const podeVerPainel = isAdmin || roles.includes('financeiro')
  const podeVerPa = podeVerPainel || roles.includes('fo') || roles.includes('fb')
  // salários só para quem tem o perfil próprio — não anda colado a nenhum operacional
  const podeVerRh = isAdmin || roles.includes('rh')
  // custos de rouparia: direcção, financeiro e quem trata dos quartos
  const podeVerLavandaria = podeVerPainel || roles.includes('hsk')
  // produção e pessoal do housekeeping: a governanta lança, a direção lê
  const podeVerHk = podeVerLavandaria
  // dinheiro: só direção e financeiro, como na base de dados (pode_ver_caixa)
  const podeVerCaixa = podeVerPainel
  /*
   * Faturação do F&B: quem trata do restaurante, mais o financeiro e a direção.
   * É o mesmo conjunto que a base de dados já deixava ler a fb_billing, por isso
   * isto não tira nada a ninguém — só deixa de mostrar a quem a página já
   * aparecia vazia.
   */
  const podeVerFaturacao = podeVerPainel || roles.includes('fb')
  /*
   * O acesso `fb_checklist` entra para fazer uma coisa só. Só conta como tal
   * quem não tem mais nenhum papel: juntar `fb_checklist` a um supervisor que
   * já é `fb` não lhe pode tirar o que ele tinha — isso seria um papel que
   * castiga quem o recebe, e ninguém espera isso de uma permissão.
   */
  const soChecklist = roles.length > 0 && roles.every(r => r === 'fb_checklist')
  const canWrite = (d: Department) =>
    isAdmin ||
    (d === 'FO' && roles.includes('fo')) ||
    (d === 'HSK' && roles.includes('hsk')) ||
    (d === 'FB' && roles.includes('fb'))

  const allowedDepartments = (['FO', 'HSK', 'FB'] as Department[]).filter(canWrite)

  /*
   * As regras de quem vê o quê ficam aqui, num sítio só. Antes estavam
   * espalhadas pelo Shell, e agora a Entrada precisa das mesmas — duas cópias
   * das mesmas condições é como se começa a ter menus que discordam um do outro.
   */
  const podeVerModulo = (m: {
    soAdmin?: boolean; soRh?: boolean; soLav?: boolean; soHk?: boolean; soCaixa?: boolean
  }) =>
    (!m.soAdmin || isAdmin) && (!m.soRh || podeVerRh) &&
    (!m.soLav || podeVerLavandaria) && (!m.soHk || podeVerHk) &&
    (!m.soCaixa || podeVerCaixa)

  const podeVerPagina = (p: {
    to?: string
    soAdmin?: boolean; soPainel?: boolean; soPa?: boolean; soRh?: boolean
    soLav?: boolean; soHk?: boolean; soCaixa?: boolean; soEscrita?: boolean
    soFaturacao?: boolean
  }) =>
    /*
     * Para a checklist a regra não é «tirar as páginas que não deve ver»: é
     * «ver esta, e mais nada». A diferença só aparece no dia em que se
     * acrescentar a próxima página à app — uma lista de exceções teria de ser
     * revista, e quem a esquecesse abria-lhe a página sem dar por isso. Isto
     * não precisa de ser revisto: o que é novo fica de fora.
     */
    soChecklist ? p.to === CAMINHO_CHECKLIST :
    (!p.soAdmin || isAdmin) && (!p.soPainel || podeVerPainel) &&
    (!p.soPa || podeVerPa) && (!p.soRh || podeVerRh) &&
    (!p.soLav || podeVerLavandaria) && (!p.soHk || podeVerHk) &&
    (!p.soCaixa || podeVerCaixa) &&
    (!p.soFaturacao || podeVerFaturacao) &&
    (!p.soEscrita || allowedDepartments.length > 0)

  const value: AuthState = {
    session,
    precisaCodigo,
    revalidarMfa: verificarMfa,
    email: session?.user.email ?? null,
    fullName,
    senhaTemporaria,
    roles,
    loading,
    isAdmin,
    podeVerPainel,
    podeVerPa,
    podeVerRh,
    podeVerLavandaria,
    podeVerHk,
    podeVerCaixa,
    podeVerFaturacao,
    soChecklist,
    podeVerModulo,
    podeVerPagina,
    canWrite,
    allowedDepartments,
    signOut: async () => { await supabase.auth.signOut() },
    refreshRoles: async () => loadRoles(session?.user.id),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
