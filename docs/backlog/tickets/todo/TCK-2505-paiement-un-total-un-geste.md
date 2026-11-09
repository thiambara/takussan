---
id: TCK-2505
title: Paiement d'une échéance « Un total, un geste » : coque de lien nue, total en un montant, aucun cul-de-sac
status: todo
phase: P1
family: front
estimate: M
wave: 84
created: 2026-11-08
updated: 2026-11-08
depends_on: [TCK-2504]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models: []
tags: [front, payments, pay-link, mobile, audit-ux]
---

## Objectif utilisateur

Le locataire ouvre le lien reçu par SMS ou WhatsApp, voit en un montant ce qu'il doit, paie d'un geste — ou, si le paiement en ligne est fermé, sait comment payer autrement.

## Contrat de données

`GET /api/pay/{token}` (avec `late_fee_outstanding`, `late_fee_payable_online` existants, et `offline_payment`, `paid_at` de TCK-2504), `POST initiate` et `POST verify` existants.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=paiement&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « À payer », « Hors ligne », « Payé », « Déjà réglée », téléphone et bureau.
- **Coque de lien nue** : l'agence émettrice et « Paiement sécurisé », rien de la marketplace (ni recherche, ni favoris, ni comparateur, ni barre d'onglets). Cette coque servira ensuite la revendication, le partage de document et les désinscriptions.
- La période et le locataire sont nommés (« Loyer d'octobre 2026 », « Pour Fatou Ndiaye »).
- Un total en grand, son détail dessous ; deux boutons de paiement de même poids. Wave et Orange Money nommés en texte, sans logo ni couleur de marque.
- Hors ligne : numéros copiables, virement, Appeler / WhatsApp de l'agence.
- Payé : reçu partageable sur WhatsApp.

## Contraintes strictes (métier)

- **Le total dit ce qui est réellement payable en ligne.** Pénalité encaissée en ligne par l'agence (`late_fee_payable_online`) : un seul total, pénalité dans le détail. Sinon : le total payable en ligne, et la pénalité sur une ligne à part « à régler auprès de l'agence » — jamais un total qui la compte sans qu'on puisse la payer (réglage d'agence de TCK-593 inchangé).
- Le montant est celui que l'API rend, figé à l'ouverture du paiement ; le front ne calcule rien.
- Jamais de cul-de-sac : chaque état dit comment payer ou à qui s'adresser.

## Delta à produire

- [ ] Coque de lien réutilisable, sans la marketplace.
- [ ] Les quatre états de la page.
- [ ] Tests : total avec et sans pénalité en ligne ; état hors ligne avec et sans moyens déclarés ; état déjà réglé ; aucun élément de la marketplace dans la page.

## Critères d'acceptation

- [ ] AC1 — Échéance en retard, agence qui encaisse la pénalité en ligne : un seul montant affiché, égal à `amount_due`.
- [ ] AC2 — Même échéance, agence qui ne l'encaisse pas : le total payable et la ligne « à régler auprès de l'agence » sont distincts, et l'écran le dit en clair.
- [ ] AC3 — Paiement en ligne fermé : la page montre au moins un moyen de joindre l'agence, et les moyens hors ligne déclarés.
- [ ] AC4 — La page ne contient ni recherche, ni favoris, ni comparateur, ni barre d'onglets (vérifié au navigateur à 390 et 1440 px).

## Hors périmètre

- Les maquettes de la revendication et des pages par lien (lot suivant).
- Le choix d'un moyen de paiement préféré par l'agence.

## Notes d'implémentation

_(à remplir par implementing-specs)_
