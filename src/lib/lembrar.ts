/**
 * Escolhas que não se perdem ao mudar de página.
 *
 * O mês que se está a ver, o departamento em que se está a trabalhar, o filtro
 * que se escolheu — nada disto é informação da operação, mas perder-se de cada
 * vez que se muda de separador dá um trabalho enorme a quem está a lançar um
 * mês inteiro.
 *
 * Fica em sessionStorage e não em localStorage de propósito: aguenta mudar de
 * página e recarregar, mas não fica para sempre.
 *
 * Páginas do mesmo módulo partilham a chave: passar do Mês para o Mapa mantém
 * o mês, porque é o mesmo mês que se está a olhar.
 *
 * Só que «fechar o separador» não é o mesmo que «acabar o dia»: os browsers
 * repõem o sessionStorage quando se restaura uma janela, e uma escolha feita
 * na semana passada aparecia hoje como se fosse a normal — abrir o painel e
 * ver Agosto em Setembro, sem se perceber porquê. Por isso as escolhas de
 * período guardam-se com o dia em que foram feitas (`doDia`) e caducam à
 * meia-noite. Já um departamento ou um filtro não caducam: não envelhecem.
 */
import { useCallback, useState } from 'react'

const PREFIXO = 'cb.'

/** O dia de hoje em "2026-09-08", pelo relógio de quem está a ver. */
const hoje = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

interface Guardado<T> { v: T; d?: string }

function ler<T>(chave: string, doDia: boolean): T | undefined {
  try {
    const cru = sessionStorage.getItem(PREFIXO + chave)
    if (cru == null) return undefined
    const g = JSON.parse(cru) as Guardado<T>
    // um valor sem envelope é de uma versão anterior: deita-se fora
    if (g == null || typeof g !== 'object' || !('v' in g)) return undefined
    if (doDia && g.d !== hoje()) return undefined
    return g.v
  } catch {
    // browser em modo privado, armazenamento cheio ou desligado: segue sem memória
    return undefined
  }
}

function escrever(chave: string, valor: unknown, doDia: boolean) {
  try {
    const g: Guardado<unknown> = doDia ? { v: valor, d: hoje() } : { v: valor }
    sessionStorage.setItem(PREFIXO + chave, JSON.stringify(g))
  } catch { /* paciência */ }
}

export interface OpcoesLembrar<T> {
  /** Recusa um valor guardado que já não faça sentido — um hotel que saiu da lista. */
  valido?: (v: T) => boolean
  /** Esquece a escolha à meia-noite. Para meses, anos e outros períodos. */
  doDia?: boolean
}

/** Como o `useState`, mas lembrado. */
export function useLembrado<T>(
  chave: string,
  inicial: T | (() => T),
  opcoes: OpcoesLembrar<T> = {},
) {
  const { valido, doDia = false } = opcoes

  const [v, setV] = useState<T>(() => {
    const guardado = ler<T>(chave, doDia)
    if (guardado !== undefined && (!valido || valido(guardado))) return guardado
    return typeof inicial === 'function' ? (inicial as () => T)() : inicial
  })

  const definir = useCallback((novo: T | ((anterior: T) => T)) => {
    setV(anterior => {
      const x = typeof novo === 'function' ? (novo as (a: T) => T)(anterior) : novo
      escrever(chave, x, doDia)
      return x
    })
  }, [chave, doDia])

  return [v, definir] as const
}

/** O mês corrente em "2026-09", que é o arranque de quase todos os ecrãs. */
export const mesCorrente = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Um mês só é aceitável se tiver mesmo a forma de um mês. */
export const ehMes = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)
