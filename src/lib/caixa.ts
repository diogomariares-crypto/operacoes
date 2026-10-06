/**
 * Contagem de dinheiro.
 *
 * A unidade é o turno, não o dia: um envelope é o que uma equipa fechou entre a
 * hora a que abriu a caixa e a hora a que a fechou. Dado esse intervalo, o
 * relatório do Mews diz sozinho quanto dinheiro lá devia estar:
 *
 *     o que o turno anterior deixou na caixa
 *   + o cobrado em dinheiro entre o início e o fim do turno
 *   − as faturas que vieram dentro deste envelope
 *   − o troco que fica na caixa para o turno seguinte
 *   ─────────────────────────────────────────────────
 *   = o que devia estar no envelope,  que se compara com o contado nota a nota
 *
 * Um turno pode fechar torto de propósito — não havia trocos — e nesse caso o
 * que ficou na caixa abre o turno seguinte e a conta continua a fechar. Por
 * isso o número que importa no fim do mês é a diferença acumulada.
 *
 * Substitui a Contagem de Dinheiro, as Saídas de Caixa, o CAJA OPORTO e o
 * CAJAS VALENTINAS, que hoje são quatro ficheiros a dizer partes da mesma coisa.
 */
import { supabase } from './supabase'

export interface Caixa {
  id: string
  nome: string
  hotel_id: string | null
  empresa_id: string | null
  /** 'pms' = o recebido vem do relatório; 'manual' = escreve-se ao fecho do dia. */
  fonte: 'pms' | 'manual'
  ordem: number
  ativa: boolean
}

export interface Recebido {
  id: string
  dia: string
  valor: number
  origem: 'pms' | 'manual'
  cliente: string | null
  criador: string | null
  documento: string | null
  momento: string | null
}

export interface Saida {
  id: string
  /** Dia em que se pagou — o dinheiro saiu da caixa. Manda no mês e no turno. */
  dia: string
  /**
   * Data impressa na fatura. Pode ser de meses antes: paga-se em setembro uma
   * fatura de agosto, e o fecho de setembro é que a leva. Só informativa.
   */
  data_fatura: string | null
  fornecedor: string | null
  descricao: string | null
  documento: string | null
  valor: number
  ficheiro: string | null
  /** Em que envelope veio esta fatura. Nula enquanto ninguém o disser. */
  envelope_id: string | null
}

export interface Envelope {
  id: string
  /** Dia do fecho — o dia do fim do turno. Serve para arrumar por mês. */
  dia: string
  /** Princípio do turno, com hora. */
  inicio: string
  /** Fim do turno, com hora. */
  fim: string
  responsavel: string | null
  /**
   * Dinheiro que já estava na caixa ao abrir. Nulo significa «o troco que o
   * turno anterior deixou», que é a regra; escreve-se à mão quando não há
   * turno anterior registado, para a corrente arrancar certa.
   */
  abertura: number | null
  valor: number
  denominacoes: Record<string, number>
  /** Troco que não coube no envelope e ficou na caixa para o turno seguinte. */
  transporte: number
  nota: string | null
  /**
   * Corte de mês: não é um fecho físico, é o fim de mês a cortar um turno que o
   * atravessa.
   *
   * Um turno pode começar a 28 de setembro e acabar a 5 de outubro. O dinheiro
   * foi contado uma vez, no fim — mas os pagamentos são de dois meses, e cada
   * mês tem de responder pelo que recebeu. Então o turno fica registado em dois
   * fechos, cortados à meia-noite da mudança de mês: o de setembro leva os
   * pagamentos de setembro, o de outubro os seus.
   *
   * Num corte não se contou nada, porque ninguém foi à caixa à meia-noite. Por
   * isso o contado é zero e **todo** o dinheiro passa adiante: o transporte de
   * um corte não é o que está guardado na linha, é `abertura + recebido −
   * faturas`, calculado na hora. Tem de ser calculado e não guardado porque os
   * pagamentos costumam ser importados depois de o fecho existir, e um número
   * guardado ficaria a mentir em silêncio — que é o pior que um número de
   * dinheiro pode fazer.
   *
   * Em consequência, um corte nunca tem diferença própria: a do turno inteiro
   * aparece no fecho que levou a contagem, o último.
   */
  corte: boolean
}

export interface Deposito {
  id: string
  dia: string
  valor: number
  referencia: string | null
}

/* --------------------------------------------------------------- notas e moedas */

/** Do maior para o mais pequeno, como se conta na mão. */
export const DENOMINACOES = [
  500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01,
]

export const ehNota = (v: number) => v >= 5

/** Soma da contagem nota a nota, arredondada ao cêntimo. */
export function somaDenominacoes(d: Record<string, number>): number {
  let t = 0
  for (const v of DENOMINACOES) t += v * (d[String(v)] || 0)
  return Math.round(t * 100) / 100
}

/* ------------------------------------------------------------------ balanço */

/**
 * Uma diferença de cêntimos é troco; uma de dezenas é um envelope por abrir ou
 * uma fatura por lançar. O limiar evita alarme onde não há problema.
 */
export const TOLERANCIA = 1
const cents = (n: number) => Math.round(n * 100) / 100
const somar = <T,>(xs: T[], f: (x: T) => number) => cents(xs.reduce((s, x) => s + f(x), 0))

/**
 * As horas da caixa são horas de relógio de parede — o Mews imprime «11:11» e o
 * turno fecha «às 15:00». Não há fuso nenhum nisto, por isso nunca passam por
 * um Date: comparam-se como texto, que em ISO já dá a ordem cronológica certa.
 * Só é preciso pôr todas do mesmo tamanho, porque o input do turno vem sem
 * segundos (2026-09-01T23:00) e o Mews vem com eles.
 */
export const instante = (t: string) => `${t.slice(0, 19)}:00:00`.slice(0, 19)

/** Um pagamento pertence ao turno [início, fim[ — o fim é já do turno seguinte. */
export const dentroDoTurno = (momento: string | null, inicio: string, fim: string) =>
  momento != null &&
  instante(momento) >= instante(inicio) && instante(momento) < instante(fim)

export function recebidoDoTurno(recebido: Recebido[], inicio: string, fim: string) {
  return recebido.filter(r => dentroDoTurno(r.momento, inicio, fim))
}

/* --------------------------------------------------- o mês corta os turnos */

/** '2026-12' → '2027-01'. Em texto, que é como as horas da caixa andam. */
const proximoMes = (ym: string) => {
  const [a, m] = ym.split('-').map(Number)
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`
}

/** Um dia para cada lado. Ao meio-dia, para nenhuma hora de verão mexer no dia. */
function desviar(dia: string, dias: number) {
  const d = new Date(`${dia}T12:00:00`)
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

/**
 * As meias-noites de mudança de mês dentro de [início, fim[.
 *
 * Um turno de 28/09 a 05/10 dá uma: 01/10 às 00:00. Um turno que acabe
 * exactamente à meia-noite de 01/10 não dá nenhuma — essa meia-noite já é do
 * turno seguinte, pela mesma regra do intervalo meio-aberto que decide a quem
 * pertence um pagamento.
 */
export function cortesDeMes(inicio: string, fim: string): string[] {
  const i = instante(inicio), f = instante(fim)
  const cortes: string[] = []
  let ym = proximoMes(i.slice(0, 7))
  // o travão são 1200 meses: um turno de cem anos não existe, e um ciclo infinito sim
  for (let n = 0; n < 1200; n++) {
    const c = `${ym}-01T00:00:00`
    if (c >= f) break
    if (c > i) cortes.push(c)
    ym = proximoMes(ym)
  }
  return cortes
}

/**
 * O dia em que um fecho é arrumado: o dia a que pertence o último instante que
 * ele cobre.
 *
 * Para um turno que acaba às 07:00 de 01/10 é 01/10, como sempre foi. Para um
 * corte que acaba à meia-noite de 01/10 é 30/09 — senão o fecho de setembro ia
 * aparecer no mês de outubro, que é exactamente o que se está a resolver.
 */
export const diaDoFecho = (fim: string) => {
  const t = instante(fim)
  return t.slice(11) === '00:00:00' ? desviar(t.slice(0, 10), -1) : t.slice(0, 10)
}

/** Um dos fechos em que um turno se parte. */
export interface Segmento {
  inicio: string
  fim: string
  dia: string
  corte: boolean
  valor: number
  denominacoes: Record<string, number>
  transporte: number
}

/**
 * Parte um turno nos limites de mês que ele atravessa.
 *
 * A contagem física fica toda no **último** segmento, porque foi lá que ela
 * aconteceu: é esse que tem o valor, as denominações e o troco que ficou para o
 * turno seguinte. Os segmentos anteriores são cortes — ver a nota em
 * `Envelope.corte`.
 *
 * Um turno que não atravessa mês nenhum devolve um segmento só, igual ao que
 * entrou. Nada muda para o caso normal, que é a esmagadora maioria.
 */
export function partirPorMes(e: {
  inicio: string; fim: string
  valor: number; denominacoes: Record<string, number>; transporte: number
}): Segmento[] {
  const cortes = cortesDeMes(e.inicio, e.fim)
  const limites = [instante(e.inicio), ...cortes, instante(e.fim)]
  return limites.slice(0, -1).map((inicio, k) => {
    const fim = limites[k + 1]
    const ultimo = k === limites.length - 2
    return {
      inicio, fim, dia: diaDoFecho(fim), corte: !ultimo,
      valor: ultimo ? e.valor : 0,
      denominacoes: ultimo ? e.denominacoes : {},
      // num corte o transporte é calculado na hora; guarda-se zero para a linha
      // não sugerir um número que não é o que vale
      transporte: ultimo ? e.transporte : 0,
    }
  })
}

/* ---------------------------------------------------------------- o envelope */

/**
 * As contas de um envelope. É a pergunta do fecho de turno, por ordem:
 *
 *   o que estava na caixa quando o turno começou   (deixado pelo turno anterior)
 * + o que o Mews registou em dinheiro neste turno
 * − as faturas que vieram dentro deste envelope
 * − o troco que fica na caixa para o turno seguinte
 * ────────────────────────────────────────────────
 * = o que devia estar no envelope
 */
export interface ContasDoEnvelope {
  abertura: number
  recebido: number
  faturas: number
  transporte: number
  esperado: number
  contado: number
  /** Contado menos esperado. Positivo sobra, negativo falta. */
  diferenca: number
  certo: boolean
  nPagamentos: number
  nFaturas: number
}

export function contasDoEnvelope(
  env: Pick<Envelope, 'inicio' | 'fim' | 'valor' | 'transporte'> & { corte?: boolean },
  abertura: number,
  recebido: Recebido[],
  faturas: Saida[],
): ContasDoEnvelope {
  const doTurno = recebidoDoTurno(recebido, env.inicio, env.fim)
  const r = somar(doTurno, x => x.valor)
  const f = somar(faturas, x => x.valor)

  /*
   * Num corte de mês não houve contagem: ninguém foi à caixa à meia-noite. Tudo
   * o que lá estava continua lá e passa ao fecho seguinte, por isso o esperado é
   * zero e não há diferença a apurar — a do turno inteiro sai no fecho que levou
   * a contagem. Ver a nota em `Envelope.corte`.
   */
  if (env.corte) {
    return {
      abertura: cents(abertura), recebido: r, faturas: f,
      transporte: cents(abertura + r - f),
      esperado: 0, contado: 0, diferenca: 0, certo: true,
      nPagamentos: doTurno.length, nFaturas: faturas.length,
    }
  }

  const esperado = cents(abertura + r - f - env.transporte)
  const diferenca = cents(env.valor - esperado)
  return {
    abertura: cents(abertura), recebido: r, faturas: f, transporte: env.transporte,
    esperado, contado: env.valor, diferenca,
    certo: Math.abs(diferenca) <= TOLERANCIA,
    nPagamentos: doTurno.length, nFaturas: faturas.length,
  }
}

/* ------------------------------------------------------------------- o mês */

export interface LinhaDoMes {
  envelope: Envelope
  contas: ContasDoEnvelope
  faturas: Saida[]
  /** Soma das diferenças até este turno, inclusive. É esta que tem de fechar. */
  acumulado: number
}

export interface Balanco {
  linhas: LinhaDoMes[]
  /**
   * Recebido em dinheiro **neste mês**, e só neste.
   *
   * É este o número do mês. O `recebido` ao lado é mais largo de propósito: as
   * contas de um turno que atravessa a meia-noite precisam de pagamentos de
   * fora do mês, e durante algum tempo o ecrã mostrou essa soma larga — em
   * outubro apareciam os 45,15 € recebidos a 30 de setembro.
   */
  recebidoDoMes: number
  /** Soma de tudo o que foi carregado, incluindo os dias de fora que os turnos precisam. */
  recebido: number
  saidas: number
  contado: number
  depositado: number
  /** Soma das diferenças de todos os turnos do mês. */
  diferenca: number
  /** O que ainda está no cofre por depositar. */
  emCofre: number
  envelopes: number
  faturas: number
  /** Faturas que ainda não foram atribuídas a nenhum envelope. */
  faturasSoltas: Saida[]
  /** Pagamentos que não caem dentro de nenhum turno fechado. */
  foraDeTurno: Recebido[]
  /** Turnos que se sobrepõem — o mesmo dinheiro contado duas vezes. */
  sobrepostos: [Envelope, Envelope][]
}

export interface EntradaDoBalanco {
  /** O mês que se está a ver, 'AAAA-MM'. Decide o que é «deste mês». */
  mes: string
  /**
   * Pagamentos. Vem de propósito mais largo do que o mês: as contas de um turno
   * que atravessa a meia-noite precisam de pagamentos de fora dele. O número do
   * mês sai de `recebidoDoMes`, que filtra; nunca desta lista inteira.
   */
  recebido: Recebido[]
  saidas: Saida[]
  envelopes: Envelope[]
  depositos: Deposito[]
  /**
   * Os fechos imediatamente antes do mês, do mais antigo para o mais recente.
   *
   * Um só não bastava. O troco que um corte de mês passa adiante é calculado, e
   * para o calcular é preciso saber com quanto ele abriu — ou seja, o que o
   * fecho antes dele deixou. Com uma lista, a corrente arranca num fecho
   * físico, que tem o troco guardado, e desce até ao mês.
   */
  anteriores?: Envelope[]
  /** Faturas atribuídas a esses fechos anteriores. Entram nas contas deles, não no mês. */
  saidasAnteriores?: Saida[]
}

export function balanco(e: EntradaDoBalanco): Balanco {
  const { mes, recebido, saidas, envelopes, depositos } = e
  const porInicio = (a: Envelope, b: Envelope) =>
    instante(a.inicio).localeCompare(instante(b.inicio))
  const ordenados = [...envelopes].sort(porInicio)
  const antes = [...(e.anteriores ?? [])].sort(porInicio)

  const porEnvelope = new Map<string, Saida[]>()
  for (const s of [...saidas, ...(e.saidasAnteriores ?? [])]) {
    if (!s.envelope_id) continue
    const l = porEnvelope.get(s.envelope_id) ?? []
    l.push(s); porEnvelope.set(s.envelope_id, l)
  }

  /*
   * A corrente corre sobre os fechos anteriores e os do mês, de seguida, mas só
   * os do mês aparecem na tabela. Os anteriores servem para a abertura do
   * primeiro turno do mês chegar certa — e o acumulado começa a contar no mês,
   * porque a diferença dos meses passados já foi fechada lá.
   */
  const linhas: LinhaDoMes[] = []
  let abertura = 0
  let acumulado = 0
  for (const env of [...antes, ...ordenados]) {
    const faturas = porEnvelope.get(env.id) ?? []
    // a abertura escrita à mão manda; sem ela, o troco do turno anterior
    const contas = contasDoEnvelope(env, env.abertura ?? abertura, recebido, faturas)
    // num corte vale o transporte calculado, que leva o dinheiro todo adiante
    abertura = contas.transporte
    if (antes.includes(env)) continue
    acumulado = cents(acumulado + contas.diferenca)
    linhas.push({ envelope: env, contas, faturas, acumulado })
  }

  const doMes = recebido.filter(r => r.dia.slice(0, 7) === mes)

  const cobertos = new Set<string>()
  for (const env of [...antes, ...ordenados])
    for (const r of recebidoDoTurno(recebido, env.inicio, env.fim)) cobertos.add(r.id)

  const sobrepostos: [Envelope, Envelope][] = []
  for (let i = 1; i < ordenados.length; i++)
    if (instante(ordenados[i].inicio) < instante(ordenados[i - 1].fim))
      sobrepostos.push([ordenados[i - 1], ordenados[i]])

  return {
    linhas,
    recebidoDoMes: somar(doMes, x => x.valor),
    recebido: somar(recebido, x => x.valor),
    saidas: somar(saidas, x => x.valor),
    contado: somar(envelopes, x => x.valor),
    depositado: somar(depositos, x => x.valor),
    diferenca: acumulado,
    emCofre: cents(somar(envelopes, x => x.valor) - somar(depositos, x => x.valor)),
    envelopes: envelopes.length,
    faturas: saidas.length,
    faturasSoltas: saidas.filter(s => !s.envelope_id),
    // só os deste mês: um pagamento de fora da janela não é problema de quem
    // está a fechar este mês, e aparecer ali era alarme falso
    foraDeTurno: doMes.filter(r => !cobertos.has(r.id)),
    sobrepostos,
  }
}

export const estaCerto = (b: Balanco) => Math.abs(b.diferenca) <= TOLERANCIA

/**
 * Como se lê uma diferença.
 *
 * «Dentro da tolerância» não é «bate certo», e chamar-lhe isso foi um erro meu:
 * dez cêntimos a mais são dez cêntimos a mais, e quem conta o envelope tem
 * direito a saber. A tolerância serve para não levantar bandeira vermelha por
 * troco — não para esconder o número.
 */
export type Veredicto = 'exacto' | 'troco' | 'errado'

export const veredicto = (diferenca: number): Veredicto =>
  cents(diferenca) === 0 ? 'exacto'
    : Math.abs(diferenca) <= TOLERANCIA ? 'troco' : 'errado'

/** «bate certo», «sobram 0,10 €», «faltam 12,40 €». */
export const descreveDiferenca = (diferenca: number, euros: (n: number) => string) => {
  const d = cents(diferenca)
  if (d === 0) return 'bate certo'
  return `${d > 0 ? 'sobram' : 'faltam'} ${euros(Math.abs(d))}`
}

/* --------------------------------------------------- relatório de pagamentos */

export interface LinhaPms {
  dia: string
  momento: string | null
  valor: number
  cliente: string | null
  criador: string | null
  documento: string | null
  chave: string
}

/**
 * Lê a folha "Cash payments" do relatório de pagamentos do Mews.
 *
 * As colunas vêm com nomes em inglês e a folha traz colunas vazias pelo meio,
 * por isso procura-se pelo cabeçalho em vez de contar posições — o Mews muda
 * o relatório de vez em quando e isto sobrevive a isso.
 */
export function lerRelatorioPms(linhas: Record<string, unknown>[]): LinhaPms[] {
  const fora: LinhaPms[] = []
  for (const l of linhas) {
    const col = (...nomes: string[]) => {
      for (const n of nomes) {
        const k = Object.keys(l).find(x => x.trim().toLowerCase() === n.toLowerCase())
        if (k != null && l[k] != null && String(l[k]).trim() !== '') return l[k]
      }
      return null
    }
    const valor = Number(col('Value', 'Amount', 'Valor', 'Original amount'))
    if (!Number.isFinite(valor) || valor === 0) continue

    const bruto = col('Created', 'Date', 'Data')
    const momento = paraMomento(bruto)
    if (!momento) continue

    const cliente = txt(col('Customer', 'Cliente'))
    const criador = txt(col('Creator', 'User', 'Utilizador'))
    const documento = txt(col('Bill', 'Conta', 'Document'))

    fora.push({
      dia: momento.slice(0, 10),
      momento,
      valor: Math.round(valor * 100) / 100,
      cliente, criador, documento,
      // o mesmo pagamento reimportado tem de cair na mesma chave
      chave: `${momento}|${documento ?? ''}|${valor.toFixed(2)}|${cliente ?? ''}`.slice(0, 220),
    })
  }
  return fora
}

const txt = (v: unknown) => {
  const s = v == null ? '' : String(v).trim()
  return s === '' ? null : s
}

/** Aceita a data como texto, como Date, ou como número de série do Excel. */
function paraMomento(v: unknown): string | null {
  if (v == null) return null
  if (v instanceof Date) return semFuso(v)
  if (typeof v === 'number') {
    // O Excel conta dias desde 1899-12-30
    return semFuso(new Date(Math.round((v - 25569) * 86400000)))
  }
  const s = String(v).trim()
  const pt = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})(?:[ T](\d{2}):(\d{2}))?/)
  if (pt) return `${pt[3]}-${pt[2]}-${pt[1]}T${pt[4] ?? '00'}:${pt[5] ?? '00'}:00`
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}T${iso[4] ?? '00'}:${iso[5] ?? '00'}:00`
  const d = new Date(s)
  return Number.isNaN(d.valueOf()) ? null : semFuso(d)
}

const semFuso = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
         `T${p(d.getHours())}:${p(d.getMinutes())}:00`
}

/* -------------------------------------------------------------------- dados */

const num = (v: unknown, d = 0) => (v == null ? d : Number(v))

export async function fetchCaixas(): Promise<Caixa[]> {
  const { data, error } = await supabase
    .from('cx_caixas').select('*').eq('ativa', true).order('ordem')
  if (error) throw error
  return (data ?? []) as Caixa[]
}

/**
 * Quantos fechos antes do mês se trazem para a corrente de aberturas arrancar.
 *
 * Um bastava quando todos os fechos eram físicos e traziam o troco guardado.
 * Com cortes de mês, o troco de um corte é calculado a partir da sua abertura,
 * e essa vem do fecho anterior — por isso é preciso recuar até encontrar um
 * fecho físico. Seis dá margem de sobra: seriam seis meses seguidos de turnos a
 * atravessar o fim do mês.
 */
const FECHOS_ANTES = 6

const env = (x: Record<string, unknown>) => ({
  ...x, valor: num(x.valor), transporte: num(x.transporte),
  denominacoes: x.denominacoes ?? {}, corte: x.corte === true,
}) as Envelope

export async function fetchMes(caixaId: string, de: string, ate: string) {
  // primeiro os fechos, porque são eles que dizem de que pagamentos se precisa
  const [s, e, d, ant] = await Promise.all([
    supabase.from('cx_saidas').select('*').eq('caixa_id', caixaId)
      .gte('dia', de).lte('dia', ate).order('dia'),
    supabase.from('cx_envelopes').select('*').eq('caixa_id', caixaId)
      .gte('dia', de).lte('dia', ate).order('inicio'),
    supabase.from('cx_depositos').select('*').eq('caixa_id', caixaId)
      .gte('dia', de).lte('dia', ate).order('dia'),
    supabase.from('cx_envelopes').select('*').eq('caixa_id', caixaId)
      .lt('dia', de).order('inicio', { ascending: false }).limit(FECHOS_ANTES),
  ])
  for (const x of [s, e, d, ant] as { error: unknown }[]) if (x.error) throw x.error

  const envelopes = (e.data ?? []).map(env)
  const anteriores = (ant.data ?? []).map(env).reverse()

  /*
   * A janela dos pagamentos é o mês mais tudo o que os fechos à vista precisam.
   *
   * Antes era um dia fixo para cada lado, o que chegava para um turno de noite
   * e não chegava para um turno de 28/09 a 05/10 — as contas de outubro ficavam
   * sem os pagamentos de setembro. Agora a janela é a união do mês com o
   * intervalo de cada fecho, e o dia extra de cada lado fica como folga.
   */
  const todos = [...anteriores, ...envelopes]
  const limite = (f: (a: string, b: string) => string, base: string, campo: 'inicio' | 'fim') =>
    todos.reduce((acc, x) => f(acc, instante(x[campo]).slice(0, 10)), base)
  const desde = desviar(limite((a, b) => (b < a ? b : a), de, 'inicio'), -1)
  const until = desviar(limite((a, b) => (b > a ? b : a), ate, 'fim'), 1)

  const [r, sa] = await Promise.all([
    supabase.from('cx_recebido').select('*').eq('caixa_id', caixaId)
      .gte('dia', desde).lte('dia', until).order('momento'),
    // as faturas dos fechos anteriores: entram nas contas deles, não nas do mês
    anteriores.length
      ? supabase.from('cx_saidas').select('*').eq('caixa_id', caixaId)
          .in('envelope_id', anteriores.map(x => x.id))
      : Promise.resolve({ data: [], error: null }),
  ])
  for (const x of [r, sa] as { error: unknown }[]) if (x.error) throw x.error

  const valor = (x: Record<string, unknown>) => ({ ...x, valor: num(x.valor) })
  return {
    recebido: (r.data ?? []).map(valor) as Recebido[],
    saidas: (s.data ?? []).map(valor) as Saida[],
    envelopes,
    depositos: (d.data ?? []).map(valor) as Deposito[],
    anteriores,
    saidasAnteriores: (sa.data ?? []).map(valor) as Saida[],
  }
}

/** Importa as linhas do relatório sem duplicar as que já lá estavam. */
export async function importarRecebido(caixaId: string, linhas: LinhaPms[]) {
  if (!linhas.length) return { novas: 0, repetidas: 0 }
  const { data, error } = await supabase.from('cx_recebido')
    .upsert(linhas.map(l => ({
      caixa_id: caixaId, dia: l.dia, valor: l.valor, origem: 'pms',
      cliente: l.cliente, criador: l.criador, documento: l.documento,
      momento: l.momento, chave: l.chave,
    })), { onConflict: 'caixa_id,chave', ignoreDuplicates: true })
    .select('id')
  if (error) throw error
  const novas = data?.length ?? 0
  return { novas, repetidas: linhas.length - novas }
}

export async function juntarRecebidoManual(
  caixaId: string, dia: string, valor: number, nota: string | null,
) {
  const { error } = await supabase.from('cx_recebido').insert({
    caixa_id: caixaId, dia, valor, origem: 'manual', cliente: nota,
    // sem hora a que se agarrar, fica ao meio-dia: cai dentro de qualquer
    // turno que cubra este dia
    momento: `${dia}T12:00:00`,
    chave: `manual|${dia}|${valor.toFixed(2)}|${Date.now()}`,
  })
  if (error) throw error
}

export async function juntarSaida(caixaId: string, s: Omit<Saida, 'id'>, por: string | null) {
  const { data, error } = await supabase.from('cx_saidas')
    .insert({ ...s, caixa_id: caixaId, atualizado_por: por }).select('id').single()
  if (error) throw error
  return data.id as string
}

/**
 * Lança de uma vez as faturas coladas, saltando as que já lá estão.
 *
 * A mesma colagem feita duas vezes acontece — o ecrã só mostra o mês que está
 * escolhido, e uma fatura de outro mês entra sem aparecer, o que convida a
 * colar outra vez a pensar que falhou. Sem esta guarda, ficavam cópias
 * invisíveis a estragar o total do mês delas.
 *
 * Duas faturas são a mesma se tiverem o mesmo dia, valor, documento e
 * fornecedor. Dois talões iguais do mesmo fornecedor no mesmo dia são raros e
 * distinguem-se pelo documento; se nem isso tiverem, lançam-se à mão.
 */
export async function juntarSaidas(
  caixaId: string,
  linhas: Omit<Saida, 'id' | 'ficheiro' | 'envelope_id'>[],
  por: string | null,
): Promise<{ inseridas: number; repetidas: number }> {
  if (!linhas.length) return { inseridas: 0, repetidas: 0 }

  /**
   * Quando há data de fatura, é ela que identifica a fatura — não o dia em que
   * se pagou. Senão, colar a mesma tabela outra vez com outro dia de pagamento
   * voltava a lançar tudo, que é precisamente o engano que esta guarda existe
   * para apanhar.
   */
  type Chave = Pick<Saida, 'dia' | 'data_fatura' | 'valor' | 'documento' | 'fornecedor'>
  const assinatura = (s: Chave) =>
    `${s.data_fatura ?? `p:${s.dia}`}|${Number(s.valor).toFixed(2)}` +
    `|${s.documento ?? ''}|${s.fornecedor ?? ''}`

  const datas = [...new Set(linhas.flatMap(l => [l.dia, l.data_fatura]))]
    .filter((x): x is string => !!x)
  const lista = `(${datas.join(',')})`
  const { data, error } = await supabase.from('cx_saidas')
    .select('dia, data_fatura, valor, documento, fornecedor')
    .eq('caixa_id', caixaId)
    .or(`dia.in.${lista},data_fatura.in.${lista}`)
  if (error) throw error

  const jaLa = new Set((data ?? []).map(x => assinatura(x as Chave)))

  const novas: typeof linhas = []
  for (const l of linhas) {
    const k = assinatura(l)
    if (jaLa.has(k)) continue
    jaLa.add(k)  // a própria colagem pode trazer a linha repetida
    novas.push(l)
  }

  if (novas.length) {
    const { error: e2 } = await supabase.from('cx_saidas').insert(
      novas.map(l => ({
        ...l, caixa_id: caixaId, ficheiro: null, envelope_id: null, atualizado_por: por,
      })))
    if (e2) throw e2
  }
  return { inseridas: novas.length, repetidas: linhas.length - novas.length }
}

export async function guardarSaida(id: string, patch: Partial<Saida>) {
  const { error } = await supabase.from('cx_saidas').update(patch).eq('id', id)
  if (error) throw error
}

/**
 * Grava o envelope e prende-lhe as faturas que vieram lá dentro. As que
 * deixarem de estar seleccionadas voltam a ficar soltas — a fatura não se perde,
 * só deixa de pertencer a este turno.
 */
/**
 * A fatura vai para o segmento do seu mês.
 *
 * Uma fatura tem dia mas não tem hora, por isso não se pode pôr num intervalo
 * ao minuto — e também não é preciso: o que se quer é que cada mês responda
 * pelas suas faturas. O que não bater em nenhum mês fica no último segmento,
 * que é o que levou a contagem.
 */
function segmentoDaFatura(dia: string, segmentos: Segmento[]) {
  const k = segmentos.findIndex(s => s.dia.slice(0, 7) === dia.slice(0, 7))
  return k === -1 ? segmentos.length - 1 : k
}

export async function juntarEnvelope(
  caixaId: string, e: Omit<Envelope, 'id'>, faturas: string[], por: string | null,
  saidas: Pick<Saida, 'id' | 'dia'>[] = [],
) {
  const segmentos = partirPorMes(e)
  const ids: string[] = []
  for (const s of segmentos) {
    const { data, error } = await supabase.from('cx_envelopes').insert({
      caixa_id: caixaId, atualizado_por: por,
      responsavel: e.responsavel, nota: e.nota,
      // a abertura escrita à mão é do princípio do turno, logo do primeiro
      // segmento; os seguintes abrem com o que o anterior deixou
      abertura: ids.length === 0 ? e.abertura : null,
      ...s,
    }).select('id').single()
    if (error) throw error
    ids.push(data.id as string)
  }
  await espalharFaturas(ids, segmentos, faturas, saidas, caixaId)
  return ids[ids.length - 1]
}

export async function guardarEnvelope(
  id: string, caixaId: string, e: Omit<Envelope, 'id'>, faturas: string[], por: string | null,
  saidas: Pick<Saida, 'id' | 'dia'>[] = [],
) {
  const segmentos = partirPorMes(e)
  /*
   * Se o turno editado passou a atravessar o fim do mês, deixa de caber numa
   * linha. Soltam-se as faturas, apaga-se a linha e gravam-se os segmentos — o
   * conteúdo não se perde, muda de forma. Fora desse caso, actualiza-se no
   * lugar como sempre.
   */
  if (segmentos.length > 1) {
    await atribuirFaturas(id, [], caixaId)
    const { error } = await supabase.from('cx_envelopes').delete().eq('id', id)
    if (error) throw error
    return juntarEnvelope(caixaId, e, faturas, por, saidas)
  }
  const { error } = await supabase.from('cx_envelopes')
    .update({ ...e, ...segmentos[0], atualizado_por: por }).eq('id', id)
  if (error) throw error
  await atribuirFaturas(id, faturas, caixaId)
  return id
}

/** Reparte as faturas escolhidas pelos segmentos, cada uma no mês a que pertence. */
async function espalharFaturas(
  ids: string[], segmentos: Segmento[], faturas: string[],
  saidas: Pick<Saida, 'id' | 'dia'>[], caixaId: string,
) {
  if (ids.length === 1) { await atribuirFaturas(ids[0], faturas, caixaId); return }
  const porSegmento = ids.map<string[]>(() => [])
  for (const f of faturas) {
    const dia = saidas.find(s => s.id === f)?.dia
    porSegmento[dia ? segmentoDaFatura(dia, segmentos) : ids.length - 1].push(f)
  }
  for (let k = 0; k < ids.length; k++) await atribuirFaturas(ids[k], porSegmento[k], caixaId)
}

async function atribuirFaturas(envelopeId: string, faturas: string[], caixaId: string) {
  // soltar as que já lá não pertencem
  const soltar = supabase.from('cx_saidas').update({ envelope_id: null })
    .eq('envelope_id', envelopeId)
  const { error: e1 } = faturas.length
    ? await soltar.not('id', 'in', `(${faturas.join(',')})`)
    : await soltar
  if (e1) throw e1
  if (!faturas.length) return
  const { error: e2 } = await supabase.from('cx_saidas')
    .update({ envelope_id: envelopeId }).eq('caixa_id', caixaId).in('id', faturas)
  if (e2) throw e2
}

export async function juntarDeposito(caixaId: string, d: Omit<Deposito, 'id'>) {
  const { error } = await supabase.from('cx_depositos').insert({ ...d, caixa_id: caixaId })
  if (error) throw error
}

/**
 * Apaga várias linhas de uma vez.
 *
 * Um relatório mal importado traz dezenas de pagamentos errados, e apagá-los um
 * a um não é trabalho que se peça a ninguém.
 */
export async function apagarVarios(
  tabela: 'cx_saidas' | 'cx_envelopes' | 'cx_depositos' | 'cx_recebido',
  ids: string[],
) {
  if (!ids.length) return
  const { error } = await supabase.from(tabela).delete().in('id', ids)
  if (error) throw error
}

export async function apagar(tabela: 'cx_saidas' | 'cx_envelopes' | 'cx_depositos' | 'cx_recebido',
                             id: string) {
  const { error } = await supabase.from(tabela).delete().eq('id', id)
  if (error) throw error
}

/* ---------------------------------------------------------------- ficheiros */

const BALDE = 'caixa-faturas'

/** "2026-08-15 - Auchan Cedofeita - 1161032026080001-001.pdf" */
export function nomeDaFatura(s: Pick<Saida, 'dia' | 'fornecedor' | 'documento'>, original: string) {
  const ext = original.includes('.') ? original.slice(original.lastIndexOf('.')) : ''
  const limpo = (t: string | null, alt: string) =>
    (t || alt).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9 .-]/g, '-').replace(/-+/g, '-').trim().slice(0, 60)
  return `${s.dia} - ${limpo(s.fornecedor, 'sem fornecedor')} - ${limpo(s.documento, 'sem numero')}${ext}`
}

export async function guardarFicheiro(
  caixaId: string, s: Pick<Saida, 'dia' | 'fornecedor' | 'documento'>, f: File,
): Promise<string> {
  const caminho = `${caixaId}/${s.dia.slice(0, 7)}/${nomeDaFatura(s, f.name)}`
  const { error } = await supabase.storage.from(BALDE)
    .upload(caminho, f, { upsert: true, contentType: f.type || undefined })
  if (error) throw error
  return caminho
}

/** Link temporário para abrir a fatura; o balde é privado. */
export async function linkDaFatura(caminho: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BALDE).createSignedUrl(caminho, 300)
  if (error) return null
  return data.signedUrl
}

export async function apagarFicheiro(caminho: string) {
  await supabase.storage.from(BALDE).remove([caminho])
}

/**
 * Lê o bloco de faturas colado a partir de uma tabela — uma linha por fatura,
 * campos separados por tabulação ou ponto e vírgula:
 *   data · fornecedor · descrição · nº documento · valor
 *
 * Se a colagem trouxer a linha de cabeçalho, as colunas são identificadas pelo
 * nome em vez da posição. É o que permite colar as Saídas de Caixa tal como
 * estão no Excel, onde a ordem é outra (Data · Descrição · Nº · Fornecedor).
 */
export function lerColagem(texto: string): Omit<Saida, 'id' | 'ficheiro' | 'envelope_id'>[] {
  const linhas = texto.split(/\r?\n/).filter(l => l.trim())
  if (!linhas.length) return []

  const parte = (l: string) => l.split(/\t|;/).map(x => x.trim())
  const mapa = cabecalho(parte(linhas[0]))
  const corpo = mapa ? linhas.slice(1) : linhas

  const fora: Omit<Saida, 'id' | 'ficheiro' | 'envelope_id'>[] = []
  for (const linha of corpo) {
    const c = parte(linha)
    if (c.length < 3) continue

    const em = (k: keyof typeof POSICOES, posicao: number) =>
      mapa ? (mapa[k] != null ? c[mapa[k]!] : undefined) : c[posicao]

    const dia = paraDia(em('dia', 0) ?? '')
    const bruto = em('valor', c.length - 1) ?? c[c.length - 1]
    const valor = Number(String(bruto).replace(/[^0-9,.-]/g, '').replace(',', '.'))
    if (!dia || !Number.isFinite(valor) || valor === 0) continue
    // o sinal fica como vem: um valor negativo é uma nota de crédito, dinheiro
    // que volta à caixa. Antes tomava-se o valor absoluto, e uma nota de
    // crédito de 50 EUR entrava como uma despesa de 50 EUR — 100 EUR de erro.

    // sem cabeçalho e só com 4 colunas, a do meio é o nº do documento
    const curto = !mapa && c.length < 5
    fora.push({
      dia,
      data_fatura: null,
      fornecedor: (em('fornecedor', 1) || null) ?? null,
      descricao: curto ? null : (em('descricao', 2) || null) ?? null,
      documento: (curto ? c[2] : em('documento', 3)) || null,
      valor: Math.round(valor * 100) / 100,
    })
  }
  return fora
}

/** Nomes que se reconhecem numa linha de cabeçalho, por campo. */
const POSICOES = {
  dia: ['data', 'dia', 'date', 'fecha'],
  fornecedor: ['fornecedor', 'proveedor', 'supplier'],
  descricao: ['descricao', 'descrição', 'concepto', 'descrition', 'description'],
  documento: ['no documento', 'nº documento', 'n documento', 'numero', 'nº', 'documento', 'fatura'],
  valor: ['saida', 'saída', 'salidas', 'valor', 'total', 'importe', 'montante'],
}

/**
 * Tira acentos, maiúsculas e o «º» para comparar cabeçalhos: «Número» e
 * «numero» têm de ser a mesma palavra.
 */
const chave = (x: string) =>
  x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[º°.]/g, '').replace(/\s+/g, ' ').trim()

/**
 * Devolve o índice de cada campo, ou null se a linha não for um cabeçalho.
 *
 * O nome tem de estar no princípio da célula, não ser a célula toda: ninguém
 * escreve «Data» numa folha real, escreve «Data da fatura». Antes exigia-se
 * igualdade exacta, o cabeçalho não era reconhecido, e as colunas entravam
 * pela posição — era assim que o número da fatura ia para o campo do
 * fornecedor sem ninguém perceber porquê.
 *
 * Princípio e não «contém» porque «Data da fatura» também contém «fatura», que
 * é nome do número do documento; em português o substantivo vem à frente, e é
 * por ele que se decide.
 */
function cabecalho(c: string[]): Record<keyof typeof POSICOES, number | null> | null {
  const limpo = c.map(chave)
  const comeca = (x: string, n: string) => {
    const k = chave(n)
    return x === k || (x.startsWith(k) && !/[a-z0-9]/.test(x.charAt(k.length)))
  }
  const achar = (nomes: string[]) => {
    // o nome mais comprido manda, para «nº documento» ganhar a «nº»
    const ordenados = [...nomes].sort((a, b) => b.length - a.length)
    for (const n of ordenados) {
      const i = limpo.findIndex(x => comeca(x, n))
      if (i >= 0) return i
    }
    return null
  }
  const m = {
    dia: achar(POSICOES.dia),
    fornecedor: achar(POSICOES.fornecedor),
    descricao: achar(POSICOES.descricao),
    documento: achar(POSICOES.documento),
    valor: achar(POSICOES.valor),
  }
  // é cabeçalho se reconheceu a data e o valor — senão é já uma linha de dados
  return m.dia != null && m.valor != null ? m : null
}

function paraDia(s: string): string | null {
  const m = paraMomento(s)
  return m ? m.slice(0, 10) : null
}
