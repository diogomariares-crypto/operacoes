# Notas para o Claude

O `README.md` explica o que a app faz e como se corre. Isto é outra coisa: é o
que já correu mal, e que não se adivinha a ler o código.

Fala português de Portugal com o Diogo, e escreve os comentários do código em
português. Os nomes das colunas da base de dados são uma mistura de inglês
(tabelas antigas: `parking_reservations`, `guest_name`) e português (as mais
recentes: `fb_checklist_tarefas`, `event_bookings`). Em código novo, português.

## Publicar

Um `git push` para `main` dispara o `.github/workflows/deploy.yml`, que compila
e publica no GitHub Pages. Não é preciso mais nada.

**Nunca incluir `dist/` numa entrega.** Está no `.gitignore`, e o `index.html`
que lá vive colide com o da raiz. Isso já deixou a app em baixo quatro dias.

Se o workflow falhar com *«The job was not acquired by Runner of type hosted»* e
zero passos corridos, não é o código: é a alocação de runner do GitHub. Volta a
correr o workflow.

## Verificar antes de entregar

```bash
npx tsc -b --force     # SEMPRE com -b --force
npm run build
```

**`npx tsc --noEmit` mente.** Usa um `tsbuildinfo` em cache e já deu «sem erros»
com sete erros reais no projecto. Só `-b --force` é de confiança.

Os testes vivem em `scripts/` e correm-se com `node`:

| Script | O que prova | Como |
|---|---|---|
| `testar-eventos.mjs` | horas, meia-noite, mudança da hora | `TZ=Europe/Lisbon node scripts/testar-eventos.mjs` |
| `testar-horas-hk.mjs` | o campo de horas dos ajustes, o sinal do «Pessoas ±» | `node …` |
| `testar-caixa.mjs` | os fechos de caixa | `node …` |
| `testar-acesso-checklist.mjs` | o acesso `fb_checklist` vê uma página só | `node …` |
| `testar-acesso-no-browser.mjs` | o mesmo, mas a sério num browser | `node …` |
| `testar-sala-no-browser.mjs` | a sala de eventos desenha bem, e fotografa-a | `node …` |

Os dois últimos montam a app com um Supabase falso e abrem-na no Chromium via
Playwright. Se o browser não for encontrado, passa o caminho em `CHROMIUM=`.
Exigem o Playwright instalado (`npx playwright install chromium`).

**Esconder no menu não é fechar o acesso.** Os horários estiveram fechados no
menu e continuaram a abrir a quem escrevesse `#/horarios` à mão. Qualquer
mudança de permissão mexe nas duas pontas — a rota em `src/App.tsx` *e* a
política de RLS — e confirma-se com `testar-acesso-no-browser.mjs`.

## Invariantes da app

- **Só modo claro.** Não há classes `dark:` em lado nenhum. Não as introduzas.
- **HashRouter.** Os endereços são `#/turno`, e `#/turno#manutencao` dá
  `pathname:'/turno'` com `hash:'#manutencao'`.
- **A cor `hotel` é identidade, nunca significado.** Gravity azul, Tokyo
  vermelho, Casa Teva castanho, Concrete cinzento — serve para saber em que casa
  se está. O que quer dizer bem, mal ou urgente usa `brand` (verde), `red` ou
  `amber`. Ver `src/lib/hoteis-cor.ts`.
- **As permissões vivem nas páginas, não nos separadores** (`src/lib/modulos.ts`).
  Um separador aparece se a pessoa vir ao menos uma página lá dentro.
- **O papel `fb_checklist` é uma lista de um caminho só**, e não uma lista de
  exceções: uma página nova fica-lhe fechada por omissão. Ver `podeVerPagina` em
  `src/lib/auth.tsx` e o ramo `soChecklist` em `src/App.tsx`.
- **`Balanco.diferenca` e `Balanco.pessoas` têm sinais opostos, de propósito**
  (`src/lib/housekeeping.ts`): o tempo que falta é positivo, as pessoas que
  sobram são positivas. Alinhá-los parece uma limpeza e parte a leitura da
  coluna «Pessoas ±». Há um teste que falha se o fizeres.
- **Na sala de eventos, o início e o fim são instantes**, não dia mais hora
  (`src/lib/eventos.ts`). É o que trata um jantar das 20:00 à 01:00 e os dois
  domingos do ano em que o relógio muda. Nunca montes um ISO com `+01` à mão.

## Base de dados (Supabase, projeto `vaicrwwjjjrurylkjvyf`)

- **O RLS devolve zero linhas, não um erro.** Uma página vazia é quase sempre
  uma permissão, não uma avaria. Confirma as políticas antes de procurar o bug.
- **Nunca mudes a base de dados antes de o código que a lê estar publicado.**
  Apertar uma política primeiro deixa páginas vazias a parecerem avaria.
- **Nunca apagues dados do Diogo por iniciativa própria.** Relata o problema e
  deixa-o decidir.
- **Não tratas de chaves, palavras-passe nem segredos.** Ele instala-os.
- O `has_any_role()` **não** quer dizer «tem uma linha em `user_roles`»: quer
  dizer «tem um papel que dá acesso geral». A conta de só checklist tem linha e
  não passa lá. Ver `sql/acesso-checklist.sql`.
- As regras da sala de eventos estão em `sql/sala-eventos.sql`, com o porquê de
  cada restrição.

### O MCP do Supabase bloqueia em algumas coisas

Por experiência, com este tool:

- **`DO $$ … $$` bloqueia sempre** (180s de timeout). Usa instruções simples.
- **`delete` bloqueia** — parece ficar à espera de uma confirmação que não
  chega. Também no `apply_migration`.
- Lotes com várias instruções bloqueiam. Uma de cada vez.
- `drop policy` bloqueava onde `alter policy` passou.

Quando precisares de apagar, escreve o SQL num ficheiro em `sql/` e pede ao
Diogo para o correr no editor do Supabase.

## A fazer, em dívida

- `sql/acesso-checklist.sql` — por correr. Até lá, a app esconde mas a API
  continua a dar as tabelas ao acesso `fb_checklist`.
- `sql/sala-eventos.sql` — a limpeza no topo, por correr: ficaram um espaço
  `__teste__` e quatro reservas de teste no Gravity.
- Fixar o runner do workflow em `ubuntu-24.04`.
- O importador de horários nunca correu: `hor_dias` está vazio.
- Facturas de Agosto duplicadas no Tokyo.
