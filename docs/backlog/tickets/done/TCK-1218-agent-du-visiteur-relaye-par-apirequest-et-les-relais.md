---
id: TCK-1218
title: "Le `user_agent` des demandes de contact par formulaire est celui du serveur Next : `apiRequest` côté serveur et les relais BFF ne relaient pas l'agent du visiteur"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  models:
    - "docs/models-spec.md#67-propertycontactlead-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#le-user_agent-des-demandes-de-contact-par-formulaire-est-celui-du-serveur-next-node-jamais-celui-du-visiteur"
tags: [front, api, bff, contact, pistes]
---

## Contexte

Réf : **P108.01** du fichier de pistes, `retenu · autonome` (A1). Les deux formulaires de contact
du site public (fiche de bien, fiche d'agent) partent par action serveur (`submitContactLead`,
`submitAgentContactLead`, `src/app/actions/property.ts`), donc par `apiRequest` côté serveur.
`apiRequest` relaie l'IP du visiteur, sa langue et un `X-Request-Id`, mais pas son `User-Agent` :
le `fetch` de Node pose `user-agent: node`, et `ContactLeadService` écrit `node` dans le
`user_agent` de chaque demande, colonne que la spec décrit « User-agent source — anti-abus ».
`enTetesServeurAmont`, que suivent tous les relais BFF, ne le relaie pas non plus. Seul `apiFetch`
le fait, depuis TCK-792.

## Objectif

Tout appel serveur à l'API qui parle pour un visiteur porte son agent, comme `apiFetch`.

## Delta à produire

- [x] `apiRequest` : côté serveur, pose le `User-Agent` du visiteur s'il n'est pas déjà fourni par
      l'appelant (rien dans le navigateur, qui envoie le sien).
- [x] `enTetesServeurAmont` : pose le `User-Agent` du visiteur, sauf pour un appel partagé (même
      exception que l'IP).
- [x] Garde front : `api.agent-du-visiteur.test.ts`, cinq cas (`apiRequest` avec et sans agent
      entrant, agent de l'appelant non écrasé, `enTetesServeurAmont` simple et partagé).
- [x] Garde API : un test par formulaire (`PropertyContactLeadTest`, `AgentContactLeadTest`) qui
      poste avec un `User-Agent` et le relit sur la ligne.

## Critères d'acceptation

- [x] AC1 — Une action serveur appelée par un visiteur dont l'agent est `A` envoie `User-Agent: A`
      à l'API.
- [x] AC2 — Un relais BFF (`enTetesServeurAmont`) envoie l'agent du visiteur ; un appel partagé ne
      lit pas les en-têtes entrants et n'en envoie aucun.
- [x] AC3 — L'API écrit l'agent reçu sur la demande, borné à 255 caractères.

## Hypothèses

- Le contrat est celui de TCK-792 recopié : l'agent est relayé tel que le visiteur l'envoie, sans
  rien collecter que la spec ne décide déjà (la colonne existe et se remplit aujourd'hui de `node`).
  Les relais d'impersonation (`start`, `stop`, `current`) portent désormais l'agent de l'opérateur
  au lieu de `node` : c'est le même contrat.

## Hors périmètre

- Les autres en-têtes que le `fetch` de Node pose seul (`accept-language: *` hors relais) : déjà
  traités ailleurs (TCK-536, TCK-894).

## Notes d'implémentation

- Ablation (2026-10-22) : `api.ts` rendu à `origin/pre-dev` → 2 des 9 tests de
  `api.agent-du-visiteur.test.ts` rougissent (`apiRequest` côté serveur, `enTetesServeurAmont`) ;
  correctif remis → 9/9. Côté API, `'user_agent' => null` dans `ContactLeadService` → les deux
  tests neufs rougissent ; remis → verts.
