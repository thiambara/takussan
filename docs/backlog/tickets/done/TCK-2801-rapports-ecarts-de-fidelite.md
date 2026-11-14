---
id: TCK-2801
title: "Rapports, écarts de fidélité : un pourcentage à une décimale, la tête de page, la pastille d'Impayés, « Menu » actif, et les rendus revenus à la maquette"
status: done
phase: P2
family: front
estimate: M
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: [TCK-2628, TCK-2629]
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#65-thresholdalert-"
tags: [front, rapports, fidelite, suite-de-tck-2628, suite-de-tck-2629, audit-ux, app]
---

## Objectif utilisateur

Sur « Rapports », un même chiffre se lit de la même façon partout : le taux d'impayés que l'API rend à 3,91 se lit
« 3,9 % » sur la tuile, dans « Personnaliser » et dans l'alerte (il se lisait « 4 % », « 3,9 % » et « 3,91 % »). La tête de
page dit de quoi parle le rapport et mène à l'export ; l'onglet Impayés dit combien d'échéances attendent ; au téléphone,
« Menu » dit où l'on est. Les blocs dessinés autrement que la maquette sans motif (pipeline, portefeuille, ordre du bailleur,
formulaires) reviennent à la maquette.

Source : relevés de fidélité du 2026-11-14 (`docs/qa/audit-ux-2026-11/fidelite/TCK-2628.json` O1 à O8,
`TCK-2629.json` O1 à O7 ; `takussan-web/.fidelite/TCK-2628/c1-*`, `TCK-2629/c1-*`).

## Delta

1. **Une règle pour les pourcentages** (TCK-2628 O4) : une décimale au plus pour toute valeur MESURÉE de la page (tuiles,
   total et infobulle des graphiques, valeur actuelle d'une alerte, aperçu de « Personnaliser »), par UNE fonction ; un seuil
   SAISI s'écrit tel qu'on l'a saisi (deux décimales au plus), les graduations d'axe restent entières. Face à un seuil (valeur
   actuelle d'une alerte), la même fonction garde deux décimales quand une seule ferait passer l'arrondi de l'autre côté
   du seuil (3,95 pour 3,95 → « 3,95 % », pas « 4 % » ; 10,04 pour 10 → « 10,04 % ») — consigne de team-lead, 2026-11-14. Conséquence assumée :
   l'AC3 de TCK-2629 (« 3,91 % ») se lit « 3,9 % » ; l'occupation de la démo « 46,9 % » (décision 1 a, validée par team-lead le
   2026-11-14).
2. **Tête de page au bureau** (TCK-2628 O2, TCK-2629 O4) : la description « <nom> · du 1 au 30 novembre 2026 » (l'agence
   pour l'admin, la personne pour l'agent — l'agence sous la portée « Agence » —, le bailleur et l'hôte), et « Exporter »,
   un lien vers l'onglet Exports quand la persona l'a. Au téléphone l'en-tête de page reste sans hauteur (la ligne de
   période reste dans la page, comme la maquette) ; dès `md`, la ligne de période de la page cède à la description.
   La période s'écrit en mois longs (« Du 1 au 30 novembre 2026 »).
3. **Pastille d'Impayés** (TCK-2628 O3) : le compte des échéances impayées sur l'onglet, lu côté navigateur par la règle
   de l'onglet (`payments/history`, `filter[days_late_min]=1`, `per_page=1`, `meta.total`) ; une lecture en échec n'en
   pose aucune, jamais « 0 » à la place d'un compte absent. La pastille vit dans le lien de l'onglet Impayés : elle n'existe,
   et ne lit l'API, que si la persona ouvre cet onglet, par la même garde que lui (`ongletsDesRapports`).
4. **Sous-texte servi** (TCK-2628 O6) : « seuil d'alerte : 10 % » sous « Taux d'impayés » quand une alerte active porte
   sur `unpaid_rate_percent` (lecture des alertes, seulement si l'onglet Alertes est ouvert ; un échec n'en pose aucun).
5. **Bailleur** (TCK-2628 O5) : au téléphone, « Mon portefeuille » est une carte pleine largeur avec sa jauge empilée
   (loués · libres · autres) et sa légende ; au bureau, une tuile au texte. « Prochains reversements » suit les tuiles au
   téléphone (colonne de droite au bureau, inchangé).
6. **Agent** (TCK-2628 O5) : « Prospects par étape » en barres pleines proportionnelles, le nombre au bout de la barre.
7. **Export personnalisé** (TCK-2629 O2, O5) : le format en contrôle segmenté (« CSV · Excel · PDF ») ; les types disent
   « Balance âgée » et « Cautions » (les mots des cartes prêtes et de la maquette) ; le bouton « Télécharger l'export ».
8. **Nouvelle alerte** (TCK-2629 O3, O5) : la sévérité en contrôle segmenté « Information · Attention · Critique » ; le délai
   « Délai entre deux alertes », son unité « heures » écrite à côté du champ.
9. **« Menu » actif** (TCK-2628 O7) : dans la barre d'onglets du téléphone, « Menu » est mis en avant (trait, gras, icône)
   quand la page courante est une entrée du menu qui n'est AUCUN des onglets — règle de la coque, pas de Rapports : 84
   écrans de maquette posent `onglet="menu"` sur une page du menu.

## Consigné, hors de ce ticket

- **« Ce mois ▾ »** : attend TCK-2791 (`period=last_month`) ; un sélecteur sans second mois n'aurait rien à choisir (même
  motif que les puces de période acceptées).
- **« Agence ▾ » de l'admin** : non rendu. `GET /api/dashboard/agency` n'accepte qu'`agency_id` (l'agence se choisit par
  le profil actif, dans la coque) : aucune portée par agent ou par bailleur à choisir. Chez l'agent, c'est la bascule
  « Moi / Agence », déjà rendue. Revient si une portée par agent est servie (décision 2 a, validée par team-lead le 2026-11-14).
- **Sous-textes non servis** : « 4 à renouveler d'ici 30 j » (aucun compte de baux à échéance), « 310 000 F à venir » et
  « +5 cette semaine » de l'agent (`dashboard/agent` ne les rend pas). « Visites » dit « sur les 7 prochains jours » :
  c'est `upcoming_7d`, la donnée vraie.
- **Onglets au téléphone** 44 px plus bas et non collants (TCK-2628 O1, TCK-2629 O1) : gabarit `PageHeader` de toutes
  les pages à onglets, ticket à part.
- Graphiques : mois de l'axe en initiales au téléphone et lien « Voir le tableau » (vue tableau d'un graphique) : non
  traités ici, fiche de fidélité.

## Critères d'acceptation

- [x] AC1 — `unpaid_rate_percent: 3.91` → tuile « 3,9 % » ; occupation 46,94 → « 46,9 % » ; alerte : valeur actuelle
  « 3,9 % », seuil saisi 7,25 → « 7,25 % ». Ablation : rendre `maximumFractionDigits` à 0 sur la tuile → rouge. *Preuve : `pourcentages.tck-2801.test.ts`, `TuilesDuRapport.tck-2801.test.tsx`, `AlertList.tck-2629.test.tsx` (AC3 réécrit) ; ablation `maximumFractionDigits: 0` → 4 rouges ; face au seuil : 3,95 pour 3,95 → « 3,95 % » (`pourcentages.tck-2801`, `AlertList.tck-2629`), ablation de la règle → 3 rouges ; relevé c2-a-0-bureau-1280 « 3,9 % », « 46,9 % ».*
- [x] AC2 — Tête de page : la description porte le nom et la période en mois longs ; « Exporter » mène à
  `/app/reports/exports` et n'est pas rendu sans l'onglet Exports ; l'en-tête est masqué sous `md`. *Preuve : `TeteDesRapports.tck-2801.test.tsx` ; relevé c2-a-0-bureau-1280 : « Dakar Immo · du 1 au 30 novembre 2026 » et « Exporter » ; au téléphone l’en-tête n’a pas de hauteur, la période reste dans la page.*
- [x] AC3 — Pastille : `meta.total` 16 → « 16 » sur l'onglet Impayés ; lecture en échec → aucune pastille ; sans onglet
  Impayés → aucune lecture. Ablation : retirer la garde d'échec → rouge. *Preuve : `TeteDesRapports.tck-2801.test.tsx` ; ablation de la garde `isError` → rouge ; même garde que l’onglet (admin sans page d’origine, agent, bailleur, plateforme : aucune lecture), ablation « pastille détachée de l’onglet » → 2 rouges ; relevé c2-a-0-bureau-1280 : « 16 ».*
- [x] AC4 — Seuil : une alerte active `unpaid_rate_percent > 10` → « seuil d'alerte : 10 % » ; inactive ou autre
  métrique → aucun sous-texte. *Preuve : `vues-d-ensemble.tck-2628.test.tsx` (describe TCK-2801) et `pourcentages.tck-2801.test.ts` et `TuilesDuRapport.tck-2801.test.tsx` (tuiles configurées : le relevé rempli du 2026-11-14 a montré le manque quand l’agence a choisi ses chiffres — corrigé, test rouge puis vert, ablation rouge). Preuve par test seulement : le sous-texte n’a encore été vu dans aucun relevé.*
- [x] AC5 — Bailleur : la carte du portefeuille porte trois segments proportionnels et la légende « 5 loués · 54 libres ·
  10 autres » ; « Prochains reversements » vient avant les graphiques dans l'ordre du téléphone. *Preuve : `vues-d-ensemble.tck-2628.test.tsx` ; relevé c2-a-8-telephone : carte pleine largeur, légende, reversements (y 650) avant les graphiques (y 772).*
- [x] AC6 — Agent : chaque étape a une barre dont la largeur est proportionnelle à son compte, le compte écrit au bout. *Preuve : `vues-d-ensemble.tck-2628.test.tsx` (`data-slot="barre-d-etape"`) ; relevé c2-a-7.*
- [x] AC7 — Export personnalisé : un groupe radio « Format » à trois options ; les libellés « Balance âgée » et
  « Cautions » ; le bouton « Télécharger l'export ». Nouvelle alerte : un groupe radio « Sévérité » à trois options. *Preuve : `formulaires.tck-2801.test.tsx`, `ExportForm.*.test.tsx` ; relevés c2-a-4-telephone et c2-a-6-telephone.*
- [x] AC8 — « Menu » : mis en avant sur `/app/reports` (page du menu, aucun onglet) ; éteint sur une page qui est un
  onglet. Ablation : retirer la règle → rouge. *Preuve : `BarreDOnglets.test.tsx` (deux tests TCK-2801) ; ablation de la règle → rouge ; zone « coque · barre d’onglets » 1,94 % → 0,82 % (a-0), 0 % (a-8).*
- [x] AC9 — Relevés de fidélité refaits à 390 et 1280 ; chaque écart ouvert des deux fiches est fermé ou motivé, états
  remplis (« Personnaliser » à six chiffres, deux alertes, un export de plus) relevés puis effacés par l'API. *Preuve : `takussan-web/.fidelite/TCK-2628|2629/c2-*` et `c2r-*` ; chaque écart des deux fiches porte `statut` et `preuve` ; écritures notées puis effacées (GET → 0), reste la ligne « data_exported » de l’export.*
