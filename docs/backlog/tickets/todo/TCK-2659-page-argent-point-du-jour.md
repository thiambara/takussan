---
id: TCK-2659
title: "Page Argent : le point du jour, puis les encaissements nommés"
status: todo
phase: P1
family: front
estimate: L
wave: 90
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2657, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: [TCK-2677]
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models: []
tags: [front, finances, mobile, audit-ux, app]
---

## Objectif utilisateur

L'admin d'agence sait en dix secondes, au téléphone, ce qui est entré ce mois et ce qui manque, et répond à « Mme Diop a-t-elle payé ? » sans ouvrir un bail.

## Contrat de données

- Point du mois : `GET /api/agencies/{agency}/finance/summary?period=YYYY-MM` (TCK-2657).
- Encaissements nommés : `GET /api/payments/history` avec `include=payer,property,landlord`, filtres `payer_id`, `property_id` (via `entity_type=property`), `landlord_id`, `payment_method`, `search`, `status`, `date_from` / `date_to` (TCK-2657) — **filtrés côté serveur**, jamais sur une liste déjà reçue.
- Registres existants inchangés : factures, reversements, à approuver, impayés (`finance/aging`), dialogues de facture et de reversement.
- Export : `GET /api/export/payments` (paiements de bail seulement, `PaymentsExport`).

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-argent&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Tableau du mois » et « Encaissements », téléphone et bureau.
- **Téléphone (360-390 px)** : titre « Argent » et sélecteur de mois ; deux tuiles côte à côte (Encaissé, avec la variation sur le mois précédent ; Impayés, ton d'alerte, avec le nombre de baux) ; « À faire » en trois lignes à chevron qui ouvrent chacune sa file (impayés à relancer, reversements à approuver, factures à émettre) ; « Derniers encaissements » nommés (payeur, bien, période, moyen, montant) ; « Tout voir » (les cinq registres) et « Créer » (facture, reversement) en bas. Encaissements : recherche, pastilles de moyen, cartes groupées par jour avec le total du jour, export en icône dans l'en-tête.
- **Bureau (≥ 1280 px)** : en-tête « Argent », mois, « Générer une facture », « Créer un reversement » en secondaires, « Rapprochement bancaire » en lien visible (icône et libellé) ; quatre tuiles cliquables avec leur variation ; dès `lg`, deux colonnes — « À faire » (les impayés les plus anciens, les reversements à approuver) et « Derniers encaissements » — puis les onglets actuels. Onglet Encaissements : colonnes Payeur · Bien · Période · Montant · Moyen · Date · Statut · Référence (la référence en dernier, discrète) ; filtres Payeur, Bien, Bailleur, Moyen, Statut, période.
- Règle de la coque : `md` n'est pas le bureau, les colonnes commencent à `lg`. Aucun tableau à défilement horizontal au téléphone : des cartes.
- Un indicateur nul ne prend pas une carte au téléphone (une ligne « À faire » à zéro disparaît).
- Ton : vouvoiement (décision 2).

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0100](../../../adr/0100-une-page-paiements-par-public.md).

Fonctions existantes à garder (lues dans `finances/page.tsx`, `AdminFinancesClient.tsx`, `FinanceKpis.tsx`, `AdminFinancesTabs.tsx`, `PaymentsHistoryFilters/Table`, `InvoicesTable`, `PayoutsTable`, `OverduePaymentsTable`, `CreateInvoiceDialog`, `CreatePayoutDialog`, `InvoiceDetailDialog`, `PayoutDetailDialog`) :

- Les quatre indicateurs (encaissé, impayés et baux concernés, reversements en attente, factures à émettre) ; chacun devient **cliquable vers son onglet**.
- Les onglets dans l'URL (`?tab=encaissements|factures|reversements|a-approuver|impayes`), « À approuver » réservé à `payouts.approve` ; un lien entrant existant vers un onglet continue d'y mener.
- « Générer une facture » (`invoices.create`), « Créer un reversement » (`payouts.create`), « Rapprochement bancaire » (`payments.reconcile`), avec le squelette pendant la lecture des capacités.
- Encaissements : statut, période du / au, totaux (total, payé, restant, lignes), pagination de 20, cartes au téléphone (TCK-2331). Les filtres par entité (`entity_type` / `entity_id`) ne sont plus proposés à l'écran mais **restent lus dans l'URL** (liens entrants depuis un bail ou un client).
- Factures (liste, détail, avoir), reversements et « À approuver » (détail, approuver, marquer payé avec référence, double validation au-dessus du seuil), impayés par locataire / par bailleur avec tranches, total, cautions détenues et lien vers la fiche client, dialogue de reversement qui calcule ligne à ligne.
- États : sans agence (`NoAgencyState`), super-admin sans agence renvoyé vers `/super-admin`, accès refusé (`finances-degraded`).
- Libellés corrigés : « Encaissé en {mois} » (la mesure est le mois civil, pas 30 jours) ; « baux » au pluriel (`admin.finances.kpis.overdueHint`).
- Au téléphone, cette page est la racine de l'onglet « Argent » de l'admin (décision 12 ; l'onglet lui-même est porté par la coque, famille 3) : pas de flèche de retour sur l'écran racine.
- Le bouton « Exporter » dit ce qu'il exporte (les loyers du mois) tant que l'export ne couvre pas les réservations.
- i18n : tout libellé neuf en `fr`, `en`, `wo` ; `wo` porte le texte français tel quel (wolof en pause). Montants en F CFA (`useFormatteurs()`), jamais « XOF ».

## Delta à produire

- [ ] Écran « point du mois » au-dessus des registres, mobile et bureau, avec le sélecteur de mois.
- [ ] Tuiles cliquables vers leur onglet ; « À faire » vers ses files.
- [ ] Encaissements nommés : colonnes et cartes, recherche et filtres métier, groupement par jour au téléphone.
- [ ] Libellés « Encaissé en {mois} » et « baux ».
- [ ] Tests : tuile vers onglet ; envoi des filtres au réseau ; ligne « À faire » nulle absente ; `entity_id` de l'URL respecté ; « À approuver » absent sans `payouts.approve`.

## Critères d'acceptation

- [ ] AC1 — À 390 × 844, les deux tuiles et toute la section « À faire » sont visibles sans défiler, et aucun élément ne dépasse la largeur du viewport (mesure de la plus grande boîte, pas de `scrollWidth` seul).
- [ ] AC2 — Choisir « Octobre 2026 » envoie `period=2026-10` (vu au réseau) et la tuile « Encaissé en octobre » affiche `collected.amount` formaté en F CFA.
- [ ] AC3 — Toucher « 3 reversements à approuver » ouvre `?tab=a-approuver` ; un admin sans `payouts.approve` ne voit ni la ligne ni l'onglet.
- [ ] AC4 — Une ligne d'encaissement montre le nom du locataire, le titre du bien, « Loyer de novembre », le moyen et le montant ; la référence est la dernière colonne au bureau.
- [ ] AC5 — Taper « diop » dans la recherche envoie `filter[search]=diop` (une seule requête après la saisie) ; choisir un bailleur envoie `filter[landlord_id]`.
- [ ] AC6 — `/app/agency/finances?tab=encaissements&entity_type=lease&entity_id=3` n'affiche que les paiements du bail 3.
- [ ] AC7 — Avec 16 baux en retard, la tuile dit « 16 baux » en français, jamais « bails ».

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2659.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- La relance des impayés et l'écran « Impayés » (TCK-2660, composant unique partagé avec l'onglet Impayés de Rapports, TCK-2629 ; relance en lot : TCK-2682).
- L'onglet « Argent » de la barre mobile et les groupes du menu de bureau (famille 3).
- La file « À reverser ce mois » par bailleur (ambition de l'audit).

## Notes d'implémentation

_(à remplir par implementing-specs)_
