---
id: TCK-2406
title: "Radar : les copies de publication sans ligne media, et la matière collectée d'une annonce publiée puis révoquée"
status: todo
phase: P1
family: back
estimate: S
wave: 80
created: 2026-10-29
updated: 2026-10-29
depends_on: [TCK-2391]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, radar, donnees-personnelles, purge, adr-0077]
---

## Objectif utilisateur

Ce que la purge du Radar (TCK-2391) laisse volontairement derrière elle ne s'accumule pas sans que personne l'ait décidé.

## Contexte

Deux écarts relevés par TCK-2391, mesurés le 2026-10-29 sur `feat/radar-revocation-purge` :

1. **Les copies de la publication sans ligne `media`.** `RadarPublisher::publish()` copie la réserve dans la collection `photos` des biens, sur le disque **public**. Une transaction défaite par une exception attrapée est nettoyée (`discardFiles`), mais une requête coupée par `max_execution_time` (60 s) laisse des fichiers sous le dossier d'un média jamais commité. `DefaultPathGenerator` range sous `{id du média}/` : il n'existe aucun préfixe par bien ou par annonce à balayer, et le disque public porte des milliers de dossiers numériques légitimes. `RadarOrphanFiles` (TCK-2391) ne balaie que le disque privé. L'écart est borné par `radar.publish.max_photos` (30) par requête coupée.
2. **La matière collectée d'une annonce publiée.** ADR-0077 §9 et `privacy.ts` § 6 ne purgent que les annonces « jamais publiées ». Après une révocation, le texte brut, les captures, `extracted` (numéros écartés compris) et le numéro en clair de l'annonceur restent tant que ses annonces publiées existent ; seule leur preuve d'accord suit la règle des 3 ans.

## Contraintes strictes (métier)

- Le porteur a retenu le 2026-10-29 la lettre d'ADR-0077 §9 pour TCK-2391 et demande l'éventuelle purge de la matière d'une annonce publiée **3 ans après le retrait**, avec la preuve. Elle change l'ADR-0077 §9 et le texte légal (avocat) : rien ne s'implémente sans cet accord.

## Delta à produire

- [ ] (1) Choisir : un marqueur d'écriture avant la copie (une ligne qui nomme les identifiants de média attendus, effacée au commit), ou un chemin par bien pour la collection `photos` des biens du Radar, puis un balayage qui n'en dépend que.
- [ ] (2) Purger la matière collectée d'une annonce publiée 3 ans après le retrait (`offline_since`, TCK-2391), avec la preuve ; en tirer l'ADR, `privacy.ts` § 6 et la règle de `RadarPurger`.

## Critères d'acceptation

- [ ] AC1 — Un fichier de copie laissé par une publication coupée est effacé par la purge.
- [ ] AC2 — Après le retrait du dernier bien et la durée retenue, la matière collectée d'une annonce publiée est effacée (si le porteur le décide).

## Hors périmètre

- La suppression du compte créé par le Radar (voie existante de `features.md` § 2.1).

## Notes d'implémentation

_(à remplir par implementing-specs)_
