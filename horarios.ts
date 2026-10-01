import { supabase } from './supabase'

/**
 * Os horários do pessoal.
 *
 * Isto nasceu de três folhas de Excel — uma por área — onde cada linha é uma
 * pessoa, cada coluna um dia do mês e cada célula um código de turno. O Excel
 * faz bem a escrita e muito mal a leitura: ninguém consegue olhar para a folha
 * e dizer quem está na recepção às 23h de terça, nem quantas horas de noite
 * fez a Maria em Março.
 *
 * Por isso a base de dados guarda o que o Excel guarda — uma célula por pessoa
 * e por dia — e as contas fazem-se aqui.
 *
 * O que importa entender antes de mexer:
 *
 * 1. **O código não é único.** A legenda do Excel tem `M` = 07h00/15h30 e
 *    também `M` = 06h30/15h00, e `T18` aparece cinco vezes com horas
 *    diferentes. Cada linha da legenda tem o seu próprio id e `hor_dias`
 *    aponta para esse id, não para o texto. Assim, corrigir uma linha da
 *    legenda nunca muda o significado do que já ficou registado.
 *
 * 2. **As horas são decimais e o fim pode passar das 24.** Um turno 23h00/07h30
 *    guarda-se `[[23, 31.5]]`. É o que permite somar horas sem pensar em dias
 *    nem em fusos horários.
 *
 * 3. **A lista de pessoas é própria.** Muitos nomes no Excel são só o primeiro
 *    nome, e nem todos têm ficha de empregado. `empregado_id` liga à ficha
 *    quando existe, e é opcional de propósito.
 *
 * Quem lê: todos os departamentos. Quem escreve: admin e RH.
 */

/* ----------------------------- tipos de base ----------------------------- */

export type Categoria =
  | 'trab' | 'folga' | 'ferias' | 'feriado' | 'rec' | 'baixa' | 'falta' | 'licenca' | 'outro'

export const CATEGORIAS: Record<Categoria, string> = {
  trab: 'Trabalho',
  folga: 'Folga',
  ferias: 'Férias',
  feriado: 'Feriado',
  rec: 'Recuperação',
  baixa: 'Baixa',
  falta: 'Falta',
  licenca: 'Licença',
  outro: 'Outro',
}

/** Períodos do dia, deduzidos da hora a que o turno começa. */
export type Periodo = 'manha' | 'meio' | 'tarde' | 'noite' | 'nenhum'

export const PERIODOS: Record<Periodo, string> = {
  manha: 'Manhã',
  meio: 'Meio',
  tarde: 'Tarde',
  noite: 'Noite',
  nenhum: '—',
}

export type Hotel = 'G' | 'T'

export const HOTEIS: Record<Hotel, string> = { G: 'Gravity', T: 'Tokyo' }

/** `[início, fim]` em horas decimais. O fim pode passar das 24 (turno da noite). */
export type Bloco = [number, number]

export interface Seccao {
  nome: string
  area: string
  ordem: number
}

export interface Codigo {
  id: string
  codigo: string
  descricao: string
  hotel: Hotel | null
  categoria: Categoria
  blocos: Bloco[]
  area: string | null
  ordem: number
  activo: boolean
}

export interface Pessoa {
  id: string
  nome: string
  seccao: string
  lider: boolean
  ordem: number
  activo: boolean
  empregado_id: string | null
  nota: string | null
}

export interface Dia {
  pessoa_id: string
  data: string
  codigo_id: string
  nota: string | null
  updated_at?: string
  atualizado_por?: string | null
}

/** Tudo o que uma vista precisa, já junto. */
export interface Horarios {
  seccoes: Seccao[]
  codigos: Codigo[]
  pessoas: Pessoa[]
  /** Chave `pessoa_id|data`. */
  dias: Map<string, Dia>
}

export const chaveDia = (pessoaId: string, data: string) => `${pessoaId}|${data}`

/* ------------------------------- as contas ------------------------------- */

/** Horas de um bloco. */
const horasBloco = (b: Bloco) => Math.max(0, b[1] - b[0])

/** Horas de um turno. Códigos sem blocos (folga, férias) dão 0. */
export const horasDoCodigo = (c: Codigo | undefined) =>
  c ? c.blocos.reduce((s, b) => s + horasBloco(b), 0) : 0

const sobreposicao = (a: number, b: number, de: number, ate: number) =>
  Math.max(0, Math.min(b, ate) - Math.max(a, de))

/**
 * Horas nocturnas: o que cai entre as 22h e as 07h.
 *
 * Como o fim de um turno pode passar das 24, a janela da noite parte-se em
 * duas: `[22, 31]` apanha o 22h→07h do dia seguinte e `[0, 7]` apanha a
 * madrugada de um turno que começa de manhã muito cedo. Um bloco nunca cai
 * nas duas ao mesmo tempo, por isso somar não conta nada duas vezes.
 */
export function horasNoiteDoCodigo(c: Codigo | undefined): number {
  if (!c) return 0
  let t = 0
  for (const [a, b] of c.blocos) {
    t += sobreposicao(a, b, 22, 31) + sobreposicao(a, b, 0, 7)
  }
  return t
}

/** O período em que o turno cai, pela hora a que começa. */
export function periodoDoCodigo(c: Codigo | undefined): Periodo {
  if (!c || c.blocos.length === 0) return 'nenhum'
  const h = Math.min(...c.blocos.map(b => b[0]))
  if (h >= 22) return 'noite'
  if (h >= 14) return 'tarde'
  if (h >= 10) return 'meio'
  return 'manha'
}

/** `true` se o turno está a decorrer à hora dada (0–24, dia civil). */
export function estaDeServico(c: Codigo | undefined, hora: number): boolean {
  if (!c) return false
  for (const [a, b] of c.blocos) {
    if (hora >= a && hora < b) return true
    // A parte do turno que passa da meia-noite pertence à madrugada seguinte.
    if (b > 24 && hora + 24 >= a && hora + 24 < b) return true
  }
  return false
}

export const horasTexto = (h: number) => {
  if (!h) return '—'
  const inteiras = Math.floor(h)
  const m = Math.round((h - inteiras) * 60)
  return m ? `${inteiras}h${String(m).padStart(2, '0')}` : `${inteiras}h`
}

/** `7.5` → `07h30`. Para escrever a legenda. */
export const horaTexto = (h: number) => {
  const d = h % 24
  const i = Math.floor(d)
  const m = Math.round((d - i) * 60)
  return `${String(i).padStart(2, '0')}h${String(m).padStart(2, '0')}`
}

export const blocosTexto = (c: Codigo | undefined) =>
  c && c.blocos.length ? c.blocos.map(b => `${horaTexto(b[0])}/${horaTexto(b[1])}`).join(' + ') : ''

/* --------------------------------- cores --------------------------------- */

/**
 * A cor diz duas coisas: a categoria (trabalha / não trabalha e porquê) e,
 * dentro do trabalho, o período. É o que permite ver um mês inteiro e perceber
 * o padrão sem ler um único código.
 */
export function corDoCodigo(c: Codigo | undefined): string {
  if (!c) return 'bg-slate-50 text-slate-300'
  if (c.categoria === 'trab') {
    switch (periodoDoCodigo(c)) {
      case 'manha': return 'bg-amber-100 text-amber-900'
      case 'meio': return 'bg-lime-100 text-lime-900'
      case 'tarde': return 'bg-sky-100 text-sky-900'
      case 'noite': return 'bg-indigo-200 text-indigo-900'
      default: return 'bg-slate-100 text-slate-700'
    }
  }
  switch (c.categoria) {
    case 'folga': return 'bg-slate-200 text-slate-600'
    case 'ferias': return 'bg-emerald-100 text-emerald-800'
    case 'feriado': return 'bg-violet-100 text-violet-800'
    case 'rec': return 'bg-teal-100 text-teal-800'
    case 'baixa': return 'bg-rose-100 text-rose-800'
    case 'falta': return 'bg-red-200 text-red-900'
    case 'licenca': return 'bg-fuchsia-100 text-fuchsia-800'
    default: return 'bg-slate-100 text-slate-700'
  }
}

export const corDoHotel = (h: Hotel | null) =>
  h === 'G' ? 'bg-brand-100 text-brand-800'
    : h === 'T' ? 'bg-orange-100 text-orange-800'
      : 'bg-slate-100 text-slate-600'

/* --------------------------------- datas --------------------------------- */

export const diasDoMes = (ano: number, mes: number) => new Date(ano, mes, 0).getDate()

export const iso = (ano: number, mes: number, dia: number) =>
  `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`

/** Os dias de um mês, em ISO. */
export function diasDoIntervalo(de: string, ate: string): string[] {
  const out: string[] = []
  const d = new Date(de + 'T12:00:00')
  const fim = new Date(ate + 'T12:00:00')
  while (d <= fim) {
    out.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return out
}

/* ---------------------------------- ler ---------------------------------- */

export async function fetchSeccoes(): Promise<Seccao[]> {
  const { data, error } = await supabase.from('hor_seccoes').select('*').order('ordem')
  if (error) throw error
  return (data ?? []) as Seccao[]
}

export async function fetchCodigos(): Promise<Codigo[]> {
  const { data, error } = await supabase.from('hor_codigos').select('*').order('ordem').limit(2000)
  if (error) throw error
  return (data ?? []) as Codigo[]
}

export async function fetchPessoas(): Promise<Pessoa[]> {
  const { data, error } = await supabase.from('hor_pessoas').select('*').order('ordem').limit(2000)
  if (error) throw error
  return (data ?? []) as Pessoa[]
}

/**
 * Os dias de um intervalo. Um mês de 98 pessoas são ~3 000 linhas e um ano
 * inteiro ~36 000 — o PostgREST não tem tecto configurado, por isso o limite
 * explícito é o que nos protege de pedir a base de dados toda por engano.
 */
export async function fetchDias(de: string, ate: string): Promise<Dia[]> {
  const { data, error } = await supabase
    .from('hor_dias').select('*')
    .gte('data', de).lte('data', ate)
    .limit(60000)
  if (error) throw error
  return (data ?? []) as Dia[]
}

export function mapaDeDias(dias: Dia[]): Map<string, Dia> {
  const m = new Map<string, Dia>()
  for (const d of dias) m.set(chaveDia(d.pessoa_id, d.data), d)
  return m
}

export async function carregarHorarios(de: string, ate: string): Promise<Horarios> {
  const [seccoes, codigos, pessoas, dias] = await Promise.all([
    fetchSeccoes(), fetchCodigos(), fetchPessoas(), fetchDias(de, ate),
  ])
  return { seccoes, codigos, pessoas, dias: mapaDeDias(dias) }
}

/* -------------------------------- escrever -------------------------------- */

export async function guardarDia(
  pessoaId: string, data: string, codigoId: string, nota: string | null, quem: string | null,
) {
  const { error } = await supabase.from('hor_dias').upsert(
    { pessoa_id: pessoaId, data, codigo_id: codigoId, nota: nota || null, atualizado_por: quem },
    { onConflict: 'pessoa_id,data' },
  )
  if (error) throw error
}

export async function apagarDia(pessoaId: string, data: string) {
  const { error } = await supabase.from('hor_dias')
    .delete().eq('pessoa_id', pessoaId).eq('data', data)
  if (error) throw error
}

export async function guardarPessoa(p: Partial<Pessoa>): Promise<Pessoa> {
  const { data, error } = await supabase.from('hor_pessoas')
    .upsert(p).select().single()
  if (error) throw error
  return data as Pessoa
}

export async function guardarCodigo(c: Partial<Codigo>): Promise<Codigo> {
  const { data, error } = await supabase.from('hor_codigos')
    .upsert(c).select().single()
  if (error) throw error
  return data as Codigo
}

export async function guardarSeccao(s: Seccao) {
  const { error } = await supabase.from('hor_seccoes').upsert(s, { onConflict: 'nome' })
  if (error) throw error
}

/* --------------------------------- totais --------------------------------- */

export interface Total {
  pessoa: Pessoa
  dias: number
  horas: number
  noite: number
  /** Dias por categoria. */
  cats: Record<string, number>
  /** Dias de trabalho por período. */
  periodos: Record<string, number>
}

export function totais(
  pessoas: Pessoa[], codigos: Codigo[], dias: Map<string, Dia>, datas: string[],
): Total[] {
  const porId = new Map(codigos.map(c => [c.id, c]))
  return pessoas.map(p => {
    const t: Total = { pessoa: p, dias: 0, horas: 0, noite: 0, cats: {}, periodos: {} }
    for (const d of datas) {
      const reg = dias.get(chaveDia(p.id, d))
      if (!reg) continue
      const c = porId.get(reg.codigo_id)
      if (!c) continue
      t.cats[c.categoria] = (t.cats[c.categoria] ?? 0) + 1
      const h = horasDoCodigo(c)
      if (h > 0) {
        t.dias += 1
        t.horas += h
        t.noite += horasNoiteDoCodigo(c)
        const per = periodoDoCodigo(c)
        t.periodos[per] = (t.periodos[per] ?? 0) + 1
      }
    }
    return t
  })
}

/* ------------------------------- importação ------------------------------- */

/**
 * O resultado de ler um ficheiro ou uma colagem: já normalizado, ainda não
 * gravado. A ideia é mostrar isto ao utilizador antes de tocar na base de
 * dados — um Excel mal colado descobre-se aqui, não depois.
 */
export interface Importacao {
  seccoes: Seccao[]
  codigos: Omit<Codigo, 'id'>[]
  pessoas: { nome: string; seccao: string; lider: boolean; ordem: number }[]
  /** `[nomeSeccao, nomePessoa, data, codigoTexto, descricaoCodigo]` */
  dias: { seccao: string; pessoa: string; data: string; codigo: string; descricao: string }[]
  avisos: string[]
}

const normaliza = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ')

/** Chave de um código: o texto mais as horas. É o que distingue dois `M`. */
const chaveCodigo = (codigo: string, descricao: string, hotel: Hotel | null) =>
  `${normaliza(codigo)}|${normaliza(descricao)}|${hotel ?? ''}`

/** `09h00/17h30`, `9:00-17:30`, `23h00/07h30` → blocos. */
export function lerHoras(texto: string): Bloco[] {
  const partes = texto.split(/\s*\+\s*/)
  const out: Bloco[] = []
  for (const parte of partes) {
    const m = parte.match(/(\d{1,2})\s*[h:.]\s*(\d{2})?\s*[/–-]\s*(\d{1,2})\s*[h:.]\s*(\d{2})?/)
    if (!m) continue
    const a = Number(m[1]) + Number(m[2] ?? 0) / 60
    let b = Number(m[3]) + Number(m[4] ?? 0) / 60
    if (b <= a) b += 24 // passou da meia-noite
    out.push([a, b])
  }
  return out
}

/**
 * Lê o `data.json` (ou o `horarios-2026.html` que o embrulha) exportado da
 * folha de cálculo.
 *
 * O ficheiro guarda os códigos numa lista e cada célula é o *índice* nessa
 * lista — é assim que dois `M` com horas diferentes se mantêm distintos. Essa
 * distinção tem de sobreviver à importação, por isso a chave de um código aqui
 * é o texto **mais** as horas.
 */
export function lerJson(texto: string): Importacao {
  const bruto = extrairJson(texto)
  const d = JSON.parse(bruto) as {
    sections?: string[]
    areaOf?: Record<string, string>
    codes?: { c: string; d?: string; h?: string | null; k?: string; s?: Bloco[] }[]
    people?: { id: string; n: string; sec: string; lead?: boolean; ord?: number }[]
    sched?: Record<string, Record<string, number>>
  }
  const avisos: string[] = []

  const seccoes: Seccao[] = (d.sections ?? []).map((nome, i) => ({
    nome, area: d.areaOf?.[nome] ?? nome, ordem: i,
  }))

  const codigos = (d.codes ?? []).map((c, i) => ({
    codigo: c.c,
    descricao: c.d ?? '',
    hotel: (c.h === 'G' || c.h === 'T' ? c.h : null) as Hotel | null,
    categoria: (c.k && c.k in CATEGORIAS ? c.k : 'outro') as Categoria,
    blocos: (c.s ?? []) as Bloco[],
    area: null,
    ordem: i,
    activo: true,
  }))

  const pessoas = (d.people ?? []).map(p => ({
    nome: p.n, seccao: p.sec, lider: !!p.lead, ordem: p.ord ?? 0,
  }))
  const porIdPessoa = new Map((d.people ?? []).map(p => [p.id, p]))

  const dias: Importacao['dias'] = []
  for (const [pid, mapa] of Object.entries(d.sched ?? {})) {
    const p = porIdPessoa.get(pid)
    if (!p) { avisos.push(`Dias de uma pessoa que não está na lista: ${pid}`); continue }
    for (const [data, idx] of Object.entries(mapa)) {
      const c = codigos[idx]
      if (!c) { avisos.push(`Código desconhecido em ${p.n} / ${data}`); continue }
      dias.push({ seccao: p.sec, pessoa: p.n, data, codigo: c.codigo, descricao: c.descricao })
    }
  }

  if (!dias.length) avisos.push('Não encontrei nenhum dia no ficheiro.')
  return { seccoes, codigos, pessoas, dias, avisos }
}

/**
 * Aceita o JSON directo ou embrulhado no HTML.
 *
 * O ficheiro `horarios-2026.html` guarda os dados num
 * `<script type="application/json" id="data">`, e abaixo dele vem o resto da
 * página — CSS e JavaScript cheios de chaves. Por isso não serve cortar até ao
 * último `}` do ficheiro: conta-se as chaves a partir do início do objecto,
 * ignorando as que estão dentro de texto entre aspas.
 */
function extrairJson(texto: string): string {
  const t = texto.trim()
  if (t.startsWith('{')) return t

  const script = t.match(/<script[^>]*type\s*=\s*["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i)
  if (script) return script[1].trim()

  const atribuicao = t.match(/(?:DATA|dados|data)\s*=\s*(\{)/)
  const inicio = atribuicao
    ? t.indexOf('{', atribuicao.index)
    : t.indexOf('{"year"') >= 0 ? t.indexOf('{"year"') : t.indexOf('{')
  if (inicio < 0) throw new Error('Não encontrei dados neste ficheiro.')

  const fim = fecharChave(t, inicio)
  if (fim < 0) throw new Error('Os dados do ficheiro estão cortados a meio.')
  return t.slice(inicio, fim + 1)
}

/** O índice do `}` que fecha o `{` em `inicio`, saltando o que está entre aspas. */
function fecharChave(t: string, inicio: number): number {
  let nivel = 0
  let emTexto = false
  let escape = false
  for (let i = inicio; i < t.length; i++) {
    const ch = t[i]
    if (emTexto) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') emTexto = false
      continue
    }
    if (ch === '"') emTexto = true
    else if (ch === '{') nivel++
    else if (ch === '}' && --nivel === 0) return i
  }
  return -1
}

/**
 * Lê uma colagem do Excel: uma grelha de um mês.
 *
 * Espera-se a primeira linha com os números dos dias e, abaixo, uma linha por
 * pessoa — nome na primeira coluna, códigos nas seguintes. É exactamente o que
 * sai de um `Ctrl+C` sobre o bloco da folha, e por isso é o caminho mais curto
 * entre o Excel e a app.
 *
 * Os códigos têm de já existir na legenda: a colagem não traz horas, e inventar
 * horas para um código novo seria inventar dados.
 */
export function lerColagem(
  texto: string, seccao: string, ano: number, mes: number, codigos: Codigo[],
): Importacao {
  const avisos: string[] = []
  const linhas = texto.replace(/\r/g, '').split('\n').filter(l => l.trim() !== '')
  if (linhas.length < 2) throw new Error('Cola a grelha com a linha dos dias e pelo menos uma pessoa.')

  const celulas = linhas.map(l => l.split('\t').map(c => c.trim()))
  const nDias = diasDoMes(ano, mes)

  // A linha dos dias é a primeira que tenha 1, 2, 3… em células seguidas.
  let iCab = celulas.findIndex(l => l.filter(c => /^\d{1,2}$/.test(c)).length >= Math.min(5, nDias))
  if (iCab < 0) { iCab = 0; avisos.push('Não reconheci a linha dos dias — assumi a primeira.') }

  const cab = celulas[iCab]
  /** Coluna → dia do mês. */
  const colDia = new Map<number, number>()
  for (let i = 0; i < cab.length; i++) {
    const n = Number(cab[i])
    if (Number.isInteger(n) && n >= 1 && n <= nDias) colDia.set(i, n)
  }
  if (!colDia.size) throw new Error('Não encontrei os números dos dias na primeira linha.')

  const porTexto = new Map<string, Codigo[]>()
  for (const c of codigos) {
    const k = normaliza(c.codigo)
    porTexto.set(k, [...(porTexto.get(k) ?? []), c])
  }

  const pessoas: Importacao['pessoas'] = []
  const dias: Importacao['dias'] = []
  const emFalta = new Set<string>()
  const ambiguos = new Map<string, Codigo[]>()

  for (let i = iCab + 1; i < celulas.length; i++) {
    const linha = celulas[i]
    const nome = (linha[0] ?? '').trim()
    if (!nome || /^total/i.test(nome)) continue
    pessoas.push({ nome, seccao, lider: false, ordem: pessoas.length })
    for (const [col, dia] of colDia) {
      const v = (linha[col] ?? '').trim()
      if (!v) continue
      const achados = porTexto.get(normaliza(v)) ?? []
      if (!achados.length) { emFalta.add(v); continue }
      const c = achados[0]
      if (achados.length > 1) ambiguos.set(v, achados)
      dias.push({ seccao, pessoa: nome, data: iso(ano, mes, dia), codigo: c.codigo, descricao: c.descricao })
    }
  }

  if (emFalta.size) {
    avisos.push(`Códigos que não estão na legenda e ficaram de fora: ${[...emFalta].join(', ')}`)
  }
  /**
   * A colagem traz só o código, e na legenda há códigos repetidos com horas
   * diferentes (`M` às 07h00 e às 06h30). Aqui fica a primeira, mas o aviso
   * nomeia as alternativas: meia hora por dia e por pessoa, ao fim de um mês, é
   * dinheiro, e quem cola é quem sabe qual das duas é a certa.
   */
  for (const [texto, achados] of ambiguos) {
    avisos.push(
      `«${texto}» aparece ${achados.length} vezes na legenda `
      + `(${achados.map(c => blocosTexto(c) || CATEGORIAS[c.categoria]).join(' / ')})`
      + ` — usei ${blocosTexto(achados[0]) || CATEGORIAS[achados[0].categoria]}.`,
    )
  }
  if (!dias.length) avisos.push('Não ficou nenhum dia para gravar.')
  return { seccoes: [], codigos: [], pessoas, dias, avisos }
}

/** O que uma importação vai mudar, antes de mudar. */
export interface Resumo {
  seccoesNovas: number
  codigosNovos: number
  pessoasNovas: number
  dias: number
  pessoas: string[]
  de: string
  ate: string
  avisos: string[]
}

export function resumir(imp: Importacao, existentes: Horarios): Resumo {
  const temSeccao = new Set(existentes.seccoes.map(s => normaliza(s.nome)))
  const temCodigo = new Set(existentes.codigos.map(c => chaveCodigo(c.codigo, c.descricao, c.hotel)))
  const temPessoa = new Set(existentes.pessoas.map(p => `${normaliza(p.seccao)}|${normaliza(p.nome)}`))
  const datas = imp.dias.map(d => d.data).sort()
  return {
    seccoesNovas: imp.seccoes.filter(s => !temSeccao.has(normaliza(s.nome))).length,
    codigosNovos: imp.codigos.filter(c => !temCodigo.has(chaveCodigo(c.codigo, c.descricao, c.hotel))).length,
    pessoasNovas: imp.pessoas.filter(p => !temPessoa.has(`${normaliza(p.seccao)}|${normaliza(p.nome)}`)).length,
    dias: imp.dias.length,
    pessoas: [...new Set(imp.dias.map(d => d.pessoa))],
    de: datas[0] ?? '',
    ate: datas[datas.length - 1] ?? '',
    avisos: imp.avisos,
  }
}

const aosPedacos = <T,>(v: T[], n: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < v.length; i += n) out.push(v.slice(i, i + n))
  return out
}

/**
 * Grava a importação.
 *
 * É propositadamente idempotente: as secções e os códigos casam-se pelo texto
 * (mais as horas, nos códigos), as pessoas pelo nome dentro da secção, e os
 * dias entram por `upsert` na chave `(pessoa, data)`. Importar o mesmo mês duas
 * vezes dá o mesmo resultado que importar uma — e corrigir o Excel e voltar a
 * importar substitui o que estava, em vez de duplicar.
 */
export async function gravarImportacao(
  imp: Importacao, existentes: Horarios, quem: string | null,
  progresso?: (feito: number, total: number) => void,
): Promise<{ dias: number; pessoasNovas: number; codigosNovos: number }> {
  /* secções */
  const temSeccao = new Map(existentes.seccoes.map(s => [normaliza(s.nome), s]))
  const novasSeccoes = imp.seccoes.filter(s => !temSeccao.has(normaliza(s.nome)))
  if (novasSeccoes.length) {
    const { error } = await supabase.from('hor_seccoes').upsert(novasSeccoes, { onConflict: 'nome' })
    if (error) throw error
  }

  /* códigos */
  const porChave = new Map(existentes.codigos.map(c => [chaveCodigo(c.codigo, c.descricao, c.hotel), c]))
  const novosCodigos = imp.codigos.filter(c => !porChave.has(chaveCodigo(c.codigo, c.descricao, c.hotel)))
  if (novosCodigos.length) {
    const { data, error } = await supabase.from('hor_codigos').insert(novosCodigos).select()
    if (error) throw error
    for (const c of (data ?? []) as Codigo[]) {
      porChave.set(chaveCodigo(c.codigo, c.descricao, c.hotel), c)
    }
  }
  /** Também por texto, para os dias que vêm de uma colagem sem horas. */
  const porTexto = new Map<string, Codigo>()
  for (const [k, c] of porChave) porTexto.set(k.split('|')[0], c)

  /* pessoas */
  const porNome = new Map(
    existentes.pessoas.map(p => [`${normaliza(p.seccao)}|${normaliza(p.nome)}`, p]),
  )
  const novasPessoas = imp.pessoas.filter(
    p => !porNome.has(`${normaliza(p.seccao)}|${normaliza(p.nome)}`),
  )
  if (novasPessoas.length) {
    const { data, error } = await supabase.from('hor_pessoas')
      .insert(novasPessoas.map(p => ({ ...p, activo: true }))).select()
    if (error) throw error
    for (const p of (data ?? []) as Pessoa[]) {
      porNome.set(`${normaliza(p.seccao)}|${normaliza(p.nome)}`, p)
    }
  }

  /* dias */
  const linhas: Dia[] = []
  for (const d of imp.dias) {
    const p = porNome.get(`${normaliza(d.seccao)}|${normaliza(d.pessoa)}`)
    const c = porChave.get(chaveCodigo(d.codigo, d.descricao, null))
      ?? porChave.get(chaveCodigo(d.codigo, d.descricao, 'G'))
      ?? porChave.get(chaveCodigo(d.codigo, d.descricao, 'T'))
      ?? porTexto.get(normaliza(d.codigo))
    if (!p || !c) continue
    linhas.push({ pessoa_id: p.id, data: d.data, codigo_id: c.id, nota: null, atualizado_por: quem })
  }

  let feito = 0
  for (const pedaco of aosPedacos(linhas, 500)) {
    const { error } = await supabase.from('hor_dias')
      .upsert(pedaco, { onConflict: 'pessoa_id,data' })
    if (error) throw error
    feito += pedaco.length
    progresso?.(feito, linhas.length)
  }

  return { dias: linhas.length, pessoasNovas: novasPessoas.length, codigosNovos: novosCodigos.length }
}

/* --------------------------------- erros --------------------------------- */

export function mensagemDeErro(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e)
  if (/row-level security|permission denied/i.test(m)) {
    return 'Só o admin e o RH podem alterar horários.'
  }
  if (/hor_dias_codigo_id_fkey/i.test(m)) {
    return 'Esse código de turno já não existe na legenda.'
  }
  if (/duplicate key/i.test(m)) {
    return 'Esse registo já existe.'
  }
  if (/JSON|Unexpected token/i.test(m)) {
    return 'O ficheiro não está no formato esperado — devia ser o data.json ou o horarios-2026.html.'
  }
  return m
}
