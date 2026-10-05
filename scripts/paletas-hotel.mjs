/**
 * Gera e mede uma paleta por hotel.
 *
 * O método: manter a luminosidade do verde actual em cada degrau (50, 100, 200,
 * 500, 600, 700) e rodar o tom. Assim cada hotel pesa o mesmo no ecrã — trocar
 * um verde escuro por um azul claro mudaria a leitura de toda a interface, e não
 * só a cor dela.
 *
 * Depois mede, em vez de confiar no olho, as quatro colisões que importam:
 *
 *  1. o vermelho dos alertas críticos (#991b1b) — se a cor do hotel lhe ficar
 *     perto, um alerta deixa de saltar à vista;
 *  2. o âmbar dos avisos (#a16207) — o mesmo;
 *  3. o vermelho do botão «Apagar» (#dc2626) — se ficarem perto, guardar e
 *     apagar passam a parecer a mesma acção;
 *  4. o cinzento de «desactivado» (#94a3b8) — se ficarem perto, a app parece
 *     avariada.
 *
 * Mais o contraste de texto branco sobre a cor, que é como os botões são feitos.
 * O crivo é ΔE ≥ 15 em OKLab (×100) e contraste ≥ 4.5:1.
 *
 * Correr:  node scripts/paletas-hotel.mjs
 */

/* ------------------------------ cor: as contas ------------------------------ */

const srgbToLin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const linToSrgb = c => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)

const hexToRgb = h => {
  const n = parseInt(h.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => v / 255)
}
const rgbToHex = rgb =>
  '#' + rgb.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255)
    .toString(16).padStart(2, '0')).join('')

function rgbToOklab([r, g, b]) {
  const [R, G, B] = [srgbToLin(r), srgbToLin(g), srgbToLin(b)]
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ]
}

function oklabToRgb([L, a, bb]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3
  const s = (L - 0.0894841775 * a - 1.2914855480 * bb) ** 3
  return [
    linToSrgb(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ]
}

const dentroDoGamut = rgb => rgb.every(v => v >= -0.0015 && v <= 1.0015)

const oklch = hex => {
  const [L, a, b] = rgbToOklab(hexToRgb(hex))
  return { L, C: Math.hypot(a, b), h: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360 }
}

const paraRgb = (L, C, h) =>
  oklabToRgb([L, C * Math.cos(h * Math.PI / 180), C * Math.sin(h * Math.PI / 180)])

/**
 * O croma máximo que o ecrã aguenta nesta luminosidade e neste tom.
 *
 * Sem este travão, metade dos tons sai fora do gamut e o navegador corta-os
 * sozinho — o resultado é uma paleta em que alguns degraus não se distinguem.
 */
function cromaMaximo(L, h) {
  let baixo = 0, alto = 0.4
  for (let i = 0; i < 24; i++) {
    const meio = (baixo + alto) / 2
    if (dentroDoGamut(paraRgb(L, meio, h))) baixo = meio
    else alto = meio
  }
  return baixo
}

const cor = (L, C, h) => rgbToHex(paraRgb(L, Math.min(C, cromaMaximo(L, h)), h))

/** Distância perceptual, na escala ×100 usada pela skill de dataviz. */
const deltaE = (x, y) => {
  const A = rgbToOklab(hexToRgb(x)), B = rgbToOklab(hexToRgb(y))
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]) * 100
}

const lum = hex => {
  const [r, g, b] = hexToRgb(hex).map(srgbToLin)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contraste = (x, y) => {
  const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p)
  return (a + 0.05) / (b + 0.05)
}

/* -------------------------- a estrutura a preservar ------------------------- */

export const VERDE = {
  50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0',
  500: '#1a6b4a', 600: '#15593d', 700: '#114730',
}
const DEGRAUS = Object.keys(VERDE).map(Number)
const ESTRUTURA = Object.fromEntries(DEGRAUS.map(k => [k, oklch(VERDE[k])]))

/**
 * @param tom  graus OKLCH
 * @param forca  1 = o croma do verde actual; >1 mais vivo; e `limite` trava o
 *   croma em absoluto, que é o que faz o Concrete ser cinzento e não azul
 * @param escurecer  desce a luminosidade dos degraus escuros
 */
function paleta(tom, { forca = 1, limite = Infinity, escurecer = 0 } = {}) {
  const out = {}
  for (const k of DEGRAUS) {
    const base = ESTRUTURA[k]
    const claro = k < 500
    /*
     * O travão de croma vale para todos os degraus, claros incluídos. Sem isso,
     * os tons claros do Concrete saíam iguais aos do Gravity — nas
     * luminosidades altas o gamut é tão estreito que dois tons diferentes
     * aterram na mesma cor, e o cinzento deixava de ser cinzento.
     */
    const C = Math.min(base.C * forca, limite)
    out[k] = cor(claro ? base.L : base.L - escurecer, C, tom)
  }
  return out
}

/* ------------------------------- os hotéis --------------------------------- */

const TONS = { gravity: 255, tokyo: 25, teva: 60, concrete: 255 }
const NOMES = {
  gravity: 'Gravity', tokyo: 'Tokyo Hoose',
  teva: 'Casa Teva', concrete: 'Concrete',
}

/*
 * Três níveis, porque a pergunta não é só «que cor» — é «onde».
 *
 *  - identidade: a cor só marca de quem é o ecrã (faixa, nome do hotel,
 *    barras do gráfico). O verde continua a ser a cor de agir, e os alertas
 *    ficam onde estão. Nenhuma colisão possível.
 *  - vivo: a cor do hotel passa a ser a cor da app. É o que se pediu.
 *  - seguro: o mesmo, mas afastado dos alertas à força.
 */
export const PALETAS = {
  identidade: {
    gravity: paleta(255, { forca: 1.5 }),
    tokyo: paleta(25, { forca: 1.6 }),
    teva: paleta(60, { forca: 1.1 }),
    concrete: paleta(255, { limite: 0.022 }),
  },
  vivo: {
    gravity: paleta(255, { forca: 1.5 }),
    tokyo: paleta(25, { forca: 1.6 }),
    teva: paleta(60, { forca: 1.1 }),
    concrete: paleta(255, { limite: 0.022 }),
  },
  seguro: {
    gravity: paleta(255, { forca: 1.5 }),
    tokyo: paleta(25, { forca: 0.7, escurecer: 0.13 }),
    teva: paleta(60, { forca: 0.6, escurecer: 0.13 }),
    concrete: paleta(255, { limite: 0.022, escurecer: 0.02 }),
  },
}

/* --------------------------------- o juízo --------------------------------- */

const CONTRA = [
  ['alerta crítico', '#991b1b'],
  ['alerta aviso', '#a16207'],
  ['botão Apagar', '#dc2626'],
  ['cinzento desactivado', '#94a3b8'],
]
const PISO_DE = 15
const PISO_CT = 4.5

export function medir(hex) {
  const linhas = CONTRA.map(([nome, c]) => ({ nome, de: deltaE(hex, c) }))
  return {
    hex,
    linhas,
    pior: Math.min(...linhas.map(l => l.de)),
    contraste: contraste(hex, '#ffffff'),
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ref = medir(VERDE[500])
  console.log(`Referência — o verde actual ${VERDE[500]}`)
  console.log('   ' + ref.linhas.map(l => `${l.nome} ΔE ${l.de.toFixed(1)}`).join('   '))
  console.log(`   branco sobre a cor ${ref.contraste.toFixed(2)}:1\n`)

  let falhas = 0
  for (const nivel of ['vivo', 'seguro']) {
    console.log(`──────── nível «${nivel}» ────────`)
    for (const id of Object.keys(TONS)) {
      const p = PALETAS[nivel][id]
      const m = medir(p[500])
      const maus = m.linhas.filter(l => l.de < PISO_DE)
      const ctMau = m.contraste < PISO_CT
      if (nivel === 'vivo' && (maus.length || ctMau)) falhas += maus.length + (ctMau ? 1 : 0)
      console.log(`${NOMES[id].padEnd(12)} ${p[500]}  tom ${TONS[id]}°`)
      console.log('   ' + DEGRAUS.map(k => `${k}:${p[k]}`).join(' '))
      console.log('   ' + m.linhas.map(l =>
        `${l.nome} ${l.de.toFixed(1)}${l.de < PISO_DE ? ' ←PERTO' : ''}`).join('   '))
      console.log(`   branco ${m.contraste.toFixed(2)}:1${ctMau ? ' ←FALHA' : ''}`)
    }
    console.log()
  }
  console.log(falhas === 0
    ? '✓ as cores vivas não colidem com nada'
    : `✗ ${falhas} colisão(ões) no nível «vivo» — ver o nível «seguro» ou ficar na identidade`)
}
