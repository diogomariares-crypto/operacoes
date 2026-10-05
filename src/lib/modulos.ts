/**
 * Famílias da aplicação.
 *
 * Eram onze separadores, todos ao mesmo nível: tarefas do dia a dia a par de
 * configuração, e nenhum deles respondia à pergunta «onde é que isto está?».
 * Passam a ser sete famílias, agrupadas pela pergunta que a pessoa traz —
 * o dia, os quartos, o dinheiro, o stock, as pessoas — e cada família tem as
 * suas páginas por baixo. Nenhuma página desapareceu; mudaram de sítio.
 *
 * Duas consequências de desenho que vale a pena saber antes de mexer aqui:
 *
 *  1. As permissões vivem nas PÁGINAS, não nas famílias. Uma família aparece
 *     se a pessoa vir ao menos uma página lá dentro — ver `temPaginaVisivel`.
 *     Assim «Quartos» aparece a quem só vê a lavandaria, sem ser preciso
 *     inventar um papel «quartos» que não existe na realidade da casa.
 *  2. Sete cabem numa barra de telemóvel; onze não cabiam. Era por isso que
 *     existia o ecrã de departamentos à entrada.
 *
 * Para acrescentar uma página: criá-la em src/pages/, registar a rota em
 * src/App.tsx e pô-la na família certa aqui. O menu constrói-se desta lista.
 */
export interface Pagina {
  to: string
  label: string
  /** Só visível para administradores. */
  soAdmin?: boolean
  /** Só visível a quem pode ver números do negócio (admin ou financeiro). */
  soPainel?: boolean
  /** Visível a quem pode ver o controlo de pequenos-almoços. */
  soPa?: boolean
  /** Só visível a quem tem o perfil de recursos humanos. */
  soRh?: boolean
  /** Só visível a quem pode ver custos de lavandaria. */
  soLav?: boolean
  /** Só visível a quem pode ver a produção do housekeeping. */
  soHk?: boolean
  /** Só visível a quem trata do dinheiro das caixas. */
  soCaixa?: boolean
  /** Visível a quem escreve em pelo menos um departamento. */
  soEscrita?: boolean
}

export interface Modulo {
  id: string
  label: string
  icone: string
  /**
   * Estes sinalizadores continuam a existir para quem os queira usar, mas as
   * famílias já não os põem: a visibilidade decide-se pelas páginas.
   */
  soAdmin?: boolean
  soRh?: boolean
  soLav?: boolean
  soHk?: boolean
  soCaixa?: boolean
  paginas: Pagina[]
}

export const MODULOS: Modulo[] = [
  {
    id: 'inicio',
    label: 'Início',
    icone: '⌂',
    paginas: [
      { to: '/', label: 'Início' },
    ],
  },
  {
    id: 'dia',
    label: 'Dia',
    icone: '◴',
    paginas: [
      { to: '/turno', label: 'Relatório de turno' },
      { to: '/turno-historico', label: 'Histórico' },
      { to: '/grupos', label: 'Grupos' },
      { to: '/parque', label: 'Parque' },
    ],
  },
  {
    id: 'quartos',
    label: 'Quartos',
    icone: '▦',
    paginas: [
      { to: '/hk-mes', label: 'Housekeeping', soHk: true },
      { to: '/hk-mapa', label: 'Mapa', soHk: true },
      { to: '/hk-outsourcing', label: 'Outsourcing', soHk: true },
      { to: '/lavandaria', label: 'Lavandaria', soLav: true },
      { to: '/hk-definicoes', label: 'Definições', soAdmin: true },
    ],
  },
  {
    id: 'dinheiro',
    label: 'Dinheiro',
    icone: '€',
    paginas: [
      { to: '/caixa', label: 'Caixa', soCaixa: true },
      { to: '/fb', label: 'F&B do dia' },
      { to: '/fb-painel', label: 'Painel F&B', soPainel: true },
      { to: '/fb-pa', label: 'Pequenos-almoços', soPa: true },
      { to: '/fb-importar', label: 'Importar Valentinas', soAdmin: true },
    ],
  },
  {
    id: 'stock',
    label: 'Stock',
    icone: '▤',
    paginas: [
      // O painel do stock vivia em '/', por ser o módulo mais antigo da app.
      // Quem entrava não via o hotel, via o inventário. Passou para cá.
      { to: '/stock', label: 'Painel' },
      { to: '/contagem', label: 'Contagem' },
      { to: '/encomendas', label: 'Encomendas' },
      { to: '/historico', label: 'Histórico' },
      { to: '/itens', label: 'Itens', soEscrita: true },
      { to: '/dados', label: 'Importar/Exportar', soAdmin: true },
    ],
  },
  {
    id: 'pessoas',
    label: 'Pessoas',
    icone: '☺',
    paginas: [
      { to: '/rh', label: 'Pessoal', soRh: true },
      { to: '/rh-custos', label: 'Custos', soRh: true },
      // Fechado a admin enquanto o módulo estiver incompleto. Para o abrir a
      // toda a casa, tirar este soAdmin e o SoAdmin da rota em src/App.tsx.
      { to: '/horarios', label: 'Horários', soAdmin: true },
      { to: '/rh-definicoes', label: 'Definições', soAdmin: true },
    ],
  },
  {
    id: 'gestao',
    label: 'Gestão',
    icone: '⛭',
    paginas: [
      { to: '/utilizadores', label: 'Utilizadores', soAdmin: true },
      { to: '/migrar-imagens', label: 'Migrar imagens', soAdmin: true },
    ],
  },
]

/**
 * A família aparece se a pessoa vir ao menos uma das suas páginas.
 *
 * É a mesma regra que já existia para as páginas, aplicada um nível acima —
 * e evita um separador que abre para um ecrã vazio, que é pior do que
 * separador nenhum.
 */
export const temPaginaVisivel = (m: Modulo, podeVerPagina: (p: Pagina) => boolean) =>
  m.paginas.some(podeVerPagina)

/** Família a que pertence um caminho — a que tiver a página mais específica. */
export function moduloDoCaminho(caminho: string): Modulo {
  let melhor: { modulo: Modulo; peso: number } | null = null
  for (const m of MODULOS) {
    for (const p of m.paginas) {
      const bate = p.to === '/' ? caminho === '/' : caminho === p.to || caminho.startsWith(p.to + '/')
      if (bate && (!melhor || p.to.length > melhor.peso)) {
        melhor = { modulo: m, peso: p.to.length }
      }
    }
  }
  return melhor?.modulo ?? MODULOS[0]
}
