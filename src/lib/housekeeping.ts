/**
 * Housekeeping — produção e pessoal.
 *
 * A pergunta é sempre a mesma: o trabalho que o dia exige cabe nas pessoas que
 * há? De um lado os quartos a limpar, de outro as horas das pessoas em turno
 * mais o outsourcing, menos os **ajustes**.
 *
 * Os ajustes são as horas em que essas mesmas pessoas não estiveram nos
 * quartos: zonas comuns, inventário, uma formação, uma avaria. Lançam-se para
 * serem subtraídas às horas disponíveis, e é isso que faz a conta responder à
 * pergunta certa — quanto tempo foi de facto gasto nos quartos, e não quanto
 * tempo havia ao todo. Chamavam-se «limpezas gerais», nome que dizia um exemplo
 * em vez de dizer a função.
 *
 * Um quarto limpa-se de duas maneiras, e não custam o mesmo:
 *
 *   ocupados — estavam ocupados esta noite e não saem hoje; é um arrumo de
 *              continuação, mais rápido
 *   saídas   — estavam ocupados esta noite e saem hoje; é a limpeza completa
 *
 * São conjuntos disjuntos: um quarto ou fica ou sai, nunca os dois. Somá-los dá
 * os quartos limpos no dia. Por isso «ocupados» aqui NÃO é o total de quartos
 * ocupados do hotel — esse inclui os que saem, e contá-los dos dois lados
 * inflacionava o trabalho a fazer em cada dia.
 *
 * Os dois números não se escrevem: derivam-se do relatório de turno.
 */
import { supabase } from './supabase'

export interface Parametros {
  hotel_id: string
  min_por_quarto: number
  min_por_saida: number
  horas_por_turno: number
  preco_hora_outsourcing: number
  taxa_iva: number
  multiplicador_feriado: number
  horas_dia_completo: number
}

export const PARAMETROS_BASE: Omit<Parametros, 'hotel_id'> = {
  min_por_quarto: 20,
  min_por_saida: 45,
  horas_por_turno: 7,
  preco_hora_outsourcing: 8.7,
  taxa_iva: 0.23,
  multiplicador_feriado: 2,
  horas_dia_completo: 8,
}

export interface Dia {
  id: string
  dia: string
  /** Ocupados que NÃO saem hoje: arrumo de continuação. Não é o total ocupado. */
  quartos_ocupados: number
  /** Ocupados que saem hoje: limpeza completa. */
  saidas: number
  /** Quantas pessoas estiveram em turno a trabalhar nos quartos. */
  staff: number
  /** Os rácios em vigor no dia, congelados para o histórico não se reescrever. */
  min_por_quarto: number
  min_por_saida: number
  horas_por_turno: number
  nota: string | null
}

/**
 * Um ajuste: horas de gente em turno que não foram para os quartos.
 *
 * Guarda-se em **minutos**, como todo o resto deste módulo (min_por_quarto,
 * min_por_saida), e escreve-se e mostra-se em horas e minutos. A tabela na base
 * de dados continua a chamar-se `hk_limpezas`, do tempo em que o campo só
 * servia para limpezas gerais; o nome ficou e o significado alargou.
 */
export interface Ajuste {
  id: string
  dia: string
  /** Para onde foram as horas. Serve para depois se saber o porquê, não só o quanto. */
  descricao: string
  minutos: number
}

export interface Turno {
  id: string
  dia: string
  nome: string
  feriado: boolean
  hora_inicio: string
  hora_fim: string
  almoco_min: number
  /** Quem paga o turno. */
  hotel_id: string
  /**
   * Onde as horas foram feitas. Quase sempre é o mesmo hotel que paga, mas nem
   * sempre — e são perguntas diferentes: o custo é de quem paga, as horas
   * disponíveis são de onde se trabalhou.
   */
  hotel_trabalhado: string
}

/** Um turno por gravar: os hotéis vêm de quem o lança, não do formulário. */
export type TurnoNovo = Omit<Turno, 'id' | 'hotel_id' | 'hotel_trabalhado'>

/* ------------------------------------------------------------------ cálculo */

/**
 * Os dois tipos de limpeza, cada um ao seu tempo. Como não há quartos nos dois
 * conjuntos, é uma soma simples e nada se conta duas vezes.
 */
export const minutosNecessarios = (d: Pick<Dia,
  'quartos_ocupados' | 'saidas' | 'min_por_quarto' | 'min_por_saida'>) =>
  d.quartos_ocupados * d.min_por_quarto + d.saidas * d.min_por_saida

/**
 * O que sobrou para os quartos.
 *
 * As pessoas em turno dão o bolo de horas; o outsourcing acrescenta; os ajustes
 * tiram as horas dessas mesmas pessoas que não foram para os quartos. O que fica
 * é o tempo que esteve de facto disponível para quartos.
 */
export const minutosDisponiveis = (
  d: Pick<Dia, 'staff' | 'horas_por_turno'>, ajustesMin: number, outsourcingMin = 0,
) => Math.max(0, d.staff * d.horas_por_turno * 60 + outsourcingMin - ajustesMin)

export interface Balanco {
  necessarios: number
  disponiveis: number
  /** Positivo = falta tempo; negativo = sobra. */
  diferenca: number
  /** A diferença traduzida em pessoas de um turno. */
  pessoas: number
  /** Horas de gente em turno que não foram para os quartos, em minutos. */
  ajustesMin: number
  outsourcingMin: number
}

export function balanco(d: Dia, ajustesMin: number, outsourcingMin = 0): Balanco {
  const necessarios = minutosNecessarios(d)
  const disponiveis = minutosDisponiveis(d, ajustesMin, outsourcingMin)
  const diferenca = necessarios - disponiveis
  const base = d.horas_por_turno * 60
  return {
    necessarios, disponiveis, diferenca,
    pessoas: base > 0 ? diferenca / base : 0,
    ajustesMin, outsourcingMin,
  }
}

/* -------------------------------------------------------------- outsourcing */

const paraMinutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export const minutosDoTurno = (t: Pick<Turno, 'hora_inicio' | 'hora_fim' | 'almoco_min'>) =>
  Math.max(0, paraMinutos(t.hora_fim) - paraMinutos(t.hora_inicio) - (t.almoco_min || 0))

export const horasDoTurno = (t: Pick<Turno, 'hora_inicio' | 'hora_fim' | 'almoco_min'>) =>
  minutosDoTurno(t) / 60

export function custoDoTurno(t: Turno, p: Parametros) {
  const horas = horasDoTurno(t)
  const precoHora = t.feriado
    ? p.preco_hora_outsourcing * p.multiplicador_feriado
    : p.preco_hora_outsourcing
  const semIva = horas * precoHora
  return {
    horas,
    precoHora,
    semIva,
    comIva: semIva * (1 + p.taxa_iva),
    diasEquivalentes: p.horas_dia_completo > 0 ? horas / p.horas_dia_completo : 0,
  }
}

/* ------------------------------------------------------------------- cores */

/**
 * Escala divergente para o "pessoas ±": azul quando sobra gente, vermelho
 * quando falta, cinzento no equilíbrio. A cor é sempre acompanhada do número
 * na própria célula, por isso nunca é a cor sozinha a dizer o que se passa.
 */
const NEUTRO = '#f0efec'
const POLO_FALTA = '227, 73, 72'    // #e34948
const POLO_SOBRA = '57, 135, 229'   // #3987e5

export function corDoBalanco(pessoas: number | null): string {
  if (pessoas == null || !Number.isFinite(pessoas)) return 'transparent'
  // acima de uma pessoa e meia a cor satura; o número continua a diferenciar
  const forca = Math.min(Math.abs(pessoas) / 1.5, 1) * 0.65
  if (forca < 0.02) return NEUTRO
  return `rgba(${pessoas > 0 ? POLO_FALTA : POLO_SOBRA}, ${forca.toFixed(3)})`
}

export const pessoasTexto = (p: number) =>
  `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p).toLocaleString('pt-PT', {
    minimumFractionDigits: 1, maximumFractionDigits: 1 })}`

/**
 * Lê um tempo escrito à mão e devolve minutos. Null quando não se entende.
 *
 * A Governanta escreve horas e minutos — «1:30» — porque é como pensa no
 * relógio. Mas um campo que só aceita uma forma irrita quem escreve depressa,
 * por isso aceitam-se as formas que uma pessoa usa sem pensar:
 *
 *     1:30  1.30  1,30  1h30  1h 30   →  90
 *     2     2:00  2h               →  120   (um número sozinho são horas)
 *     0:45  :45   45m   45min      →  45
 *
 * A regra do número sozinho é a que mais importa e a menos óbvia: «2» são duas
 * horas e não dois minutos, porque o campo é de horas. Quem quiser minutos
 * escreve-os com o `m`.
 */
export function minutosDeTexto(texto: string): number | null {
  const t = texto.trim().toLowerCase().replace(/\s+/g, '')
  if (t === '') return 0

  // 45m, 45min — minutos explícitos
  const soMin = /^(\d+)m(?:in)?$/.exec(t)
  if (soMin) return Number(soMin[1])

  // 1:30, 1.30, 1,30, 1h30, 1h, :45
  const comSep = /^(\d*)[:.,h](\d{0,2})$/.exec(t)
  if (comSep) {
    const h = comSep[1] === '' ? 0 : Number(comSep[1])
    const m = comSep[2] === '' ? 0 : Number(comSep[2].padEnd(2, '0'))
    if (m > 59) return null
    return h * 60 + m
  }

  // 2 — um número sozinho são horas
  if (/^\d+$/.test(t)) return Number(t) * 60
  return null
}

/** Minutos em "1:30", para um campo que se escreve. Zero fica vazio. */
export function textoDeMinutos(min: number): string {
  if (!min) return ''
  const t = Math.abs(Math.round(min))
  return `${min < 0 ? '-' : ''}${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

/** Minutos em "3h20" — ninguém raciocina em 200 minutos. */
export function horas(min: number): string {
  const sinal = min < 0 ? '−' : ''
  const t = Math.abs(Math.round(min))
  const h = Math.floor(t / 60)
  const m = t % 60
  if (h === 0) return `${sinal}${m}min`
  return m === 0 ? `${sinal}${h}h` : `${sinal}${h}h${String(m).padStart(2, '0')}`
}

/* -------------------------------------------------------------------- dados */

export async function fetchParametros(hotelId: string): Promise<Parametros> {
  const { data, error } = await supabase
    .from('hk_parametros').select('*').eq('hotel_id', hotelId).maybeSingle()
  if (error) throw error
  if (!data) return { hotel_id: hotelId, ...PARAMETROS_BASE }
  return {
    hotel_id: data.hotel_id,
    min_por_quarto: Number(data.min_por_quarto),
    min_por_saida: Number(data.min_por_saida),
    horas_por_turno: Number(data.horas_por_turno),
    preco_hora_outsourcing: Number(data.preco_hora_outsourcing),
    taxa_iva: Number(data.taxa_iva),
    multiplicador_feriado: Number(data.multiplicador_feriado),
    horas_dia_completo: Number(data.horas_dia_completo),
  }
}

export async function guardarParametros(p: Parametros) {
  const { error } = await supabase.from('hk_parametros')
    .upsert({ ...p, atualizado_em: new Date().toISOString() }, { onConflict: 'hotel_id' })
  if (error) throw error
}

const num = (v: unknown, d = 0) => (v == null ? d : Number(v))

export async function fetchDias(hotelId: string, de: string, ate: string): Promise<Dia[]> {
  const { data, error } = await supabase
    .from('hk_dias').select('*').eq('hotel_id', hotelId)
    .gte('dia', de).lte('dia', ate).order('dia')
  if (error) throw error
  return (data ?? []).map(r => ({
    id: r.id, dia: r.dia, nota: r.nota,
    quartos_ocupados: num(r.quartos_ocupados),
    saidas: num(r.saidas),
    staff: num(r.staff),
    min_por_quarto: num(r.min_por_quarto, 20),
    min_por_saida: num(r.min_por_saida, 45),
    horas_por_turno: num(r.horas_por_turno, 7),
  }))
}

export async function fetchAjustes(hotelId: string, de: string, ate: string): Promise<Ajuste[]> {
  const { data, error } = await supabase
    .from('hk_limpezas').select('*').eq('hotel_id', hotelId)
    .gte('dia', de).lte('dia', ate).order('dia')
  if (error) throw error
  return (data ?? []).map(r => ({ ...r, minutos: num(r.minutos) })) as Ajuste[]
}

/**
 * Os turnos de gente de fora de um hotel — mas «de um hotel» quer dizer duas
 * coisas, e quem chama tem de escolher:
 *
 *   'trabalhado' — as horas feitas neste hotel, venham de onde vierem. É o que
 *                  conta para a produção do dia.
 *   'pago'       — os turnos que este hotel paga, tenham sido feitos onde
 *                  tiverem. É o que conta para os custos.
 */
export async function fetchOutsourcing(
  hotelId: string, de: string, ate: string, por: 'trabalhado' | 'pago' = 'trabalhado',
): Promise<Turno[]> {
  const { data, error } = await supabase
    .from('hk_outsourcing').select('*')
    .eq(por === 'pago' ? 'hotel_id' : 'hotel_trabalhado', hotelId)
    .gte('dia', de).lte('dia', ate).order('dia')
  if (error) throw error
  return (data ?? []).map(r => ({
    ...r, almoco_min: num(r.almoco_min), feriado: !!r.feriado,
    hora_inicio: String(r.hora_inicio).slice(0, 5),
    hora_fim: String(r.hora_fim).slice(0, 5),
  })) as Turno[]
}

export async function guardarDia(
  hotelId: string, dia: string, patch: Partial<Dia>, p: Parametros, por: string | null,
) {
  const { error } = await supabase.from('hk_dias').upsert({
    hotel_id: hotelId, dia,
    // os rácios só se escrevem quando a linha nasce; depois ficam do dia
    min_por_quarto: p.min_por_quarto,
    min_por_saida: p.min_por_saida,
    horas_por_turno: p.horas_por_turno,
    ...patch,
    atualizado_por: por,
  }, { onConflict: 'hotel_id,dia' })
  if (error) throw error
}

/**
 * Grava vários dias de uma vez, para se poder preencher o mês numa tabela em vez
 * de dia a dia.
 *
 * Cada linha leva os seus próprios rácios: as que já existem levam os que têm
 * gravados, as novas levam os que estão em vigor. É o mesmo princípio de sempre
 * — afinar os rácios em Definições não reescreve o que já passou — só que aqui
 * é preciso dizê-lo linha a linha, porque um upsert em bloco escreve todas as
 * colunas que lhe damos.
 */
export async function guardarDias(
  hotelId: string,
  linhas: Pick<Dia, 'dia' | 'quartos_ocupados' | 'saidas' | 'staff' | 'nota'
                  | 'min_por_quarto' | 'min_por_saida' | 'horas_por_turno'>[],
  por: string | null,
) {
  if (!linhas.length) return
  const { error } = await supabase.from('hk_dias').upsert(
    linhas.map(l => ({
      hotel_id: hotelId,
      dia: l.dia,
      quartos_ocupados: l.quartos_ocupados,
      saidas: l.saidas,
      staff: l.staff,
      nota: l.nota,
      min_por_quarto: l.min_por_quarto,
      min_por_saida: l.min_por_saida,
      horas_por_turno: l.horas_por_turno,
      atualizado_por: por,
    })),
    { onConflict: 'hotel_id,dia' },
  )
  if (error) throw error
}

/**
 * Os ajustes são uma lista com descrição — na tabela do mês há só um número por
 * dia, que é o total. Enquanto o dia tiver uma linha só, o número mexe-a; a
 * zero, apaga-a. Um dia com várias linhas discriminadas não se deixa esmagar
 * por um número: esse edita-se no Registo do dia, onde se vê para onde as horas
 * foram.
 */
export async function definirAjusteDoDia(
  hotelId: string, dia: string, minutos: number, existentes: Ajuste[],
) {
  if (existentes.length > 1) throw new Error(
    `${dmyCurto(dia)} tem vários ajustes discriminados — edita-os no Registo do dia.`)
  const actual = existentes[0]
  if (minutos <= 0) {
    if (actual) await apagarAjuste(actual.id)
    return
  }
  if (actual) {
    const { error } = await supabase.from('hk_limpezas')
      .update({ minutos }).eq('id', actual.id)
    if (error) throw error
    return
  }
  // sem descrição não se sabe para onde foram as horas; esta é a que o campo
  // rápido da tabela assume, e no detalhe do dia pode-se discriminar melhor
  await juntarAjuste(hotelId, { dia, descricao: 'Horas fora dos quartos', minutos })
}

const dmyCurto = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}`

export async function juntarAjuste(hotelId: string, l: Omit<Ajuste, 'id'>) {
  const { error } = await supabase.from('hk_limpezas').insert({ ...l, hotel_id: hotelId })
  if (error) throw error
}

export async function apagarAjuste(id: string) {
  const { error } = await supabase.from('hk_limpezas').delete().eq('id', id)
  if (error) throw error
}

export async function juntarTurno(hotelId: string, t: TurnoNovo, trabalhadoEm?: string) {
  const { error } = await supabase.from('hk_outsourcing').insert({
    ...t, hotel_id: hotelId, hotel_trabalhado: trabalhadoEm ?? hotelId,
  })
  if (error) throw error
}

export async function guardarTurno(id: string, patch: Partial<Turno>) {
  const { error } = await supabase.from('hk_outsourcing').update(patch).eq('id', id)
  if (error) throw error
}

export async function apagarTurno(id: string) {
  const { error } = await supabase.from('hk_outsourcing').delete().eq('id', id)
  if (error) throw error
}

/* ------------------------------------------------ quartos e saídas do turno */

export interface DoTurno {
  /**
   * Ocupados que ficam. Nulo quando não há relatório da véspera e por isso não
   * se pode saber — melhor um traço do que um número inventado.
   */
  quartos: number | null
  saidas: number
}

/**
 * O trabalho do dia, vindo do relatório de turno. O `day_offset` zero é o
 * próprio dia; os outros são previsão e não servem.
 *
 * O housekeeping limpa hoje os quartos que foram dormidos esta noite — ou seja,
 * a ocupação de ONTEM. Os que saem hoje levam limpeza completa; os restantes
 * ficam e levam arrumo de continuação:
 *
 *     ocupados que ficam (hoje) = ocupados no relatório de ontem − saídas de hoje
 *
 * O relatório de um dia diz a ocupação da noite que aí começa, já depois das
 * saídas e das entradas desse dia — por isso é o da véspera que conta. Usar o do
 * próprio dia dava uma média de 2,45 quartos de erro; com o da véspera desce
 * para 1,17, e bate certo em metade dos dias.
 */
export async function fetchDoTurno(
  hotelId: string, de: string, ate: string,
): Promise<Record<string, DoTurno>> {
  // um dia a mais para trás, que é de onde vem a ocupação do primeiro dia
  const vespera = new Date(`${de}T12:00:00`)
  vespera.setDate(vespera.getDate() - 1)
  const { data, error } = await supabase
    .from('occupancy').select('report_date, occ_rooms, departures')
    .eq('hotel_id', hotelId).eq('day_offset', 0)
    .gte('report_date', vespera.toISOString().slice(0, 10)).lte('report_date', ate)
  if (error) throw error

  const ocupados: Record<string, number> = {}
  for (const r of data ?? []) ocupados[r.report_date] = num(r.occ_rooms)

  const fora: Record<string, DoTurno> = {}
  for (const r of data ?? []) {
    if (r.report_date < de) continue
    const saidas = num(r.departures)
    const d = new Date(`${r.report_date}T12:00:00`)
    d.setDate(d.getDate() - 1)
    const ontem = ocupados[d.toISOString().slice(0, 10)]
    fora[r.report_date] = {
      // sem relatório da véspera não há como saber; nunca abaixo de zero, que
      // um relatório com mais saídas do que ocupados está errado
      quartos: ontem == null ? null : Math.max(0, ontem - saidas),
      saidas,
    }
  }
  return fora
}
