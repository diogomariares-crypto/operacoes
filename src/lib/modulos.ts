/**
 * Separadores da aplicação.
 *
 * Organizados como a casa está organizada: por departamento. Quem trabalha no
 * housekeeping procura as coisas do housekeeping num sítio chamado
 * Housekeeping, e não em «Quartos» ou «Operação» — nomes que descrevem a
 * atividade mas não correspondem a nenhuma equipa real.
 *
 * Há três separadores comuns, que não são de ninguém em particular:
 *
 *  - **Início**, o painel do dia;
 *  - **Passagem de turno**, que é de todos por definição;
 *  - **Stock**, porque na base de dados cada artigo já pertence a FO, HSK ou
 *    F&B e as três equipas contam na mesma página, com o departamento escolhido
 *    lá dentro. Arrumá-lo dentro de um departamento obrigaria os outros dois a
 *    ir buscá-lo a casa alheia.
 *
 * Duas regras que importam antes de mexer aqui:
 *
 *  1. As permissões vivem nas PÁGINAS, não nos separadores. Um separador
 *     aparece se a pessoa vir ao menos uma página lá dentro — `temPaginaVisivel`.
 *     Assim o Housekeeping aparece a quem só vê a lavandaria, sem ser preciso
 *     inventar papéis que a casa não tem.
 *
 *     Há uma exceção, e é de propósito: o acesso `fb_checklist` não se decide
 *     por estas marcas, decide-se por uma lista de um caminho só — ver
 *     `podeVerPagina` em auth.tsx. Os três separadores comuns abaixo são «de
 *     todos» menos desse, que entra na app para marcar a checklist e sair.
 *  2. Cada página tem **um** dono. Uma página que serve vários departamentos
 *     vive no dono e os outros chegam lá por atalho, em vez de aparecer
 *     repetida em três sítios — que é como se perde a noção de onde se estava.
 *
 *     Duas páginas estão em dois departamentos, e as duas pela mesma razão: há
 *     quem marque e há quem execute. O parque — a receção estaciona, a
 *     manutenção conserta. A sala de eventos — a receção atende o telefone, o
 *     F&B monta a sala e serve. Em ambos os casos é a MESMA página em dois
 *     sítios, e não duas; o `moduloDoCaminho` dá a barra ao primeiro da lista
 *     para não acender dois separadores de uma vez.
 *
 * Para acrescentar uma página: criá-la em src/pages/, registar a rota em
 * src/App.tsx e pô-la no departamento certo aqui.
 */
/**
 * A única página que o acesso `fb_checklist` vê.
 *
 * Está aqui, e não escrita à mão em três sítios, porque é ao mesmo tempo o
 * que o menu mostra (`podeVerPagina`), a única rota que a app monta
 * (`src/App.tsx`) e o sítio onde qualquer outro endereço vai dar. Se um dia
 * mudar de caminho, muda nos três de uma vez.
 */
export const CAMINHO_CHECKLIST = '/fb-checklist'

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
  /** Só visível a quem pode ver a faturação do F&B. */
  soFaturacao?: boolean
}

export interface Modulo {
  id: string
  label: string
  /**
   * O nome na barra de separadores, quando o nome por extenso não lá cabe.
   * São dez separadores: «Passagem de turno» e «Recursos Humanos» por extenso
   * empurravam o resto para fora do ecrã.
   */
  curto?: string
  icone: string
  /** Comum a toda a casa, por oposição a um departamento. */
  comum?: boolean
  /**
   * Continuam a existir para quem os queira usar, mas os separadores já não os
   * põem: a visibilidade decide-se pelas páginas.
   */
  soAdmin?: boolean
  soRh?: boolean
  soLav?: boolean
  soHk?: boolean
  soCaixa?: boolean
  paginas: Pagina[]
}

export const MODULOS: Modulo[] = [
  /* ------------------------------- comuns ------------------------------- */
  {
    id: 'inicio',
    label: 'Início',
    icone: '⌂',
    comum: true,
    paginas: [
      { to: '/', label: 'Início' },
    ],
  },
  {
    id: 'turnos',
    label: 'Passagem de turno',
    curto: 'Turno',
    icone: '⇄',
    comum: true,
    paginas: [
      { to: '/turno', label: 'Relatório do dia' },
      { to: '/turno-historico', label: 'Histórico' },
    ],
  },
  {
    id: 'stock',
    label: 'Stock',
    icone: '▤',
    comum: true,
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

  /* ---------------------------- departamentos --------------------------- */
  {
    id: 'fo',
    label: 'Front Office',
    icone: '◨',
    paginas: [
      { to: '/grupos', label: 'Grupos' },
      { to: '/parque', label: 'Parque' },
      // A receção atende o telefone de quem quer a sala, por isso é dela a
      // página. Aparece também no F&B — ver a nota do dono único lá em baixo.
      { to: '/eventos', label: 'Sala de eventos' },
    ],
  },
  {
    id: 'hsk',
    label: 'Housekeeping',
    icone: '▦',
    paginas: [
      { to: '/hk-mes', label: 'Produção do mês', soHk: true },
      { to: '/hk-mapa', label: 'Mapa', soHk: true },
      { to: '/hk-outsourcing', label: 'Outsourcing', soHk: true },
      { to: '/hk-definicoes', label: 'Definições', soAdmin: true },
    ],
  },
  {
    id: 'fb',
    label: 'F&B',
    icone: '♨',
    paginas: [
      // A faturacao do dia so se mostra a quem a pode ler. Quem nao pode via a
      // pagina vazia, porque a base de dados ja lhe recusava as linhas -- o que
      // parece avaria e nao permissao.
      { to: '/fb', label: 'Dia', soFaturacao: true },
      // A checklist da manha e seguida ao telemovel por quem esta de turno, e e
      // a unica coisa do F&B que o acesso `fb_checklist` ve.
      { to: '/fb-checklist', label: 'Checklist' },
      // Quem monta a sala e serve é o F&B, e precisa de ver o que aí vem sem
      // ir ao separador da receção. É a mesma página, não uma cópia.
      { to: '/eventos', label: 'Sala de eventos' },
      { to: '/fb-painel', label: 'Painel', soPainel: true },
      { to: '/fb-pa', label: 'Pequenos-almoços', soPa: true },
      { to: '/fb-importar', label: 'Importar Valentinas', soAdmin: true },
    ],
  },
  {
    id: 'man',
    label: 'Manutenção',
    icone: '⬓',
    paginas: [
      // Hoje a manutenção só tem o parque como página própria: as intervenções
      // são registadas dentro da passagem de turno. Se um dia tiverem página
      // sua, é aqui que entra.
      { to: '/parque', label: 'Parque' },
    ],
  },
  {
    id: 'conta',
    label: 'Contabilidade',
    curto: 'Contas',
    icone: '€',
    paginas: [
      { to: '/caixa', label: 'Caixa', soCaixa: true },
      // A lavandaria está aqui e não no housekeeping porque a página é de
      // custos, não de operação: quem a abre está a fechar contas.
      { to: '/lavandaria', label: 'Lavandaria', soLav: true },
    ],
  },
  {
    id: 'rh',
    label: 'Recursos Humanos',
    curto: 'RH',
    icone: '☺',
    paginas: [
      { to: '/rh', label: 'Pessoas', soRh: true },
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
 * O separador aparece se a pessoa vir ao menos uma das suas páginas.
 *
 * É a mesma regra que já existia para as páginas, aplicada um nível acima —
 * e evita um separador que abre para um ecrã vazio, que é pior do que
 * separador nenhum.
 */
export const temPaginaVisivel = (m: Modulo, podeVerPagina: (p: Pagina) => boolean) =>
  m.paginas.some(podeVerPagina)

/**
 * Separador a que pertence um caminho.
 *
 * O parque está em dois departamentos — é a exceção que confirma a regra do
 * dono único, porque quem estaciona é a receção e quem conserta é a manutenção.
 * Ganha o primeiro da lista, para a barra não acender dois separadores.
 */
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
