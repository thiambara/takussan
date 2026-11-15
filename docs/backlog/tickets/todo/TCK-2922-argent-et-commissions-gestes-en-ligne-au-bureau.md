---
id: TCK-2922
title: "Argent et commissions au bureau : « Relancer » sur chaque impayé du tableau, « Approuver » / « Refuser » en ligne, le menu ⋯ des impayés, la case « En attente » et l'icône « Relevé de l'agent »"
status: todo
phase: P2
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#28-payout-"
tags: [front, agence, argent, commissions, impayes, reversements, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

Au bureau, l'admin agit depuis le tableau du mois sans ouvrir chaque dossier : il relance un impayé, approuve ou refuse un reversement, et retrouve en un geste le relevé d'un agent.

## Contrat de données

Aucun endpoint neuf ; tout existe :

- relance d'un impayé : la feuille / le panneau de relance de TCK-2660 (`impayes/RelanceDUnImpaye.tsx`) ;
- reversements : `POST /api/payouts/{id}/approve` (step-up 2FA) et `POST /api/payouts/{id}/cancel` (`usePayoutApprove`, `usePayoutCancel`) ;
- encaissements : la lecture du mois déjà faite par `EncaissementsAgence` (statuts `pending`, moyens de paiement) ;
- commissions : le relevé de l'agent déjà servi à la vue admin (`VueAdmin.tsx`).

La spec ne détaille pas ces gestes de ligne : à reporter par `/sync-specs`.

## Direction UX / Artistique

- **Référence de fidélité** :
  - `app-argent`, **approche A**, `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-argent-a.tsx` (+ `app-argent-lignes.tsx`), visionneuse `?p=app-argent&a=a` — **e0 « Tableau du mois », bureau** (le téléphone est conforme) ; **e1 « Impayés et relance », bureau** (menu ⋯ en bout de rangée, `app-argent-a.tsx:545`) ; **e3 « Encaissements », bureau** (bande des totaux, `app-argent-a.tsx:818`).
  - `app-commissions`, **approche A**, `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-commissions.tsx` — **e1 « Vue admin par agent », bureau** : icône « Relevé de l'agent » en bout de rangée.
- Audit : `audit-f6-agence-entree.md`, § app-argent (e0, e1, e3), § app-commissions (e1), et « écarts couverts par les fiches » (TCK-2659 / TCK-2677 : colonne « Relancer » annoncée réinsérée par TCK-2660, jamais faite ; approbation en ligne « à trancher » jamais tranchée ; TCK-2660/2682 : ⋯ écarté).
- **Bureau seulement** dans ce ticket ; le téléphone de ces écrans est conforme et ne doit pas régresser.

## Contraintes strictes (métier)

- « Approuver » en ligne passe par le même step-up 2FA que depuis le détail ; « Refuser » demande le même motif que le refus du détail. Les deux ne paraissent qu'avec `payouts.approve`.
- La relance en ligne ouvre la même relance (WhatsApp, lien de paiement, journal « relancé il y a … ») que l'écran Impayés : aucune seconde implémentation.
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français ; vouvoiement.

## Delta à produire

- [ ] Carte « À faire · impayés les plus anciens » (tableau du mois, bureau) : 3ᵉ colonne « Relancer » par ligne.
- [ ] Carte « À faire · reversements à approuver » : « Refuser » et « Approuver » sur chaque ligne (« Examiner » reste pour ouvrir le détail).
- [ ] Table des impayés (bureau) : menu ⋯ « Plus d'actions » en bout de rangée.
- [ ] Encaissements (bureau) : 3ᵉ case de la bande des totaux « En attente ».
- [ ] Commissions, vue admin (bureau) : icône « Relevé de l'agent » par rangée.
- [ ] Tests de chaque geste.

## Critères d'acceptation

- [ ] AC1 — À 1440, chaque ligne de « À faire · impayés les plus anciens » porte un bouton « Relancer » qui ouvre la relance de **cet** impayé (montant et locataire de la ligne) ; après envoi, la ligne dit « relancé à l'instant ».
- [ ] AC2 — Avec un reversement à approuver et la capacité `payouts.approve`, sa ligne porte « Approuver » (qui appelle `POST /api/payouts/{id}/approve` après le second facteur, puis retire la ligne) et « Refuser » (qui demande un motif puis appelle `POST /api/payouts/{id}/cancel`). Sans la capacité, ni l'un ni l'autre n'est rendu.
- [ ] AC3 — Dans la table des impayés au bureau, chaque rangée a un bouton « Plus d'actions » (⋯) qui ouvre un menu offrant au moins « Fiche client », « Encaisser un paiement » et « Voir le bail » de cette rangée.
- [ ] AC4 — La bande des totaux des encaissements au bureau rend, en 3ᵉ case, « En attente » : lecture `status=pending` **bornée par l'échéance** (la règle D2 de TCK-2659, comme « Échoué » : `EncaissementsAgence.tsx:160-171`), montant et sous-ligne « N virement(s) annoncé(s) » quand le moyen est un virement, sinon « N paiement(s) en attente ». Avec un paiement `pending` de 1 800 000 F par virement échu dans le mois, la case dit « 1 800 000 F · 1 virement annoncé ». « Restant » quitte la bande (la maquette n'en a pas) ; le reste dû du mois se lit dans la tuile « Impayés » du point du mois.
- [ ] AC5 — Dans la table « par agent » des commissions au bureau, chaque rangée porte l'icône « Relevé de l'agent » (libellé accessible), qui ouvre le relevé de cet agent ; le lien vers ses lignes (`?agent=`) reste.
- [ ] AC6 — Vérifier au navigateur, avec au moins un reversement à approuver en base de démo, la carte « reversements à approuver » et les lignes conditionnelles de « À faire » (non vérifiables par le code selon l'audit) ; corriger si absentes.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiches de fidélité des tickets d'origine (TCK-2659, TCK-2660, TCK-2677, TCK-2682, TCK-2662) mises à jour : les entrées `ecarts_acceptes` couvertes par ce ticket sont retirées.
- [ ] AC-F2 — À 1440 × 900 (densité ×0,9), `fidelite compare` sur argent e0, e1, e3 et commissions e1 ne rend aucun écart non expliqué ; à 390 rien ne régresse.
- [ ] AC-F3 — Largeurs intermédiaires (ADR-0106 § 4) : à 1024 et 768, les tables défilent dans leur conteneur, aucun défilement horizontal du document.

## Hors périmètre

- Le téléphone de ces écrans (conforme).
- Un statut « virement annoncé par le locataire » distinct de `pending` (il n'existe pas ; la case lit `pending`).

## Notes d'implémentation

_(à remplir par implementing-specs)_
