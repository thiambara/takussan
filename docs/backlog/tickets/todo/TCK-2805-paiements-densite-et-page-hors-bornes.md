---
id: TCK-2805
title: "Factures, Reversements et Paiements lisent la densité choisie (?per_page=), et une page au-delà de la dernière ne passe plus pour une liste vide"
status: todo
phase: P2
family: front
estimate: S
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#25-invoice-"
    - "docs/models-spec.md#28-payout-"
    - "docs/models-spec.md#15-leasepayment-"
tags: [front, paiements, pagination, densite, suite-de-tck-2750, audit-ux, app]
---

## Objectif utilisateur

Sur `/app/payments`, l'utilisateur qui choisit 50 lignes par page en voit 50. Celui qui ouvre un lien vers une page
qui n'existe plus apprend qu'il est au-delà de la dernière page et peut y revenir, au lieu de croire qu'il n'y a
aucune facture.

## Contrat de données

**Origine.** Relevé pendant TCK-2750 (interv-2750). Le registre « Interventions » y lit `?per_page=`
(`ServiceProviderBillsTable`, `usePageDesFactures`). Ses voisins ne le font pas.

**Constat, relu sur HEAD (`ebc494478`) le 2026-11-14.** Les trois fichiers ont des modifications locales d'un autre
agent ; elles ne touchent pas ces lignes.

- `InvoicesTable.tsx`, `PayoutsTable.tsx` et `PaymentsHistoryTable.tsx` rendent `PropertyPagination`, dont le
  sélecteur de densité (10, 20 ou 50 par page) écrit `?per_page=` et remet la page à 1.
- Les trois tables envoient pourtant `per_page: 20` en dur à l'API, et ne lisent que `?page=`. Le serveur rend donc
  toujours 20 lignes et `meta.per_page = 20`, et le sélecteur revient à 20 : le choix n'a aucun effet.
- Les trois tables testent `rows.length === 0` et rendent alors leur état vide, sans la pagination. Avec `?page=9`
  sur une liste de deux pages, l'API rend `data: []` avec `meta.total > 0` : l'écran dit « aucune facture » (ou
  équivalent), et aucun contrôle ne permet de revenir.

**Endpoints consommés (existants, inchangés) :** ceux des trois tables, avec `page` et `per_page`.

## Direction UX / Artistique

Rien de neuf à dessiner. La densité choisie se voit dans le nombre de lignes et dans le sélecteur, qui garde la valeur
choisie. Au-delà de la dernière page, un message calme dit que la page demandée n'existe pas et propose d'aller à la
dernière page ou à la première. La liste ne se dit vide que lorsqu'elle l'est.

## Contraintes strictes (métier)

- **Une seule lecture de la densité pour tout `/app/payments`.** Les trois tables lisent `?per_page=` comme le
  registre « Interventions » : 10, 20 ou 50, et toute autre valeur retombe à 20. Pas de quatrième variante.
- **« Vide » et « au-delà de la dernière page » sont deux états distincts**, jugés sur `meta.total` et
  `meta.last_page`, et non sur le seul nombre de lignes rendues.
- Le registre « Interventions » en mode agence suit la même règle pour la page au-delà de la dernière, s'il ne le
  fait pas déjà. Le ticket le vérifie et l'écrit dans ses notes.
- Les textes passent par next-intl (fr, en ; le wo porte le français tel quel, le wolof étant en pause).

## Delta à produire

- [ ] Les trois tables envoient la densité lue sur `?per_page=` (bornée aux trois valeurs).
- [ ] Les trois tables, et le registre « Interventions » s'il le faut, distinguent la page au-delà de la dernière de
  la liste vide.
- [ ] Tests vitest par table, sur le double réseau.

## Critères d'acceptation

- [ ] AC1 — Pour chacune des trois tables, `?per_page=50` dans l'adresse : la requête envoyée à l'API porte
  `per_page=50`. Le test lit la requête partie, pas le rendu.
- [ ] AC2 — `?per_page=37` et `?per_page=abc` : la requête porte `per_page=20`.
- [ ] AC3 — Choisir 50 dans le sélecteur : l'adresse porte `per_page=50`, la page revient à 1, la requête suivante
  porte `per_page=50`, et le sélecteur affiche 50.
- [ ] AC4 — Réponse `{data: [], meta: {total: 25, last_page: 2, current_page: 9}}` : l'état « au-delà de la dernière
  page » s'affiche avec un moyen d'aller à la page 2. Le texte de l'état vide est ABSENT.
- [ ] AC5 — Réponse `{data: [], meta: {total: 0, last_page: 1, current_page: 1}}` : l'état vide d'aujourd'hui,
  inchangé.
- [ ] AC6 — Vérifié par ablation, une à la fois : `per_page: 20` remis en dur rend AC1 rouge ; le test sur
  `rows.length === 0` seul remis rend AC4 rouge.

## Hors périmètre

- La pagination côté API et la forme de `meta`.
- Les autres écrans qui emploient `PropertyPagination`. Un inventaire peut être noté, mais leur correction est un
  ticket à part.

## Notes d'implémentation

_(à remplir par implementing-specs)_
