---
id: TCK-2423
title: "Radar : le pilote d'embeddings et la table embeddings d'ADR-0076 § 11, quand un fournisseur sera retenu"
status: todo
phase: P3
family: back
estimate: M
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2392]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, radar, ia, pgvector, adr-0076]
---

## Décision du porteur (2026-10-30)

Rester sur `pg_trgm` (signal de texte livré par TCK-2392) : **aucun fournisseur d'embeddings tant que le volume ne le
justifie pas**. Le ticket reste `todo`, sans travail engagé, jusqu'à ce que le porteur le rouvre sur une mesure de
volume.

## Objectif utilisateur

Deux annonces qui décrivent le même bien avec d'autres mots se rapprochent, et pas seulement celles
qui en recopient le texte.

## Contexte

TCK-2392 a posé la similarité de texte comme quatrième signal de `RadarMatcher`, derrière un pilote
remplaçable (`radar.similarity.driver`). Le seul pilote livré est `trigram` (`pg_trgm`, sans
fournisseur) : il rapproche un texte recopié, pas une reformulation.

La table `embeddings` d'[ADR-0076](../../adr/0076-le-socle-ia.md) § 11 n'a pas été créée : aucun
fournisseur de la liste fermée ne sert d'embeddings (`config/ai.php`, rôle `embedding` vide), et
l'extension `vector` n'est pas de confiance (sa création exige un superutilisateur sur le rôle de
la base cible, à vérifier en préproduction).

## Delta à produire

- [ ] Un fournisseur d'embeddings ajouté au rôle `embedding`, avec sa ligne de `privacy.ts`
      (`takussan-web/src/content/legal/README.md`).
- [ ] Migration : extension `vector` et table `embeddings` (objet polymorphe, modèle, dimension,
      vecteur, empreinte du contenu), avec leur `down()`.
- [ ] Un pilote `embeddings` de `radar.similarity.driver`, calculé en file `ai`, et le repli `trigram`
      tant qu'un vecteur manque.

## Critères d'acceptation

- [ ] AC1 — Deux annonces reformulées se rapprochent par le signal `text` sous le pilote
      `embeddings`, avec un faux modèle ; aucun test n'appelle un vrai fournisseur.
- [ ] AC2 — Sans vecteur calculé, le signal retombe sur `trigram`.

## Hors périmètre

- Le chatbot de TCK-344, qui réutilisera la même table.

## Notes d'implémentation

_(à remplir par implementing-specs)_
