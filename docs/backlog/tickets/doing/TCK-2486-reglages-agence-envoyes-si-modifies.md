---
id: TCK-2486
title: Fiche de l'agence — un réglage de `settings` ne part que s'il a changé, pour ne plus écraser celui d'un autre admin
status: doing
phase: P3
family: bug
estimate: S
wave: 82
created: 2026-11-06
updated: 2026-11-06
depends_on: [TCK-2483]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#21-authentification--comptes"
  models:
    - "docs/models-spec.md#2-agency"
tags: [front, agence, settings, concurrence]
---

## Objectif utilisateur

Deux admins d'une même agence qui enregistrent la fiche de l'agence l'un après l'autre ne
s'écrasent plus un réglage que l'un n'a pas touché.

## Contrat de données

`PATCH /api/agencies/{id}` (existant, inchangé) : l'API fusionne `settings` clé par clé sur la ligne
relue sous verrou (TCK-593, TCK-2362) — une clé absente est conservée, une clé à `null` revient au
défaut. Les clés de `settings` que la fiche gère : `require_team_two_factor`,
`late_fee_online_collection`, `hidden_modules` (types et défauts : `spec_refs.models`).

Relevé par TCK-2483 (suite (b), au navigateur) : la fiche envoie `require_team_two_factor` et
`late_fee_online_collection` à CHAQUE enregistrement, avec la valeur lue au chargement. L'admin A
coche « 2FA obligatoire » ; l'admin B, qui avait ouvert la fiche avant, enregistre son nom : la case
revient à `false`. `hidden_modules` suit déjà le bon patron (revue de TCK-2483, M5).

## Direction UX / Artistique

Aucun changement visible : mêmes cases, mêmes libellés.

## Contraintes strictes (métier)

- **Décision de la session** : le patron de M5 de TCK-2483 (`initialHiddenModules`) s'étend à TOUTES
  les clés de `settings` que le formulaire gère — une clé ne part que si sa valeur diffère de la
  valeur chargée.
- La valeur chargée se lit comme l'écran la lit (clé absente = défaut de l'API : `false`, `[]`) :
  une seule lecture, pour que « inchangé » ait le même sens à l'affichage et à l'envoi.
- Décocher une case cochée au chargement DOIT partir (`false`) : c'est une modification (TCK-589).
- Rien ne part de `settings` qu'on n'a pas modifié ; aucune autre clé (`watermark_*`, …) n'y entre
  (TCK-593, TCK-962).

## Delta à produire

- [ ] `normaliseAgencyForm` : `require_team_two_factor` et `late_fee_online_collection` comparés à
      la valeur chargée, comme `hidden_modules`.
- [ ] Le formulaire passe ce qu'il a chargé, lu par la même fonction que ses valeurs par défaut.
- [ ] Tests : ceux qui figent les clés envoyées s'adaptent ; un test par clé « inchangée → absente »,
      « modifiée → présente », `false` compris.

## Critères d'acceptation

- [ ] AC1 — Fiche chargée puis enregistrée sans toucher aux cases : `settings` ne porte ni
      `require_team_two_factor`, ni `late_fee_online_collection`, ni `hidden_modules`.
- [ ] AC2 — Cocher une case décochée au chargement envoie `true` ; décocher une case cochée au
      chargement envoie `false` — pour chacune des deux clés booléennes.
- [ ] AC3 — Un `settings` lu sans la clé vaut `false` à l'affichage ET à l'envoi : enregistrer sans
      toucher n'envoie rien ; cocher envoie `true`.
- [ ] AC4 — Chaque test neuf est prouvé par ablation (retour à l'émission systématique → rouge).
- [ ] AC5 — Suites front et API vertes par la CI.

## Hors périmètre

- Un verrou optimiste (version de la ligne, 409) sur la fiche : deux admins qui modifient la MÊME
  clé restent en « dernier qui écrit gagne ».
- Les champs de premier niveau (nom, e-mail, taux…) : ils partent toujours ; leur écrasement est le
  même « dernier qui écrit gagne », hors de ce ticket.
- La section « Sécurité de l'équipe » d'une agence `individual` : TCK-2487.

## Notes d'implémentation

_(à remplir par implementing-specs)_
