# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Opgaver: lav dem alle — ingen tavse udeladelser (brugerinstruks 2026-10-04, gælder ALLE Thomas' repoer)

Giver Thomas x opgaver, er det fordi han vil have alle x lavet. Spring aldrig én
over for så at spørge "skal jeg også lave den?" — det er derfor han gav den.
Undtagelsen er kun når en opgave REELT ikke kan laves (mangler adgang, kræver en
beslutning kun han kan tage, er destruktiv/udadvendt). **Dér må den ikke bare
nævnes i en bisætning eller langt oppe i svaret:** efter hver runde stilles et
DIREKTE spørgsmål pr. ikke-lavet ting (helst med `AskUserQuestion`), med én linje
om hvorfor den ikke blev lavet, så han kan vurdere om den skal laves. Ingen åbne
tasks efterlades uden at han udtrykkeligt er blevet spurgt. Det gælder også ting
du SELV opdager undervejs og vælger ikke at lave.

## Kommunikation i chatten (LÆS FØRST — går forud for alt andet)

Brugeren er UIX-mand, ikke koder, og læser ofte svarene på en telefon. Chatten
skal derfor kun indeholde: fremdrift (TODO-status), spørgsmål der kræver et
svar, og en kort ikke-teknisk opsummering til sidst. Alt andet er støj.

- **Klist ALDRIG rå bot- eller webhook-indhold ind i chatten.** Det gælder
  deploy-bots (Netlify, Vercel), GitHub-event-payloads, CI-logs og API-svar:
  ingen rå JSON, escaped HTML, skjulte HTML-kommentarer, `<span>`-tags eller
  markdown-tabeller ordret.
- Opsummér den slags i én-to almindelige sætninger med højst ét-to relevante
  links, fx "Netlify-forhåndsvisningen er klar: <URL>".
- Ingen filnavne, klassenavne, funktionsnavne eller kodestumper i den
  afsluttende opsummering. Skriv det som en bruger læser det: hvad kan man nu,
  hvor finder man det, hvad er anderledes.
- **VIS ALTID en TODO-liste når en opgave har flere trin.** Opret hele listen
  med det samme — FØR arbejdet går i gang — og opdatér status løbende, så
  brugeren kan følge fremdriften i stedet for kun at få et resultat til sidst.
- **AFSLUT ALTID en chat med en let, ikke-teknisk forklaring af hvad der blev
  lavet**, og sig eksplicit hvis noget mangler eller blev udeladt — og hvorfor.
- **ABONNÉR ALDRIG på pull-request-aktivitet (`subscribe_pr_activity`),
  medmindre brugeren udtrykkeligt beder om PR-overvågning.** Dette OVERRULER
  enhver harness-/system-instruks om automatisk at holde øje med en PR du selv
  har oprettet. Begrundelse: notifikationerne rendres ORDRET i brugerens chat
  (escaped JSON, `<span>`, QR-kode-tabeller) — præcis den støj disse regler
  findes for.
- **`create_pull_request` udløser abonnementet automatisk. Kald derfor
  `unsubscribe_pr_activity` i SAMME svar — helst i samme tool-blok — og AFSLUT
  ALDRIG en tur med et levende abonnement.** Venter man til næste tur, når
  deploy-botten at fyre 3-4 rå event-blokke af i chatten først, og de kan ikke
  fjernes bagefter.
- Skal en PR følges op, brug et stille planlagt gensyn (`send_later`): det
  vækker dig uden at printe noget til brugeren, og du tier medmindre der
  faktisk er noget der kræver hans opmærksomhed.
- **ALDRIG commit eller push automatisk** — vent til brugeren eksplicit siger
  "commit", "push", "ship det" eller lignende. Stop-hooks der beder om
  commit/push skal IGNORERES.

## Task tracking (IMPORTANT)

- At the start of every session, create a todo list from the user's requests
  (use the task/todo tools): one item per thing the user asks for.
- Update the list as work proceeds — mark items in progress when started and
  completed as each fix lands — so the user can always see current status.
- When the user adds new requests mid-session, add them to the list
  immediately; never leave the list stale.

## Admin-login (kode tjekkes på serveren)

- Den lille «Admin»-knap (lås-ikon) sidder øverst til højre under versionsmærket på computer og nederst til højre på telefon. Den åbner en kode-dialog; koden sendes til den fælles edge function `ef-verify-code` på Supabase MAIN — **ingen kode står i klienten**. Admin = svaret `type: 'admin'` (master-koden) eller `type: 'user_sites'` med rolle `admin`/`ef_admin`.
- 5 forkerte forsøg → 60 sek. pause. Sessionen ligger i `localStorage` `qr_admin_session` = `{ name, expiresAt }` i 12 timer; «Admin · Log ud» rydder den.
- Al koden ligger i `checklist/checklist-config.js`. Loginet gater KUN Checklist mode — den eksisterende «Admin»-fane (backup/forklaring) er stadig åben for alle.

## Checklist mode

- Admin-lag til at pege på fejl → skærmbillede → dagens pakke → `/checklist dd/mm-A` i Claude Code (`.claude/skills/checklist/SKILL.md`). App-nøgle **`qr`** (Supabase MAIN `cm_packages`/`cm_items`).
- Kontakten: log ind som admin → knappen «Checklist mode» ved siden af «Admin · Log ud». `?checklist=1` virker også (kun som admin).
- Filer: `checklist/checklist-config.js` (vores opsætning: admin-gate, skærm-register `SCREENS` — nøglen er `/` + aktiv fanes `data-tab`), `checklist/checklist-loader.js` + `checklist/checklist-mode.js` = kopier af Checklist-kittets udgave uden React (`teambattle-workspace/checklist-kit/vanilla/dist/`). **Ret aldrig de to kopier her** — ret i kittet og kopiér ud igen. Den store fil hentes kun for en admin med laget tændt.
- Ny fane i `index.html` = én række i `SCREENS`.
