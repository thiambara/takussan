# Plan d'implémentation — audit UX famille 1 (site public), TCK-2493 → TCK-2524

- **Date** : 2026-11-09
- **Décidé par** : le porteur (1a arbre partagé, 2a vague 1 entière, 3a une PR par vague), puis délégation
  complète la nuit du 2026-11-09 (« valide tes propres recommandations, implémente tout »).
- **Source** : [audit](../qa/audit-ux-2026-11/01-site-public.md), [ADR-0091](../adr/0091-la-navigation-mobile-du-site-public-suit-le-profil.md),
  tickets des vagues 84 et 85.
- **Hors plan** : TCK-2525 (vente en crédits de la mise en avant) — attend un amendement
  d'ADR-0061 accepté par le porteur (prix, durée, file d'attente, remboursement).

## Principe : les fichiers partagés ordonnent plus que les dépendances

Quatre zones sont touchées par plusieurs tickets ; chacune est tenue par **un seul agent qui
enchaîne**, jamais par deux en parallèle :

| Zone | Tickets |
|---|---|
| Moteur de recherche (`PropertySearchService`, `SearchPublicPropertyRequest`) | 2496, 2498, 2517, 2500 |
| Contrôleurs publics d'agences et d'agents | 2506, 2518, 2519, 2520 |
| Coque publique (`Navbar`, layout `(public)`) | 2493, 2494, puis 2495, 2497 |
| Dictionnaires `fr`/`en`/`wo` | tous les tickets front — un outil d'écriture sous verrou |

**Un seul arbre partagé** : les agents éditent, la session commite par ticket. C'est aussi le seul
arbre où vivent les maquettes de référence, hors git
([README de l'audit, § Maquettes](../qa/audit-ux-2026-11/README.md#maquettes)).

## Vagues

| Vague | Agents | Tickets |
|---|---|---|
| 1 — back, et le front sans dépendance | recherche · annuaire-personnes · annuaire-agences · visite-paiement · favoris-alertes · radar · coque · fiche | 2496 → 2498 → 2517 → 2500 (back) · 2506 → 2519 · 2518 → 2520 · 2502, 2504 · 2507, 2513 · 2511 · 2493 → 2494 · 2501 |
| 2 — fondations du front **et** les pages (ex-vagues 2 et 3 réunies) | liste · liens · accueil-recherche · visite · réservation · favoris · comparateur · erreurs-légal · console | 2499 + 2500 (front) · 2505 → 2512 → 2514 · 2495 → 2497 · 2503 · 2510 · 2508 · 2509 · 2515, 2516 · 2532, 2536, 2534 |
| 3 — l'annuaire en front | console · annuaire · fiches | 2524 · 2521 · 2522 → 2523 |

La liste (2499) pose le composant de filtres que la fiche d'agence (2522) réutilise ; la coque de
lien (2505) sert la réclamation et les pages par lien.

## Consignes à chaque agent

1. Re-mesurer chaque affirmation du ticket avant de coder ; écrire les mesures dans les Notes
   d'implémentation au fur et à mesure.
2. La maquette citée est la référence de fidélité (résultat, jamais le code), téléphone et bureau.
3. Seulement ses tests (`php artisan test <fichiers>`, `npx vitest run <fichiers>`) ; jamais la
   suite entière — la CI la joue.
4. Aucune commande git qui écrit ; clés i18n par l'outil sous verrou, `wo` = texte français.
5. Chaque test d'une règle métier vérifié par ablation, restauré par `cp` et prouvé par `md5`.
6. Noms réservés par agent (préfixes de migration, numéros de ticket de secours).
7. Rapport JSON sur disque, verdict en premier ; message final d'une ligne.

## Rythme

- Une PR vers `dev` par vague ; la CI joue les suites pendant que la vague suivante démarre.
- Avant chaque PR, une **passe de revue adverse** (réfuter, rejouer les ablations par exécution).
- Fusion seulement sur CI verte ; après chaque fusion, relever le run du push sur `dev`.

## Journal

- **Vague 1** (2026-11-09, nuit) : 15 tickets livrés, un front restant (TCK-2500, liste). Chaque
  livraison relue par un vérificateur adverse ; 7 refus sur 8, tous corrigés puis contre-vérifiés.
  Les décisions prises par la session sont reportées dans les tickets et les specs. Trois tickets
  ouverts en route : TCK-2532 (seeders, avant l'annuaire), TCK-2534, TCK-2536.
- **Vagues 2 et 3 réunies** : hors TCK-2512 et TCK-2514, qui attendent la coque de lien (TCK-2505)
  et sont enchaînés derrière elle par le même agent, les tickets de l'ex-vague 3 ne dépendaient que
  de la vague 1. Les réunir économise un cycle entier de revue et de PR.
- **Vague 2** (2026-11-09) : 16 tickets livrés (TCK-2495 → TCK-2536), plus TCK-2568, ouvert en route
  à la demande du porteur : au téléphone, l'en-tête de page suit la maquette (amendement d'ADR-0091).
  Chaque livraison a été refusée au moins une fois par son vérificateur adverse, puis corrigée et
  contre-vérifiée. La vague 3 travaillait dans le même arbre : ses lignes ont été retirées des
  fichiers partagés au moment du commit (index seul), puis la vague 2 a été vérifiée seule dans un
  arbre détaché (typage, lint, tests touchés, gardes).
- **Vague 3** (2026-11-09) : TCK-2521 → TCK-2524 livrés, chacun refusé par son vérificateur puis
  corrigé et contre-vérifié. L'annuaire et les fiches basculent ensemble sous la règle d'en-tête
  au téléphone. Quatre tickets de suite ouverts : TCK-2574 (agence d'un propriétaire, nom abrégé
  servi — reçoit l'AC3 de TCK-2523), TCK-2575 (sa propre fiche), TCK-2576 (WhatsApp), TCK-2577
  (un avis d'agence écrit son contexte).
