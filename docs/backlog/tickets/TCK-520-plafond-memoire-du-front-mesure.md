---
id: TCK-520
title: "Le plafond mémoire des fronts se décide sur une mesure sous charge d'images, pas au repos"
status: doing
phase: P1
family: technique
estimate: S
wave: 64
created: 2026-09-14
updated: 2026-09-14
depends_on: [TCK-515]
blocks: [TCK-517]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, dokploy, front, budget, next-image, adr-0028]
---

## Objectif utilisateur

Que le front de préproduction ne redémarre pas au premier visiteur qui déclenche cinquante encodages
AVIF — et que le plafond de production soit posé sur un chiffre, pas hérité de la préproduction.

## Contrat de données

Relevé du 2026-09-14 : `takussan-web-preview` à **308 Mio sur 384** au repos, stable sur deux
lectures à une heure d'écart, alors que le plan (§ Budget) l'avait mesuré à 57 puis 95 Mio juste
après déploiement. Le cache de l'optimiseur (`/app/.next/cache/images`, 157 entrées, 3,7 Mo) est
dans le conteneur, donc perdu à chaque déploiement : chaque variante AVIF est ré-encodée par le
premier visiteur (`next.config.ts`, `formats`). Une seule réplique : un OOM est un redémarrage
Swarm, visible. Le plafond est posé par `application.update` (`memoryLimit`, en octets).

## Contraintes strictes (métier)

- Le plafond retenu laisse **au moins 20 %** de marge au-dessus du pic mesuré sous la charge définie.
- La charge de mesure est écrite et rejouable : 50 photos de biens distinctes, `w=640`, `Accept:
  image/avif`, en 4 clients simultanés, sur une préproduction fraîchement déployée (cache vide).
- Aucun `OOMKilled` pendant la mesure (`docker inspect -f '{{.State.OOMKilled}}'`).

## Delta à produire

- [ ] Script de charge jetable (poste), résultat dans le ticket : pic `docker stats` du front pendant
  et après, temps de réponse médian de `/_next/image`
- [ ] Plafond de `takussan-web-preview` porté à la valeur mesurée (au moins 512 Mio si le pic
  approche 384), même geste pour `cpp-web-preview` avec ses propres pages
- [ ] Si le pic dépasse 80 % du nouveau plafond : `NODE_OPTIONS=--max-old-space-size=<n>` posé dans
  l'Application Dokploy, et la mesure rejouée
- [ ] Le plan, tableau § Budget : colonne « Mesuré sous charge d'images », et la ligne « Instances à
  terme » recalculée pour deux fronts de production
- [ ] `docs/infra/hebergement.md`, tableau « Ce qui sert quoi » : les plafonds mis à jour, datés

## Critères d'acceptation

- [ ] AC1 — le pic sous charge est écrit dans le ticket avec la commande qui l'a produit
- [ ] AC2 — plafond ≥ pic × 1,2, relu par `docker service inspect … .Spec.TaskTemplate.Resources`
- [ ] AC3 — `OOMKilled=false` et `RestartCount` inchangé après la charge
- [ ] AC4 — la mémoire disponible de la machine reste ≥ 1 500 Mo pendant la charge

## Hors périmètre

- Déplacer l'optimisation d'images vers l'API ou un CDN (`docs/infra/cdn.md`) : une décision à part.
- Un volume pour `.next/cache` : Swarm en `start-first` ferait cohabiter deux répliques sur le même
  cache ; à étudier seulement si la mesure montre que le ré-encodage coûte.

## Notes d'implémentation

_(à remplir par implementing-specs)_
