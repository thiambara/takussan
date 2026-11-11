---
id: TCK-2629
title: "Rapports, les onglets de travail : Équipe, Impayés (balance âgée), Exports prêts à télécharger, Alertes qui disent leur état, chiffres personnalisés sur la page"
status: todo
phase: P2
family: front
estimate: L
wave: 87
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2626, TCK-2627, TCK-2628, TCK-2657, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#64-kpiconfig-"
    - "docs/models-spec.md#65-thresholdalert-"
tags: [front, rapports, exports, alertes, audit-ux, app]
---

## Objectif utilisateur

L'admin compare ses agents sur un tableau. Il voit ses impayés par ancienneté et sait lesquels n'ont jamais été relancés. Il télécharge « Paiements du mois dernier » en un geste et sait si une alerte veille, et sur quelle valeur. Il règle les chiffres de sa vue d'ensemble sur la page même, et voit leur effet.

## Contrat de données

- **Équipe** :
  - `GET /api/agencies/{agency}/team-performance`, avec `leads_handled` (TCK-2626) ;
  - délai de première réponse par agent : `contact-leads/response-stats` (famille 5), affiché quand il est livré, colonne absente avant.
- **Impayés** :
  - tranches de `GET /api/agencies/{agency}/finance/aging` (existant) ;
  - liste par échéance avec payeur, bien, bailleur et jours de retard, plus la dernière relance : `payments/history` enrichi et `lease-payments/{id}/reminders` (famille 6). **La même lecture que la page des impayés de la famille 6, pas une seconde.**
- **Exports** :
  - `GET /api/export/{entity}` (existant : types selon les capacités, CSV, Excel ou PDF, période, plafonds 5 000 et 200 lignes, nom de fichier rendu par l'API) ;
  - `GET /api/me/exports` (TCK-2627).
- **Alertes** :
  - `threshold-alerts` (existant : création, modification, suppression) ;
  - `current_value`, `recipients`, `channels` et `include=triggers` (TCK-2627).
- **Personnaliser** : `kpi-configs`. Création, suppression, `sort_order` et `is_enabled` sont déjà acceptés par l'API. `kpi-configs/metrics` pour le catalogue.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-rapports&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes). Écrans « Personnaliser les chiffres », « Impayés (balance âgée) », « Exports », « Export personnalisé », « Alertes », « Nouvelle alerte ».
- **Équipe** :
  - **bureau** : un tableau avec Agent, Biens gérés, Demandes traitées, Visites, Baux signés, Commissions générées et Délai de réponse, trié par colonne ;
  - **téléphone** : une carte par agent, avec trois chiffres et « Voir ».
- **Impayés** :
  - en tête, les tranches (« 1–30 j · 31–60 j · 61–90 j · > 90 j »), chacune avec son compte, son montant, et un lien qui filtre la liste ;
  - puis la liste : locataire, bailleur, bien, montant dû, retard, « Dernière relance » (« Jamais relancé » en ton d'alerte) ;
  - « Relancer » ouvre le geste de la famille 6.
  - **Un seul composant Impayés** (décision du porteur du 2026-11-10, point 14 a) : l'onglet Impayés de Rapports (TCK-2629) et l'écran Impayés d'« Argent » (TCK-2660) sont **le même composant**, mêmes données, mêmes filtres, même relance unitaire et en lot (TCK-2682) — pas deux écrans qui se ressemblent. Ce qui diffère (en-tête, place dans la page) passe par ses propriétés. Ce ticket **monte** le composant livré par TCK-2660 ; s'il est mergé avant lui, il l'écrit et TCK-2660 le reprend.
- **Exports** :
  - des **cartes prêtes** (« Paiements du mois dernier · Excel › Télécharger », « Baux actifs · Excel », « Balance âgée · PDF ») ;
  - puis « Export personnalisé » (le formulaire actuel, avec les préréglages de période « Mois dernier · Ce mois · Année 2026 ») ;
  - puis « Derniers exports » (date, type, lignes, « Refaire ») ;
  - au téléphone, le PDF est recommandé pour la lecture sur place.
- **Alertes** :
  - une ligne par alerte : jauge de la valeur actuelle avec le trait du seuil (« Taux d'impayés : 3,91 % · seuil 10 % »), puis « Dernier déclenchement » (« jamais » ou une date), destinataires, canal et délai ;
  - au bureau, un tableau à ces colonnes ;
  - « Nouvelle alerte » en feuille ou en dialogue.
- **Personnaliser les chiffres** :
  - depuis la vue d'ensemble, « Personnaliser » ouvre le mode réglage **sur la page** : poignées pour ordonner, interrupteur pour masquer, « Ajouter un chiffre » (métrique, libellé, format), aperçu de la valeur ;
  - « Terminé » referme.
- **Téléphone (360–390)** : cartes, feuilles du bas. **Bureau (≥ 1280)** : tableaux dès `lg`, formulaire d'export en colonne droite.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0089](../../../adr/0089-le-menu-de-app-se-derive-du-profil-actif.md), [ADR-0096](../../../adr/0096-l-accueil-est-la-journee-et-les-rapports-sont-une-page.md), [ADR-0105](../../../adr/0105-la-relance-d-un-impaye-part-du-telephone-de-l-agence.md).

**Pas de régression.**

- **Indicateurs** :
  - ajouter (métrique du catalogue, libellé, format nombre, montant ou pourcentage), supprimer ;
  - état vide ;
  - les tuiles de la vue d'ensemble lisent ces chiffres (TCK-2373) ;
  - ouvert aussi en agence individuelle (TCK-284).
- **Alertes** :
  - métrique, opérateur, seuil, sévérité, délai entre deux alertes (24 h par défaut) ;
  - liste, suppression ;
  - « évaluées toutes les heures » dit à l'écran.
- **Exports** :
  - types selon les capacités (paiements, baux, clients, biens, reversements, factures, commissions, balance âgée, cautions ; le bailleur : paiements, baux, biens) ;
  - formats CSV, Excel et PDF ;
  - période ;
  - « Les exports respectent votre rôle », « 5 000 lignes au plus, 200 en PDF » ;
  - la coupure au plafond signalée (en-tête de TCK-1308) ;
  - nom de fichier rendu par l'API.

**Autres règles :**

- **Une carte prête est un export comme un autre** : mêmes capacités, mêmes plafonds, même journal. Une carte dont le type n'est pas permis n'est pas rendue.
- **« Refaire »** relance l'export avec les mêmes paramètres, sous les capacités d'aujourd'hui (TCK-2627). Aucun fichier n'est conservé ni promis.
- **Impayés** :
  - Takussan n'envoie rien (décision 13 a) ;
  - la liste ne mélange jamais deux agences ;
  - un bailleur qui ouvre Rapports n'a **pas** cet onglet (il a « Vue d'ensemble · Reversements · Exports »).
- **Équipe** : un onglet du **persona admin d'agence**, sous la garde de `team-performance` (`viewReports`). L'agent ne l'a pas, même s'il détient `reports.view_agency` : ses onglets sont ceux de la maquette, et le délai de réponse d'un collègue ne lui est jamais montré (décision 7 a de la famille 5).
- **Ordre et masquage des chiffres** : `sort_order` et `is_enabled` sont enregistrés à « Terminé ». Un échec rend l'ordre d'avant et le dit.
- Libellés en français (« Indicateurs », « Délai de réponse ») en `fr`/`en`/`wo` (`wo` = le français tel quel) ; vouvoiement.

## Delta à produire

- [ ] Onglet « Équipe » (tableau au bureau, cartes au téléphone).
- [ ] Onglet « Impayés » : tranches, liste par échéance, dernière relance, « Relancer » (geste de la famille 6).
- [ ] Onglet « Exports » : cartes prêtes, export personnalisé avec préréglages, derniers exports et « Refaire ».
- [ ] Onglet « Alertes » : valeur actuelle et seuil, dernier déclenchement, destinataires, canal, création et modification.
- [ ] Mode « Personnaliser » de la vue d'ensemble : ordre, masquage, ajout, aperçu.
- [ ] Tests :
  - une carte prête interdite n'est pas rendue ;
  - « Refaire » rejoue les mêmes paramètres ;
  - « Jamais relancé » en ton d'alerte ;
  - jauge et seuil lus de `current_value` ;
  - réordonner écrit `sort_order` ;
  - masquer écrit `is_enabled: false` ;
  - un agent n'a pas l'onglet « Équipe ».

## Critères d'acceptation

- [ ] AC1 — Admin : la carte « Paiements du mois dernier · Excel » lance `GET /api/export/payments?format=xlsx&from=2026-10-01&to=2026-10-31` (réseau, le 2026-11-10). Le fichier porte le nom rendu par l'API, et la ligne apparaît en tête de « Derniers exports » après rechargement.
- [ ] AC2 — Bailleur : l'onglet « Exports » ne propose que paiements, baux et biens (compte = 3 types), en cartes comme en formulaire.
- [ ] AC3 — Alerte « Taux d'impayés > 10 % » jamais déclenchée : la ligne dit « 3,91 % », « seuil 10 % » et « jamais ». Les destinataires sont les admins actifs (nombre égal à `recipients.count`).
- [ ] AC4 — Dans « Impayés », la tranche « 31–60 j » filtre la liste sur les échéances de 31 à 60 jours (paramètres vus au réseau). Une échéance sans relance porte « Jamais relancé ».
- [ ] AC5 — En mode « Personnaliser », glisser « Taux d'impayés » en premier puis « Terminé » envoie `PATCH kpi-configs/{id}` avec le nouveau `sort_order`. Après rechargement, la tuile est la première de la vue d'ensemble.
- [ ] AC6 — Un agent qui détient `reports.view_agency` n'a pas d'onglet « Équipe ». `team-performance` ne part pas de sa page (réseau).

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2629.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- La page des impayés de l'onglet « Argent » et le geste de relance (TCK-2660, TCK-2682) : cet onglet monte le même composant.
- L'envoi programmé d'un export, le format SYSCOHADA.
- Le choix des destinataires d'une alerte.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
