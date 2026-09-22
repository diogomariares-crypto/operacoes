import { useMemo, useState } from 'react'
import { corrigirArtigo, createPurchase } from '../lib/data'
import type { StockRow } from '../lib/types'
import { money, qty, todayISO } from '../lib/format'
import { Modal, NumInput, useToast } from './ui'

/**
 * A janela de registar uma encomenda — a mesma nas Encomendas e na Contagem.
 *
 * Havia duas maneiras de encomendar, com campos diferentes: a janela das
 * Encomendas (completa, mas longe da contagem) e o quadro «A repor» por baixo
 * da contagem (perto, mas com metade dos campos e uma lógica de sugestões que
 * ninguém percebia bem). Fica uma só janela, aberta de onde der jeito: nas
 * Encomendas escolhe-se o artigo; na Contagem já vem escolhido pela linha.
 *
 * Traz uma coisa que o quadro de baixo tinha e a janela não: guardar no artigo
 * o preço e o fornecedor desta compra. Muitos artigos estão «sem preço», e sem
 * preço não há valor de stock nem custo por quarto — quem encomenda tem a
 * fatura à frente e é o melhor momento para o dizer uma vez por todas.
 */
export default function NovaEncomenda({
  hotelId, email, stock, itemInicial, fornecedorDe, fornecedores, onFechar, onGravada,
}: {
  hotelId: string
  email: string | null
  /** Os artigos que se podem encomendar, com o stock de cada um. */
  stock: StockRow[]
  /** Vindo da contagem, o artigo já vem escolhido. */
  itemInicial?: string
  /** O fornecedor habitual do artigo, se se souber. */
  fornecedorDe?: (itemId: string) => string | null
  /** Nomes conhecidos, para sugerir enquanto se escreve. */
  fornecedores?: string[]
  onFechar: () => void
  onGravada: () => void
}) {
  const toast = useToast()

  // a quantidade sugerida é o que falta para o par, contando com o que já vem
  // a caminho — a mesma conta que as Encomendas sempre fizeram
  const sugerida = (s?: StockRow) => {
    if (!s || s.par_qty == null) return 0
    return Math.max(0, Math.ceil(s.par_qty - (s.stock_atual ?? 0) - s.por_chegar))
  }
  const estimar = (s: StockRow | undefined, q: number) =>
    s?.unit_price_eur != null ? Number((q * s.unit_price_eur).toFixed(2)) : 0

  const inicial = stock.find(s => s.item_id === itemInicial)
  const [itemId, setItemId] = useState(itemInicial ?? '')
  const [quantidade, setQuantidade] = useState(sugerida(inicial))
  const [valor, setValor] = useState(estimar(inicial, sugerida(inicial)))
  // enquanto ninguém mexer no valor, ele acompanha a quantidade
  const [valorAMao, setValorAMao] = useState(false)
  const [data, setData] = useState(todayISO())
  const [fornecedor, setFornecedor] = useState(
    (itemInicial && fornecedorDe?.(itemInicial)) || '')
  const [nota, setNota] = useState('')
  const [aGravar, setAGravar] = useState(false)

  const item = useMemo(() => stock.find(s => s.item_id === itemId), [stock, itemId])
  const habitual = itemId ? (fornecedorDe?.(itemId) ?? null) : null

  // por omissão guarda-se no artigo o que ele ainda não sabe; um preço que já lá
  // está não se substitui em silêncio
  const [guardar, setGuardar] = useState<boolean | null>(null)
  const guardarEfectivo = guardar ?? (!!item && (item.unit_price_eur == null || !habitual))

  const escolherItem = (id: string) => {
    const s = stock.find(x => x.item_id === id)
    const q = sugerida(s)
    setItemId(id)
    setQuantidade(q)
    setValor(estimar(s, q))
    setValorAMao(false)
    setFornecedor(fornecedorDe?.(id) ?? '')
    setGuardar(null)
  }

  const gravar = async () => {
    if (!item) { toast('Escolhe o artigo', 'erro'); return }
    if (quantidade <= 0) { toast('Indica uma quantidade', 'erro'); return }
    setAGravar(true)
    try {
      await createPurchase({
        hotel_id: hotelId,
        item_id: item.item_id,
        qty: quantidade,
        amount_paid_eur: valor,
        order_date: data,
        supplier: fornecedor.trim() || null,
        note: nota.trim() || null,
        created_by: email,
      })

      if (guardarEfectivo) {
        const patch: { unit_price_eur?: number; supplier?: string } = {}
        if (valor > 0) patch.unit_price_eur = Number((valor / quantidade).toFixed(4))
        if (fornecedor.trim() && fornecedor.trim() !== habitual) patch.supplier = fornecedor.trim()
        if (Object.keys(patch).length) {
          await corrigirArtigo(item.item_id, patch).catch(e =>
            // a encomenda já ficou; isto é um extra e não a desfaz
            toast(`Encomenda registada, mas o artigo não foi corrigido: ${(e as Error).message}`, 'erro'))
        }
      }

      toast(`${item.item_name}: ${qty(quantidade)} ${item.unit} encomendados`)
      onGravada()
    } catch (e) {
      toast((e as Error).message, 'erro')
      setAGravar(false)
    }
  }

  return (
    <Modal open onClose={onFechar} title="Nova encomenda">
      <div className="space-y-3">
        {/* vindo da contagem mostra-se o artigo; se por acaso não estiver na
            lista do stock (acabado de criar), cai para a escolha normal */}
        {itemInicial && item ? (
          <div>
            <div className="text-base font-semibold">{item?.item_name ?? '—'}</div>
            <div className="text-xs text-slate-500">
              {item?.unit_price_eur != null ? `${money(item.unit_price_eur)} / ${item.unit}` : 'sem preço'}
              {habitual ? ` · ${habitual}` : ' · sem fornecedor'}
            </div>
          </div>
        ) : (
          <div>
            <label className="label">Artigo *</label>
            <select className="input" value={itemId} onChange={e => escolherItem(e.target.value)}>
              <option value="">— escolher —</option>
              {stock.map(s => <option key={s.item_id} value={s.item_id}>{s.item_name}</option>)}
            </select>
          </div>
        )}

        {item && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Stock actual: {qty(item.stock_atual ?? 0)} {item.unit}
            {item.par_qty != null && ` · par: ${qty(item.par_qty)}`}
            {item.por_chegar > 0 && ` · já por chegar: ${qty(item.por_chegar)}`}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Quantidade *</label>
            <NumInput value={quantidade} autoFocus={!!itemInicial} onChange={n => {
              const q = Math.max(0, n)
              setQuantidade(q)
              if (!valorAMao) setValor(estimar(item, q))
            }} />
          </div>
          <div>
            <label className="label">Valor total (€)</label>
            <NumInput value={valor} placeholder="0,00"
                      onChange={n => { setValor(Math.max(0, n)); setValorAMao(true) }} />
          </div>
          <div>
            <label className="label">Data da encomenda</label>
            <input type="date" className="input" value={data}
                   onChange={e => setData(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Fornecedor</label>
            <input className="input" list="fornecedores-encomenda" value={fornecedor}
                   placeholder="sem fornecedor"
                   onChange={e => setFornecedor(e.target.value)} />
            <datalist id="fornecedores-encomenda">
              {(fornecedores ?? []).map(n => <option key={n} value={n} />)}
            </datalist>
          </div>
          <div>
            <label className="label">Nota</label>
            <input className="input" value={nota} onChange={e => setNota(e.target.value)} />
          </div>
        </div>

        {item && (valor > 0 || fornecedor.trim()) && (
          <label className="flex items-start gap-2 text-sm text-slate-600">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#1a6b4a]"
                   checked={guardarEfectivo} onChange={e => setGuardar(e.target.checked)} />
            <span>
              Guardar no artigo
              {valor > 0 && quantidade > 0 && <> o preço ({money(valor / quantidade)}/{item.unit})</>}
              {valor > 0 && quantidade > 0 && fornecedor.trim() && ' e'}
              {fornecedor.trim() && <> o fornecedor</>}
              <span className="block text-xs text-slate-400">
                {item.unit_price_eur == null
                  ? 'Este artigo ainda não tem preço — sem ele não entra no valor do stock nem no custo por quarto.'
                  : 'Substitui o preço que o artigo tem agora.'}
              </span>
            </span>
          </label>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onFechar}>Cancelar</button>
          <button className="btn-primary" onClick={gravar} disabled={!item || aGravar}>
            {aGravar ? 'A registar…' : 'Registar encomenda'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
