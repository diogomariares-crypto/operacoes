/**
 * Lavandaria — custo da rouparia por quarto ocupado.
 *
 * Guarda-se o que vem na fatura (período, quartos e linhas) e calcula-se tudo
 * o resto. Na ferramenta antiga os totais estavam gravados e já tinham
 * divergido — havia faturas com 3164 peças a mostrar "0 peças por quarto".
 */
import { supabase } from './supabase'
import { addDays } from './format'

export type Seccao = 'alojamento' | 'restauracao' | 'outros'

export const SECCOES: { v: Seccao; rot: string; cor: string }[] = [
  { v: 'alojamento', rot: 'Alojamento', cor: '#2a78d6' },
  { v: 'restauracao', rot: 'Restauração', cor: '#eb6834' },
  { v: 'outros', rot: 'Outros', cor: '#1baf7a' },
]
export const corSeccao = (s: Seccao) => SECCOES.find(x => x.v === s)?.cor ?? '#8a8a8a'
export const rotSeccao = (s: Seccao) => SECCOES.find(x => x.v === s)?.rot ?? s

export interface Artigo {
  nome: string
  seccao: Seccao
  conta_para_quarto: boolean
}

export interface Linha {
  id: string
  fatura_id: string
  artigo: string
  quantidade: number
  valor: number
}

/** Um período de faturação, já com as contas feitas pela vista. */
export interface Periodo {
  id: string
  numero: string | null
  periodo_inicio: string
  periodo_fim: string
  quartos: number
  total_com_iva: number | null
  nota: string | null
  dias: number
  sub_alojamento: number
  pecas_alojamento: number
  sub_restauracao: number
  total_sem_iva: number
  custo_quarto: number | null
  pecas_quarto: number | null
}

/* ------------------------------------------------------------------- datas */

export const anoDe = (iso: string) => Number(iso.slice(0, 4))
export const mesDe = (iso: string) => Number(iso.slice(5, 7))

export const MESES_CURTOS = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
]

/**
 * A semana do ano a que o período pertence, para alinhar anos diferentes.
 * Usa-se a semana ISO do fim do período, que é quando a fatura fecha.
 */
export function semanaISO(iso: string): number {
  const d = new Date(iso + 'T12:00:00')
  const alvo = new Date(d.valueOf())
  alvo.setDate(alvo.getDate() + 3 - ((d.getDay() + 6) % 7))
  const primeira = new Date(alvo.getFullYear(), 0, 4)
  return 1 + Math.round(
    ((alvo.valueOf() - primeira.valueOf()) / 86400000
      - 3 + ((primeira.getDay() + 6) % 7)) / 7)
}

/* ------------------------------------------------------------------ totais */

export interface Totais {
  periodos: number
  quartos: number
  alojamento: number
  restauracao: number
  outros: number
  pecas: number
  custoQuarto: number | null
  pecasQuarto: number | null
  restauracaoQuarto: number | null
  de: string | null
  ate: string | null
}

export function somar(ps: Periodo[]): Totais {
  const t: Totais = {
    periodos: ps.length, quartos: 0, alojamento: 0, restauracao: 0, outros: 0,
    pecas: 0, custoQuarto: null, pecasQuarto: null, restauracaoQuarto: null,
    de: null, ate: null,
  }
  for (const p of ps) {
    t.quartos += p.quartos
    t.alojamento += p.sub_alojamento
    t.restauracao += p.sub_restauracao
    t.outros += p.total_sem_iva - p.sub_alojamento - p.sub_restauracao
    t.pecas += p.pecas_alojamento
    if (!t.de || p.periodo_inicio < t.de) t.de = p.periodo_inicio
    if (!t.ate || p.periodo_fim > t.ate) t.ate = p.periodo_fim
  }
  if (t.quartos > 0) {
    t.custoQuarto = t.alojamento / t.quartos
    t.pecasQuarto = t.pecas / t.quartos
    t.restauracaoQuarto = t.restauracao / t.quartos
  }
  return t
}

/** Variação relativa entre dois valores; null quando não há com que comparar. */
export const variacao = (atual: number | null, antes: number | null) =>
  atual == null || antes == null || antes === 0 ? null : (atual - antes) / antes

/* -------------------------------------------------------------------- dados */

export async function fetchPeriodos(hotelId: string): Promise<Periodo[]> {
  const { data, error } = await supabase
    .from('v_lav_periodos').select('*')
    .eq('hotel_id', hotelId)
    .order('periodo_inicio')
  if (error) throw error
  return (data ?? []).map(r => ({
    id: r.id,
    numero: r.numero,
    periodo_inicio: r.periodo_inicio,
    periodo_fim: r.periodo_fim,
    quartos: Number(r.quartos ?? 0),
    total_com_iva: r.total_com_iva == null ? null : Number(r.total_com_iva),
    nota: r.nota,
    dias: Number(r.dias ?? 0),
    sub_alojamento: Number(r.sub_alojamento ?? 0),
    pecas_alojamento: Number(r.pecas_alojamento ?? 0),
    sub_restauracao: Number(r.sub_restauracao ?? 0),
    total_sem_iva: Number(r.total_sem_iva ?? 0),
    custo_quarto: r.custo_quarto == null ? null : Number(r.custo_quarto),
    pecas_quarto: r.pecas_quarto == null ? null : Number(r.pecas_quarto),
  }))
}

export async function fetchArtigos(): Promise<Artigo[]> {
  const { data, error } = await supabase.from('lav_artigos').select('*').order('nome')
  if (error) throw error
  return (data ?? []) as Artigo[]
}

export async function fetchLinhas(faturaIds: string[]): Promise<Linha[]> {
  if (!faturaIds.length) return []
  const { data, error } = await supabase
    .from('lav_linhas').select('*').in('fatura_id', faturaIds)
  if (error) throw error
  return (data ?? []).map(r => ({
    ...r, quantidade: Number(r.quantidade), valor: Number(r.valor),
  })) as Linha[]
}

export async function criarFatura(f: {
  hotel_id: string
  numero: string | null
  periodo_inicio: string
  periodo_fim: string
  quartos: number
  total_com_iva: number | null
  atualizado_por: string | null
}) {
  const { data, error } = await supabase.from('lav_faturas').insert(f).select('id').single()
  if (error) {
    if (error.code === '23505') throw new Error('Já existe uma fatura para esse período.')
    throw error
  }
  return data.id as string
}

export async function guardarFatura(id: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from('lav_faturas').update(patch).eq('id', id)
  if (error) throw error
}

export async function apagarFatura(id: string) {
  const { error } = await supabase.from('lav_faturas').delete().eq('id', id)
  if (error) throw error
}

export async function gravarLinhas(
  faturaId: string, linhas: { artigo: string; quantidade: number; valor: number }[],
) {
  await supabase.from('lav_linhas').delete().eq('fatura_id', faturaId)
  if (!linhas.length) return
  const { error } = await supabase.from('lav_linhas')
    .insert(linhas.map(l => ({ ...l, fatura_id: faturaId })))
  if (error) throw error
}

/** Artigos que ainda não estão no catálogo entram como alojamento. */
export async function garantirArtigos(nomes: string[]) {
  if (!nomes.length) return
  const { error } = await supabase.from('lav_artigos')
    .upsert(nomes.map(nome => ({ nome })), { onConflict: 'nome', ignoreDuplicates: true })
  if (error) throw error
}

/* ------------------------------------------------------- quartos dos turnos */

/**
 * A fatura da ELIS fecha ao sábado mas cobra a semana inteira: os quartos que
 * lá vêm correspondem às sete noites, do primeiro dia do período até ao dia
 * seguinte ao da recolha. Comparámos sete faturas com os turnos e cinco delas
 * batem dentro de ±6 quartos (~1%); as duas que não batem têm erro conhecido
 * nos turnos.
 */
const NOITE_EXTRA = 1

export interface Ocupacao {
  /** Soma dos quartos ocupados nas noites do período. */
  quartos: number
  noites: string[]
  faltam: string[]
  /** Dias com um valor tão fora do normal que quase de certeza é gralha. */
  suspeitos: { dia: string; quartos: number }[]
}

export async function ocupacaoDoPeriodo(
  hotelId: string, inicio: string, fim: string,
): Promise<Ocupacao> {
  const ultimo = addDays(fim, NOITE_EXTRA)
  const noites: string[] = []
  for (let d = inicio; d <= ultimo; d = addDays(d, 1)) noites.push(d)

  const { data, error } = await supabase
    .from('occupancy')
    .select('report_date, occ_rooms')
    .eq('hotel_id', hotelId)
    .eq('day_offset', 0)           // o próprio dia; os outros offsets são previsão
    .gte('report_date', inicio)
    .lte('report_date', ultimo)
  if (error) throw error

  const porDia: Record<string, number> = {}
  for (const r of data ?? []) porDia[r.report_date] = Number(r.occ_rooms ?? 0)

  const valores = Object.values(porDia).sort((a, b) => a - b)
  const mediana = valores.length ? valores[Math.floor(valores.length / 2)] : 0
  const suspeitos = Object.entries(porDia)
    .filter(([, v]) => mediana > 0 && v > mediana * 3)
    .map(([dia, quartos]) => ({ dia, quartos }))

  return {
    quartos: Object.values(porDia).reduce((a, b) => a + b, 0),
    noites,
    faltam: noites.filter(d => !(d in porDia)),
    suspeitos,
  }
}

/* --------------------------------------------------------- o catálogo */

/**
 * O catálogo de peças é uma lista de nomes escritos à mão, e **as linhas das
 * faturas ligam-se a ele só pelo texto** — não há chave estrangeira nenhuma.
 *
 * É por isso que já lá estão «Fronha Classica branca 46x71» e «Fronha Clássica
 * branca 46x71» como duas peças diferentes, cada uma com o seu histórico: uma
 * entrou escrita de uma maneira e a outra de outra, e nada as impediu.
 *
 * Daí estas funções existirem em vez de um `update` qualquer:
 *
 *  - antes de acrescentar, `parecidoCom` avisa que já existe uma peça igual
 *    escrita de outra maneira;
 *  - mudar o nome **reescreve também as linhas**, senão o histórico ficava
 *    órfão: as linhas antigas apontariam para um nome que já não existe, e
 *    passariam a contar como «alojamento» por omissão, sem erro nenhum.
 */

/** Sem acentos, sem maiúsculas, sem espaços a mais. Para comparar nomes. */
export const normalizarNome = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * A peça do catálogo que é «a mesma» que este nome, escrita de outra maneira.
 * Devolve null quando não há nenhuma, e ignora a própria.
 */
export function parecidoCom(nome: string, artigos: Artigo[], excepto?: string): string | null {
  const n = normalizarNome(nome)
  if (!n) return null
  const bate = artigos.find(a => a.nome !== excepto && normalizarNome(a.nome) === n)
  return bate?.nome ?? null
}

export async function criarArtigo(a: Artigo) {
  const { error } = await supabase.from('lav_artigos').insert(a)
  if (error) {
    if (error.code === '23505') throw new Error(`Já existe uma peça chamada «${a.nome}».`)
    throw error
  }
}

/** Muda a secção ou o «conta por quarto». O nome muda-se com `renomearArtigo`. */
export async function guardarArtigo(
  nome: string, patch: Partial<Pick<Artigo, 'seccao' | 'conta_para_quarto'>>,
) {
  const { error } = await supabase.from('lav_artigos').update(patch).eq('nome', nome)
  if (error) throw error
}

/** Quantas linhas de fatura usam esta peça. Zero = dá para apagar sem perder nada. */
export async function usosDoArtigo(nome: string): Promise<number> {
  const { count, error } = await supabase
    .from('lav_linhas').select('id', { count: 'exact', head: true }).eq('artigo', nome)
  if (error) throw error
  return count ?? 0
}

/**
 * Muda o nome de uma peça, **e o das linhas que lhe apontam**.
 *
 * Se o nome novo já existir, isto é uma junção: as linhas das duas passam a ter
 * o mesmo nome e a peça antiga desaparece do catálogo. É o que resolve os
 * duplicados que lá estão — mas apaga uma linha do catálogo, por isso quem
 * chama tem de perguntar primeiro.
 *
 * As linhas primeiro, o catálogo depois: se falhar a meio, ficam linhas com o
 * nome novo e as duas peças no catálogo — feio, mas sem nada perdido. Pela
 * ordem contrária ficariam linhas órfãs.
 */
export async function renomearArtigo(a: Artigo, para: string, juntar: boolean) {
  const de = a.nome
  const novo = para.trim()
  if (!novo) throw new Error('O nome não pode ficar vazio.')
  if (novo === de) return

  if (!juntar) {
    // a secção e o «conta por quarto» vão com ela: nascer com os valores por
    // omissão fazia uma peça de restauração passar a alojamento ao mudar-lhe
    // uma letra do nome, e isso reescrevia o €/quarto do histórico todo
    const { error } = await supabase.from('lav_artigos')
      .insert({ nome: novo, seccao: a.seccao, conta_para_quarto: a.conta_para_quarto })
    if (error && error.code !== '23505') throw error
  }

  const { error: eL } = await supabase
    .from('lav_linhas').update({ artigo: novo }).eq('artigo', de)
  if (eL) throw eL

  const { error: eA } = await supabase.from('lav_artigos').delete().eq('nome', de)
  if (eA) throw eA
}

export async function apagarArtigo(nome: string) {
  const { error } = await supabase.from('lav_artigos').delete().eq('nome', nome)
  if (error) throw error
}

/* ------------------------------------------------- linhas em edição */

/** Uma linha de fatura enquanto se escreve, antes de ter id. */
export type LinhaEdit = { artigo: string; quantidade: number; valor: number }

/** O que impede de gravar. Null quando está tudo bem. */
export function problemaDasLinhas(ls: LinhaEdit[]): string | null {
  const usadas = ls.filter(l => l.artigo.trim() || l.quantidade || l.valor)
  if (usadas.some(l => !l.artigo.trim())) {
    return 'Há uma linha com peças ou valor e sem nome.'
  }
  const nomes = usadas.map(l => l.artigo.trim())
  const repetido = nomes.find((n, i) => nomes.indexOf(n) !== i)
  if (repetido) return `A peça «${repetido}» aparece duas vezes na mesma fatura.`
  if (usadas.some(l => !Number.isFinite(l.quantidade) || !Number.isFinite(l.valor))) {
    return 'Há um número que não se entende.'
  }
  return null
}

/** Só as linhas que valem a pena gravar, com os nomes já aparados. */
export const linhasAGravar = (ls: LinhaEdit[]) => ls
  .map(l => ({ ...l, artigo: l.artigo.trim() }))
  .filter(l => l.artigo && (l.quantidade !== 0 || l.valor !== 0))
