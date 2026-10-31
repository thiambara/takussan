---
id: TCK-2423
title: "Radar : le pilote d'embeddings Voyage AI et la table embeddings d'ADR-0076 § 11, avec repli sur pg_trgm"
status: doing
phase: P3
family: back
estimate: M
wave: 80
created: 2026-10-30
updated: 2026-10-31
depends_on: [TCK-2392]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, radar, ia, pgvector, adr-0076]
---

## Décision du porteur (2026-10-31)

La décision du 2026-10-30 (« rester sur `pg_trgm` ») est **levée**. Le fournisseur est **Voyage AI**. Si la clé n'est pas
fournie, ou si l'API ne répond pas, le signal retombe sur `pg_trgm` : aucune panne de Voyage n'empêche le Radar d'apparier
des annonces, ni ne bloque une migration. Aucune clé n'existe encore : le contrat est vérifié sur la documentation
officielle, sans aucun vrai appel.

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
- [ ] AC3 — Ce qui part chez Voyage passe par le masquage de la passerelle, prouvé sur le corps de la requête.
- [ ] AC4 — Chaque appel se journalise (`ai_calls`, coût en dollars) et compte dans les plafonds et le coupe-circuit.
- [ ] AC5 — Le repli s'applique par cas : pilote non configuré, clé absente, vecteur manquant d'un côté ou de l'autre,
      table absente, API en panne. Le calcul se fait en file `ai`, jamais pendant l'appariement.
- [ ] AC6 — L'extension `vector` indisponible ou refusée ne fait jamais rougir la migration, et le refus de droit
      n'abandonne pas la transaction en cours ; `down()` juste.
- [ ] AC7 — Une annonce inchangée ne se recalcule pas, et une panne ne produit pas de boucle de réessais.

## Hors périmètre

- Le chatbot de TCK-344, qui réutilisera la même table.

## Notes d'implémentation

_(à remplir par implementing-specs)_
