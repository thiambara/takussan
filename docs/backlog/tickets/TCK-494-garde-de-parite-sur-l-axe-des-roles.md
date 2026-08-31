---
id: TCK-494
title: "La garde de parité couvre les profils, pas les rôles — l'axe où la dérive a réellement eu lieu"
status: done
phase: P1
family: technique
estimate: S
wave: 56
created: 2026-08-30
updated: 2026-08-31
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

- [x] Une garde de parité `UserRole` ↔ `HasProfiles::profileTypes()`, sur le patron de
      `profile-types.parity.test.ts`
- [x] Elle échoue explicitement si elle ne peut pas extraire la liste du code PHP
- [x] Un cas nommé pour chacun des trois écarts qui ont motivé la garde : `broker` absent du front,
      `customer` et `tenant` absents du back
- [x] L'union `UserRole` et `lib/roles.ts` sont mises en accord avec ce que le back émet réellement

## Critères d'acceptation

- [x] **AC1** — La garde rougit si un alias est ajouté à `profileTypes()` sans l'être à `UserRole`,
      et réciproquement. Vérifié par ablation dans les deux sens.
- [x] **AC2** — La garde rougit — sans passer au vert — si le fichier PHP est introuvable, si son
      motif d'extraction ne trouve rien, ou si l'ensemble extrait est vide.
- [x] **AC3** — `broker` figure dans `UserRole` à l'issue du ticket.
- [x] **AC4** — La garde est verte sur `dev` une fois TCK-492 mergé, et rouge avant : c'est la
      preuve qu'elle mesure l'écart réel et non une liste réécrite pour lui plaire.
- [x] **AC5** — `npm run lint`, `npx tsc --noEmit`, `npm run test` verts.

## Hors périmètre

- La dérivation de `customer` / `tenant` elle-même → TCK-492.
- Le sort du profil `broker` → TCK-495 : ce ticket le rend visible du front, il ne lui donne pas de
  surface.
- La justesse des libellés de rôle : gardée par ailleurs, hors de portée d'un test de parité.
- Toute extension de la garde à d'autres couples front ↔ back (capacités, statuts, énumérations).

## Notes d'implémentation

`src/types/__tests__/user-roles.parity.test.ts`, sur le patron de TCK-329. `UserRole` dérive
désormais d'un `USER_ROLES` `as const` — la garde compare des ensembles, et le typage reste exhaustif.

**L'extraction est en DEUX temps, et le premier n'est pas décoratif** : on isole le corps de
`profileTypes()`, puis on y cherche les `$types->push('…')`. Chercher la forme sur le fichier entier
reviendrait à faire confiance au reste du fichier pour ne jamais la contenir — dans un commentaire,
dans une méthode voisine — et la contrainte n° 1 dit que la garde lit le code, pas ce qui l'entoure.
Chaque étape qui peut échouer le dit : méthode introuvable, corps non borné, ensemble vide.

**Ablation, trois sens (AC1 + AC2) :** retirer `broker` du front → 2 cas rouges ; ajouter un
`push('concierge')` au back → 1 rouge ; renommer `profileTypes()` → 3 rouges avec le message
« profileTypes() introuvable », **jamais un vert sur un ensemble vide**.

**Deux effets de bord, tous deux attrapés par `tsc` et non par un humain** — c'est le second
mécanisme dont parle TCK-329 (`Record<UserRole, …>` exhaustif) qui a fonctionné :
`ProfileHeader.tsx` et `ProfileAdminSection.tsx` portaient des tables de libellés incomplètes, et
`AppSidebar.test.tsx` une table d'href sans ligne `broker`. Les libellés `profile.roles.broker`
sont ajoutés en `fr`/`en`/`wo`.

**`getPrimaryRole` a été refait au passage** : sa liste de priorité était un tableau littéral que
`tsc` ne pouvait pas juger incomplet, et `broker` y manquait — un courtier obtenait `null`,
c'est-à-dire « aucun rôle » pour un compte qui en porte un. Elle est devenue un
`Record<UserRole, number>`.

**Ce que la ligne `broker: []` du relevé de menu dit vraiment** : un courtier ne reçoit AUCUNE entrée
au-delà du socle (`/app`, `/app/messages`, `/app/documents`). Ce n'est pas une propriété souhaitée,
c'est le constat que TCK-495 doit trancher — la garde le rend visible plutôt que de le laisser dans
un angle mort.
