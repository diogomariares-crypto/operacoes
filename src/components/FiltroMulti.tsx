import { useEffect, useRef, useState } from 'react'

/**
 * Filtro de várias escolhas: um botão que abre uma lista de caixas.
 *
 * Um `select` normal só deixa escolher uma coisa, e a pergunta real quase nunca
 * é «o Gravity» — é «o Gravity e o Tokyo», ou «quem está de baixa ou de férias».
 * Com um só valor, isso obrigava a olhar duas vezes e a somar de cabeça.
 *
 * Lista vazia significa «todos», e não «nenhum»: um filtro em branco não pode
 * esconder tudo, senão quem destapa a última caixa fica com um ecrã vazio sem
 * entender porquê.
 */
export interface Opcao {
  v: string
  rot: string
}

export default function FiltroMulti({
  todos, opcoes, valor, onMudar, largura = 'w-auto',
}: {
  /** O que se lê quando nada está escolhido: «Todos os hotéis». */
  todos: string
  opcoes: Opcao[]
  valor: string[]
  onMudar: (v: string[]) => void
  largura?: string
}) {
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)

  // fechar ao clicar fora ou com Escape, como qualquer menu
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false)
    }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', tecla)
    }
  }, [aberto])

  const alternar = (v: string) =>
    onMudar(valor.includes(v) ? valor.filter(x => x !== v) : [...valor, v])

  // com uma escolha diz-se qual; com várias, quantas — o nome de três hotéis
  // não cabe num botão e «2 escolhidos» não diz nada a ninguém
  const etiqueta = valor.length === 0
    ? todos
    : valor.length === 1
      ? (opcoes.find(o => o.v === valor[0])?.rot ?? todos)
      : `${valor.length} de ${opcoes.length}`

  return (
    <div className={`relative ${largura}`} ref={caixa}>
      <button
        type="button"
        onClick={() => setAberto(a => !a)}
        className={`input flex w-full items-center gap-1.5 text-left ${
          valor.length ? 'border-brand-300 bg-brand-50/60 text-brand-900' : ''}`}
        title={valor.length > 1
          ? valor.map(v => opcoes.find(o => o.v === v)?.rot ?? v).join(', ')
          : undefined}
      >
        <span className="min-w-0 flex-1 truncate">{etiqueta}</span>
        <span className="shrink-0 text-xs text-slate-400">▾</span>
      </button>

      {aberto && (
        <div className="absolute left-0 z-30 mt-1 max-h-72 min-w-[220px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          <button
            type="button"
            className={`block w-full rounded-lg px-2 py-1.5 text-left text-sm ${
              valor.length === 0 ? 'font-medium text-brand-700' : 'text-slate-600 hover:bg-slate-50'}`}
            onClick={() => onMudar([])}
          >
            {todos}
          </button>
          <div className="my-1 border-t border-slate-100" />
          {opcoes.map(o => (
            <label key={o.v}
                   className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
              <input type="checkbox" className="h-4 w-4 accent-[#1a6b4a]"
                     checked={valor.includes(o.v)} onChange={() => alternar(o.v)} />
              <span className="min-w-0 flex-1 truncate">{o.rot}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
