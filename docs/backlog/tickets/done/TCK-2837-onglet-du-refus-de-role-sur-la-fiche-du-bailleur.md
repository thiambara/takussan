---
id: TCK-2837
title: "Sur owners/[id], le refus de rôle (404) garde « Page introuvable » dans l'onglet après l'hydratation"
status: done
phase: P2
family: front
estimate: S
wave: null
created: 2026-11-14
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
  tickets:
    - docs/backlog/tickets/done/TCK-2831-onglet-d-une-fiche-absente-dit-page-introuvable.md
    - docs/backlog/tickets/done/TCK-2740-la-404-de-app-sort-sans-html-serveur.md
tags: [front, introuvable, metadata, titre, owners, suivi-lot-3]
---

## Objectif utilisateur

Quand un utilisateur qui n'est pas admin d'agence ouvre la fiche d'un bailleur (`/app/owners/<id>`), il reçoit
l'introuvable. L'onglet doit dire « Page introuvable » du début à la fin, et pas « Fiche du bailleur » une fois la page
chargée.

## Contexte

Constaté pendant [TCK-2831](TCK-2831-onglet-d-une-fiche-absente-dit-page-introuvable.md) le 2026-11-14 (serveur de
dev, persona agent, `/app/owners/30`, fiche existante, à 390 et 1280). La réponse est un **404**, le `<title>` du HTML
dit « Page introuvable — Takussan », puis **après l'hydratation l'onglet devient « Fiche du bailleur — Takussan »**.

**Cause.** `owners/[id]/layout.tsx` juge d'abord l'appelant : `assertCanReachOwnerAccount(roles)`
(`@/lib/auth/guards`), qui lève `notFound()` hors de `ouvreLaFicheDuBailleur` (décision 3a de TCK-2641). Le document
d'erreur résout ses métadonnées avec la convention `not-found`. Mais Next réécrit l'onglet depuis la charge RSC avec
les métadonnées de la page demandée, et le `generateMetadata` de `owners/[id]/page.tsx` ne connaît pas ce refus.
TCK-2831 n'y rappelle que la sonde d'existence (`exigerRessource('owners', …)`). Pour un agent, cette sonde lit l'API
sans conclure à l'introuvable, et le titre de la fiche est rendu.

C'est le même mécanisme que TCK-2831, avec une autre cause de refus : le rôle, et non la ressource.

## Piste — à vérifier avant d'écrire le correctif

Dans le `generateMetadata` de `owners/[id]/page.tsx`, rappeler le refus du layout avant la sonde :
`assertCanReachOwnerAccount((await getMeAction()).roles)`. `getMeAction` est mémoïsé par `cache()` : **mesurer**
qu'il n'ajoute aucune lecture de `/api/me` par chargement (journal de l'API, avant/après).

⚠ `etats-de-route.test.ts` range `assertCanReach\w*` parmi les refus interdits dans une page sous repli. Son exemption
`sansMiroirDuLayout` (TCK-2831) ne couvre que `exigerRessource`. Il faudra l'étendre au même appel de garde, aux
mêmes conditions : seulement dans `generateMetadata`, et seulement si le layout du dossier fait le même appel.
Il faudra aussi vérifier par ablation que l'appel placé dans le rendu de la page reste rouge.

À relever au passage : les autres layouts de `/app` qui refusent par rôle en `notFound()` sous une page à titre propre.
Les lister dans ce ticket. Ne pas les corriger ici.

## Contraintes strictes

- Le statut **404** du refus ne régresse pas (TCK-426, TCK-2641).
- Aucune lecture de plus vers l'API, ni pour l'admin qui ouvre la fiche, ni pour l'agent refusé.
- Le titre de la fiche pour l'admin ne change pas (`titres-onglets.test.ts` reste vert).

## Critères d'acceptation

- [x] AC1 — Persona agent, `/app/owners/<id existant>` : `document.title` vaut « Page introuvable — Takussan » après
      l'hydratation (relevé au navigateur, 390 et 1280), et la réponse reste **404**.
      *Preuve : relevé CDP, `/app/owners/30`, 390 et 1280 → 404, « Page introuvable — Takussan » de bout en bout (au HEAD :
      « Fiche du bailleur — Takussan » après l'hydratation, relevé avant le correctif).*
- [x] AC2 — Persona admin d'agence : même titre qu'avant (« Fiche du bailleur — Takussan »), et même nombre de
      requêtes à l'API par chargement.
      *Preuve : 390 et 1280 → 200, « Fiche du bailleur — Takussan » ; journal de l'API, 3 chargements avant et 3 après :
      1 `/api/auth/me` et 1 `/api/owners/30` par chargement pour l'admin, avant comme après. Pour l'agent : 1 lecture
      de la fiche avant, 0 après (voir les notes).*
- [x] AC3 — Une garde rougit si le `generateMetadata` de `owners/[id]/page.tsx` ne rappelle pas le refus de rôle de son
      layout ; ablation consignée. La garde `etats-de-route.test.ts` rougit toujours sur le même appel placé dans le
      rendu de la page.
      *Preuve : `app/__tests__/titre-du-refus-de-role.tck-2837.test.ts` (source, dérivée de `guards.ts` et des layouts ;
      montage). Ablations : appel retiré du titre → 3 rouges ; appel dans le rendu → `etats-de-route` rouge ; appel
      retiré du layout → 2 rouges ; autre garde (`assertCanReachAgentArea`) dans le titre → 4 rouges.*

## Hors périmètre

- La fiche absente (fait par TCK-2831).
- Le HTML du 404 (TCK-2740, décision 2 (a)).

## Notes d'implémentation (2026-11-14)

- **La piste a été vérifiée.** `generateMetadata` appelle `assertCanReachOwnerAccount((await getMeAction()).roles)` avant
  `exigerRessource`, dans l'ordre du layout. L'agent refusé ne sonde donc plus l'API depuis le titre.
- **Lectures de l'API.** `getMeAction` est mémoïsé par `cache()` : 1 `/api/auth/me` par chargement, avant comme après.
- **Le rendu ne lit plus rien pour l'agent refusé (décision du porteur, prise dans ce ticket).** Next lance le rendu de
  la page en parallèle du layout qui refuse. Une fois le titre corrigé, l'agent déclenchait encore
  `GET /api/owners/<id>` depuis ce rendu : un 403 de `lireBailleurDuRendu`, journalisé `⨯ Error: API error 403`.
  Le rendu rend désormais `null` hors de `ouvreLaFicheDuBailleur`, avant toute lecture. C'est un narrowing, pas un
  refus : le 404 reste celui du layout. Journal de dev, 3 chargements par persona : l'admin garde 1 lecture de la fiche,
  l'agent passe à 0, et plus aucune erreur n'est journalisée.
- **Garde adaptée.** `sansMiroirDuLayout` (`etats-de-route.test.ts`) exempte aussi `assertCanReach<X>(`, appel par
  appel, s'il est dans le corps de `generateMetadata` ET si le layout du dossier fait le même appel.
- **Relevé demandé : les autres layouts de `/app` qui refusent par rôle en `notFound()`.** Il n'y en a **aucun**.
  `assertCanReachOwnerAccount` est la seule garde de `guards.ts` qui rend `notFound()`, et seul `owners/[id]/layout.tsx`
  l'appelle (la non-vacuité du test l'éprouve). Les autres refus de rôle passent par `redirect('/app')` et ne sont pas
  concernés : `calendar`, `commissions`, `crm/pipeline`, `customers`, `leads`, `leases/onboarding-pending`, `properties`
  et `tasks`. Une navigation remplace l'onglet. À côté : `agency/finances/reconciliation/[statementId]` rend `notFound()`
  sur la forme de l'identifiant, pas sur le rôle.

