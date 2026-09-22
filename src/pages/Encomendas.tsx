import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../lib/appState'
import { useAuth } from '../lib/auth'
import {
  deletePurchase, fetchPurchases, fetchStock, receivePurchase,
} from '../lib/data'
import type { Department, Purchase, StockRow } from '../lib/types'
import { DEPARTMENTS } from '../lib/types'
import NovaEncomenda from '../components/NovaEncomenda'
import { dmy, downloadCSV, money, qty, todayISO } from '../lib/format'
import { Empty, Loading, Modal, NumInput, Spinner, useToast } from '../components/ui'
import {
  fetchFornecedores, guardarFornecedor, DIAS_SEMANA_CURTOS, type Fornecedor,
} from '../lib/reposicao'

type PurchaseRow = Purchase & {
  items: { id: string; name: string; department: Department; unit: string; unit_price_eur: number | null }
}

export default function Encomendas() {
  const { hotelId, dept, setDept } = useApp()
  const { canWrite, email, isAdmin } = useAuth()
  const toast = useToast()

  const [stock, setStock] = useState<StockRow[]>([])
  const [compras, setCompras] = useState<PurchaseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<'pendentes' | 'historico' | 'fornecedores'>('pendentes')
  const [fornecedores, setFornecedores] = useState<Record<string, Fornecedor>>({})
  const [nova, setNova] = useState(false)
  const [receber, setReceber] = useState<{ p: PurchaseRow; data: string; qty: number } | null>(null)

  const editavel = canWrite(dept)

  const carregar = async () => {
    if (!hotelId) return
    setLoading(true)
    try {
      const [s, c, forn] = await Promise.all([
        fetchStock(hotelId, dept), fetchPurchases(hotelId, dept), fetchFornecedores(),
      ])
      setStock(s)
      setCompras(c)
      setFornecedores(forn)
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally { setLoading(false) }
  }
  useEffect(() => { carregar() }, [hotelId, dept])

  const pendentes = useMemo(() => compras.filter(c => !c.received_date), [compras])
  const recebidas = useMemo(() => compras.filter(c => c.received_date), [compras])


  const marcarRecebida = async () => {
    if (!receber) return
    try {
      await receivePurchase(receber.p.id, receber.data, email, receber.qty)
      toast('Chegada registada')
      setReceber(null)
      carregar()
    } catch (e) { toast((e as Error).message, 'erro') }
  }

  const apagar = async (p: PurchaseRow) => {
    if (!confirm(`Apagar a encomenda de ${qty(p.qty)} ${p.items.unit} de "${p.items.name}"?`)) return
    try { await deletePurchase(p.id); toast('Encomenda apagada'); carregar() }
    catch (e) { toast((e as Error).message, 'erro') }
  }

  if (loading) return <Loading />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {DEPARTMENTS.filter(d => d.value !== 'FB').map(d => (
          <button
            key={d.value}
            onClick={() => setDept(d.value)}
            className={`rounded-lg px-3.5 py-2 text-sm font-medium ${
              dept === d.value ? 'bg-brand-500 text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {d.label}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <button className="btn-ghost" onClick={() => downloadCSV(`encomendas_${dept}.csv`, [
            ['item', 'quantidade', 'unidade', 'valor_eur', 'fornecedor', 'data_encomenda', 'data_chegada', 'nota'],
            ...compras.map(c => [c.items.name, c.qty, c.items.unit, c.amount_paid_eur,
              c.supplier, c.order_date, c.received_date, c.note]),
          ])} disabled={!compras.length}>Exportar</button>
          <button className="btn-primary" disabled={!editavel}
                  onClick={() => setNova(true)}>
            + Encomenda
          </button>
        </div>
      </div>

      {!editavel && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Só podes consultar as encomendas deste departamento.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="card p-3">
          <div className="text-xs text-slate-500">Por chegar</div>
          <div className="text-lg font-semibold tabular-nums">{pendentes.length}</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-slate-500">Valor por chegar</div>
          <div className="text-lg font-semibold tabular-nums">
            {money(pendentes.reduce((s, p) => s + Number(p.amount_paid_eur), 0))}
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {([
          ['pendentes', `Por chegar (${pendentes.length})`],
          ['historico', `Recebidas (${recebidas.length})`],
          ['fornecedores', `Fornecedores (${Object.keys(fornecedores).length})`],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setAba(k)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
              aba === k ? 'bg-slate-800 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === 'fornecedores' && (
        <QuadroFornecedores fornecedores={fornecedores} isAdmin={isAdmin} onMudou={carregar} />
      )}

      {/* ------------------------------ Pendentes ------------------------------ */}
      {aba === 'pendentes' && (
        pendentes.length === 0 ? (
          <Empty>Não há encomendas por chegar.</Empty>
        ) : (
          <div className="space-y-2">
            {pendentes.map(p => (
              <div key={p.id} className="card flex flex-wrap items-center gap-3 border-l-4 border-l-amber-400 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-800">{p.items.name}</div>
                  <div className="text-xs text-slate-500">
                    encomendado a {dmy(p.order_date)}
                    {p.supplier && ` · ${p.supplier}`}
                    {p.note && ` · ${p.note}`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold tabular-nums">{qty(p.qty)} {p.items.unit}</div>
                  <div className="text-xs text-slate-500 tabular-nums">{money(Number(p.amount_paid_eur))}</div>
                </div>
                <button
                  className="btn-primary"
                  disabled={!editavel}
                  onClick={() => setReceber({ p, data: todayISO(), qty: Number(p.qty) })}
                >
                  Chegou
                </button>
                <button className="text-sm text-slate-400 hover:text-red-600 disabled:opacity-40"
                        disabled={!editavel} onClick={() => apagar(p)}>apagar</button>
              </div>
            ))}
          </div>
        )
      )}

      {/* ------------------------------ Histórico ------------------------------ */}
      {aba === 'historico' && (
        recebidas.length === 0 ? (
          <Empty>Ainda não há encomendas recebidas.</Empty>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="th">Item</th>
                  <th className="th text-right">Quantidade</th>
                  <th className="th text-right">Valor</th>
                  <th className="th">Encomendada</th>
                  <th className="th">Chegou</th>
                  <th className="th">Fornecedor</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recebidas.map(p => (
                  <tr key={p.id}>
                    <td className="td font-medium">{p.items.name}</td>
                    <td className="td text-right tabular-nums">{qty(p.qty)} {p.items.unit}</td>
                    <td className="td text-right tabular-nums">{money(Number(p.amount_paid_eur))}</td>
                    <td className="td text-slate-500">{dmy(p.order_date)}</td>
                    <td className="td">{dmy(p.received_date!)}</td>
                    <td className="td text-slate-500">{p.supplier ?? '—'}</td>
                    <td className="td text-right">
                      <button className="text-sm text-slate-400 hover:text-red-600 disabled:opacity-40"
                              disabled={!editavel} onClick={() => apagar(p)}>apagar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      <p className="text-xs text-slate-400">
        As quantidades contam para o consumo na contagem cuja semana inclui a <strong>data de chegada</strong>.
        Enquanto a encomenda estiver por chegar, não entra em nenhum cálculo.
      </p>

      {/* ------------------------------- Modais ------------------------------- */}
      {/* a mesma janela que abre na Contagem, aqui com o artigo por escolher */}
      {nova && hotelId && (
        <NovaEncomenda
          hotelId={hotelId}
          email={email}
          stock={stock}
          // o fornecedor habitual é o da última compra do artigo
          fornecedorDe={id => compras.find(c => c.item_id === id && c.supplier)?.supplier ?? null}
          fornecedores={Object.keys(fornecedores)}
          onFechar={() => setNova(false)}
          onGravada={() => { setNova(false); carregar() }}
        />
      )}

      <Modal open={!!receber} onClose={() => setReceber(null)} title="Registar chegada">
        {receber && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              <strong>{receber.p.items.name}</strong> — encomendado a {dmy(receber.p.order_date)}.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Quantidade recebida</label>
                <NumInput value={receber.qty} onChange={n => setReceber({ ...receber, qty: n })} />
              </div>
              <div>
                <label className="label">Data de chegada *</label>
                <input type="date" className="input" value={receber.data}
                       onChange={e => setReceber({ ...receber, data: e.target.value })} />
              </div>
            </div>
            {receber.qty !== Number(receber.p.qty) && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Recebeste {qty(receber.qty)} em vez dos {qty(receber.p.qty)} encomendados — o registo fica
                com a quantidade que indicares.
              </p>
            )}
            <p className="text-xs text-slate-500">
              A partir desta data, a quantidade passa a contar como entrada na contagem dessa semana.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={() => setReceber(null)}>Cancelar</button>
              <button className="btn-primary" onClick={marcarRecebida}>Confirmar chegada</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

/* ---------------------------------------------------------------- Pares ---- */

/**
 * O par a par com o par: o que está escrito e o que o consumo diz que devia
 * estar. Onde o histórico não chega para propor um número, diz-se porquê —
 * essa lista é o mapa do que falta arrumar na contagem.
 */
function QuadroFornecedores({
  fornecedores, isAdmin, onMudou,
}: {
  fornecedores: Record<string, Fornecedor>
  isAdmin: boolean
  onMudou: () => void
}) {
  const toast = useToast()
  const [aGuardar, setAGuardar] = useState<string | null>(null)
  const lista = useMemo(
    () => Object.values(fornecedores).sort((a, b) => a.nome.localeCompare(b.nome, 'pt')),
    [fornecedores])

  const guardar = async (nome: string, patch: Partial<Fornecedor>) => {
    setAGuardar(nome)
    try { await guardarFornecedor(nome, patch); onMudou() }
    catch (e) { toast((e as Error).message, 'erro') }
    finally { setAGuardar(null) }
  }

  return (
    <div className="card p-4">
      <p className="text-sm text-slate-600">
        O prazo é o que a app assume entre encomendar e receber. Onde há recepções
        registadas que cheguem, o valor foi medido nelas; o resto está por confirmar.
        Se um fornecedor só entrega em certos dias, marca-os — a espera pela próxima
        entrega passa a contar para o par.
        {!isAdmin && (
          <strong className="mt-1 block text-slate-700">
            Estes valores mexem nos pares de todos os artigos do fornecedor, por isso
            só o administrador os altera.
          </strong>
        )}
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="pb-1 font-medium">Fornecedor</th>
              <th className="pb-1 font-medium">Prazo (dias)</th>
              <th className="pb-1 font-medium">Entrega em</th>
              <th className="pb-1 font-medium">Nota</th>
              <th className="w-6 pb-1"></th>
            </tr>
          </thead>
          <tbody>
            {lista.map(f => (
              <tr key={f.nome} className="border-t border-slate-100">
                <td className="py-2 pr-3 font-medium text-slate-700">{f.nome}</td>
                <td className="py-2 pr-3">
                  {isAdmin ? (
                    <NumInput className="w-20 px-2 py-1 text-sm" value={f.prazo_dias}
                              onChange={n => guardar(f.nome, { prazo_dias: n })} />
                  ) : (
                    <span className="tabular-nums text-slate-700">{f.prazo_dias}</span>
                  )}
                </td>
                <td className="py-2 pr-3">
                  <div className="flex flex-wrap gap-1">
                    {DIAS_SEMANA_CURTOS.map((d, i) => {
                      const dia = i + 1
                      const on = f.dias_entrega.includes(dia)
                      return (
                        <button
                          key={d}
                          disabled={!isAdmin}
                          title={on ? 'entrega neste dia' : 'não entrega neste dia'}
                          className={`rounded px-1.5 py-0.5 text-[11px] ${
                            on ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500'
                          } ${isAdmin ? '' : 'cursor-default'}`}
                          onClick={() => guardar(f.nome, {
                            dias_entrega: on
                              ? f.dias_entrega.filter(x => x !== dia)
                              : [...f.dias_entrega, dia].sort((a, b) => a - b),
                          })}
                        >{d}</button>
                      )
                    })}
                  </div>
                  {f.dias_entrega.length === 0 && (
                    <div className="mt-0.5 text-[11px] text-slate-400">qualquer dia</div>
                  )}
                </td>
                <td className="py-2 pr-3 text-xs text-slate-400">{f.nota}</td>
                <td className="py-2">{aGuardar === f.nome && <Spinner className="text-slate-400" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
