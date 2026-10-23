---
id: TCK-1816
title: "Les relais BFF rendent une redirection de l'API au navigateur et relaient le corps en flux"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-108--ce-que-lapi-tire-encore-de-la-requête-sur-le-chemin-interne-du-front"
  conventions:
    - "takussan-web/CLAUDE.md#route-handlers-bff"
tags: [front, bff, relais, pistes]
---

## Contexte

Réf : **P108.04** du fichier de pistes (« Petites améliorations » de l'angle 108), `validé` par
le porteur (critère V7 accordé).

**Décision du porteur** : validé — porteur (2026-10-22) : garder la route ; `redirect: 'manual'` et relais en flux dans `relayerVersApi` comme l'écrit la Piste ; le suivi de la route par le panneau Versions (V3) reste à trancher à part

`relayerVersApi` (`src/lib/relais-api.ts`) et le relais du téléchargement de l'export RGPD
(`src/app/api/data-exports/[id]/download/route.ts`) appelaient `fetch` sans `redirect:`, donc en
`follow` : une 302 de l'API vers une URL présignée aurait été suivie par le serveur Next, et les
octets auraient traversé le VPS, ce que `PrivateMediaAccess::redirect()` existe pour éviter. Les
deux lisaient aussi le corps entier en mémoire (`arrayBuffer()`) avant de le rendre. Aucune route
relayée ne redirige aujourd'hui : le changement est sans effet visible.

## Hypothèse retenue

La décision nomme `relayerVersApi` ; la `Piste` porte aussi le flux sur le relais d'export RGPD
(c'est lui qu'elle constate en `arrayBuffer()`), et la recommandation du délégué y ajoute
`redirect: 'manual'`. Les deux relais reçoivent donc les deux changements, « comme l'écrit la
Piste ». Les autres relais qui appellent `fetchVersApi` directement (KYC, export d'entité…) ne
changent pas.

## Delta à produire

- [x] `relayerVersApi` : `redirect: 'manual'`, `location` ajoutée aux en-têtes de réponse
      relayés, corps relayé par `amont.body` (toujours `null` sur 204/205/304).
- [x] Relais d'export RGPD : même chose ; `content-length` reste relayé.
- [x] Test vitest `src/app/api/__tests__/relais-redirection-et-flux.test.ts`.

## Critères d'acceptation

- [x] AC1 — Une 302 de l'API est rendue en 302 par les deux relais, avec sa `location`, et
      `fetch` part en `redirect: 'manual'`.
- [x] AC2 — Les deux relais rendent le corps sans appeler `arrayBuffer()` sur la réponse amont,
      octet pour octet.

## Hors périmètre

- La route `GET /api/documents/{document}/versions/{versionId}/download` est gardée (décision).
- Le suivi de cette route par le panneau Versions plutôt que `version.url` (V3) : à trancher à
  part par le porteur.
- La question d'undici sur `Authorization` après une redirection d'origine croisée n'est plus
  posée : le relais ne suit plus de redirection.

## Notes d'implémentation

- Ablation : `src/` rendu à `pre-dev` → les 4 tests neufs rouges (`redirect` indéfini,
  `arrayBuffer` appelé une fois) ; correctif remis → 4/4 verts.
- Les tests existants des relais (`relais-commun`, `relais-chemin-serveur`, `relais-panne-amont`,
  `relais-sans-corps`, export RGPD, KYC, super-admin, admin-users, `relais-bff.tck-968`,
  `api-relais-impersonation`, `api-erreurs-bff`) restent verts : leurs `Response` simulées ont un
  vrai corps, que le flux rend tel quel.
