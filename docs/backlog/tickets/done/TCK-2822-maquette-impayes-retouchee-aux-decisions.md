---
id: TCK-2822
title: "Maquette « Argent › Impayés » (a-1, a-2) retouchée aux décisions du porteur, puis références regelées"
status: done
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

- [x] AC1 — La référence a-2 téléphone regelée, comparée au relevé « telle qu'ouverte » (`?tab=impayes&relance=<échéance>`),
  n'a plus de ligne « absent de la maquette » pour « Créé à l'envoi de la relance », ni « absent du produit » pour
  « WhatsApp », « SMS », « E-mail ».
  *Preuve (2026-11-14, HEAD 928e9c810)* : relevé `?tab=impayes&relance=602` (feuille telle qu'ouverte, aucun clic,
  interceptions vides, aucun POST) comparé à la référence regelée : 28 conformes · 53 écarts · 2 absents du produit
  (« Messages » de la barre d'onglets, ignorée) · 5 absents de la maquette (« Messages », « Aller au contenu
  principal », « Par bailleur », « Fermer ») ; le MÊME relevé contre l'ancienne référence portait « WhatsApp »,
  « SMS », « E-mail » absents du produit et « Créé à l’envoi de la relance » absent de la maquette.
- [x] AC2 — La fiche TCK-2660 ne porte plus aucune entrée renvoyant à TCK-2822, et chaque entrée restante cite une
  des trois exceptions d'ADR-0106 § 2 ou une donnée.
  *Preuve (2026-11-14)* : `grep -c 2822 docs/qa/audit-ux-2026-11/fidelite/TCK-2660.json` → 0 (7 entrées
  d'`ignorer` et 7 d'`ecarts_acceptes` retirées, chacune mesurée absente des rapports contre la référence regelée) ;
  les 25 écarts acceptés, relus un à un contre ces rapports, citent « règle du design system », « technique » ou
  « vérité des données » (4 nouveaux mesurés, 7 corrigés). Des 4 entrées d’`ignorer` restantes, « Rappel automatique » est une donnée ; la coque, le mois
  et l’export de l’en-tête, le « ⋯ » des rangées sont des décisions du porteur, qui a validé le 2026-11-14 la
  maquette retouchée avec ces choix (`exception` : « décision du porteur (validation du 2026-11-14) »). Les deux
  écarts mesurés non acceptés (hauteur des lignes du dossier, +16 px du contenu au téléphone) restent dans
  `ecarts_ouverts` → TCK-2840. Même passe sur TCK-2682.json : `grep -c 2822` → 0.
- [x] AC3 — Les références de a-0 et a-3 sont inchangées (`git diff --stat` ne les nomme pas).
  *Preuve* : `git diff --stat -- docs/qa/audit-ux-2026-11/fidelite/references` ne nomme que les six JSON d'a-1 et
  a-2 et `JOURNAL.md` (ligne app-argent : dates « 2026-11-11, 2026-11-14 ») ; md5 avant/après identiques pour
  a-0-*, a-3-* (JSON et PNG de `takussan-web/.fidelite/references/`) et `gel.json`. Le gel a été borné en
  écartant les six JSON d'a-1 et a-2 puis en lançant `geler --page app-argent --appareils
  telephone,bureau-1440,bureau-1280` SANS `--force` (« 6 relevés écrits, 6 déjà présents ») : `--force` re-relève
  toute la page, a-0 et a-3 compris.

## Notes

- Maquette validée par le porteur le 2026-11-14 (`app-argent-a.tsx`, md5 96de45586e6da103aeabfc3f5ec34536, au
  moment du gel). Les six références regelées ont des nœuds identiques aux relevés de la maquette montrés au porteur.
- `meta.gel.revue` des références cite encore la revue du 2026-11-11 : l'outil la lit dans
  `references/retenues.json`. La nouvelle date et la validation sont nommées dans les fiches TCK-2660 et TCK-2682.

## Hors périmètre

- Tout changement du produit : il suit déjà les décisions.
