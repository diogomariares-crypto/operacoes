import { useEffect, useMemo, useState } from 'react'
import { corrigirArtigo, createPurchase, fetchStock } from '../lib/data'
import type { Department, Item, StockRow } from '../lib/types'
import {
  analisar, cobertura, fetchConsumo, fetchFornecedores,
  type Analise, type Consumo, type Fornecedor,
} from '../lib/reposicao'
import { money, qty, todayISO } from '../lib/format'
import { Spinner, useToast } from './ui'

type Linha = {
  s: StockRow
  item: Item | undefined
  a: Analise
  alvo: number | null
  sugerido: number
}

/**
 * O que falta repor, logo a seguir à contagem — porque é aí que se sabe o que
 * há, e é aí que apetece encomendar. Antes era preciso ir a outro separador
 * procurar os mesmos artigos outra vez.
 */
export default function ARepor({
  dept, hotelId, editavel, itens, email, aoEncomendar,
}: {
  dept: Department
  hotelId: string
  editavel: boolean
  itens: Item[]
  email: string | null
  aoEncomendar?: () => void
}) {
  const toast = useToast()
  const [stock, setStock] = useState<StockRow[]>([])
  const [consumo, setConsumo] = useState<Record<string, Consumo>>({})
  const [fornecedores, setFornecedores] = useState<Record<string, Fornecedor>>({})
  const [loading, setLoading] = useState(true)
  const [quantidades, setQuantidades] = useState<Record<string, number>>({})
  const [aEnviar, setAEnviar] = useState<string | null>(null)
  const [tudo, setTudo] = useState(false)
  /**
   * O que se escreveu à mão no valor e no fornecedor desta encomenda. Fica
   * fora das linhas para uma recarga do stock não apagar o que se escreveu.
   */
  const [valores, setValores] = useState<Record<string, number>>({})
  const [forns, setForns] = useState<Record<string, string>>({})
  const [guardarNoArtigo, setGuardarNoArtigo] = useState<Record<string, boolean>>({})

  const carregar = () => {
    setLoading(true)
    Promise.all([fetchStock(hotelId, dept), fetchConsumo(hotelId, dept), fetchFornecedores()])
      .then(([s, c, f]) => { setStock(s); setConsumo(c); setFornecedores(f) })
      .catch(e => toast((e as Error).message, 'erro'))
      .finally(() => setLoading(false))
  }
  useEffect(carregar, [hotelId, dept])

  const porItem = useMemo(
    () => Object.fromEntries(itens.map(i => [i.id, i])), [itens])

  const linhas: Linha[] = useMemo(() => {
    return stock.map(s => {
      const item = porItem[s.item_id]
      const a = analisar({
        stock: s.stock_atual,
        consumo: consumo[s.item_id],
        fornecedor: item?.supplier ? fornecedores[item.supplier] : undefined,
        frequencia: s.count_frequency,
      })
      // o par escrito à mão manda; o calculado só entra onde não há nenhum
      const alvo = s.par_qty ?? a.par
      const sugerido = alvo == null
        ? 0
        : Math.max(0, Math.ceil(alvo - (s.stock_atual ?? 0) - s.por_chegar))
      return { s, item, a, alvo, sugerido }
    })
  }, [stock, consumo, fornecedores, porItem])

  /** Primeiro o que fica sem produto antes de a encomenda chegar. */
  const aRepor = useMemo(() => {
    const relevantes = linhas.filter(l => l.sugerido > 0 || l.a.ruptura)
    return relevantes.sort((x, y) => {
      if (x.a.ruptura !== y.a.ruptura) return x.a.ruptura ? -1 : 1
      const cx = x.a.cobertura ?? Infinity, cy = y.a.cobertura ?? Infinity
      if (cx !== cy) return cx - cy
      return y.sugerido - x.sugerido
    })
  }, [linhas])

  const visiveis = tudo ? aRepor : aRepor.slice(0, 12)
  const emRuptura = aRepor.filter(l => l.a.ruptura).length

  /** O valor a pagar: o que se escreveu, ou a estimativa pelo preço do artigo. */
  const valorDe = (l: Linha, q: number) =>
    valores[l.s.item_id] ?? Number((q * (l.s.unit_price_eur ?? 0)).toFixed(2))

  const fornecedorDe = (l: Linha) => forns[l.s.item_id] ?? l.item?.supplier ?? ''

  /** Por omissão, guarda no artigo o que o artigo ainda não sabe. */
  const guardaDe = (l: Linha) =>
    guardarNoArtigo[l.s.item_id]
    ?? (l.s.unit_price_eur == null || !l.item?.supplier)

  const encomendar = async (l: Linha) => {
    const q = quantidades[l.s.item_id] ?? l.sugerido
    if (q <= 0) return
    const valor = valorDe(l, q)
    const fornecedor = fornecedorDe(l).trim()
    setAEnviar(l.s.item_id)
    try {
      await createPurchase({
        hotel_id: hotelId,
        item_id: l.s.item_id,
        qty: q,
        amount_paid_eur: valor,
        order_date: todayISO(),
        supplier: fornecedor || null,
        note: 'a repor, a partir da contagem',
        created_by: email,
      })

      // o que se aprendeu com esta encomenda fica no artigo, se for pedido
      if (guardaDe(l)) {
        const patch: { unit_price_eur?: number; supplier?: string | null } = {}
        if (valor > 0 && q > 0) patch.unit_price_eur = Number((valor / q).toFixed(4))
        if (fornecedor && fornecedor !== l.item?.supplier) patch.supplier = fornecedor
        if (Object.keys(patch).length) {
          await corrigirArtigo(l.s.item_id, patch).catch(e =>
            // a encomenda já ficou registada; isto é um extra e não a desfaz
            toast(`Encomenda registada, mas o artigo não foi corrigido: ${(e as Error).message}`, 'erro'))
        }
      }

      toast(`${l.s.item_name}: ${qty(q)} encomendados`)
      setQuantidades(x => ({ ...x, [l.s.item_id]: 0 }))
      setValores(x => { const y = { ...x }; delete y[l.s.item_id]; return y })
      setForns(x => { const y = { ...x }; delete y[l.s.item_id]; return y })
      carregar()
      aoEncomendar?.()
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally { setAEnviar(null) }
  }

  if (loading) {
    return (
      <div className="card flex items-center gap-2 p-4 text-sm text-slate-500">
        <Spinner /> a ver o que falta repor…
      </div>
    )
  }

  // depois de valorDe existir, o total é a soma do que se vai mesmo pagar
  const valor = aRepor.reduce(
    (t, l) => t + valorDe(l, quantidades[l.s.item_id] ?? l.sugerido), 0)
  const semPreco = aRepor.filter(
    l => valorDe(l, quantidades[l.s.item_id] ?? l.sugerido) === 0).length

  if (aRepor.length === 0) {
    return (
      <div className="card p-4 text-sm text-slate-500">
        Nada a repor com o stock actual.
      </div>
    )
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700">
          A repor · {aRepor.length}
          {emRuptura > 0 && (
            <span className="ml-2 chip bg-red-100 text-red-700">
              {emRuptura} {emRuptura === 1 ? 'acaba' : 'acabam'} antes de chegar
            </span>
          )}
        </h3>
        <span className="text-xs tabular-nums text-slate-500">
          {money(valor)} se encomendares tudo
          {semPreco > 0 && (
            <span className="ml-1 text-amber-700">· {semPreco} sem valor</span>
          )}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-slate-400">
        Ordenado pelo que se esgota primeiro. A cobertura é o tempo que o stock
        actual aguenta ao ritmo a que se tem gasto.
      </p>

      <div className="mt-3 space-y-1.5">
        {visiveis.map(l => {
          const q = quantidades[l.s.item_id] ?? l.sugerido
          return (
            <LinhaRepor
              key={l.s.item_id}
              l={l}
              editavel={editavel}
              aEnviar={aEnviar === l.s.item_id}
              quantidade={q}
              valor={valorDe(l, q)}
              fornecedor={fornecedorDe(l)}
              guardar={guardaDe(l)}
              onQuantidade={n => setQuantidades(x => ({ ...x, [l.s.item_id]: n }))}
              onValor={n => setValores(x => ({ ...x, [l.s.item_id]: n }))}
              onFornecedor={v => setForns(x => ({ ...x, [l.s.item_id]: v }))}
              onGuardar={v => setGuardarNoArtigo(x => ({ ...x, [l.s.item_id]: v }))}
              onEncomendar={() => encomendar(l)}
            />
          )
        })}
      </div>
      <datalist id="fornecedores-repor">
        {Object.keys(fornecedores).map(n => <option key={n} value={n} />)}
      </datalist>

      {aRepor.length > 12 && (
        <button className="mt-3 text-sm text-brand-700 hover:underline"
                onClick={() => setTudo(t => !t)}>
          {tudo ? 'Mostrar só os 12 mais urgentes' : `Ver os outros ${aRepor.length - 12}`}
        </button>
      )}
    </div>
  )
}

function LinhaRepor({
  l, editavel, quantidade, valor, fornecedor, guardar, aEnviar,
  onQuantidade, onValor, onFornecedor, onGuardar, onEncomendar,
}: {
  l: Linha
  editavel: boolean
  quantidade: number
  valor: number
  fornecedor: string
  guardar: boolean
  aEnviar: boolean
  onQuantidade: (n: number) => void
  onValor: (n: number) => void
  onFornecedor: (v: string) => void
  onGuardar: (v: boolean) => void
  onEncomendar: () => void
}) {
  const { s, a, alvo } = l
  const calculado = s.par_qty == null && a.par != null
  const novidade = s.unit_price_eur == null || !l.item?.supplier

  return (
    <div className={`rounded-lg border p-2.5 ${
      a.ruptura ? 'border-red-200 bg-red-50/60' : 'border-slate-200'}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="min-w-[160px] flex-1">
          <div className="text-sm font-medium text-slate-800">{s.item_name}</div>
          <div className="text-[11px] text-slate-400">
            {l.item?.supplier || 'sem fornecedor'} · entrega em {a.prazo} dias
          </div>
        </div>

        <div className="w-24 text-right">
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Stock</div>
          <div className="text-sm tabular-nums text-slate-700">
            {qty(s.stock_atual ?? 0)} {s.unit}
            {s.por_chegar > 0 && (
              <span className="ml-1 text-[11px] text-brand-600">+{qty(s.por_chegar)}</span>
            )}
          </div>
        </div>

        <div className="w-28 text-right">
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Dura</div>
          <div className={`text-sm ${a.ruptura ? 'font-semibold text-red-600' : 'text-slate-700'}`}>
            {cobertura(a.cobertura)}
          </div>
        </div>

        <div className="w-24 text-right">
          <div className="text-[10px] uppercase tracking-wide text-slate-400">
            Par {calculado && <span className="text-brand-600">calc.</span>}
          </div>
          <div className="text-sm tabular-nums text-slate-700">
            {alvo == null ? '—' : qty(alvo)}
          </div>
        </div>

        {editavel && (
          <div className="flex items-end gap-1.5">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Encomendar</div>
              <input
                inputMode="decimal"
                className="input w-20 px-2 py-1 text-right text-sm tabular-nums"
                value={quantidade === 0 ? '' : String(quantidade).replace('.', ',')}
                onChange={e => {
                  const n = Number(e.target.value.replace(',', '.').replace(/[^0-9.]/g, ''))
                  onQuantidade(Number.isFinite(n) ? n : 0)
                }}
              />
            </div>
            <button
              className="btn-primary px-3 py-1.5 text-sm disabled:opacity-40"
              disabled={quantidade <= 0 || aEnviar}
              onClick={onEncomendar}
            >
              {aEnviar ? '…' : 'Encomendar'}
            </button>
          </div>
        )}
      </div>

      {/*
        Valor e fornecedor da encomenda, ao lado da quantidade. Antes vinham do
        artigo e não se podiam tocar aqui: metade dos artigos está «sem preço»,
        e uma encomenda a 0,00 € que ninguém pode corrigir sem ir a outro
        separador é uma encomenda que fica errada.
      */}
      {editavel && quantidade > 0 && (
        <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-2 border-t border-slate-200/70 pt-2">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400">Valor total €</div>
            <input
              inputMode="decimal"
              className="input w-24 px-2 py-1 text-right text-sm tabular-nums"
              placeholder="0,00"
              value={valor === 0 ? '' : String(valor).replace('.', ',')}
              onChange={e => {
                const n = Number(e.target.value.replace(',', '.').replace(/[^0-9.]/g, ''))
                onValor(Number.isFinite(n) ? n : 0)
              }}
            />
          </div>

          <div className="min-w-[150px] flex-1">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">Fornecedor</div>
            <input
              className="input w-full px-2 py-1 text-sm"
              list="fornecedores-repor"
              placeholder="sem fornecedor"
              value={fornecedor}
              onChange={e => onFornecedor(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-1.5 pb-1 text-[11px] text-slate-600">
            <input type="checkbox" className="h-3.5 w-3.5 accent-[#1a6b4a]"
                   checked={guardar} onChange={e => onGuardar(e.target.checked)} />
            guardar no artigo
            {valor > 0 && quantidade > 0 && (
              <span className="text-slate-400">
                ({money(valor / quantidade)}/{s.unit})
              </span>
            )}
          </label>
        </div>
      )}

      {editavel && quantidade > 0 && novidade && guardar && (
        <p className="mt-1 text-[11px] text-slate-500">
          Este artigo ainda não tem {s.unit_price_eur == null ? 'preço' : ''}
          {s.unit_price_eur == null && !l.item?.supplier ? ' nem ' : ''}
          {!l.item?.supplier ? 'fornecedor' : ''} — ao encomendar, fica com o que
          escreveres aqui e o valor do stock passa a contar com ele.
        </p>
      )}

      {(a.ruptura || a.confianca !== 'boa') && (
        <p className="mt-1.5 text-[11px] text-slate-500">
          {a.ruptura && (
            <span className="font-medium text-red-600">
              O stock acaba em {cobertura(a.cobertura)} e a entrega demora {a.prazo} dias.{' '}
            </span>
          )}
          {a.confianca !== 'boa' && <>Sem par calculado: {a.porque}.</>}
        </p>
      )}
    </div>
  )
}
