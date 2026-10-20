export type Department = 'FO' | 'HSK' | 'FB'
/**
 * `fb_checklist` é o acesso mais pequeno que existe: a checklist da manhã do
 * F&B e mais nada — sem Início, sem turno, sem stock, sem grupos, sem parque,
 * sem faturação. Não dá escrita em departamento nenhum (ver canWrite em
 * auth.tsx) nem permite editar a própria lista de tarefas, só marcá-la.
 *
 * Só vale como acesso pequeno quando é o único papel da conta: somá-lo a um
 * supervisor que já é `fb` não lhe tira nada — ver `soChecklist` em auth.tsx.
 *
 * E não é só o menu: a base de dados recusa-lhe as tabelas das outras páginas,
 * porque `has_any_role()` deixa de ser verdade para esta conta. Quem mexer
 * nesse papel tem de mexer nas duas pontas, ou a app esconde o que a API dá.
 */
export type AppRole =
  'admin' | 'fo' | 'hsk' | 'fb' | 'financeiro' | 'rh' | 'fb_checklist'
export type PeriodKind = 'semanal' | 'mensal'
export type CountStatus = 'rascunho' | 'submetido'

export const DEPARTMENTS: { value: Department; label: string; kind: PeriodKind }[] = [
  { value: 'FO', label: 'Front Office', kind: 'semanal' },
  { value: 'HSK', label: 'Housekeeping', kind: 'semanal' },
  { value: 'FB', label: 'F&B / Restaurante', kind: 'mensal' },
]

export const deptLabel = (d: Department) =>
  DEPARTMENTS.find(x => x.value === d)?.label ?? d

export const MOTIVOS = [
  'Validade',
  'Dano',
  'Derrame',
  'Roubo',
  'Erro de contagem',
  'Outro',
] as const

export interface Hotel {
  id: string
  slug: string
  name: string
  active: boolean
}

export interface Item {
  id: string
  hotel_id: string | null
  department: Department
  count_frequency: PeriodKind
  ref: string | null
  name: string
  category: string | null
  supplier: string | null
  unit: string
  unit_price_eur: number | null
  par_qty: number | null
  active: boolean
  is_custom: boolean
}

export interface Period {
  id: string
  hotel_id: string
  department: Department
  kind: PeriodKind
  start_date: string
  end_date: string
  label: string
  occupied_rooms: number | null
  status: CountStatus
  /**
   * O instante em que a contagem foi fechada — é o dia em que o trabalho foi
   * realmente feito. Não confundir com `end_date`, que é a data de contagem
   * escolhida à mão e que pode ser corrigida (ou errada). Volta a null se a
   * contagem for reaberta.
   */
  submitted_at: string | null
  /** O instante em que a contagem foi criada na aplicação. Nunca muda. */
  created_at: string
  updated_at: string
}

export interface Count {
  id: string
  period_id: string
  item_id: string
  opening_qty: number
  purchased_qty: number
  amount_paid_eur: number
  closing_qty: number
  closing_counted: boolean
  /** Parcelas somadas durante a contagem (modo somar); a soma dá closing_qty. */
  parcelas: number[]
  quebras: number
  motivo: string | null
  comentario: string | null
  unit_price_eur: number | null
  updated_by: string | null
  updated_at: string
}

export interface Purchase {
  id: string
  hotel_id: string
  item_id: string
  qty: number
  amount_paid_eur: number
  order_date: string
  received_date: string | null
  supplier: string | null
  note: string | null
  created_by: string | null
  received_by: string | null
  created_at: string
}

export interface StockRow {
  item_id: string
  item_name: string
  department: Department
  count_frequency: PeriodKind
  unit: string
  par_qty: number | null
  unit_price_eur: number | null
  hotel_id: string
  hotel_slug: string
  stock_atual: number | null
  contado_em: string | null
  por_chegar: number
  sugerido: number | null
}

export interface VCount {
  id: string
  hotel_id: string
  hotel_slug: string
  hotel_name: string
  department: Department
  kind: PeriodKind
  period_id: string
  start_date: string
  end_date: string
  label: string
  occupied_rooms: number | null
  status: CountStatus
  item_id: string
  item_name: string
  ref: string | null
  category: string | null
  supplier: string | null
  unit: string
  count_frequency: PeriodKind
  unit_price_eur: number | null
  par_qty: number | null
  opening_qty: number
  purchased_qty: number
  received_qty: number
  entradas_qty: number
  amount_paid_eur: number
  closing_qty: number
  quebras: number
  motivo: string | null
  comentario: string | null
  used_qty: number
  cost_used_eur: number | null
  stock_value_eur: number | null
  used_per_room: number | null
  cost_per_room_eur: number | null
  updated_at: string
}
