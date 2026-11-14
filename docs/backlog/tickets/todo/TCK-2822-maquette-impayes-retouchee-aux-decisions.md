---
id: TCK-2822
title: "Maquette « Argent › Impayés » (a-1, a-2) retouchée aux décisions du porteur, puis références regelées"
status: todo
phase: P1
family: front
estimate: S
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: [TCK-2660]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models: []
tags: [front, fidelite, maquette, impayes, relance, audit-ux, app]
---

## Objectif utilisateur

Le porteur valide l'écran Impayés sur un rideau qui ne montre plus que de vrais écarts : la référence gelée dessine
ce qu'il a décidé après le gel du 2026-11-11, au lieu de le compter comme écart.

## Origine

Clôture de TCK-2660 (2026-11-14) : la re-comparaison de l'écran a-2 après 38bac668d et 7ed7f3073 ne laisse que des
écarts nés de décisions du porteur prises **après** le gel des références (`gele_le` 2026-11-11). Aucun n'entre dans
les trois exceptions d'ADR-0106 § 2, et le produit ne doit pas revenir sur ces décisions. ADR-0106, § Conséquences :
« une maquette retouchée après le gel produit une nouvelle référence, datée et nommée dans la fiche de fidélité ».

## Delta à produire

Retoucher `app-argent`, approche a, écrans 1 et 2 (téléphone, bureau 1440, bureau 1280), dans l'arbre du porteur
(maquettes non versionnées, cf. README de l'audit, § Maquettes) :

1. Feuille et dossier tels qu'ouverts : le message porte le repère « [lien de paiement ajouté à l'envoi] » au dessin du
   lien, et le cadre du lien dit « Créé à l'envoi de la relance » (décision 1 du 2026-11-12, ADR-0105 amendement).
2. Le message finit par « De la part de {agence}. » au lieu de « — Dakar Immo », et ne nomme aucun moyen de paiement
   (« Vous pouvez le payer en ligne ici : »), et dit le montant en « F CFA » (il quitte `/app` pour le WhatsApp du locataire) ; le bien est cité « du bien « … » » (ADR-0105 amendement, point 6 ; ticket
   TCK-2660 § Direction).
3. Une carte (rangée) par ÉCHÉANCE, sans « N échéances » (décision 2) ; pages de 20 au bureau.
4. Ni bascule « WhatsApp · SMS · E-mail » dans la feuille, ni « Lu le », « Remis », icône SMS dans l'historique
   (décision 6, ADR-0105).
5. Le panneau de droite sans voile (décision du porteur du 2026-11-10, `ui/panneau-droit.tsx`).
6. « Ancienneté du dû » au bas du dossier ; « Pénalité de retard · hors du lien » quand le lien ne la règle pas.
7. Les éléments d'autres tickets désormais sur la page : onglet « Interventions » du registre (TCK-2677),
   « Sélectionner » de l'en-tête du téléphone et colonne de coches (TCK-2682), en-tête sans « ⋯ ».

Puis : faire valider par le porteur, regeler (`fidelite.mjs geler --page app-argent --appareils
telephone,bureau-1440,bureau-1280 --force`, a-1 et a-2 seulement — a-0 et a-3 appartiennent à d'autres tickets), et
mettre à jour `docs/qa/audit-ux-2026-11/fidelite/TCK-2660.json` (nouvelle date de gel, `ecarts_acceptes` retirés).

## Critères d'acceptation

- [ ] AC1 — La référence a-2 téléphone regelée, comparée au relevé « telle qu'ouverte » (`?tab=impayes&relance=<échéance>`),
  n'a plus de ligne « absent de la maquette » pour « Créé à l'envoi de la relance », ni « absent du produit » pour
  « WhatsApp », « SMS », « E-mail ».
- [ ] AC2 — La fiche TCK-2660 ne porte plus aucune entrée renvoyant à TCK-2822, et chaque entrée restante cite une
  des trois exceptions d'ADR-0106 § 2 ou une donnée.
- [ ] AC3 — Les références de a-0 et a-3 sont inchangées (`git diff --stat` ne les nomme pas).

## Hors périmètre

- Tout changement du produit : il suit déjà les décisions.
