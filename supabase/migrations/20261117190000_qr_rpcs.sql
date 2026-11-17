-- QR: offentlige RPC'er til RLS-lockdown på MAIN.
-- *** KØRES PÅ MAIN (ilbjytyukicbssqftmma) — IKKE ANVENDT ENDNU. Kør del 1 FØR deploy af QR/GAMES. ***
--
-- Tabellerne qr_codes, qr_scans, qr_sections er delt mellem QR (index.html) og GAMES (qrcode.html).
-- Begge apps er staff-værktøjer (generator, arkiv, scan-log, sektioner) — de sender nu platform-SSO
-- (x-eventday-sso) og har login-skærm. Det ENESTE offentlige flow er når en spiller scanner en
-- aktivitets-QR (…/?a=<id>[&to=<url>]) på sin egen telefon:
--   1) slå aktiviteten op på dens præcise id  → qr_resolve_activity (ny)
--   2) tæl scanningen                          → qr_log_scan (findes; strammes her, samme signatur)
-- Ingen af dem kan liste koder, læse scan-loggen eller rette/slette noget.
--
-- GAMES refererer til disse funktioner (GAMES/supabase/migrations/20261117190000_games_rpcs.sql) — de
-- defineres KUN her.

-- ═══════════════════════════════════════════════════════════════════════════
-- DEL 1 — RPC'er (kør før deploy; bagudkompatibelt med de nuværende klienter)
-- ═══════════════════════════════════════════════════════════════════════════

-- Hurtigt opslag til throttling i qr_log_scan.
create index if not exists qr_scans_qr_id_scanned_at_idx on public.qr_scans (qr_id, scanned_at desc);

-- 1) Opslag af én aktivitets-QR på præcist id. Kun type 'activity' og kun de felter
--    besøgssiden viser (navn, beskrivelse, mål, antal scanninger). null hvis ukendt.
create or replace function public.qr_resolve_activity(p_id text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'id', c.id,
           'name', c.name,
           'description', c.description,
           'target', c.target,
           'scan_count', c.scan_count)
    from public.qr_codes c
   where c.id = p_id
     and c.type = 'activity'
     and length(coalesce(p_id, '')) between 1 and 64
   limit 1;
$$;

revoke all on function public.qr_resolve_activity(text) from public;
grant execute on function public.qr_resolve_activity(text) to anon, authenticated;
comment on function public.qr_resolve_activity(text) is
  'QR/GAMES public scan landing (?a=<id>): read one activity QR by exact id. No listing.';

-- 2) Tæl en scanning (insert-only). Samme signatur og returtype som den eksisterende funktion,
--    så de klienter der kører nu, virker uændret. Strammet:
--    - kun eksisterende aktivitets-QR'er (ukendt id → 0, intet indsat; før gav det en FK-fejl)
--    - source kun 'url' eller 'scanner'; device_id højst 64 tegn
--    - samme enhed + samme QR inden for 10 sek. tælles ikke igen (dobbelt-load / refresh)
--    - højst 300 scanninger pr. QR pr. time (loft mod spam af tælleren)
--    Returnerer det aktuelle antal scanninger.
create or replace function public.qr_log_scan(p_qr_id text, p_source text default 'url', p_device_id text default null)
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  c_dedupe_window constant interval := interval '10 seconds';
  c_hourly_cap    constant int := 300;
  v_count  int;
  v_source text := case when p_source in ('url', 'scanner') then p_source else 'url' end;
  v_device text := nullif(left(btrim(coalesce(p_device_id, '')), 64), '');
begin
  select scan_count into v_count
    from public.qr_codes
   where id = p_qr_id and type = 'activity'
   for update;
  if not found then
    return 0;
  end if;

  if v_device is not null and exists (
       select 1 from public.qr_scans
        where qr_id = p_qr_id and device_id = v_device
          and scanned_at > now() - c_dedupe_window) then
    return coalesce(v_count, 0);
  end if;

  if (select count(*) from public.qr_scans
       where qr_id = p_qr_id and scanned_at > now() - interval '1 hour') >= c_hourly_cap then
    return coalesce(v_count, 0);
  end if;

  insert into public.qr_scans (qr_id, source, device_id) values (p_qr_id, v_source, v_device);
  update public.qr_codes
     set scan_count = coalesce(scan_count, 0) + 1,
         last_scan  = now()
   where id = p_qr_id
  returning scan_count into v_count;
  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.qr_log_scan(text, text, text) from public;
grant execute on function public.qr_log_scan(text, text, text) to anon, authenticated;
comment on function public.qr_log_scan(text, text, text) is
  'QR/GAMES: count one scan of an activity QR (insert-only, deduped per device, capped per hour). Returns scan_count.';

-- ═══════════════════════════════════════════════════════════════════════════
-- DEL 2 — LOCK (run after deploy)
-- Kør FØRST når QR (index.html + sso.js) og GAMES (qrcode.html + sso.js) med SSO er deployet.
-- Efter dette: kun staff (is_staff() = gyldigt SSO-token med rolle admin/ef_admin/crew, CRM-admin
-- eller CCC-bruger) kan læse/skrive tabellerne direkte. Offentlige scanninger går via RPC'erne ovenfor.
-- Står i en kommentarblok, så filen kan køres uden at låse for tidligt. Kopiér blokken ud og kør den.
-- ROLLBACK pr. tabel: drop policy <t>_staff_all on public.<t>;
--   create policy <t>_anon_all on public.<t> for all to anon, authenticated using (true) with check (true);
-- ═══════════════════════════════════════════════════════════════════════════
/*
do $$
declare t text; p record;
begin
  foreach t in array array['qr_codes', 'qr_scans', 'qr_sections'] loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all using ((select public.is_staff())) with check ((select public.is_staff()))', t || '_staff_all', t);
    execute format('revoke truncate on public.%I from anon, authenticated', t);
  end loop;
end $$;
*/
