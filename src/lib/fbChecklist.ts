/**
 * Checklist da manhã do F&B.
 *
 * Uma lista de tarefas que alguém segue com o telemóvel na mão, a meio de
 * montar um buffet. Isso manda em tudo o que está aqui:
 *
 *  - **A lista é dados, não código.** O supervisor acrescenta, tira e reordena
 *    tarefas sem esperar por uma publicação. Por isso há um modelo
 *    (`fb_checklist_tarefas`) e um registo diário (`fb_checklist_feito`).
 *  - **A hora vem sozinha.** Marcar é um toque, não dois: a hora é a do
 *    momento em que se marcou, e corrige-se depois se alguém marcou tarde.
 *  - **Nem todas as tarefas são de todos os dias.** As plantas regam-se à
 *    segunda; o menu de almoço é à semana. Uma tarefa que não é de hoje não
 *    aparece hoje, em vez de ficar por marcar a fingir que falta.
 *
 * A ordem dos blocos sai da ordem da primeira tarefa de cada bloco. É de
 * propósito: com um campo de ordem só, arrastar uma tarefa nunca pode deixar os
 * blocos numa ordem que discorda da das tarefas.
 */
import { supabase } from './supabase'

export interface Tarefa {
  id: string
  hotel_id: string
  /** O momento da manhã a que pertence. Texto livre: o supervisor dá-lhes o nome. */
  bloco: string
  ordem: number
  titulo: string
  /** O detalhe, quando o título não chega. No telemóvel fica em segunda linha. */
  descricao: string | null
  /**
   * Dias em que a tarefa existe: 1 = segunda … 7 = domingo.
   * Nulo é todos os dias, que é o caso da esmagadora maioria.
   */
  dias_semana: number[] | null
  ativa: boolean
}

export type TarefaNova = Omit<Tarefa, 'id' | 'hotel_id' | 'ativa'>

export interface Feito {
  tarefa_id: string
  /** Hora a que foi marcada, do relógio de parede. Nula = por fazer. */
  hora: string | null
  nota: string | null
}

/* ------------------------------------------------------------------ regras */

/** 1 = segunda … 7 = domingo, que é como as pessoas contam a semana. */
export function diaDaSemana(dia: string): number {
  const d = new Date(`${dia}T12:00:00`)
  return d.getDay() === 0 ? 7 : d.getDay()
}

/**
 * A tarefa existe neste dia?
 *
 * Uma lista sem esta pergunta mostrava as plantas todos os dias e ficava com
 * seis dias por semana de tarefas que ninguém devia fazer — e uma checklist que
 * nunca fecha deixa de ser lida.
 */
export const noDia = (t: Pick<Tarefa, 'dias_semana'>, dia: string) =>
  t.dias_semana == null || t.dias_semana.length === 0 ||
  t.dias_semana.includes(diaDaSemana(dia))

export const DIAS_CURTOS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']

/** '{1}' → 'só à segunda'; '{1,2,3,4,5}' → 'à semana'; nulo → ''. */
export function quandoTexto(dias: number[] | null): string {
  if (!dias || dias.length === 0 || dias.length === 7) return ''
  const s = [...dias].sort((a, b) => a - b)
  if (s.join() === '1,2,3,4,5') return 'à semana'
  if (s.join() === '6,7') return 'ao fim-de-semana'
  const nomes = s.map(d => DIAS_CURTOS[d - 1])
  return s.length === 1 ? `só à ${nomes[0]}` : nomes.join(', ')
}

/** 'HH:MM' do relógio local. É esta a hora que fica quando se marca. */
export function horaAgora(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** A base de dados devolve 'HH:MM:SS'; no ecrã mostram-se os minutos. */
export const hhmm = (hora: string | null) => (hora ? hora.slice(0, 5) : '')

/* ------------------------------------------------------------- os blocos */

export interface Bloco {
  nome: string
  tarefas: Tarefa[]
  feitas: number
}

/**
 * Agrupa as tarefas do dia em blocos, pela ordem em que aparecem.
 *
 * Só entram as tarefas que são deste dia — ver `noDia`.
 */
export function blocosDoDia(
  tarefas: Tarefa[], dia: string, feito: Record<string, Feito>,
): Bloco[] {
  const out: Bloco[] = []
  for (const t of [...tarefas].sort((a, b) => a.ordem - b.ordem)) {
    if (!t.ativa || !noDia(t, dia)) continue
    let b = out.find(x => x.nome === t.bloco)
    if (!b) { b = { nome: t.bloco, tarefas: [], feitas: 0 }; out.push(b) }
    b.tarefas.push(t)
    if (feito[t.id]?.hora) b.feitas++
  }
  return out
}

export const totalFeitas = (blocos: Bloco[]) =>
  blocos.reduce((s, b) => s + b.feitas, 0)

export const totalTarefas = (blocos: Bloco[]) =>
  blocos.reduce((s, b) => s + b.tarefas.length, 0)

/* -------------------------------------------------------------------- dados */

export async function fetchTarefas(hotelId: string): Promise<Tarefa[]> {
  const { data, error } = await supabase
    .from('fb_checklist_tarefas').select('*').eq('hotel_id', hotelId).order('ordem')
  if (error) throw error
  return (data ?? []) as Tarefa[]
}

/** O que já foi marcado num dia, por tarefa. */
export async function fetchFeito(hotelId: string, dia: string): Promise<Record<string, Feito>> {
  const { data, error } = await supabase
    .from('fb_checklist_feito').select('tarefa_id, hora, nota')
    .eq('hotel_id', hotelId).eq('dia', dia)
  if (error) throw error
  return Object.fromEntries((data ?? []).map(r => [r.tarefa_id as string, r as Feito]))
}

/**
 * Marca ou desmarca uma tarefa.
 *
 * Desmarcar põe a hora a nulo e **guarda a nota**: quem escreveu «faltavam
 * chávenas» não perde isso por ter tocado no sítio errado.
 */
export async function marcar(
  hotelId: string, dia: string, tarefaId: string, hora: string | null,
) {
  const { error } = await supabase.from('fb_checklist_feito')
    .upsert({ hotel_id: hotelId, dia, tarefa_id: tarefaId, hora,
              atualizado_em: new Date().toISOString() },
            { onConflict: 'hotel_id,dia,tarefa_id' })
  if (error) throw error
}

export async function guardarNota(
  hotelId: string, dia: string, tarefaId: string, nota: string | null,
) {
  const { error } = await supabase.from('fb_checklist_feito')
    .upsert({ hotel_id: hotelId, dia, tarefa_id: tarefaId, nota: nota?.trim() || null,
              atualizado_em: new Date().toISOString() },
            { onConflict: 'hotel_id,dia,tarefa_id' })
  if (error) throw error
}

/* ------------------------------------------------------- editar a lista */

export async function juntarTarefa(hotelId: string, t: TarefaNova, por: string | null) {
  const { error } = await supabase.from('fb_checklist_tarefas')
    .insert({ ...t, hotel_id: hotelId, atualizado_por: por })
  if (error) throw error
}

export async function guardarTarefa(id: string, patch: Partial<Tarefa>, por: string | null) {
  const { error } = await supabase.from('fb_checklist_tarefas')
    .update({ ...patch, atualizado_por: por }).eq('id', id)
  if (error) throw error
}

/**
 * Desactiva em vez de apagar.
 *
 * Apagar a tarefa levava com ela o registo de todas as manhãs em que foi feita
 * — a chave estrangeira apaga em cascata. Uma tarefa que deixou de se fazer
 * desaparece da lista de hoje e não reescreve o passado.
 */
export async function desactivarTarefa(id: string, por: string | null) {
  return guardarTarefa(id, { ativa: false }, por)
}

/**
 * Troca a ordem de duas tarefas.
 *
 * Mover acontece aos pares — subir é trocar com a de cima — porque arrastar com
 * o dedo numa lista de 25 linhas acerta pouco e desfaz-se mal.
 */
export async function trocarOrdem(a: Tarefa, b: Tarefa, por: string | null) {
  await guardarTarefa(a.id, { ordem: b.ordem }, por)
  await guardarTarefa(b.id, { ordem: a.ordem }, por)
}

/** Os nomes de bloco já usados, para não se inventarem variantes do mesmo. */
export const blocosExistentes = (tarefas: Tarefa[]) =>
  [...new Set([...tarefas].sort((a, b) => a.ordem - b.ordem).map(t => t.bloco))]
