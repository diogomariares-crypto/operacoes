-- O acesso `fb_checklist` vê uma página, e mais nada — também na base de dados.
--
-- Correr NO SQL EDITOR DO SUPABASE, e só DEPOIS de a app estar publicada com
-- a versão que trata deste papel (>= 2.75.0). A ordem importa: isto fecha
-- tabelas que a app antiga ainda pede, e uma página que pede o que lhe é
-- recusado aparece vazia em vez de não aparecer.
--
-- POR QUE É QUE ISTO É PRECISO
--
-- Esconder a página no menu nunca foi fechar o acesso. O `has_any_role()`
-- queria dizer «tem uma linha em user_roles» e é o guarda de umas trinta
-- tabelas — grupos, horários, stock, ocupação, reclamações, parque, imagens —
-- várias delas com escrita e apagamento. Uma conta `fb_checklist` passava-o,
-- por isso via tudo isso pela API mesmo sem lá chegar pelo menu.
--
-- A correção é mudar o que a pergunta quer dizer: `has_any_role()` passa a ser
-- «tem um papel que dá acesso geral». Para todos os outros papéis isto não
-- muda nada — a conta que tem `fo`, `hsk`, `fb`, `rh`, `financeiro` ou `admin`
-- continua a responder verdade exactamente como antes.
--
-- Depois reabrem-se à mão as quatro políticas de que a checklist vive. É de
-- propósito que sejam quatro e estejam nomeadas: quem acrescentar uma tabela
-- nova à app não lhe dá acesso sem passar por aqui.

begin;

-- 1. Quem é «só checklist».
--    Exige que seja o ÚNICO papel da conta. Somar `fb_checklist` a um
--    supervisor que já é `fb` não lhe pode tirar o que ele tinha: um papel que
--    castiga quem o recebe é um papel que ninguém usa bem.
create or replace function public.so_checklist()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
           select 1 from public.user_roles
           where user_id = auth.uid() and role = 'fb_checklist'::app_role
         )
     and not exists (
           select 1 from public.user_roles
           where user_id = auth.uid() and role <> 'fb_checklist'::app_role
         );
$function$;

comment on function public.so_checklist() is
  'A conta entra na app só para marcar a checklist da manhã do F&B: tem o papel fb_checklist e nenhum outro. Fecha-lhe o has_any_role().';

-- 2. O que a checklist precisa: a regra que o `has_any_role()` tinha antes.
--    Fica com nome próprio para se ver, pelas políticas, quais são as quatro
--    tabelas que esta conta alcança.
create or replace function public.pode_ver_checklist()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.mfa_ok()
     and exists (select 1 from public.user_roles where user_id = auth.uid());
$function$;

comment on function public.pode_ver_checklist() is
  'Qualquer conta com papel, incluindo a de só checklist. Usada apenas nas quatro políticas que a checklist precisa de ler e escrever.';

-- 3. `has_any_role()` deixa de ser verdade para a conta de só checklist.
--    Uma linha a mais, e com ela fecham as ~30 tabelas e as 4 políticas do
--    storage que a usam como guarda.
create or replace function public.has_any_role()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.mfa_ok()
     and exists (select 1 from public.user_roles where user_id = auth.uid())
     and not public.so_checklist();
$function$;

comment on function public.has_any_role() is
  'Tem um papel que dá acesso geral à casa. NÃO é «tem uma linha em user_roles»: a conta de só checklist tem linha e não passa aqui — ver so_checklist().';

-- 4. As quatro portas que ficam abertas, e só estas.

--    Os hotéis: sem a lista, a checklist não sabe de que casa é. São nomes e
--    identificadores, não números do negócio.
alter policy hotels_read on public.hotels
  using (public.pode_ver_checklist());

--    As tarefas: lê a lista. Escrever nela continua a ser de quem escreve no
--    F&B ou de um administrador (fb_chk_tarefas_write, que não se toca aqui),
--    por isso esta conta marca a checklist mas não a reescreve.
alter policy fb_chk_tarefas_read on public.fb_checklist_tarefas
  using (public.pode_ver_checklist());

--    O que foi marcado em cada dia: lê e escreve, que é o que a página faz.
alter policy fb_chk_feito_read on public.fb_checklist_feito
  using (public.pode_ver_checklist());

alter policy fb_chk_feito_write on public.fb_checklist_feito
  using (public.pode_ver_checklist())
  with check (public.pode_ver_checklist());

commit;

-- ---------------------------------------------------------------------------
-- A CONFIRMAR, depois de correr o que está acima.
--
-- Deve devolver uma linha por tabela, todas com `fechada` = true menos as
-- quatro de cima. Se alguma tabela nova aparecer aberta um dia, foi criada
-- com `has_any_role()` e está certa; se aparecer FECHADA uma de que a
-- checklist precise, é aqui que se vê porquê.
--
--   select tablename, policyname,
--          coalesce(qual, with_check) like '%pode_ver_checklist%' as aberta_a_checklist
--   from pg_policies
--   where schemaname in ('public','storage')
--     and coalesce(qual,'') || coalesce(with_check,'') like '%any_role%'
--        or coalesce(qual,'') like '%pode_ver_checklist%'
--   order by aberta_a_checklist desc, tablename, policyname;
--
-- E o papel da conta, que é a outra metade do pedido:
--
--   select u.email, array_agg(r.role::text order by r.role::text) as papeis
--   from auth.users u join public.user_roles r on r.user_id = u.id
--   where u.email = 'valentinas2@chicandbasic.com'
--   group by u.email;
--
-- Deve dizer {fb_checklist}. Se disser {fb}, a conta ainda vê a faturação.
