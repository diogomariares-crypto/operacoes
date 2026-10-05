import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../lib/appState'
import { fetchPeriods, fetchVCounts } from '../lib/data'
import type { Department, Period, VCount } from '../lib/types'
import { DEPARTMENTS } from '../lib/types'
import { diaDe, dm, dmy, dmyHm, downloadCSV, money, monthLabel, qty } from '../lib/format'
import { Empty, Loading } from '../components/ui'
import { useLembrado } from '../lib/lembrar'

/**
 * Por que é que se pode ordenar por data de fecho: a data de contagem escolhe-se
 * à mão e, se sair errada, a contagem vai para um sítio da lista onde ninguém a
 * procura. A data de fecho é registada pela aplicação e não se pode alterar, por
 * isso é sempre possível voltar a encontrá-la pela ordem em que foi feita.
 */
type Ordem = 'contagem' | 'fecho'

export default function Historico() {
  const { hotelId, hotels } = useApp()
  const [dept, setDept] = useLembrado<Department | ''>('inv.hist.dept', '')
  const [ordem, setOrdem] = useLembrado<Ordem>('inv.hist.ordem', 'contagem')
  const [rows, setRows] = useState<VCount[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    if (!hotelId) return
    setLoading(true)
    Promise.all([
      fetchVCounts({ hotelId, dept: dept || undefined }),
      fetchPeriods(dept || undefined, hotelId),
    ])
      .then(([cs, ps]) => { setRows(cs); setPeriods(ps) })
      .finally(() => setLoading(false))
  }, [hotelId, dept])

  const periodos = useMemo(() => {
    // A lista parte dos períodos e não das linhas de contagem: assim também
    // aparece uma contagem criada por engano que ficou sem nenhuma linha.
    const map = Object.fromEntries(periods.map(p => [p.id, {
      id: p.id,
      label: p.department === 'FB' ? monthLabel(p.label) : `Contagem de ${dmy(p.end_date)}`,
      intervalo: `${dm(p.start_date)} – ${dm(p.end_date)}`,
      dataContagem: p.end_date,
      fecho: p.submitted_at,
      criada: p.created_at,
      dept: p.department,
      linhas: 0, custo: 0, stock: 0,
      quartos: p.occupied_rooms,
      status: p.status as string,
    }]))
    for (const r of rows) {
      const p = map[r.period_id]
      if (!p) continue
      p.linhas++
      p.custo += r.cost_used_eur ?? 0
      p.stock += r.stock_value_eur ?? 0
    }

    const lista = Object.values(map).sort((a, b) => ordem === 'fecho'
      // Sem data de fecho (contagem ainda aberta) fica em cima, que é onde se
      // quer ver o que está a decorrer.
      ? (b.fecho ?? '9999').localeCompare(a.fecho ?? '9999')
      : b.dataContagem.localeCompare(a.dataContagem))

    const q = busca.trim().toLowerCase()
    if (!q) return lista
    // Procura também pelas duas datas, para se poder escrever o dia em que a
    // contagem foi feita mesmo que a data de contagem esteja errada.
    return lista.filter(p => [p.label, p.intervalo, dmyHm(p.fecho), diaDe(p.criada)]
      .join(' ').toLowerCase().includes(q))
  }, [rows, periods, busca, ordem])

  const exportar = () => {
    const hotel = hotels.find(h => h.id === hotelId)?.slug ?? 'hotel'
    const fecho = Object.fromEntries(periods.map(p => [p.id, p.submitted_at]))
    downloadCSV(`inventario_${hotel}${dept ? '_' + dept : ''}.csv`, [
      ['departamento', 'tipo', 'periodo_inicio', 'periodo_fim', 'fechada_em',
       'quartos_ocupados', 'item',
       'referencia', 'categoria', 'fornecedor', 'unidade', 'preco_unitario_eur',
       'inv_inicial', 'recebido_encomendas', 'outras_entradas', 'valor_pago_eur',
       'inv_final', 'quebras',
       'utilizado', 'custo_utilizado_eur', 'valor_stock_eur', 'custo_por_quarto_eur'],
      ...rows.map(r => [
        r.department, r.kind, r.start_date, r.end_date, dmyHm(fecho[r.period_id]),
        r.occupied_rooms, r.item_name,
        r.ref, r.category, r.supplier, r.unit, r.unit_price_eur,
        r.opening_qty, r.received_qty, r.purchased_qty, r.amount_paid_eur,
        r.closing_qty, r.quebras,
        r.used_qty, r.cost_used_eur, r.stock_value_eur, r.cost_per_room_eur,
      ]),
    ])
  }

  if (loading) return <Loading />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Departamento</label>
          <select className="input w-auto" value={dept} onChange={e => setDept(e.target.value as Department | '')}>
            <option value="">Todos</option>
            {DEPARTMENTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Ordenar por</label>
          <select className="input w-auto" value={ordem} onChange={e => setOrdem(e.target.value as Ordem)}>
            <option value="contagem">Data de contagem</option>
            <option value="fecho">Data em que foi fechada</option>
          </select>
        </div>
        <div className="min-w-[180px] flex-1">
          <label className="label">Procurar período</label>
          <input className="input" value={busca} onChange={e => setBusca(e.target.value)}
                 placeholder="Ex: Junho, 25/08… (procura nas duas datas)" />
        </div>
        <button className="btn-ghost" onClick={exportar} disabled={!rows.length}>Exportar CSV</button>
      </div>

      {periodos.length === 0 ? (
        <Empty>Sem períodos registados.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="th">Período</th>
                <th className="th">Dep.</th>
                <th className="th">Fechada em</th>
                <th className="th text-right">Linhas</th>
                <th className="th text-right">Quartos</th>
                <th className="th text-right">Consumo</th>
                <th className="th text-right">Valor em stock</th>
                <th className="th text-right">€/quarto</th>
                <th className="th">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {periodos.map(p => (
                <tr key={p.id}>
                  <td className="td">
                    <div className="font-medium">{p.label}</div>
                    <div className="text-xs text-slate-400">período {p.intervalo}</div>
                  </td>
                  <td className="td">{p.dept}</td>
                  <td className="td whitespace-nowrap">
                    {p.fecho
                      ? <span className="tabular-nums">{dmyHm(p.fecho)}</span>
                      // Há duas contagens antigas fechadas sem o instante registado;
                      // dizer «ainda aberta» nesses casos seria falso.
                      : <span className="text-slate-400">
                          {p.status === 'submetido' ? 'sem registo' : 'ainda aberta'}
                        </span>}
                    <div className="text-xs text-slate-400">criada {diaDe(p.criada)}</div>
                  </td>
                  <td className="td text-right tabular-nums">{p.linhas}</td>
                  <td className="td text-right tabular-nums">{p.quartos ?? '—'}</td>
                  <td className="td text-right tabular-nums">{p.dept === 'FB' ? '—' : money(p.custo)}</td>
                  <td className="td text-right tabular-nums">{money(p.stock)}</td>
                  <td className="td text-right tabular-nums">
                    {p.quartos && p.dept !== 'FB' ? money(p.custo / p.quartos) : '—'}
                  </td>
                  <td className="td">
                    <span className={`chip ${p.status === 'submetido'
                      ? 'bg-brand-100 text-brand-700' : 'bg-amber-100 text-amber-800'}`}>
                      {p.status === 'submetido' ? 'Fechado' : 'Rascunho'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-400">{qty(rows.length)} linhas de contagem carregadas.</p>
    </div>
  )
}
