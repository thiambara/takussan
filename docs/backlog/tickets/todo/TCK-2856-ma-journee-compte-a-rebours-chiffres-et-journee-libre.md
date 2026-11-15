---
id: TCK-2856
title: "Ma journée de l'agent : « dans 45 min » au bureau, « 3 sans photo » et « 310 000 F à venir » sous les chiffres, une journée libre qui nomme qui relancer et quels biens proposer, deux colonnes dès 1024"
status: todo
phase: P1
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2855]
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models: []
tags: [front, journee, agent, audit-ux, app]
---

## Objectif utilisateur

L'agent voit combien de temps il lui reste avant sa prochaine visite, ce que ses chiffres cachent, et, quand sa journée est vide, à qui consacrer son temps — par son nom.

## Contrat de données

- `properties_without_photo`, `commissions_upcoming`, `suggestions.follow_up`, `suggestions.matches` : **livrés par TCK-2855**.
- Le reste est déjà lu (`MaJournee`, `Chronologie`, `MesChiffres`, `JourneeLibre`).

Relevé : audit-f3-coque.md, app-aujourdhui e0 et e4, app-accueil e0 (écran jamais relevé) — chronologie au bureau qui dit la durée (« 45 min ») et non « dans 45 min » ; `MesChiffres.tsx:54, 57` contexte `null` ; `JourneeLibre.tsx:43-61` sans suggestion « biens à proposer » et `relancerDetail` fixe ; deux colonnes dès `xl` au lieu de `lg` (écart accepté par décision, repris ici à la demande du porteur).

## Direction UX / Artistique

**Référence de fidélité** — `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-aujourdhui.tsx`, approche a, **e0 « Ma journée »** et **e4 « Journée libre »**, téléphone et bureau ; et `app-accueil.tsx` **e0 « Agent : sa journée »** (`AccueilAgentMobile`, `AccueilAgentBureau` dans `app-accueil-contenu.tsx`).

- **Bureau** : sur la chronologie, la prochaine visite dit « dans 45 min » (compte à rebours relatif à maintenant), comme le téléphone.
- **Les deux formats** — « Mes chiffres » : « Biens gérés » porte « 3 sans photo » (mène à la liste des biens filtrée sur les sans photo si le filtre existe, sinon à la liste), « Commissions » porte « 310 000 F à venir ».
- **Journée libre** (e4) : la première suggestion nomme le client (« Relancer Ibrahima Sarr » / « attend depuis 9 jours ») ; une suggestion « 3 biens à proposer à Mariama » / « Studios à Mermoz et à Ouakam » qui ouvre la fiche du client sur ses biens rapprochés.
- **Largeur** : deux colonnes dès 1024 (`lg`), comme la maquette.

## Contraintes strictes (métier)

- Une sous-ligne à zéro ne s'affiche pas (« 0 sans photo » : non).
- Pas de suggestion `matches` ni `follow_up` servie → la suggestion correspondante ne se rend pas ; les suggestions fixes (« Planifier une visite », « Ajouter un client ») restent.
- Le compte à rebours se met à jour sans recharger (au moins à la minute) et bascule sur l'heure quand la visite est passée.
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel ; vouvoiement.

## Delta à produire

- [ ] « dans N min » au bureau.
- [ ] Deux sous-lignes de « Mes chiffres ».
- [ ] Suggestions nominatives de « Journée libre ».
- [ ] Deux colonnes dès `lg`.
- [ ] Tests : « dans 45 min » à 1440 (horloge simulée) ; sous-lignes et leur absence à 0 ; suggestions nominatives et leur absence.

## Critères d'acceptation

- [ ] AC1 — À 1440, horloge à 09:15, visite à 10:00 : la carte dit « dans 45 min ».
- [ ] AC2 — `properties_without_photo = 3`, `commissions_upcoming = 310000` : « 3 sans photo » sous « Biens gérés » et « 310 000 F à venir » sous « Commissions » ; à 0, aucune sous-ligne.
- [ ] AC3 — Journée libre avec les deux suggestions servies : « Ibrahima Sarr » et « attend depuis 9 jours » ; « 3 biens à proposer à Mariama » qui mène à `/app/customers/{id}`.
- [ ] AC4 — À 1024, « Ma journée » est en deux colonnes.
- [ ] AC5 — Vérifier au navigateur (audit, non vérifiables) : la ligne « demande qui attend » de « À régler » avec une demande de plus de 24 h ; une tâche du jour à heure fixe dans la chronologie ; Appeler / WhatsApp d'une tâche rattachée à un client joignable ; « Journée libre » d'un agent sans rien (et « Mes chiffres » à droite à 1280) — corriger si absents.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2856.json` : app-aujourdhui e0 et e4, app-accueil e0 (jamais relevé), téléphone et bureau.
- [ ] AC-F2 — Zéro écart non expliqué ; les sous-lignes ne sont plus en `hors_perimetre`.
- [ ] AC-F3 — À 1024 et 768 : `scrollWidth − innerWidth = 0`.

## Hors périmètre

- La page « Tâches » : TCK-2857.

## Notes d'implémentation

Livré le 2026-11-15 (worktree `feat/audit-manques-2026-11-15`), front seul, sur le contrat de TCK-2855.

**Prémisse re-mesurée — deux écarts.**
- « *comme le téléphone* » : faux. Ni le téléphone ni le bureau ne disaient « dans N min » ; la maquette
  (`app-aujourdhui` e0, `Chronologie`, `large ? 'dans 45 min' : '30 min'`) ne le met qu'AU BUREAU, sur la seule
  prochaine visite ; le téléphone garde la durée. Suivi : la maquette.
- La maquette ouvre les deux colonnes à `xl` et dit « à 1024 : une colonne » (ADR-0106) ; l'AC4 (demande du porteur)
  l'emporte. À 1024 il reste 1024 − 272 (barre) − 64 (marges) = 688 px : 400 px à droite laisseraient ~264 px à la
  chronologie. **Décision** : 320 px à droite entre `lg` et `xl` (`calc(var(--spacing)*80)`), 400 px dès `xl` ; les
  cartes de la chronologie gardent leurs variantes `xl:` (empilées sous 1280). Jusqu'à la carte : 344 − 2 − 40 (`px-5`)
  − 76 (heure) − 12 − 28 (`p-3.5`) ≈ 185 px utiles, quand Itinéraire (~114 px) et les deux disques (2 × 44 px + 2 × 8)
  en demandent ~218 : la rangée des gestes passe à la ligne sous `xl` (`flex-wrap`) au lieu d'être rognée.

**Décisions tranchées (consigne « valide tes choix »).**
1. *Compte à rebours* : la prochaine visite d'aujourd'hui dont l'heure n'est pas passée ; arrondi à la minute
   supérieure (« dans 1 min » à 30 s, jamais « dans 0 min ») ; au-delà d'une heure « dans 6 h 25 », « dans 1 h » ;
   passée, la ligne reprend sa durée et le compte passe à la visite suivante. Relu chaque minute (`useMinuteCourante`).
   Les tâches n'en ont pas (la maquette non plus). Bascule téléphone/bureau en CSS : la chronologie est un seul nœud
   rendu dans les deux blocs.
2. *« 3 sans photo »* : aucun filtre « sans photo » n'existe côté API (`/api/properties`) : la case garde sa cible
   (`/app/properties?only_mine=1`), comme le ticket l'autorise.
3. *Relance* : la forme de la maquette (l. 810) — titre « 6 prospects à relancer » (le compte de la liste), détail
   « Ibrahima Sarr attend depuis 9 jours » ; vers la liste « à relancer ». Ne se rend que si `follow_up` est servi
   (contrainte du ticket) ; compte nul mais `follow_up` servi : « Relancer {nom} » ; `waiting_days = 0` :
   « {nom} attend un signe de vous ».
4. *Biens à proposer* : « 3 biens à proposer à Mariama » vers `/app/customers/{id}?section=biens` (la ligne « Biens
   correspondants » du dossier, ouverte et amenée à l'écran). `sample` ne sert pas le type des biens : « Studios » de
   la maquette devient « Biens à Mermoz et à Ouakam » (quartiers distincts, joints par la clé `journee.libre.liste` —
   pas `Intl.ListFormat` : le wolof porte le texte français et `ListFormat('wo')` le joindrait sans « et ») ; sans quartier, les titres ; sans prénom, « … à un client ».
5. *Lecture des suggestions* : côté client, `useSuggestionsDeLaJournee(libre)` (`lib/queries/journee.ts`) —
   `GET /api/dashboard/me?include=suggestions` (une chaîne), seulement une journée libre : le rapprochement a un coût
   côté API, et `page.tsx` (partagé avec TCK-2850) n'est pas touché. Clé sous `['customers']`.
6. La clé `journee.libre.relancerDetail` (« Vos clients qui attendent un signe »), devenue sans appelant, est retirée.

**Tests.** `src/components/journee/__tests__/MaJournee.tck-2856.test.tsx` (11) ; `MaJournee.tck-2596.test.tsx` mis à
jour (assertion `xl:` → `lg:`, la relance servie par `include=suggestions`) ; plus `journee-de-l-agent.tck-2596`,
`socle.tck-2622`, `lien-etire.tck-2792`, `visites-champs-lus.tck-2797`, `PageHeader.onglets.tck-2804`,
`liste-des-clients.tck-2596` : verts. Ablations une à une, restaurées par `cp` et prouvées par md5 : compte à rebours
retiré, arrondi `ceil` → `floor`, sous-ligne « sans photo » à zéro, sous-ligne « à venir » retirée, relance gardée sur
le seul compte, lien sans `?section=biens`, classe `lg:` retirée, `include` en tableau — chacune rouge.

**AC5 (non mesuré au navigateur, consigne du lot)** : couverts par les tests de TCK-2596 — la demande de plus de 24 h
dans « À régler », la tâche de 18:00 dans la chronologie, Appeler/WhatsApp d'une tâche rattachée à un client joignable,
« Journée libre » d'un agent sans rien ; au bureau, « Mes chiffres » est dans la colonne de droite (code).

**Fidélité.** Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2856.json` (app-aujourdhui e0, e4, app-accueil e0 ;
`releve_le: null` — pas de relevé au navigateur dans ce lot) ; l'entrée « 3 sans photo / 310 000 F à venir » est
sortie de `hors_perimetre` de `TCK-2596.json`. AC-F2 (« zéro écart non expliqué ») et AC-F3 (1024, 768) : non
mesurés sans relevé — calcul ci-dessus. Gardes à la source jouées : `fields-demandables`, `show-sans-fields`,
`chemin-api`, `graphe-client-de-la-console`, `etats-de-route`, `fleche-de-retour-unique`, `echelle-du-bureau` (verts).
