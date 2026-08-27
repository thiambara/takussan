---
id: TCK-378
title: "`forbidden()` — trois pages que TCK-167 n'a pas pu voir, et le cliquet qui manquait pour qu'il le voie"
status: todo
phase: P1
family: bug
estimate: S
wave: 48
created: 2026-08-26
updated: 2026-08-26
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
    - docs/features.md#16-crm--relation-client
tags: [front, dashboard, rbac, nextjs, bug, garde-ci]
---

## Objectif utilisateur

Un utilisateur qui atteint une page `/app/*` réservée à un autre rôle retombe sur son tableau de
bord — il ne reçoit pas un écran d'erreur générique qui lui laisse croire à une panne.

## Contexte

**Ce ticket ne rejoue pas TCK-167 : il corrige la raison pour laquelle TCK-167 est `done` alors
que le défaut est de retour.**

TCK-167 (wave 19, `done` le 2026-05-05) a retiré `forbidden()` de six pages, créé
`assertCanReachAgentArea` dans `src/lib/auth/guards.ts`, et posé en AC3 que
`experimental.authInterrupts` **ne serait pas** activé. Les trois points tiennent encore :
`next.config.ts` ne porte pas le drapeau, et le helper existe.

Ce qui n'a pas tenu, c'est que rien ne rejoue l'AC. Le quatrième point du delta de TCK-167 — un
test e2e parcourant les six routes — n'a jamais été fait ; ses propres notes d'implémentation le
disent : *« E2e test non ajouté : pas de setup Playwright dans le repo. »* Trois pages écrites
**après** ont donc réintroduit l'appel, chacune de bonne foi :

| Page | Ticket d'origine | Appel |
|---|---|---|
| `src/app/(dashboard)/app/customers/new/page.tsx` | TCK-042 | l. 24 |
| `src/app/(dashboard)/app/crm/pipeline/page.tsx` | TCK-083 | l. 20 |
| `src/app/(dashboard)/app/leases/onboarding-pending/page.tsx` | TCK-266 | l. 34 |

Mesure du 2026-08-26, à la source plutôt qu'au raisonnement —
`node_modules/next/dist/client/components/forbidden.js` :

```js
function forbidden() {
    if (!process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS) {
        throw new Error('`forbidden()` is experimental and only allowed to be enabled when
                         `experimental.authInterrupts` is enabled.')   // __NEXT_ERROR_CODE: E488
    }
```

et `node_modules/next/dist/build/define-env.js:169` :
`'process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS': !!config.experimental.authInterrupts`.

Le drapeau étant absent, l'appel lève `E488`. La frontière `(dashboard)/error.tsx` l'attrape et
affiche son message **générique** — délibérément générique, son propre docblock explique
pourquoi. L'utilisateur non autorisé reçoit donc « une erreur est survenue » et un bouton
« réessayer » qui relèvera la même erreur.

Le docblock de `leases/onboarding-pending/page.tsx` affirme quant à lui : *« Les autres tombent
en 403 via `forbidden()` »*. C'est faux, et c'est le genre de faux qui coûte : le prochain
lecteur croira la garde bonne.

*Un `done` mesuré une fois redevient faux sans que personne le voie — sauf si une garde le
remesure.* C'est la même leçon que TCK-372 a tirée de TCK-244.

## Contrat de données

Aucune donnée nouvelle, aucun endpoint. Les trois pages lisent déjà l'utilisateur courant via
`getMeAction()`.

## Direction UX / Artistique

Un refus n'est pas une panne, et les deux ne doivent pas se ressembler. La destination du refus
est le tableau de bord de l'utilisateur — un écran qui marche — et non un écran d'erreur.

## Contraintes strictes (métier)

- **`experimental.authInterrupts` reste désactivé.** C'est l'AC3 de TCK-167, reconduite : le
  correctif passe par la redirection, pas par l'activation d'un drapeau expérimental.
- Le refus reste **côté serveur**, avant tout rendu : aucun flash de contenu privé.
- `assertCanReachAgentArea` couvre le trio agent/bailleur/admin. `crm/pipeline` et
  `customers/new` portent exactement cette condition ; `leases/onboarding-pending` porte
  agent/admin **sans** bailleur — ne pas l'élargir en la factorisant, la table de vérité du menu
  et celle de l'API font foi.
- La garde à écrire doit être **prouvée capable d'échouer**, pas seulement de passer.

## Delta à produire

- [ ] Remplacer les trois `forbidden()` par la redirection serveur, en réutilisant
      `src/lib/auth/guards.ts` — et en y ajoutant la garde agent/admin dont
      `leases/onboarding-pending` a besoin plutôt qu'en élargissant l'existante
- [ ] Corriger le docblock de `leases/onboarding-pending/page.tsx`, qui décrit un 403 qui
      n'arrive pas
- [ ] Garde `scripts/check-auth-interrupts.mjs` : refuse tout import ou appel de `forbidden()` /
      `unauthorized()` sous `takussan-web/src` **tant que** `experimental.authInterrupts` est
      absent de `next.config.ts` — et refuse l'inverse aussi (le drapeau activé sans fichier
      `forbidden.tsx` de frontière). En-tête portant le motif, la mesure du 2026-08-26 et le
      renvoi à TCK-167
- [ ] Branchement de la garde dans `.github/workflows/repo-ci.yml`
- [ ] Tests : les trois pages, en rôle non autorisé, redirigent

## Critères d'acceptation

- [ ] AC1 — `grep -rn "forbidden()" takussan-web/src` ne renvoie plus aucun appel (le mot peut
      subsister dans un commentaire ou dans la garde elle-même)
- [ ] AC2 — un `customer` authentifié atteignant `/app/customers/new`, `/app/crm/pipeline` et
      `/app/leases/onboarding-pending` est redirigé vers `/app` ; aucun des trois ne rend la
      frontière d'erreur du tableau de bord
- [ ] AC3 — un `agent` continue d'accéder aux trois pages ; un `owner` accède aux deux premières
      et **pas** à la troisième, comme aujourd'hui
- [ ] AC4 — `next.config.ts` n'introduit pas `experimental.authInterrupts`
- [ ] AC5 — `node scripts/check-auth-interrupts.mjs` sort en 0 sur le dépôt propre et **sort en
      échec** quand on réintroduit volontairement `forbidden()` dans une page (vérification par
      ablation)
- [ ] AC6 — la garde est rejouée par `repo-ci.yml`
- [ ] AC7 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent

## Hors périmètre

- Introduire un écran 403 dédié : la décision de TCK-167 était la redirection, elle n'est pas
  rouverte ici.
- Le harnais e2e que TCK-167 n'a pas pu poser : la garde statique le remplace pour **cette**
  propriété, elle ne le remplace pas en général.
- Les autres gardes d'accès de `/app`.

## Notes d'implémentation

_(à remplir par implementing-specs)_
