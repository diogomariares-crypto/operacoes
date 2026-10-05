/**
 * Confronta os links do Início com as secções que existem de facto.
 *
 * Um link para `/turno#manutencao` só funciona se houver uma secção chamada
 * `manutencao` e se ela estiver mapeada para um separador — e nada no
 * TypeScript garante isso, porque são todos texto. É exactamente o tipo de erro
 * que já aconteceu uma vez: o módulo dos horários estava registado e não
 * aparecia a ninguém, porque faltava numa segunda lista.
 *
 * Correr:  node scripts/verificar-ancoras.mjs
 */
import { readFileSync } from 'node:fs'

const ler = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

const turno = ler('src/pages/Turno.tsx')
const inicio = ler('src/pages/Inicio.tsx')
const libInicio = ler('src/lib/inicio.ts')

/* --------- o que existe: secções com âncora, e o mapa para separadores ------ */

const existentes = new Set(
  [...turno.matchAll(/ancora="([^"]+)"/g)].map(m => m[1]),
)

const bloco = turno.match(/const SECCAO_ABA[^{]*\{([\s\S]*?)\n\}/)
if (!bloco) { console.error('✗ não encontrei SECCAO_ABA em Turno.tsx'); process.exit(1) }
const mapeadas = new Map(
  [...bloco[1].matchAll(/'?([\w-]+)'?\s*:\s*'([\w-]+)'/g)].map(m => [m[1], m[2]]),
)

const abas = new Set(
  [...turno.matchAll(/aba === '([\w-]+)'/g)].map(m => m[1]),
)

/* ------------------------- o que se pede: os links ------------------------- */

/*
 * Apanha as três formas em que um destino aparece: `to="/turno#x"`,
 * `to={cond ? … }` e `to: '/turno#x'` dentro de uma lista. O caminho pode levar
 * uma data pelo meio (`/turno/${p.data}#x`), daí o `[^#\s'"\`]*`.
 */
const pedidos = [
  ...inicio.matchAll(/\/turno[^#\s'"`]*#([\w-]+)/g),
  ...libInicio.matchAll(/\/turno[^#\s'"`]*#([\w-]+)/g),
].map(m => m[1])

/* --------------------------------- juízo ---------------------------------- */

const erros = []

for (const a of new Set(pedidos)) {
  if (!existentes.has(a)) erros.push(`link para #${a} mas não há secção com essa âncora`)
  else if (!mapeadas.has(a)) erros.push(`secção #${a} existe mas não está em SECCAO_ABA — o link abre o separador errado`)
}
for (const [a, aba] of mapeadas) {
  if (!existentes.has(a)) erros.push(`SECCAO_ABA tem #${a}, que não corresponde a nenhuma secção`)
  if (!abas.has(aba)) erros.push(`SECCAO_ABA manda #${a} para o separador '${aba}', que não existe`)
}
for (const a of existentes) {
  if (!mapeadas.has(a)) erros.push(`secção #${a} não está em SECCAO_ABA`)
}

console.log(`secções com âncora: ${existentes.size}`)
console.log(`links do Início para secções: ${new Set(pedidos).size} (${[...new Set(pedidos)].join(', ')})`)

if (erros.length) {
  console.error('\n' + erros.map(e => `✗ ${e}`).join('\n'))
  process.exit(1)
}
console.log('\n✓ todos os links do Início batem numa secção existente, no separador certo')
