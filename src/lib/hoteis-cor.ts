/**
 * A cor de cada hotel.
 *
 * Serve uma pergunta prática: «em que hotel é que eu estou?». Com quatro casas
 * no mesmo ecrã e o mesmo desenho em todas, lançar a contagem do Tokyo no
 * Gravity é um erro que acontece — e que só se descobre depois.
 *
 * ## Onde a cor entra, e onde não entra
 *
 * Entra em três sítios, todos eles de identidade: a faixa sob o cabeçalho, o
 * nome do hotel e as barras do gráfico de ocupação.
 *
 * **Não** entra em nada que signifique estado.** O verde continua a ser a cor de
 * agir (botões, focos, «está em dia»), o vermelho continua a ser o alerta
 * crítico e o âmbar o aviso. A razão é medida, não estética: o vermelho vivo do
 * Tokyo fica a ΔE 3,1 do vermelho dos alertas — são praticamente a mesma cor — e
 * o castanho da Casa Teva a ΔE 9 do âmbar dos avisos. Pintar a app toda punha o
 * botão «Guardar» na família do «Apagar» e punha o visto de «está tudo bem» a
 * vermelho. As contas estão em scripts/paletas-hotel.mjs, que se pode correr.
 *
 * Por isso: ao acrescentar um sítio onde a cor do hotel apareça, confirmar que
 * nada ali quer dizer bem/mal/urgente. Se quiser dizer, usa-se `brand` e não
 * `hotel`.
 *
 * ## Como as cores foram escolhidas
 *
 * Mantendo a luminosidade do verde da casa em cada degrau e rodando só o tom,
 * para que todos os hotéis pesem o mesmo no ecrã. Um azul mais claro que o
 * verde mudaria a leitura de toda a interface e não só a sua cor.
 */

export interface Paleta {
  50: string; 100: string; 200: string
  500: string; 600: string; 700: string
}

const DEGRAUS = [50, 100, 200, 500, 600, 700] as const

/** O verde da casa — o recurso para qualquer hotel que não esteja na lista. */
export const VERDE: Paleta = {
  50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0',
  500: '#1a6b4a', 600: '#15593d', 700: '#114730',
}

/**
 * As quatro casas.
 *
 * `id` é o da base de dados e é o que decide; `pista` é a rede de segurança
 * para quando o hotel for renomeado ou entrar um novo registo — procura-se no
 * nome, em minúsculas e sem acentos. Um hotel que não bata em nenhum dos dois
 * fica com o verde, que é um resultado correcto e não uma falha.
 */
const CASAS: { id: string; pista: string; nome: string; cor: Paleta }[] = [
  {
    id: '844fc22d-8444-42f1-9db1-4a9acfee0ceb', pista: 'gravity', nome: 'Gravity',
    cor: { 50: '#f4f9ff', 100: '#e4f0ff', 200: '#cbe2ff',
           500: '#155aa7', 600: '#114b8c', 700: '#0d3c70' },
  },
  {
    id: 'c46fa6f9-eee9-4246-9515-d05a3be0be57', pista: 'tokyo', nome: 'Tokyo Hoose',
    cor: { 50: '#fff6f5', 100: '#ffe9e6', 200: '#ffd4cf',
           500: '#9e2d2d', 600: '#842424', 700: '#6a1d1c' },
  },
  {
    id: 'df3b8701-6a87-4ca4-b50e-7c5a1ff5523f', pista: 'teva', nome: 'Casa Teva',
    cor: { 50: '#fff6ef', 100: '#ffeada', 200: '#ffd7b7',
           500: '#844b10', 600: '#6e3e0c', 700: '#58310a' },
  },
  {
    id: 'e69f6299-4d2b-4054-ad75-92481edfa830', pista: 'concrete', nome: 'Concrete',
    cor: { 50: '#f4f9ff', 100: '#e5f0fe', 200: '#d6e1ee',
           500: '#535c68', 600: '#444c58', 700: '#343d48' },
  },
]

const semAcentos = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** A paleta de um hotel: pelo id, senão pelo nome, senão o verde da casa. */
export function corDoHotel(id: string | null, nome?: string | null): Paleta {
  if (id) {
    const porId = CASAS.find(c => c.id === id)
    if (porId) return porId.cor
  }
  if (nome) {
    const n = semAcentos(nome)
    const porNome = CASAS.find(c => n.includes(c.pista))
    if (porNome) return porNome.cor
  }
  return VERDE
}

/**
 * Põe a paleta no `:root`, de onde o Tailwind a lê.
 *
 * Funciona porque o Tailwind v4 compila `bg-hotel-500` para
 * `var(--color-hotel-500)` — mudar a variável repinta tudo o que a usa, sem a
 * app ter de voltar a desenhar nada nem cada página ter de saber do assunto.
 */
export function aplicarCorDoHotel(id: string | null, nome?: string | null) {
  const p = corDoHotel(id, nome)
  const raiz = document.documentElement
  for (const k of DEGRAUS) raiz.style.setProperty(`--color-hotel-${k}`, p[k])
}
