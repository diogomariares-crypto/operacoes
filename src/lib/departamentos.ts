/**
 * Departamentos de entrada.
 *
 * Não são permissões — são atalhos. Nasceram porque os onze separadores de
 * então não cabiam num telemóvel; agora que são sete famílias, caberiam todas,
 * e isto passou a servir para outra coisa: encurtar a barra ao que interessa a
 * quem está a trabalhar, sem ser um ecrã por onde se tenha de passar.
 *
 * Quem vê o quê continua a decidir-se pelos papéis, em src/lib/auth.tsx.
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
   * As famílias que fazem deste departamento o que ele é. Se a conta não vir
   * nenhuma delas, o cartão não aparece — a Direção prometia dinheiro e pessoal
   * a quem não tem acesso a nenhum dos dois, e um cartão que não cumpre o que
   * diz é pior do que cartão nenhum. Sem esta lista, basta ter uma página.
   */
  essenciais?: string[]
  /** classes de fundo e tinta do quadrado do ícone */
  tom: string
}

export const DEPARTAMENTOS: Departamento[] = [
  // os grupos entram em todos os departamentos: é a mesma ficha, e o que muda
  // é a nota que cada um lá escreve
  // Os três comuns — Início, Passagem de turno e Stock — entram em todos: não
  // são de ninguém e fazem falta a toda a gente. O que muda é o departamento.
  { id: 'fo', label: 'Front Office', icone: '◨', tom: 'bg-brand-50 text-brand-700',
    desc: 'Grupos, parque, passagem de turno e contagens',
    modulos: ['inicio', 'turnos', 'fo', 'stock'] },
  { id: 'hsk', label: 'Housekeeping', icone: '▦', tom: 'bg-blue-50 text-blue-700',
    desc: 'Produção do mês, mapa, outsourcing e contagens',
    modulos: ['inicio', 'turnos', 'hsk', 'stock'] },
  { id: 'fb', label: 'F&B', icone: '♨', tom: 'bg-amber-50 text-amber-700',
    desc: 'Faturação do dia, pequenos-almoços e contagens',
    modulos: ['inicio', 'turnos', 'fb', 'stock'] },
  { id: 'man', label: 'Manutenção', icone: '⬓', tom: 'bg-violet-50 text-violet-700',
    desc: 'Parque, pendentes do dia e material',
    modulos: ['inicio', 'turnos', 'man', 'stock'] },
  { id: 'conta', label: 'Contabilidade', icone: '€', tom: 'bg-emerald-50 text-emerald-700',
    desc: 'Caixa, custos de lavandaria e faturação',
    modulos: ['inicio', 'turnos', 'conta', 'fb', 'stock'] },
  { id: 'rh', label: 'Recursos Humanos', icone: '☺', tom: 'bg-rose-50 text-rose-700',
    desc: 'Pessoas, custos e horários',
    modulos: ['inicio', 'turnos', 'rh'] },
  // a direção tem mesmo de ter tudo: o cartão promete-o e é onde se vai buscar
  // a caixa, o pessoal e o inventário quando é preciso olhar para o conjunto
  { id: 'dir', label: 'Direção', icone: '⛭', tom: 'bg-slate-100 text-slate-700',
    desc: 'Tudo — todos os departamentos e os acessos',
    modulos: ['inicio', 'turnos', 'stock', 'fo', 'hsk', 'fb', 'man', 'conta', 'rh', 'gestao'],
    essenciais: ['conta', 'rh', 'gestao'] },
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

/**
 * A entrada mostra-se uma vez por sessão a quem ainda não escolheu
 * departamento. Fica na sessão e não no aparelho: fechada a app, volta a
 * perguntar; dentro da mesma sessão, os links abrem direitos.
 *
 * Se o navegador recusar a sessionStorage, diz-se que já passou — mais vale
 * não mostrar a entrada do que prender alguém num redireccionamento.
 */
const CHAVE_VISTA = 'entrada.vista'

export const jaPassouPelaEntrada = () => {
  try { return sessionStorage.getItem(CHAVE_VISTA) === '1' } catch { return true }
}

export const marcarEntradaVista = () => {
  try { sessionStorage.setItem(CHAVE_VISTA, '1') } catch { /* paciência */ }
}

/** Os módulos de um departamento, pela ordem que ele define. */
export function modulosDoDept(d: Departamento | null): Modulo[] {
  if (!d) return MODULOS
  return d.modulos
    .map(id => MODULOS.find(m => m.id === id))
    .filter((m): m is Modulo => !!m)
}
