import { supabase } from './supabase'

/**
 * Sala de eventos — ver e reservar.
 *
 * O parque de estacionamento não tem horas: uma reserva ocupa noites, e por
 * isso lá basta uma data de entrada e uma de saída. Aqui há horas, e é isso que
 * manda em tudo o que está neste ficheiro.
 *
 *  - **O início e o fim são instantes**, e não dia mais hora. É o que trata um
 *    jantar das 20:00 à 01:00 sem o partir em duas reservas nem inventar um
 *    campo «acaba no dia seguinte». Na base de dados são `timestamptz`, e a
 *    sobreposição é garantida por uma restrição de exclusão sobre o intervalo.
 *  - **Os instantes constroem-se com o relógio de quem escreve.** Nunca com um
 *    fuso escrito à mão: a 25 de Outubro de 2026 os relógios recuam, e nesse
 *    dia uma hora escrita com `+01` à mão sai uma hora ao lado. Quem sabe disso
 *    é o browser, e é a ele que se pergunta — ver `instante`.
 *  - **Cancelado não ocupa.** A restrição ignora os cancelados, senão um «não»
 *    de Março bloqueava um «sim» de Abril. A consequência está em
 *    `mensagemDeErro`: reactivar um cancelado cuja hora já foi tomada entretanto
 *    é recusado, e isso tem de se dizer por palavras.
 *
 * O dia a que uma reserva pertence não é o do calendário, é o da casa — ver
 * `diaOperacional`. Uma festa que começa às 00:30 é da noite anterior para quem
 * está a trabalhar, e é nessa coluna que a pessoa a vai procurar.
 */

export type Estado = 'pedido' | 'confirmado' | 'cancelado'

export const ESTADOS: { valor: Estado; label: string; chip: string }[] = [
  { valor: 'pedido',     label: 'pedido',     chip: 'bg-amber-100 text-amber-800' },
  { valor: 'confirmado', label: 'confirmado', chip: 'bg-brand-50 text-brand-700' },
  { valor: 'cancelado',  label: 'cancelado',  chip: 'bg-slate-100 text-slate-500' },
]

export const chipDoEstado = (e: Estado) =>
  ESTADOS.find(x => x.valor === e)?.chip ?? 'bg-slate-100 text-slate-500'

export interface Espaco {
  id: string
  hotel_id: string
  nome: string
  capacidade: number | null
  /** 'HH:MM:SS' — a hora a que a pista de cada dia começa. */
  abre: string
  /** 'HH:MM:SS'. Menor que `abre` quer dizer que fecha depois da meia-noite. */
  fecha: string
  ordem: number
  ativo: boolean
}

/** As necessidades que se marcam numa caixa; o resto vai nas notas. */
export const NECESSIDADES = ['projector', 'som', 'catering', 'coffee break'] as const

export interface Reserva {
  id: string
  space_id: string
  cliente: string
  contacto: string | null
  pax: number | null
  estado: Estado
  valor: number | null
  necessidades: string[]
  notas: string | null
  /** ISO com fuso, como vem da base de dados. */
  inicio: string
  fim: string
}

/* ------------------------------------------------------------- relógio */

/**
 * Um instante a partir de um dia e de uma hora escritos por uma pessoa.
 *
 * `new Date(ano, mês, dia, h, m)` usa o fuso de quem está a escrever e sabe
 * das mudanças de hora. É de propósito que não se monte a string ISO à mão com
 * um `+01`: no dia em que o relógio muda, essa string fica uma hora ao lado e
 * ninguém dá por isso até alguém aparecer à hora errada.
 */
export function instante(dia: string, hora: string): Date {
  const [a, m, d] = dia.split('-').map(Number)
  const [h, min] = hora.split(':').map(Number)
  return new Date(a, m - 1, d, h, min, 0, 0)
}

const dois = (n: number) => String(n).padStart(2, '0')

/** 'yyyy-mm-dd' do dia de calendário em que o instante cai, no relógio local. */
export const diaDe = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`
}

/** 'HH:MM' no relógio local. */
export const horaDe = (iso: string) => {
  const d = new Date(iso)
  return `${dois(d.getHours())}:${dois(d.getMinutes())}`
}

/** Minutos desde a meia-noite, no relógio local. */
export const minutoDe = (iso: string) => {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

/** 'HH:MM' ou 'HH:MM:SS' → minutos desde a meia-noite. */
export const minutosDaHora = (hora: string) => {
  const [h, m] = hora.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export const horasEntre = (inicio: string, fim: string) =>
  (new Date(fim).getTime() - new Date(inicio).getTime()) / 3600000

/** A reserva acaba num dia de calendário diferente daquele em que começou. */
export const passaMeiaNoite = (r: Pick<Reserva, 'inicio' | 'fim'>) =>
  diaDe(r.inicio) !== diaDe(r.fim)

/* --------------------------------------------------------- datas curtas */

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

export const aData = (s: string) => {
  const [a, m, d] = s.split('-').map(Number)
  return new Date(a, m - 1, d)
}
export const aIso = (d: Date) =>
  `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`
export const hojeIso = () => aIso(new Date())
export const somaDias = (iso: string, n: number) => {
  const d = aData(iso)
  d.setDate(d.getDate() + n)
  return aIso(d)
}
export const diaSemana = (iso: string) => DIAS[aData(iso).getDay()]
export const dataCurta = (iso: string) =>
  `${aData(iso).getDate()} ${MESES[aData(iso).getMonth()]}`
export const eFimDeSemana = (iso: string) => {
  const d = aData(iso).getDay()
  return d === 0 || d === 6
}

/* ------------------------------------------------------- o dia da casa */

/**
 * O dia a que a reserva pertence aos olhos de quem trabalha.
 *
 * A sala abre às 08:00 e fecha à 01:00. Uma festa que começa às 00:30 é, no
 * calendário, do dia seguinte — mas é a noite anterior para toda a gente que
 * esteja lá dentro. Fica na coluna da véspera, que é onde a pessoa a procura.
 *
 * Sem isto, essa reserva caía no topo da pista do dia seguinte com uma posição
 * negativa: desaparecia do ecrã sem erro nenhum.
 */
export function diaOperacional(inicio: string, abre: string): string {
  const dia = diaDe(inicio)
  return minutoDe(inicio) < minutosDaHora(abre) ? somaDias(dia, -1) : dia
}

/**
 * A pista de horas de um dia: onde começa, onde acaba, quanto mede.
 *
 * Quando o espaço fecha depois da meia-noite, o fim conta-se para lá das 24h —
 * 01:00 são 25 horas. É assim que uma reserva das 20:00 à 01:00 sai contínua em
 * vez de dar a volta ao ecrã.
 */
export function pista(e: Pick<Espaco, 'abre' | 'fecha'>) {
  const de = minutosDaHora(e.abre)
  const bruto = minutosDaHora(e.fecha)
  const ate = bruto <= de ? bruto + 24 * 60 : bruto
  return { de, ate, minutos: ate - de }
}

/**
 * Onde é que a reserva fica na pista do seu dia, em fracções de 0 a 1.
 *
 * `topo` pode ser negativo e `base` pode passar de 1 — uma reserva que comece
 * antes de abrir ou acabe depois de fechar existe na mesma, e o ecrã corta-a em
 * vez de a esconder.
 */
export function posicaoNaPista(
  r: Pick<Reserva, 'inicio' | 'fim'>, e: Pick<Espaco, 'abre' | 'fecha'>,
): { topo: number; base: number } {
  const p = pista(e)
  const dia = diaOperacional(r.inicio, e.abre)
  // minutos desde a meia-noite do dia operacional, que é o que faz a conta
  // bater certo quando a reserva atravessa a meia-noite
  const desde = (iso: string) =>
    minutoDe(iso) + (diaDe(iso) === dia ? 0 : 24 * 60)
  return {
    topo: (desde(r.inicio) - p.de) / p.minutos,
    base: (desde(r.fim) - p.de) / p.minutos,
  }
}

/* ---------------------------------------------------------- validação */

/**
 * O que o formulário tem de recusar antes de chegar à base de dados.
 *
 * A base de dados recusa na mesma — é ela que manda — mas um erro que se vê ao
 * escrever vale mais do que um erro depois de carregar em Guardar.
 */
export function problemaDoRascunho(r: {
  cliente: string; dia: string; horaInicio: string; horaFim: string
}): string | null {
  if (!r.cliente.trim()) return 'Falta o nome de quem reserva.'
  if (!r.dia) return 'Falta o dia.'
  if (!r.horaInicio || !r.horaFim) return 'Faltam as horas.'
  if (r.horaInicio === r.horaFim) return 'A hora de fim tem de ser diferente da de início.'
  return null
}

/**
 * Converte o que está no formulário em dois instantes.
 *
 * Se a hora de fim for mais pequena do que a de início, o fim é no dia
 * seguinte: é assim que «20:00 às 01:00» se escreve sem a pessoa ter de pensar
 * em datas. Horas iguais não passam por aqui — ver `problemaDoRascunho`.
 */
export function intervalo(dia: string, horaInicio: string, horaFim: string) {
  const inicio = instante(dia, horaInicio)
  const fim = minutosDaHora(horaFim) < minutosDaHora(horaInicio)
    ? instante(somaDias(dia, 1), horaFim)
    : instante(dia, horaFim)
  return { inicio: inicio.toISOString(), fim: fim.toISOString() }
}

/* ---------------------------------------------------------------- dados */

export async function fetchEspacos(hotelId: string): Promise<Espaco[]> {
  const { data, error } = await supabase
    .from('event_spaces').select('*')
    .eq('hotel_id', hotelId).eq('ativo', true)
    .order('ordem')
  if (error) throw error
  return (data ?? []) as Espaco[]
}

/** Reservas que tocam a janela [de, ate), para os espaços dados. */
export async function fetchReservas(
  espacoIds: string[], de: string, ate: string,
): Promise<Reserva[]> {
  if (espacoIds.length === 0) return []
  // a janela é alargada um dia para cada lado: uma reserva que comece às 23:00
  // da véspera ainda pinta o dia de hoje, e uma que acabe de madrugada também
  const { data, error } = await supabase
    .from('event_bookings')
    .select('id, space_id, cliente, contacto, pax, estado, valor, necessidades, notas, inicio, fim')
    .in('space_id', espacoIds)
    .gte('inicio', instante(somaDias(de, -1), '00:00').toISOString())
    .lt('inicio', instante(somaDias(ate, 1), '00:00').toISOString())
    .order('inicio')
  if (error) throw error
  return (data ?? []) as Reserva[]
}

export async function procurarReservas(termo: string): Promise<Reserva[]> {
  const t = termo.trim()
  if (t.length < 2) return []
  const escapado = t.replace(/[%,()]/g, ' ')
  const { data, error } = await supabase
    .from('event_bookings')
    .select('id, space_id, cliente, contacto, pax, estado, valor, necessidades, notas, inicio, fim')
    .or(`cliente.ilike.%${escapado}%,contacto.ilike.%${escapado}%,notas.ilike.%${escapado}%`)
    .order('inicio', { ascending: false })
    .limit(12)
  if (error) throw error
  return (data ?? []) as Reserva[]
}

export async function guardarReserva(
  r: Omit<Reserva, 'id'> & { id?: string },
  email: string | null,
) {
  const corpo = { ...r, atualizado_por: email, atualizado_em: new Date().toISOString() }
  const { error } = r.id
    ? await supabase.from('event_bookings').update(corpo).eq('id', r.id)
    : await supabase.from('event_bookings').insert(corpo)
  if (error) throw error
}

export async function apagarReserva(id: string) {
  const { error } = await supabase.from('event_bookings').delete().eq('id', id)
  if (error) throw error
}

/** Só administradores, pela política da tabela. */
export async function guardarEspaco(id: string, patch: Partial<Espaco>) {
  const { error } = await supabase.from('event_spaces').update(patch).eq('id', id)
  if (error) throw error
}

export async function criarEspaco(hotelId: string, nome: string) {
  const { error } = await supabase.from('event_spaces')
    .insert({ hotel_id: hotelId, nome })
  if (error) throw error
}

/* ----------------------------------------------------------------- erros */

/**
 * A base de dados devolve o erro cru da restrição. Traduz para algo que quem
 * está ao telefone perceba.
 *
 * O caso de reactivar merece frase própria: ao mudar um cancelado para
 * confirmado, a sala pode já ter sido dada a outro entretanto, e «viola a
 * restrição de exclusão» não explica isso a ninguém.
 */
export function mensagemDeErro(e: unknown, aReactivar = false): string {
  const m = (e as { message?: string })?.message ?? String(e)
  if (/eventos_sem_sobreposicao|exclusion constraint/i.test(m)) {
    return aReactivar
      ? 'Entretanto marcaram outra coisa nessa hora. Para recuperar esta reserva, '
        + 'muda primeiro o dia ou as horas.'
      : 'A sala já está ocupada em parte desse horário.'
  }
  if (/eventos_fim_depois_do_inicio/i.test(m)) {
    return 'A hora de fim tem de ser depois da de início.'
  }
  if (/eventos_estado_conhecido/i.test(m)) {
    return 'Estado desconhecido.'
  }
  if (/row-level security|permission denied/i.test(m)) {
    return 'Não tens permissão para alterar reservas da sala.'
  }
  return m
}
