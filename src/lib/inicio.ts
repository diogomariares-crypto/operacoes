/**
 * Dados do Início.
 *
 * O Início não inventa números: lê as mesmas tabelas que cada módulo lê, e
 * quando uma delas não tem registos recentes diz isso em vez de mostrar zeros —
 * um zero e uma falta de lançamentos parecem iguais no ecrã e são coisas muito
 * diferentes na operação.
 *
 * Tudo num só carregamento, em paralelo: são consultas pequenas, e assim a
 * página não pisca a encher-se aos pedaços.
 */
import { supabase } from './supabase'
import { addDays, diffDias, hojeLocal } from './format'

/** Um dia da previsão de ocupação. */
export interface DiaOcupacao {
  data: string
  ocupacao: number | null
  quartos: number | null
  tarifa: number | null
  chegadas: number | null
  saidas: number | null
}

/**
 * Uma linha de «Precisa de atenção».
 *
 * `nivel` ordena a lista e escolhe a cor; `crítico` é para o que já falhou,
 * `aviso` para o que está a envelhecer e `ok` para o que está em dia — este
 * último entra porque uma lista que só mostra problemas não diz se o resto
 * está bem ou se apenas ninguém o verificou.
 */
export type Nivel = 'critico' | 'aviso' | 'ok'

export interface Alerta {
  chave: string
  nivel: Nivel
  titulo: string
  detalhe: string
  /** O número à direita. Null quando a linha não é uma contagem. */
  valor: string | null
  /**
   * Para onde a linha leva — e leva ao sítio exato, não ao topo da página onde
   * o sítio fica. A passagem de turno tem doze secções distribuídas por cinco
   * separadores: aterrar lá em cima obrigava a procurar outra vez aquilo que o
   * alerta acabou de dizer. Daí o `#`, que nomeia a secção
   * (`ancora` em src/components/turno-parts.tsx) e a página trata de abrir o
   * separador certo e de a trazer à vista.
   */
  to: string
}

export interface Inicio {
  hoje: DiaOcupacao | null
  previsao: DiaOcupacao[]
  tarifaMedia7: number | null
  /** Null quando o perfil não tem acesso à faturação — não é o mesmo que zero. */
  fb7dias: number | null
  vips: number
  transfers: number
  perdidos: number
  gruposProximos: number
  primeiroGrupo: string | null
  stockUltimaContagem: { data: string; valor: number | null } | null
  /** Null quando o perfil não tem acesso ao pessoal. */
  empregados: number | null
  alertas: Alerta[]
}

/**
 * O que este perfil pode ler.
 *
 * Isto não é decoração: na base de dados, três destas tabelas têm leitura
 * restrita, e uma consulta sem permissão devolve **zero linhas, não um erro**.
 * Sem este filtro, o Início diria «Housekeeping nunca foi lançado» a toda a
 * gente que não trata de housekeeping, e «0 colaboradores» a quem não vê o
 * pessoal. Um número errado é pior do que número nenhum, por isso o que não se
 * pode ler nem se pergunta nem se mostra.
 */
export interface Permissoes {
  /** `hk_dias` exige pode_ver_hk() */
  hk: boolean
  /** `hr_empregados` exige pode_ver_rh() */
  rh: boolean
  /** `fb_billing` exige can_write_dept('FB') ou pode_ver_painel() */
  fb: boolean
}

const num = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v)

export async function carregarInicio(hotelId: string, pode: Permissoes): Promise<Inicio> {
  const hoje = hojeLocal()
  const ha7 = addDays(hoje, -7)
  const daqui30 = addDays(hoje, 30)

  const [
    ocup, manut, pend, perd, recl, vipsR, transfR,
    gruposR, primeiroR, fbR, contagemR, abertasR, hkR, empregadosR,
  ] = await Promise.all([
    // A ocupação é lançada por dia de relatório com uma previsão em `day_offset`,
    // por isso interessa só o relatório mais recente — daí trazer uma janela e
    // escolher em memória, que poupa uma ida ao servidor só para saber a data.
    supabase.from('occupancy')
      .select('report_date, day_offset, occ_pct, occ_rooms, adr, arrivals, departures')
      .eq('hotel_id', hotelId)
      .order('report_date', { ascending: false })
      .order('day_offset', { ascending: true })
      .limit(60),
    supabase.from('maintenance').select('data', { count: 'exact' })
      .eq('hotel_id', hotelId).eq('status', 'por_resolver')
      .order('data', { ascending: true }).limit(1),
    supabase.from('pending_issues').select('id', { count: 'exact', head: true })
      .eq('hotel_id', hotelId).eq('resolvido', false),
    supabase.from('lost_items').select('id', { count: 'exact', head: true })
      .eq('hotel_id', hotelId).eq('resolvido', false),
    supabase.from('complaints').select('created_date', { count: 'exact' })
      .eq('hotel_id', hotelId).eq('status', 'aberta')
      .order('created_date', { ascending: true }).limit(1),
    supabase.from('vips').select('id', { count: 'exact', head: true })
      .eq('hotel_id', hotelId).eq('report_date', hoje),
    supabase.from('transfers').select('id', { count: 'exact', head: true })
      .eq('hotel_id', hotelId).eq('concluido', false).gte('report_date', hoje),
    supabase.from('grupos').select('id', { count: 'exact', head: true })
      .eq('hotel_id', hotelId).gte('chegada', hoje).lte('chegada', daqui30),
    supabase.from('grupos').select('chegada')
      .eq('hotel_id', hotelId).gte('chegada', hoje)
      .order('chegada', { ascending: true }).limit(1),
    pode.fb
      ? supabase.from('fb_billing').select('day_total')
          .eq('hotel_id', hotelId).gte('service_date', ha7).lte('service_date', hoje)
      : Promise.resolve({ data: null, count: null }),
    supabase.from('periods').select('end_date, submitted_at')
      .eq('hotel_id', hotelId).eq('status', 'submetido')
      .order('end_date', { ascending: false }).limit(1),
    supabase.from('periods').select('id', { count: 'exact', head: true })
      .eq('hotel_id', hotelId).neq('status', 'submetido'),
    pode.hk
      ? supabase.from('hk_dias').select('dia')
          .eq('hotel_id', hotelId).order('dia', { ascending: false }).limit(1)
      : Promise.resolve({ data: null, count: null }),
    pode.rh
      ? supabase.from('hr_empregados').select('id', { count: 'exact', head: true })
      : Promise.resolve({ data: null, count: null }),
  ])

  /* ------------------------------ ocupação ------------------------------ */
  const linhas = (ocup.data ?? []) as Record<string, unknown>[]
  const relatorio = linhas.length ? String(linhas[0].report_date) : null
  const previsao: DiaOcupacao[] = linhas
    .filter(r => String(r.report_date) === relatorio && Number(r.day_offset) >= 0)
    .slice(0, 7)
    .map(r => ({
      data: addDays(String(r.report_date), Number(r.day_offset)),
      ocupacao: num(r.occ_pct),
      quartos: num(r.occ_rooms),
      tarifa: num(r.adr),
      chegadas: num(r.arrivals),
      saidas: num(r.departures),
    }))

  const comTarifa = previsao.filter(d => d.tarifa !== null)
  const tarifaMedia7 = comTarifa.length
    ? comTarifa.reduce((a, d) => a + (d.tarifa ?? 0), 0) / comTarifa.length
    : null

  /* -------------------------------- stock ------------------------------- */
  const ultima = (contagemR.data ?? [])[0] as { end_date: string } | undefined

  /* ------------------------------- alertas ------------------------------ */
  const alertas: Alerta[] = []

  // Housekeeping: aqui o que interessa não é o número, é a idade do último
  // lançamento — produção sem registo não se recupera depois. Só entra na lista
  // para quem vê housekeeping: a quem não vê, a consulta devolveria vazio e o
  // alerta seria falso.
  const ultimoHk = ((hkR.data ?? [])[0] as { dia: string } | undefined)?.dia
  const diasHk = ultimoHk ? diffDias(ultimoHk, hoje) : null
  if (pode.hk) {
    if (!ultimoHk) {
      alertas.push({
        chave: 'hk', nivel: 'critico', titulo: 'Housekeeping sem registos',
        detalhe: 'nunca foi lançado nenhum dia', valor: '—', to: '/hk-mes',
      })
    } else if (diasHk !== null && diasHk > 7) {
      alertas.push({
        chave: 'hk', nivel: diasHk > 20 ? 'critico' : 'aviso',
        titulo: 'Housekeeping por lançar',
        detalhe: `último dia registado: ${ultimoHk.split('-').reverse().join('/')}`,
        valor: `${diasHk}d`, to: '/hk-mes',
      })
    }
  }

  const reclamacoes = recl.count ?? 0
  if (reclamacoes > 0) {
    const desde = ((recl.data ?? [])[0] as { created_date: string } | undefined)?.created_date
    alertas.push({
      chave: 'reclamacoes', nivel: 'critico',
      titulo: reclamacoes === 1 ? 'Reclamação aberta' : 'Reclamações abertas',
      detalhe: desde ? `a mais antiga é de ${desde.split('-').reverse().join('/')}` : 'por responder',
      valor: String(reclamacoes), to: '/turno#reclamacoes',
    })
  }

  const manutencoes = manut.count ?? 0
  if (manutencoes > 0) {
    const antiga = ((manut.data ?? [])[0] as { data: string } | undefined)?.data
    const idade = antiga ? diffDias(antiga, hoje) : null
    alertas.push({
      chave: 'manutencao', nivel: idade !== null && idade > 30 ? 'critico' : 'aviso',
      titulo: 'Manutenções por resolver',
      detalhe: idade !== null ? `a mais antiga está aberta há ${idade} dias` : 'em aberto',
      valor: String(manutencoes), to: '/turno#manutencao',
    })
  }

  const pendentes = pend.count ?? 0
  if (pendentes > 0) {
    alertas.push({
      chave: 'pendentes', nivel: 'aviso', titulo: 'Pendentes de turno',
      detalhe: 'passados de um turno para o seguinte',
      valor: String(pendentes), to: '/turno#pendentes',
    })
  }

  const contagensAbertas = abertasR.count ?? 0
  if (contagensAbertas > 0) {
    alertas.push({
      chave: 'contagens', nivel: 'aviso', titulo: 'Contagens por fechar',
      detalhe: 'ficam fora dos totais enquanto não fecharem',
      valor: String(contagensAbertas), to: '/contagem',
    })
  } else if (ultima) {
    const idade = diffDias(ultima.end_date, hoje)
    alertas.push({
      chave: 'contagens', nivel: idade > 10 ? 'aviso' : 'ok',
      titulo: idade > 10 ? 'Contagem a envelhecer' : 'Contagens em dia',
      detalhe: idade === 0 ? 'a última fechou hoje' : `a última é de há ${idade} dias`,
      valor: null, to: '/historico',
    })
  }

  const ordem: Record<Nivel, number> = { critico: 0, aviso: 1, ok: 2 }
  alertas.sort((a, b) => ordem[a.nivel] - ordem[b.nivel])

  /* -------------------------------- f&b --------------------------------- */
  const fb = (fbR.data ?? []) as { day_total: unknown }[]
  const fb7dias = pode.fb && fb.length
    ? fb.reduce((a, r) => a + (num(r.day_total) ?? 0), 0)
    : null

  return {
    hoje: previsao[0] ?? null,
    previsao,
    tarifaMedia7,
    fb7dias,
    vips: vipsR.count ?? 0,
    transfers: transfR.count ?? 0,
    perdidos: perd.count ?? 0,
    gruposProximos: gruposR.count ?? 0,
    primeiroGrupo: ((primeiroR.data ?? [])[0] as { chegada: string } | undefined)?.chegada ?? null,
    stockUltimaContagem: ultima ? { data: ultima.end_date, valor: null } : null,
    empregados: pode.rh ? empregadosR.count ?? 0 : null,
    alertas,
  }
}
