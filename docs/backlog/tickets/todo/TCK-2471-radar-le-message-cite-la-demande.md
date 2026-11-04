---
id: TCK-2471
title: "Radar : le message d'accord dit à l'annonceur que son bien est recherché sur Takussan, quand une cible de la demande le vise"
status: todo
phase: P2
family: full
estimate: M
wave: 81
created: 2026-11-04
updated: 2026-11-04
depends_on: [TCK-2470]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, front, radar, demarchage, adr-0077, adr-0087]
---

## Objectif utilisateur

L'annonceur accepte plus volontiers parce que le message lui dit une chose vraie et utile : des personnes cherchent en ce
moment, sur Takussan, un bien comme le sien.

## Décision du porteur à confirmer

`accord.v3` est le corps du gabarit que Meta a approuvé pour le démarchage par l'API (TCK-2395). Une phrase de plus
exige un nouveau gabarit approuvé. Proposition de la session : **`accord.v4` sur le seul canal manuel (`wa.me`)**, l'API
gardant `accord.v3` jusqu'à l'approbation d'un gabarit v4 par Meta.

## Contraintes strictes (métier)

- **Texte fixe et versionné** (ADR-0077 §4) : une phrase écrite dans le dépôt, jamais générée, sans nombre (« Des
  personnes recherchent en ce moment sur Takussan un bien comme le vôtre. »). Elle n'apparaît que si au moins une annonce
  du message est rattachée à une cible `demand` active (TCK-2470).
- Chaque message garde sa version ; une version nouvelle ne réécrit aucun message envoyé.
- Le canal API refuse `accord.v4` tant que `radar.whatsapp.accord_v4_template` n'est pas configuré.
- Les textes juridiques ne changent pas (la phrase n'est pas une clause).

## Delta à produire

- [ ] `ConsentMessageComposer` : version `accord.v4` = `accord.v3` + la phrase, choisie quand la condition tient et que
      le canal est manuel.
- [ ] Console : l'aperçu du message montre la phrase et sa raison (« recherché : <nom de la cible> »).
- [ ] Tests : `ConsentMessageDemandSentenceTest` (phrase présente seulement si une cible `demand` active couvre une
      annonce ; absente sur le canal API ; version enregistrée `accord.v4`).

## Critères d'acceptation

- [ ] AC1 — Une annonce rattachée à une cible `demand` active → message `accord.v4` avec la phrase, mot pour mot.
- [ ] AC2 — Sans cible `demand`, ou par l'API sans gabarit v4 → `accord.v3` inchangé.
- [ ] AC3 — Ablation : retirer la condition fait rougir AC2.

## Hors périmètre

- Le gabarit Meta v4 (démarche du porteur).

## Notes d'implémentation

_(à remplir)_
