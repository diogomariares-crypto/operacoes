import { supabase } from './supabase'

/**
 * Grupos que vamos receber.
 *
 * Substitui o «Tour Movement» em Word. A diferença que importa não é o formato:
 * é que um documento enviado por email envelhece no dia em que o grupo muda de
 * plano, e ninguém sabe qual das cinco versões na caixa de entrada é a boa.
 * Aqui a ficha é uma só, actualiza-se, e cada departamento lê a sua parte.
 *
 * As horas de chegada e saída guardam-se como texto ('16:30'). São o que se
 * escreve no documento, não instantes para calcular — e assim não há fusos
 * horários a mexer-lhes.
 */

export type Estado = 'previsto' | 'confirmado' | 'cancelado'
export type QuemPaga = 'empresa' | 'individual' | 'misto'
/** 'DEP' é o depósito e 'MAN' a manutenção — secções do documento, não papéis. */
export type DeptNota = 'FO' | 'DEP' | 'MAN' | 'HSK' | 'FB'

export interface Grupo {
  id: string
  hotel_id: string
  nome: string
  codigo: string | null
  organizador: string | null
  tour_leader: string | null
  telefone: string | null
  email: string | null
  chegada: string
  saida: string
  hora_chegada: string | null
  hora_saida: string | null
  paga_quarto: QuemPaga
  paga_city_tax: QuemPaga
  paga_eventos: QuemPaga
  paga_extras: QuemPaga
  pedir_cartao: boolean
  deposito: string | null
  vips: string | null
  estado: Estado
  updated_at: string
  atualizado_por: string | null
}

export interface Dia {
  grupo_id: string
  data: string
  pax: number | null
  s_quartos: number
  s_tarifa: number | null
  d_quartos: number
  d_tarifa: number | null
  t_quartos: number
  t_tarifa: number | null
}

export interface Nota {
  grupo_id: string
  departamento: DeptNota
  texto: string | null
  updated_at: string
  atualizado_por: string | null
}

export interface QuartoGrupo {
  id: string
  grupo_id: string
  quarto: string
  hospede: string | null
  nota: string | null
  ordem: number
}

export type GrupoNovo = Omit<Grupo, 'id' | 'updated_at' | 'atualizado_por'>

/** As secções de notas, na ordem do documento. */
export const SECCOES: { id: DeptNota; label: string; quem: string }[] = [
  { id: 'FO', label: 'Front Office', quem: 'receção' },
  { id: 'DEP', label: 'Depósito', quem: 'receção' },
  { id: 'MAN', label: 'Manutenção', quem: 'receção' },
  { id: 'HSK', label: 'Housekeeping', quem: 'housekeeping' },
  { id: 'FB', label: 'F&B', quem: 'F&B' },
]

export const TIPOS_QUARTO = [
  { id: 's' as const, label: 'Single' },
  { id: 'd' as const, label: 'Double' },
  { id: 't' as const, label: 'Twin' },
]

export const ESTADOS: { id: Estado; label: string; tom: string }[] = [
  { id: 'previsto', label: 'Previsto', tom: 'bg-amber-100 text-amber-800' },
  { id: 'confirmado', label: 'Confirmado', tom: 'bg-brand-50 text-brand-700' },
  { id: 'cancelado', label: 'Cancelado', tom: 'bg-slate-100 text-slate-500' },
]

export const PAGAMENTOS: { chave: keyof Grupo & `paga_${string}`; label: string }[] = [
  { chave: 'paga_quarto', label: 'Quarto + PA' },
  { chave: 'paga_city_tax', label: 'City Tax' },
  { chave: 'paga_eventos', label: 'Eventos' },
  { chave: 'paga_extras', label: 'Extras' },
]

/* ------------------------------- datas ------------------------------- */
export const aData = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const aIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const hojeIso = () => aIso(new Date())

export const somaDias = (iso: string, n: number) => {
  const d = aData(iso)
  d.setDate(d.getDate() + n)
  return aIso(d)
}

export const noites = (a: string, b: string) =>
  Math.max(0, Math.round((aData(b).getTime() - aData(a).getTime()) / 86400000))

const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export const diaSemana = (iso: string) => DIAS_SEMANA[aData(iso).getDay()]
export const dataCurta = (iso: string) =>
  `${aData(iso).getDate()} ${MESES[aData(iso).getMonth()]}`
export const dataLonga = (iso: string) =>
  `${dataCurta(iso)} ${aData(iso).getFullYear()}`

/**
 * As noites que o grupo ocupa: da chegada até à véspera da saída.
 *
 * O dia da saída não é noite. No documento do Veneta isso aparece como três
 * linhas (2, 3 e 4 de Junho) para uma estadia de 2 a 5 — e é assim que a
 * operação conta quartos.
 */
export const diasDoGrupo = (chegada: string, saida: string) => {
  const out: string[] = []
  for (let d = chegada; d < saida; d = somaDias(d, 1)) out.push(d)
  return out
}

/* ------------------------------- contas ------------------------------- */
export const quartosDoDia = (d: Dia) => d.s_quartos + d.d_quartos + d.t_quartos

export const valorDoDia = (d: Dia) =>
  d.s_quartos * (d.s_tarifa ?? 0) +
  d.d_quartos * (d.d_tarifa ?? 0) +
  d.t_quartos * (d.t_tarifa ?? 0)

export interface Totais {
  noites: number
  quartosNoite: number
  quartosMax: number
  paxMax: number
  valor: number
}

export function totais(dias: Dia[]): Totais {
  return {
    noites: dias.length,
    quartosNoite: dias.reduce((s, d) => s + quartosDoDia(d), 0),
    quartosMax: dias.reduce((m, d) => Math.max(m, quartosDoDia(d)), 0),
    paxMax: dias.reduce((m, d) => Math.max(m, d.pax ?? 0), 0),
    valor: dias.reduce((s, d) => s + valorDoDia(d), 0),
  }
}

/* ------------------------------- dados ------------------------------- */
export async function fetchGrupos(hotelId: string, desde?: string): Promise<Grupo[]> {
  let q = supabase.from('grupos').select('*').eq('hotel_id', hotelId)
  if (desde) q = q.gte('saida', desde)
  const { data, error } = await q.order('chegada')
  if (error) throw error
  return (data ?? []) as Grupo[]
}

export async function fetchGrupo(id: string): Promise<Grupo | null> {
  const { data, error } = await supabase.from('grupos').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as Grupo) ?? null
}

export async function fetchDias(grupoId: string): Promise<Dia[]> {
  const { data, error } = await supabase
    .from('grupo_dias').select('*').eq('grupo_id', grupoId).order('data')
  if (error) throw error
  return (data ?? []) as Dia[]
}

export async function fetchNotas(grupoId: string): Promise<Nota[]> {
  const { data, error } = await supabase
    .from('grupo_notas').select('*').eq('grupo_id', grupoId)
  if (error) throw error
  return (data ?? []) as Nota[]
}

export async function fetchQuartos(grupoId: string): Promise<QuartoGrupo[]> {
  const { data, error } = await supabase
    .from('grupo_quartos').select('*').eq('grupo_id', grupoId).order('ordem')
  if (error) throw error
  return (data ?? []) as QuartoGrupo[]
}

export async function criarGrupo(g: GrupoNovo, quem: string | null): Promise<Grupo> {
  const { data, error } = await supabase
    .from('grupos').insert({ ...g, atualizado_por: quem }).select('*').single()
  if (error) throw error
  return data as Grupo
}

export async function guardarGrupo(
  id: string, patch: Partial<GrupoNovo>, quem: string | null,
) {
  const { error } = await supabase
    .from('grupos').update({ ...patch, atualizado_por: quem }).eq('id', id)
  if (error) throw error
}

export async function apagarGrupo(id: string) {
  const { error } = await supabase.from('grupos').delete().eq('id', id)
  if (error) throw error
}

/** Grava um dia. A chave é (grupo, data), por isso repetir não duplica. */
export async function guardarDia(d: Dia) {
  const { error } = await supabase
    .from('grupo_dias').upsert(d, { onConflict: 'grupo_id,data' })
  if (error) throw error
}

/**
 * Põe os dias em linha com as datas do grupo: cria os que faltam e apaga os
 * que ficaram fora do intervalo depois de a estadia encurtar.
 *
 * Os novos herdam quartos, tarifas e PAX do último dia conhecido — prolongar
 * uma estadia por uma noite quase nunca muda a composição, e escrever quinze
 * singles outra vez à mão é onde se enganam os números.
 */
export async function alinharDias(grupo: Grupo, dias: Dia[]) {
  const querem = diasDoGrupo(grupo.chegada, grupo.saida)
  const tem = new Set(dias.map(d => d.data))
  const sobra = dias.filter(d => !querem.includes(d.data)).map(d => d.data)
  const molde = dias[dias.length - 1]

  const novos = querem.filter(d => !tem.has(d)).map(data => ({
    grupo_id: grupo.id,
    data,
    pax: molde?.pax ?? null,
    s_quartos: molde?.s_quartos ?? 0, s_tarifa: molde?.s_tarifa ?? null,
    d_quartos: molde?.d_quartos ?? 0, d_tarifa: molde?.d_tarifa ?? null,
    t_quartos: molde?.t_quartos ?? 0, t_tarifa: molde?.t_tarifa ?? null,
  }))

  if (novos.length) {
    const { error } = await supabase.from('grupo_dias').insert(novos)
    if (error) throw error
  }
  if (sobra.length) {
    const { error } = await supabase
      .from('grupo_dias').delete().eq('grupo_id', grupo.id).in('data', sobra)
    if (error) throw error
  }
  return novos.length + sobra.length > 0
}

export async function guardarNota(
  grupoId: string, departamento: DeptNota, texto: string, quem: string | null,
) {
  const { error } = await supabase.from('grupo_notas').upsert(
    { grupo_id: grupoId, departamento, texto: texto.trim() || null, atualizado_por: quem },
    { onConflict: 'grupo_id,departamento' },
  )
  if (error) throw error
}

export async function substituirQuartos(grupoId: string, linhas: LinhaColada[]) {
  const { error: e1 } = await supabase.from('grupo_quartos').delete().eq('grupo_id', grupoId)
  if (e1) throw e1
  if (!linhas.length) return
  const { error: e2 } = await supabase.from('grupo_quartos').insert(
    linhas.map((l, i) => ({ grupo_id: grupoId, quarto: l.quarto, hospede: l.hospede, ordem: i })),
  )
  if (e2) throw e2
}

export async function apagarQuarto(id: string) {
  const { error } = await supabase.from('grupo_quartos').delete().eq('id', id)
  if (error) throw error
}

/* ---------------------------- rooming list ---------------------------- */
export interface LinhaColada { quarto: string; hospede: string | null }

/**
 * Lê a rooming list colada do PMS.
 *
 * O que sai do PMS é «Space / Customer» — número de quarto e nome, separados
 * por tabulação quando vem de uma tabela e por espaços quando vem de um PDF.
 * Aceita-se qualquer um, e também «106 - Jara Schakelaar» ou «106; Jara».
 *
 * Salta cabeçalhos («Space», «Customer», «Quarto», «Guests») e linhas sem
 * nenhum número de quarto reconhecível, para colar a tabela inteira sem ter de
 * a limpar primeiro.
 */
export function lerRooming(texto: string): LinhaColada[] {
  const out: LinhaColada[] = []
  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.trim()
    if (!linha) continue
    if (/^(space|customer|quarto|room|guests?|hóspede|hospede|nome|name)\b/i.test(linha)) continue

    // o quarto é o primeiro pedaço, o nome é tudo o que vem depois
    const m = linha.match(/^([A-Za-z]?\d{1,4}[A-Za-z]?)\s*(?:[-–—;:,|\t]|\s)\s*(.*)$/)
    if (m) {
      const hospede = m[2].replace(/\s+/g, ' ').trim()
      out.push({ quarto: m[1], hospede: hospede || null })
      continue
    }
    // um quarto sozinho numa linha continua a ser uma linha útil
    if (/^[A-Za-z]?\d{1,4}[A-Za-z]?$/.test(linha)) out.push({ quarto: linha, hospede: null })
  }
  return out
}

/* ------------------------------ formatar ------------------------------ */
export const euros = (n: number) =>
  n.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })

export const mensagemDeErro = (e: unknown) =>
  e instanceof Error ? e.message : String(e)

/** Onde está o grupo no tempo, para a lista se ordenar pelo que interessa. */
export function quando(g: Grupo, hoje = hojeIso()) {
  if (g.saida <= hoje) return 'passado' as const
  if (g.chegada <= hoje) return 'em casa' as const
  if (g.chegada <= somaDias(hoje, 7)) return 'esta semana' as const
  return 'por vir' as const
}
