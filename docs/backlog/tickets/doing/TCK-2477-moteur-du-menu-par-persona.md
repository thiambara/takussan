---
id: TCK-2477
title: Le moteur du menu de /app — catalogue des destinations, persona du profil actif, composition pure, sans changement visible
status: doing
phase: P1
family: front
estimate: L
wave: 82
created: 2026-11-05
updated: 2026-11-05
depends_on: []
blocks: [TCK-2478]
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
    - "docs/features.md#22-rôles--permissions"
  models: []
tags: [front, navigation, coque, adr-0089]
---

## Objectif utilisateur

Aucun changement visible : chaque compte voit exactement le menu d'aujourd'hui, mais ce menu est
désormais **dérivé** d'un catalogue et d'une disposition par persona, ce qui rend possibles les
lots suivants (ADR-0089).

## Contrat de données

- Aucun endpoint neuf. Le profil actif est lu par le layout de `/app` : cookie `active_profile_id`
  (`<type>:<id>`) ou, à défaut, `GET /api/me/profiles` (`meta.active_profile_id`, déjà consommé par
  `useMyProfiles`).
- Capacités : `GET /api/me/capabilities`, déjà amorcé par le layout (`capacitesAmorcees`, TCK-1278).
- Pages d'agence : `PAGES_ADMIN` / `accesAdmin` (TCK-633), inchangés et repris tels quels.

## Direction UX / Artistique

Aucune : ce lot ne change pas un pixel. Le critère de succès est l'identité du rendu.

## Contraintes strictes (métier)

- **Identité de rendu** : pour chacun des sept rôles éprouvés par `AppSidebar.test.tsx`, le jeu
  ordonné d'`href`, les sections, les libellés, les compteurs armés et les cadenas sont IDENTIQUES à
  ceux de `buildNavItems` sur `dev` avant le lot. Les tests existants ne sont pas réécrits pour
  passer : ils passent tels quels.
- Le persona se résout d'après le **profil actif**, jamais d'après l'union de `roles` seule (ADR-0089
  §2). Les huit personas existent dès ce lot, même si leurs dispositions reproduisent encore le menu
  actuel.
- La table des dispositions est exhaustive sur les personas, vérifiée par le compilateur.
- La section d'agence reste dérivée de `PAGES_ADMIN` ; le catalogue n'en recopie aucune exigence.
- Le menu ne juge que l'écran : aucune garde serveur, aucun appel API n'est retiré.
- Une destination accessible au persona n'est jamais perdue : placée nulle part, elle tombe sous
  « Plus » (ADR-0089 §4).

## Delta à produire

- [ ] Catalogue unique des destinations de `/app`, avec prédicat d'accès reprenant les gardes
      actuelles (TCK-379, TCK-492, TCK-587, P152.03, `isProRouteLocked`).
- [ ] Liste `HORS_MENU` des pages de `/app` sans entrée, chacune avec sa raison.
- [ ] Résolution du persona (huit personas) et lecture du profil actif par le layout de `/app`.
- [ ] Table des dispositions par persona, dans une version « miroir » qui reproduit le menu actuel.
- [ ] Composition pure (filtrage, groupes vides, règle des en-têtes de TCK-377, « Plus »,
      identifiants inconnus ignorés).
- [ ] `AppSidebar` n'affiche plus que la composition ; `buildNavItems`, `RANG_EN_TETE`,
      `SECTION_ORDER` disparaissent (ou ne survivent que comme fixtures de test du lot).
- [ ] Garde d'arborescence : chaque `page.tsx` sous `app/(dashboard)/app` est au catalogue ou dans
      `HORS_MENU` ; chaque `href` du catalogue a sa page.
- [ ] Tests : table de résolution du persona ; composition par persona ; « aucune destination
      accessible perdue » ; « tout identifiant cité par une disposition existe au catalogue ».

## Critères d'acceptation

- [ ] AC1 — `AppSidebar.test.tsx` passe **sans modification** de ses attentes ; ablation : remettre
      une entrée hors de sa place dans la disposition miroir fait rougir au moins un de ses tests.
- [ ] AC2 — Un compte admin d'agence ET bailleur de la même agence, profil actif `agency_admin`, se
      résout en `admin-agence` ; le même compte, profil actif `owner`, en `bailleur` ; un admin d'une
      agence `individual` en `hote`. Ablation : résoudre sur l'union de `roles` fait rougir le test.
- [ ] AC3 — Ajouter un persona sans disposition casse `tsc --noEmit`.
- [ ] AC4 — Ajouter un `page.tsx` sous `/app` sans l'inscrire au catalogue ni à `HORS_MENU` fait
      rougir la garde d'arborescence ; supprimer la page d'une destination du catalogue aussi.
- [ ] AC5 — Retirer une destination accessible de toute disposition la fait apparaître sous « Plus »
      (et non disparaître) ; ablation : supprimer la règle de chute fait rougir le test.
- [ ] AC6 — `/app/tasks` est inscrite (au catalogue, placée par la disposition de l'agent au
      TCK-2478, ou en `HORS_MENU` avec sa raison d'ici là).
- [ ] AC7 — `npm run lint`, `npx tsc --noEmit`, `npm run check:i18n` et la suite front verts (CI).

## Hors périmètre

- Toute disposition qui DIFFÈRE du menu actuel (TCK-2478).
- Action principale, en-tête d'espace, complément « Aussi … » (TCK-2478).
- Bande « À traiter », « Démarrer » (TCK-2479) ; préférences (TCK-2480) ; mobile (TCK-2481) ;
  palette (TCK-2482).

## Notes d'implémentation

Branche `feat/coque-dynamique-par-persona`, plan `docs/plans/2026-11-05-tck-2477-moteur-du-menu.md`.

**Livré** — sous `takussan-web/src/lib/navigation/` : `types.ts` (les types du menu, sortis
d'`AppSidebar` avec leurs docblocks, plus la section `plus`), `catalogue.ts` (29 destinations ; le
prédicat de chacune reprend la garde de `buildNavItems`), `personas.ts` (`typeDuProfilActif`,
`resoudrePersona`), `dispositions.ts` (miroir du menu de `dev` 0b7deae44), `composer-menu.ts`,
`__tests__/hors-menu.ts` (9 pages, dont `/app/tasks` — AC6). Le layout de `/app` lit le cookie
`active_profile_id` (`getActiveProfileId`, vide pendant une impersonation) et en descend le type par
`AppShell` jusqu'à `AppSidebar`. Clé `nav.sidebar.sections.more` en `fr`/`en`/`wo`.

**`buildNavItems` survit comme adaptateur déprécié** (même signature, plus deux paramètres
facultatifs) : c'est ce qui laisse les tests du menu des sept rôles passer sans retouche. TCK-2478
les réécrit sur le moteur et le retire.

**Un ordre unique ne suffisait pas** — relevé sur `buildNavItems` pour les sept rôles : « Engagements »
se lit États des lieux → Avis → Documents chez le client, Avis → … → Documents → États des lieux chez
le personnel. Deux miroirs donc (`MIROIR_CLIENT`, `MIROIR_PERSONNEL`).

**Écart assumé, pour les comptes CUMULANTS seulement** : l'accès se juge toujours sur l'union de
`roles` (jeu d'`href` inchangé), mais l'ordre dans une section suit la disposition du persona. Seul
écart mesuré sur les couples relevés : `service_provider` + `customer`, dont « Engagements » se lit
désormais Baux → Documents (avant : Documents → Baux).

**Filet** — 7 fichiers, 153 tests (`AppSidebar*.test.*`, `roles-derives`, `AgencyQueues.source-unique`)
verts avant et après, **aucune attente modifiée**. Trois tests du layout (`bandeau-suspension`,
`layout.acces-admin`, `marqueur-accueil-agence.tck-1766`) moquaient `@/lib/session` sans
`getActiveProfileId` : leur mock gagne la fonction, rien d'autre. Test neuf :
`layout.profil-actif.test.tsx`.

**Ablations** (chacune a rougi, puis a été rétablie) :
- `proposer-bien` sans `!peutPublier` → « deux destinations d'un même href » rouge ;
- `resoudrePersona` sans profil actif → 3 cas rouges (AC2) ;
- composition sans la chute sous « Plus » → rouge (AC5) ; persona `essai` sans disposition → `tsc`
  rouge (AC3) ;
- Réservations et Visites inversées dans la tête → 5 tests TCK-646 d'`AppSidebar.test.tsx` rouges
  (AC1) ;
- `/app/tasks` retirée de `HORS_MENU`, `href` du calendrier faussé → garde d'arborescence rouge (AC4) ;
- layout sans la prop → `layout.profil-actif` rouge.

**Vérifié en local** : 103 fichiers / 806 tests du périmètre touché, `tsc --noEmit`, `npm run lint`,
`npm run check:i18n`, toutes les gardes `scripts/check-*.mjs`. Suites entières : par la CI.
