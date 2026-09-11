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

/**
 * Uma linha de quartos numa noite: tantos quartos de tal tipologia, a tal
 * preço.
 *
 * Três colunas fixas (single/double/twin) davam a tabela do documento, mas não
 * chegam: há noites com tipologias diferentes ao mesmo tempo, triplos, e o
 * mesmo tipo vendido a preços diferentes na mesma noite. Com linhas, o caso
 * simples é uma linha por noite e o complicado cabe sem truques.
 */
export interface Linha {
  id: string
  grupo_id: string
  data: string
  tipologia: string
  quartos: number
  tarifa: number | null
  /** Pessoas nesta linha. Vazio significa «o que a tipologia leva». */
  pax: number | null
  nota: string | null
  ordem: number
}

export type LinhaNova = Omit<Linha, 'id'>

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

/**
 * Tipologias conhecidas, com quantas pessoas levam.
 *
 * A lista serve de sugestão e de valor por omissão do PAX — não é uma prisão:
 * a tipologia é texto, por isso um «Duplex» ou um «Quarto do tour leader»
 * entram sem esperar por mim. O que não estiver aqui fica sem capacidade
 * conhecida e obriga a escrever o PAX à mão, que é melhor do que inventar.
 */
export const TIPOLOGIAS: { id: string; label: string; pax: number }[] = [
  { id: 'single', label: 'Single', pax: 1 },
  { id: 'double', label: 'Double', pax: 2 },
  { id: 'twin', label: 'Twin', pax: 2 },
  { id: 'triplo', label: 'Triplo', pax: 3 },
  { id: 'quadruplo', label: 'Quádruplo', pax: 4 },
  { id: 'familiar', label: 'Familiar', pax: 4 },
  { id: 'suite', label: 'Suite', pax: 2 },
]

/**
 * Como a tipologia é escrita à mão, a comparação ignora maiúsculas e acentos:
 * «Triplo», «triplo» e «TRIPLO» são a mesma coisa e todas levam três pessoas.
 */
const simples = (s: string) =>
  s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const conhecida = (t: string) =>
  TIPOLOGIAS.find(x => simples(x.id) === simples(t) || simples(x.label) === simples(t))

export const tipologiaLabel = (t: string) => conhecida(t)?.label ?? t

/** Quantas pessoas leva a tipologia, ou null se não a conhecemos. */
export const paxDaTipologia = (t: string) => conhecida(t)?.pax ?? null

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
export const valorDaLinha = (l: Linha) => l.quartos * (l.tarifa ?? 0)

/** Pessoas numa linha: o que lá está escrito, ou o que a tipologia leva. */
export const paxDaLinha = (l: Linha) => {
  if (l.pax != null) return l.pax
  const cap = paxDaTipologia(l.tipologia)
  return cap == null ? null : l.quartos * cap
}

export interface Noite {
  data: string
  linhas: Linha[]
  quartos: number
  pax: number | null
  valor: number
}

/**
 * As noites do grupo com as suas linhas.
 *
 * As noites vêm sempre das datas do grupo e não da tabela: uma noite sem
 * linhas nenhumas tem de aparecer vazia, para se ver que falta preencher em
 * vez de desaparecer do quadro.
 */
export function noitesDoGrupo(grupo: Grupo, linhas: Linha[]): Noite[] {
  return diasDoGrupo(grupo.chegada, grupo.saida).map(data => {
    const doDia = linhas.filter(l => l.data === data)
    const paxes = doDia.map(paxDaLinha)
    return {
      data,
      linhas: doDia,
      quartos: doDia.reduce((s, l) => s + l.quartos, 0),
      // se alguma linha tem tipologia desconhecida e PAX em branco, o total da
      // noite fica desconhecido em vez de mentir por defeito
      pax: doDia.length === 0 || paxes.some(p => p == null)
        ? null
        : paxes.reduce<number>((s, p) => s + (p ?? 0), 0),
      valor: doDia.reduce((s, l) => s + valorDaLinha(l), 0),
    }
  })
}

export interface Totais {
  noites: number
  quartosNoite: number
  quartosMax: number
  paxMax: number
  valor: number
  /** Noites do grupo que ainda não têm nenhuma linha lançada. */
  vazias: number
}

export function totais(noites: Noite[]): Totais {
  return {
    noites: noites.length,
    quartosNoite: noites.reduce((s, n) => s + n.quartos, 0),
    quartosMax: noites.reduce((m, n) => Math.max(m, n.quartos), 0),
    paxMax: noites.reduce((m, n) => Math.max(m, n.pax ?? 0), 0),
    valor: noites.reduce((s, n) => s + n.valor, 0),
    vazias: noites.filter(n => n.linhas.length === 0).length,
  }
}

/** As tipologias que o grupo usa, para o resumo dizer «10 single, 2 triplo». */
export function composicao(noites: Noite[]) {
  const m = new Map<string, number>()
  for (const n of noites) {
    for (const l of n.linhas) {
      // o máximo em qualquer noite, não a soma: é a pergunta da governanta
      m.set(l.tipologia, Math.max(m.get(l.tipologia) ?? 0, quartosDaTipologiaNaNoite(n, l.tipologia)))
    }
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tipologia, quartos]) => ({ tipologia, quartos }))
}

const quartosDaTipologiaNaNoite = (n: Noite, tipologia: string) =>
  n.linhas.filter(l => l.tipologia === tipologia).reduce((s, l) => s + l.quartos, 0)

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

export async function fetchLinhas(grupoId: string): Promise<Linha[]> {
  const { data, error } = await supabase
    .from('grupo_linhas').select('*').eq('grupo_id', grupoId)
    .order('data').order('ordem')
  if (error) throw error
  return (data ?? []) as Linha[]
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

export async function criarLinha(l: LinhaNova): Promise<Linha> {
  const { data, error } = await supabase
    .from('grupo_linhas').insert(l).select('*').single()
  if (error) throw error
  return data as Linha
}

export async function guardarLinha(id: string, patch: Partial<LinhaNova>) {
  const { error } = await supabase.from('grupo_linhas').update(patch).eq('id', id)
  if (error) throw error
}

export async function apagarLinha(id: string) {
  const { error } = await supabase.from('grupo_linhas').delete().eq('id', id)
  if (error) throw error
}

/**
 * Copia a composição de uma noite para as outras noites do grupo.
 *
 * Quase todos os grupos repetem a mesma composição todas as noites; preencher
 * cinco vezes à mão é trabalho e é onde os números se estragam. As noites de
 * destino são substituídas — «copiar» que deixasse o que já lá estava dava
 * quartos a dobrar.
 */
export async function copiarNoite(grupo: Grupo, linhas: Linha[], origem: string) {
  const molde = linhas.filter(l => l.data === origem)
  if (!molde.length) throw new Error('Essa noite não tem nada para copiar')

  const destinos = diasDoGrupo(grupo.chegada, grupo.saida).filter(d => d !== origem)
  if (!destinos.length) return 0

  const { error: e1 } = await supabase
    .from('grupo_linhas').delete().eq('grupo_id', grupo.id).in('data', destinos)
  if (e1) throw e1

  const novas = destinos.flatMap(data => molde.map(l => ({
    grupo_id: grupo.id,
    data,
    tipologia: l.tipologia,
    quartos: l.quartos,
    tarifa: l.tarifa,
    pax: l.pax,
    nota: l.nota,
    ordem: l.ordem,
  })))
  const { error: e2 } = await supabase.from('grupo_linhas').insert(novas)
  if (e2) throw e2
  return destinos.length
}

/**
 * Apaga as linhas que ficaram fora das datas depois de a estadia encurtar.
 *
 * Ao contrário dos quartos por dia de antes, não se criam linhas
 * automaticamente: uma noite nova aparece vazia e o quadro diz que falta
 * preencher, em vez de herdar números que ninguém confirmou.
 */
export async function limparLinhasFora(grupo: Grupo, linhas: Linha[]) {
  const querem = new Set(diasDoGrupo(grupo.chegada, grupo.saida))
  const fora = linhas.filter(l => !querem.has(l.data)).map(l => l.id)
  if (!fora.length) return false
  const { error } = await supabase.from('grupo_linhas').delete().in('id', fora)
  if (error) throw error
  return true
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
