---
id: TCK-3010
title: "Un harnais de test du front : un rendu unique (intl, QueryClient, auth, gestes) et une doublure de l'API par ressource, fidèle à fields[] et include="
status: todo
phase: P2
family: technique
estimate: M
wave: 99
created: 2026-11-27
updated: 2026-11-27
depends_on: [TCK-3008, TCK-3009]
blocks: []
spec_refs:
  features: []
  models: []
tags: [front, tests, technique, architecture]
---

## Objectif utilisateur

Un test du front se monte en une ligne et parle à une API simulée qui ne rend que les colonnes demandées, comme la vraie.

## Contrat de données

Relevé du 2026-11-27 (`dev` 4e3a929f7), 1 971 fichiers de test :

- `vi.mock('@/lib/api')` ×252, `stubGlobal('fetch')` ×170, `vi.mock('@/lib/queries/…')` ×549, `AuthContext` ×492, `new QueryClient` ×556 ; aucun outil partagé pour `QueryClient` ni l'auth (chaque test refait son `monter`).
- Outils partagés existants : `withIntl` (`src/test/intl.tsx`, 1 181 importeurs), `avecGestes` (`src/test/habilitations.tsx`), `navigationDeTest`.
- Une seule doublure fidèle : `commeLApi` (`src/test/visites-comme-l-api.ts`), au niveau du retour d'`apiRequest`, pour `/api/property-visits` seulement ; le contrat TCK-1800 recopie la table de renommage des relais (`requetes-du-front.tck-1800.test.tsx:122-125`).

## Contraintes strictes (métier)

- Pas de dépendance neuve (pas de MSW) ; interception au niveau de `fetch`, qui couvre Laravel, le BFF et le contrat TCK-1800.
- La doublure applique `fields[<table>]` et `include=` sur les listes (ADR-0006, ADR-0021) et signale une clé lue hors de `fields`.
- La table de renommage des relais n'existe qu'une fois (lue par le harnais et par le contrat TCK-1800).
- Migration progressive : les tests existants ne sont pas réécrits en bloc ; on migre ceux des dossiers touchés par TCK-3005, 3007, 3008, 3009, et la doublure des visites.

## Delta à produire

- [ ] Intention : un rendu de test unique (intl, QueryClient frais, auth fournie, gestes, navigation)
- [ ] Intention : une doublure d'API par ressource sur `fetch`, qui généralise `commeLApi` (au moins visites, réservations, baux), avec erreurs à la forme de TCK-3008
- [ ] `commeLApi` passe par la nouvelle doublure ; ses 11 importeurs restent verts
- [ ] Tests du harnais lui-même (fields, include, clé hors fields signalée, erreur)

## Critères d'acceptation

- [ ] AC1 — Un test qui lit une clé non demandée dans `fields[]` échoue avec un message qui la nomme (test du harnais).
- [ ] AC2 — Les tests migrés n'ont plus de `new QueryClient` ni de `vi.mock('@/lib/api')` locaux.
- [ ] AC3 — La table de renommage des relais n'est écrite qu'une fois dans `src/test/`.
- [ ] AC4 — `tsc --noEmit`, lint et les tests touchés sont verts.

## Hors périmètre

- La migration des ~1 900 autres fichiers de test (elle se fera au fil des tickets qui les touchent).

## Notes d'implémentation
