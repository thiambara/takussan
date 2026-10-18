---
id: TCK-838
title: "Garde : une action serveur anonyme part par le chemin interne quand il est déclaré"
status: done
phase: P1
family: technique
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#tant-que-api_internal_url-nest-pas-posée-les-formulaires-anonymes-envoyés-par-action-serveur-partagent-un-seau-pour-tout-le-site"
tags: [front, rate-limit, server-actions, adr-0052, pistes]
---

## Contexte

Réf : **P37.03** du fichier de pistes, `validé` par le porteur (critère accordé : V5).

La demande de visite et les deux demandes de contact (bien, agent) partent d'une action serveur
(`src/app/actions/property.ts`). L'IP du visiteur n'y survit que si le serveur Next joint l'API par
`API_INTERNAL_URL` (ADR-0052 § 5) : par l'URL publique, Traefik efface le `X-Forwarded-For`, et les
bornes `public-visit-request` et `public-contact-lead` deviennent un seau pour tout le site. Le test
existant (`api.ip-du-visiteur.test.ts`) garde `apiRequest` en général, aucune de ces trois actions.

## Décision du porteur

le test du front qui garde qu'une action serveur anonyme ne part jamais sur l'URL publique quand un chemin interne est déclaré ; reste : poser `API_INTERNAL_URL` en préproduction (porteur, TCK-720)

## Reste à faire

poser `API_INTERNAL_URL` en préproduction (porteur, TCK-720)

## Objectif utilisateur

Deux visiteurs qui envoient un formulaire public ne partagent pas la même borne anti-abus, dès que
l'environnement déclare le chemin interne.

## Delta à produire

- [x] `src/app/actions/__tests__/property.chemin-interne.test.ts` : avec `API_INTERNAL_URL` posée,
  `submitVisitRequest`, `submitContactLead` et `submitAgentContactLead`, anonymes, partent sur
  l'adresse interne, jamais sur `origineApi()`, et portent l'IP du visiteur.

## Critères d'acceptation

- [x] AC1 — Les trois actions appellent `http://api:8080/api/public/…`, une fois chacune.
- [x] AC2 — Chacune porte `X-Forwarded-For: 203.0.113.7`, l'IP de la requête entrante, et aucun
  `Authorization`.
- [x] AC3 — Ablation : `baseServeur()` qui ignore `API_INTERNAL_URL` rougit les trois.

## Hors périmètre

- Poser la clé sur un environnement (reste, porteur).
- Envoyer ces formulaires depuis le navigateur (autre voie de la `Piste`, non retenue).

Hypothèse (mode sans humain) : « anonyme » se lit sans jeton de session ; une action avec jeton suit
le même chemin (`apiRequest`), le test ne la répète pas.

## Notes d'implémentation

- Le test est en environnement `node` : sous jsdom, `window` existe et `baseServeur()` rend toujours
  l'URL publique, ce qui ferait passer ou rougir le test pour une raison étrangère.
- Vert dès l'écriture : le comportement existe, il n'était pas gardé. Ablation : `baseServeur()`
  sans `API_INTERNAL_URL` → 3 rouges ; remis → 3 verts.
