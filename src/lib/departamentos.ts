/**
 * Departamentos de entrada.
 *
 * Não são permissões — são atalhos. A barra de baixo tem nove módulos, o que
 * num telemóvel é impossível de usar; escolhendo o departamento passa a mostrar
 * só os que interessam a quem está a trabalhar. Quem vê o quê continua a
 * decidir-se pelos papéis, em src/lib/auth.tsx.
 *
 * Cada departamento lista módulos por id. Um id que não exista em MODULOS é
 * ignorado, para esta lista poder ficar à frente das mudanças sem rebentar.
 */
import type { Modulo } from './modulos'
import { MODULOS } from './modulos'

export interface Departamento {
  id: string
  label: string
  icone: string
  desc: string
  /** ids de MODULOS, na ordem em que aparecem na barra de baixo */
  modulos: string[]
  /**
   * Os módulos que fazem deste departamento o que ele é. Se a conta não vir
   * nenhum deles, o cartão não aparece — a Direção prometia caixa e pessoal a
   * quem não tem acesso a nenhum dos dois, e um cartão que não cumpre o que diz
   * é pior do que cartão nenhum. Sem esta lista, basta ter uma página.
   */
  essenciais?: string[]
  /** classes de fundo e tinta do quadrado do ícone */
  tom: string
}

export const DEPARTAMENTOS: Departamento[] = [
  { id: 'fo', label: 'Receção', icone: '◨', tom: 'bg-brand-50 text-brand-700',
    desc: 'Turnos, faturação do dia, parque e contagens',
    modulos: ['turnos', 'fb', 'parque', 'inventario'] },
  { id: 'hsk', label: 'Housekeeping', icone: '⌂', tom: 'bg-blue-50 text-blue-700',
    desc: 'Produção do mês, mapa, outsourcing e rouparia',
    modulos: ['housekeeping', 'lavandaria', 'turnos', 'inventario'] },
  { id: 'fb', label: 'F&B', icone: '€', tom: 'bg-amber-50 text-amber-700',
    desc: 'Faturação do dia, pequenos-almoços e stock',
    modulos: ['fb', 'inventario', 'turnos'] },
  { id: 'man', label: 'Manutenção', icone: '⬓', tom: 'bg-violet-50 text-violet-700',
    desc: 'Mapa do parque e material de reposição',
    modulos: ['parque', 'inventario'] },
  // a direção tem mesmo de ter tudo: o cartão promete-o e é onde se vai buscar
  // o painel, a rouparia e o inventário quando é preciso olhar para o conjunto
  { id: 'dir', label: 'Direção', icone: '⛭', tom: 'bg-slate-100 text-slate-700',
    desc: 'Tudo — caixa, pessoal, custos e acessos',
    modulos: ['turnos', 'fb', 'inventario', 'housekeeping', 'lavandaria',
              'caixa', 'rh', 'parque', 'gestao'],
    essenciais: ['caixa', 'rh', 'gestao'] },
]

const CHAVE = 'entrada.departamento'

/**
 * Fica no aparelho e não na conta: a mesma pessoa entra pela receção no
 * telemóvel do balcão e pela direção no seu computador, e isso é normal.
 */
export const deptGuardado = (): Departamento | null => {
  try {
    return DEPARTAMENTOS.find(d => d.id === localStorage.getItem(CHAVE)) ?? null
  } catch {
    return null
  }
}

export const guardarDept = (id: string) => {
  try { localStorage.setItem(CHAVE, id) } catch { /* paciência */ }
}

export const esquecerDept = () => {
  try { localStorage.removeItem(CHAVE) } catch { /* paciência */ }
}

/** Os módulos de um departamento, pela ordem que ele define. */
export function modulosDoDept(d: Departamento | null): Modulo[] {
  if (!d) return MODULOS
  return d.modulos
    .map(id => MODULOS.find(m => m.id === id))
    .filter((m): m is Modulo => !!m)
}
