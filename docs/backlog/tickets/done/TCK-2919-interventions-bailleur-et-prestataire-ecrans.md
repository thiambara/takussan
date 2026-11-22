---
id: TCK-2919
title: "Interventions du bailleur et du prestataire : « Depuis janvier » et les devis consultés chez le bailleur ; « À facturer », « Facturer », le calendrier et le relevé des factures chez le prestataire"
status: done
phase: P2
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: [TCK-2911]
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#21-maintenancerequest-"
    - "docs/models-spec.md#77-serviceproviderbill-"
tags: [front, interventions, bailleur, prestataire, factures, audit-ux, app]
---

## Objectif utilisateur

Le bailleur lit ce que les interventions lui ont coûté depuis janvier et voit les devis que l'agence a comparés ; le prestataire facture ce qu'il a terminé, voit sa semaine en calendrier et télécharge le relevé de ses factures.

## Contrat de données

- Bilan `GET /api/owner/maintenance-summary`, `quote_alternatives[]`, factures `draft` + `POST …/submit`, relevé `GET service-provider-bills/statement/pdf` : TCK-2911.
- Calendrier : `GET /api/calendar` rend déjà les interventions assignées (`CalendarEventCollector`) — et la page `/app/calendar` existe.

Audit (`audit-f4-patrimoine.md`, app-interventions) :

- **e6** (bailleur, téléphone et bureau) : bloc « Depuis janvier » (Interventions 12 dont 9 closes · « À votre charge » · « Par bien » / « Historique par bien ») absent ; mise en concurrence (« a consulté deux autres artisans ») absente.
- **e7** (prestataire) : « À facturer · 2 » et le geste « Facturer » absents ; « Relevé de mes factures » (bureau) et « Calendrier » (téléphone) absents. Fiche `TCK-2654.json` a-7.

## Direction UX / Artistique

**Référence de fidélité** : page `app-interventions`, approche `a`, fichier `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-interventions-autres.tsx` :

- **e6 « Bailleur — devis à approuver »** :
  - téléphone (l. 480-500) : bloc « Depuis janvier », action « Par bien », chiffres « Interventions 12 — dont 9 closes » et « À votre charge 1 521 000 F — déduit de vos revenus » ;
  - bureau (l. 503-530) : même bloc, action « Historique par bien » ;
  - téléphone et bureau, dans la carte du devis (l. 436) : « Au-dessus de 150 000 F, votre mandat prévoit votre accord. Dakar Immo a consulté deux autres artisans (520 000 F et 610 000 F) et recommande ce devis. »
- **e7 « Prestataire — Ma semaine »** :
  - téléphone (l. 650-695) : action « Calendrier » sur « Cette semaine » (l. 661), section « À facturer · 2 » avec « Facturer » par ligne (`AFacturer`, l. 596-620) ;
  - bureau (l. 745-800) : sous-titre « … — 1 à accepter, 2 prévues, 2 à facturer », bouton « Relevé de mes factures » en tête, section « À facturer · 2 ».

## Contraintes strictes (métier)

- « Par bien » / « Historique par bien » ouvrent le détail `by_property` (feuille au téléphone, panneau au bureau), chaque bien menant à son historique d'interventions.
- La phrase de mise en concurrence n'est rendue que si `quote_alternatives` est non vide ; elle cite les montants servis.
- « Facturer » ouvre la saisie du montant final (prérempli du devis approuvé) et de la pièce, puis envoie `submit` ; la ligne quitte « À facturer ».
- « Relevé de mes factures » propose la période (mois courant par défaut).
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel.

## Delta à produire

- [ ] Bailleur : bloc « Depuis janvier » + détail par bien ; phrase de mise en concurrence dans la carte du devis.
- [ ] Prestataire : « À facturer » + « Facturer » ; « Calendrier » (téléphone) vers le calendrier ; « Relevé de mes factures » (bureau) ; sous-titre compté.
- [ ] Fiche de fidélité `TCK-2654.json` (a-7 et le bloc bailleur levés) ; docblock de `InterventionsDuBailleur`.
- [ ] Tests : bloc rendu depuis la réponse ; « dont 9 closes » ; phrase des devis concurrents présente/absente ; « Facturer » → `POST …/submit` ; « Relevé » → `…/statement/pdf` avec la période ; « Calendrier » → `/app/calendar`.

## Critères d'acceptation

- [ ] AC1 — Avec `{total: 12, closed: 9, charged_amount: 1521000}`, le bailleur voit « Depuis janvier », « 12 », « dont 9 closes » et « 1 521 000 F » à 390 et à 1440 ; « Par bien » (téléphone) / « Historique par bien » (bureau) ouvre la liste des biens avec leurs chiffres.
- [ ] AC2 — Une demande avec deux devis concurrents de 520 000 F et 610 000 F rend la phrase « … a consulté deux autres artisans (520 000 F et 610 000 F) … » ; sans devis concurrent, la phrase s'arrête au seuil du mandat.
- [ ] AC3 — Le prestataire avec 2 factures `draft` voit « À facturer · 2 » ; « Facturer » sur l'une envoie `POST /api/service-provider-bills/{id}/submit` avec le montant saisi, et la section passe à « À facturer · 1 ».
- [ ] AC4 — À 390, « Cette semaine » porte l'action « Calendrier » qui mène au calendrier filtré sur ses interventions ; à 1440, « Relevé de mes factures » télécharge le relevé de la période choisie.
- [ ] AC5 — Le sous-titre du bureau compte « n à accepter, n prévues, n à facturer » depuis les données servies.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)) — fiche : `docs/qa/audit-ux-2026-11/fidelite/TCK-2654.json` (écrans e6, e7) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2654.json` (écrans e6, e7) liste chaque écran de maquette implémenté par ce ticket (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés ; les écarts que ce ticket lève en sont retirés.
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'ADR-0106 § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif (une des trois exceptions d'ADR-0106 § 2, ou une donnée).
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une, sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- L'agence et le locataire (TCK-2918).

## Notes d'implémentation

Implémenté le 2026-11-15 (worktree `feat/audit-manques-2026-11-15`), sur l'API de TCK-2911 (ADR-0120).

**Prémisses re-mesurées — ce qui différait :**
- La facture ne sert de son intervention que `{id, title}` et de son bien que `{id, title}` : « Sacré-Cœur 3 » (quartier) devient le titre du bien, et « terminée hier » se lit du `created_at` du brouillon, qui naît à la clôture des travaux (`MaintenanceRequestObserver::bill`) — aucune clé d'API ajoutée.
- `property.agency.name` n'est servi au détail qu'avec `include=property`, ce que `useMaintenanceRequest` envoie : la phrase nomme l'agence ; sans nom, « L'agence a consulté… ».
- « Mes factures » listait tous les statuts : elle aurait repris chaque brouillon sous le badge « À facturer ». Elle filtre désormais les factures émises (`STATUTS_DES_FACTURES_EMISES`, par l'API).
- `filter[lease_id]` (ajout de la session) : l'API l'autorisait déjà (`MaintenanceRequest::$requestFilterable`, éprouvé par `LeaseMaintenanceSummaryTest`) — aucun changement d'API. Le front l'ignorait : la page ouvrait les files de l'agence (ou l'accueil du bailleur), et `MaintenanceList` ne le lisait pas.

**Livré :**
- Bailleur — `acteurs/DepuisJanvier.tsx` : « Depuis {mois de `since`} », « Interventions 12 / dont 9 closes », « À votre charge 1 521 000 F / déduit de vos revenus » (`useBilanDuBailleur`, `GET /api/owner/maintenance-summary`), sous « En cours » ; « Par bien » (téléphone) / « Historique par bien » (bureau) ouvre `FeuilleDuBas` (feuille / panneau) listant `by_property`, chaque bien vers `/app/properties/{id}?tab=interventions`. Sa lecture est indépendante : un échec se dit en une ligne sans masquer le devis ; un bailleur sans devis ni en-cours mais avec un bilan n'a plus l'état vide.
- Bailleur — `RappelDuSeuil` : « … votre mandat prévoit votre accord. {agence} a consulté deux autres artisans (520 000 F CFA et 610 000 F CFA) et recommande ce devis. » quand `quote_alternatives` est non vide (pluriel ICU 1/2/3/n, `Intl.ListFormat`) ; s'arrête au seuil sinon. Monté par `DecisionDuDevis` (liste, accueil) et `QuoteActions` (fiche). Type `quote_alternatives` déclaré (`types/maintenance.ts`).
- Prestataire — `acteurs/AFacturer.tsx` : « À facturer · n » (`filter[status]=draft`, `meta.total`), ligne « titre / bien · terminée hier », « Facturer » → feuille (montant final prérempli du brouillon, numéro et pièce facultatifs, sans zod : écran de lecture) → `POST /api/service-provider-bills/{id}/submit` multipart (`useFacturer`), relecture des clés `service-provider-bills` : la ligne quitte la section.
- Prestataire — « Calendrier » sur « Cette semaine » (sous `xl`, là où la grille manque) → `/app/calendar?view=week&types=maintenance` ; `acteurs/ReleveDesFactures.tsx` en tête (bureau) : période au choix (mois en cours par défaut, douze derniers mois, « Depuis janvier {année} »), `useTelechargementApi` → `…/statement/pdf?from=…&to=…` ; sous-titre « …, n à facturer ».
- Liste — `?filter[lease_id]=` : la page rend la liste complète (« Les interventions de ce bail ») pour tout persona, et `MaintenanceList` transmet `filter[lease_id]` à l'API (`MaintenanceListParams.lease_id`).
- Docblocks d'`InterventionsDuBailleur` et `InterventionsDuPrestataire` (écarts levés) ; `factures.videTexte` réécrit (la facture naît en brouillon) ; fiche `TCK-2654.json` : 5 écarts levés retirés (concurrence, « Depuis janvier », « À facturer », « Relevé »/« Calendrier », largeur du titre), 4 écarts motivés ajoutés (« F CFA », feuille par bien, feuilles « Facturer »/période, bien nommé par son titre).

**Décisions (mineures, tranchées) :** montants en « F CFA » (écriture de `useFormatteurs` partout, la maquette dit « F ») ; la feuille par bien mène à l'onglet Interventions de la fiche du bien (`MaintenanceHistoryByProperty`), pas à une vue neuve ; le relevé propose aussi l'année en cours (366 jours au plus côté API) ; « Calendrier » aussi entre `md` et `xl` (la grille n'y est pas) ; « À facturer » absent quand il n'y a rien.

**Mesures :** tests neufs — `interventions-du-bailleur.tck-2919` (6), `interventions-du-prestataire.tck-2919` (7), `MaintenanceList.bail.tck-2919` (3), `page.bail.tck-2919` (3) ; mocks réseau des deux tests TCK-2654 adaptés (bilan, routage des factures par statut). 28 fichiers du périmètre verts (224 tests) + gardes zod / flèche / sitemap / show-sans-fields. 8 ablations rouges puis restaurées (md5) : concurrents vidés, bilan jamais montré, « Mes factures » sans filtre de statut, `amount` non envoyé, période figée au mois courant, `lease_id` non transmis, page sans branche du bail, sous-titre à 0. ESLint propre ; `check:i18n`, `check:i18n-namespaces`, `check:vouvoiement` verts. Restent rouges, hors de ce ticket (baux, TCK-2912 en cours) : `tsc` (`agency/lease-settings/page.tsx`), `check:classes-emises` et `check-valeurs-arbitraires-app` (`ReglagesDeBail.tsx`).

**Non mesuré (navigateur hors du lot) :** AC-F2 à AC-F6 (`fidelite compare`, rideau, largeurs intermédiaires) ; AC1/AC4 « à 390 et à 1440 » éprouvés par les classes responsives et les tests, pas au navigateur.
