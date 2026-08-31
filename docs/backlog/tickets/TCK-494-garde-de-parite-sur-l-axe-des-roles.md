---
id: TCK-494
title: "La garde de parité couvre les profils, pas les rôles — l'axe où la dérive a réellement eu lieu"
status: todo
phase: P1
family: technique
estimate: S
wave: 56
created: 2026-08-30
updated: 2026-08-30
depends_on: [TCK-492]
blocks: []
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
  models:
    - docs/models-spec.md#1-user
tags: [front, back, garde, ci, roles, technique]
---

## Objectif utilisateur

L'écart entre ce que l'API émet dans `roles` et ce que le front sait en faire rougit le jour où il
est introduit, au lieu d'être découvert des mois plus tard par un utilisateur devant un menu vide.

## Contrat de données

**Il y a deux axes, et un seul est gardé.**

| Axe | Source de vérité (back) | Recopie (front) | Gardé par |
|---|---|---|---|
| Profils | `ActiveProfileResolver::TYPE_MAP` | `PROFILE_TYPES` (`types/profile.ts`) | `types/__tests__/profile-types.parity.test.ts` (TCK-329) |
| **Rôles** | `HasProfiles::profileTypes()` | `UserRole` (`types/user.ts`) | **rien** |

L'axe non gardé porte trois écarts mesurés le 2026-08-30 :

- `broker` est émis par `profileTypes()` et **absent** de l'union `UserRole` ;
- `customer` et `tenant` sont déclarés dans `UserRole` et **jamais émis** (→ TCK-492) ;
- `lib/roles.ts` expose `isCustomer()` et `isTenant()`, qui rendent donc toujours `false`.

**La garde de TCK-329 est le bon patron et il fonctionne** : elle lit le fichier PHP, en extrait les
alias, échoue bruyamment si elle ne trouve pas sa source, et vit dans la suite vitest que
`web-ci.yml` rejoue déjà. Ce ticket ne conçoit rien — il applique ce patron au second axe.

⚠ **La source est plus difficile à extraire ici.** `TYPE_MAP` est un tableau littéral ;
`profileTypes()` est une méthode dont les valeurs sont poussées conditionnellement. Une extraction
par expression régulière sur le corps de la méthode est fragile : si la forme du code change, la
garde doit **échouer**, jamais passer au vert sur un ensemble vide — c'est déjà l'invariant écrit
dans la garde de TCK-329, et c'est celui qui compte le plus ici.

## Contraintes strictes (métier)

1. **La garde lit le CODE, jamais un commentaire ni un docblock.** C'est la règle qui a fait de la
   garde de TCK-329 une garde et non une intention.
2. **Une garde qui ne trouve pas sa source échoue.** Un ensemble vide n'est pas une parité tenue —
   c'est la forme de vacuité qui ressemble le plus à un succès.
3. **La garde vit dans la suite vitest**, pas dans un `scripts/check-*.mjs` : `web-ci.yml` la rejoue
   déjà à chaque PR, sans étape supplémentaire — même raison que TCK-329.
4. **Elle vérifie que les deux ensembles coïncident, rien de plus.** La justesse des libellés et le
   comportement des prédicats sont gardés ailleurs ; ce ticket ne s'en charge pas et le dit.
5. **Aucune modification du back.** Si la garde rougit à l'écriture, c'est TCK-492 qui la fait
   verdir, pas un ajustement de la liste front pour faire passer le test.

## Delta à produire

**Frontend — intentionnel**

- [ ] Une garde de parité `UserRole` ↔ `HasProfiles::profileTypes()`, sur le patron de
      `profile-types.parity.test.ts`
- [ ] Elle échoue explicitement si elle ne peut pas extraire la liste du code PHP
- [ ] Un cas nommé pour chacun des trois écarts qui ont motivé la garde : `broker` absent du front,
      `customer` et `tenant` absents du back
- [ ] L'union `UserRole` et `lib/roles.ts` sont mises en accord avec ce que le back émet réellement

## Critères d'acceptation

- [ ] **AC1** — La garde rougit si un alias est ajouté à `profileTypes()` sans l'être à `UserRole`,
      et réciproquement. Vérifié par ablation dans les deux sens.
- [ ] **AC2** — La garde rougit — sans passer au vert — si le fichier PHP est introuvable, si son
      motif d'extraction ne trouve rien, ou si l'ensemble extrait est vide.
- [ ] **AC3** — `broker` figure dans `UserRole` à l'issue du ticket.
- [ ] **AC4** — La garde est verte sur `dev` une fois TCK-492 mergé, et rouge avant : c'est la
      preuve qu'elle mesure l'écart réel et non une liste réécrite pour lui plaire.
- [ ] **AC5** — `npm run lint`, `npx tsc --noEmit`, `npm run test` verts.

## Hors périmètre

- La dérivation de `customer` / `tenant` elle-même → TCK-492.
- Le sort du profil `broker` → TCK-495 : ce ticket le rend visible du front, il ne lui donne pas de
  surface.
- La justesse des libellés de rôle : gardée par ailleurs, hors de portée d'un test de parité.
- Toute extension de la garde à d'autres couples front ↔ back (capacités, statuts, énumérations).

## Notes d'implémentation

_(à remplir par implementing-specs)_
