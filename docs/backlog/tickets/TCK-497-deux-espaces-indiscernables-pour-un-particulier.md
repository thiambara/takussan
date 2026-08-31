---
id: TCK-497
title: "Le sélecteur propose deux espaces au nom et au slug identiques — un choix qui n'en est pas un"
status: todo
phase: P1
family: full
estimate: M
wave: 56
created: 2026-08-30
updated: 2026-08-30
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
    - docs/features.md#112-agence--équipe
  models:
    - docs/models-spec.md#2-agency
tags: [front, back, onboarding, profils, ux, bug]
---

## Objectif utilisateur

Un particulier qui a créé son espace voit **son espace** — pas deux entrées portant le même nom entre
lesquelles il doit choisir sans qu'aucune information ne l'aide à choisir.

## Contrat de données

`HostIndividualOnboardingService::onboard()` crée dans une seule transaction une `Agency`
(`kind: individual`), un `AgencyAdminProfile` et un `OwnerProfile` — les trois pour une seule
personne, dans la même agence. `GET /api/me/profiles` rend donc deux profils, et le sélecteur
affiche, mesuré le 2026-08-30 :

```
Administrateur   Espace de Mouhamadoul Amine THIAM
                 espace-de-mouhamadoul-amine-thiam-3
Propriétaire     Espace de Mouhamadoul Amine THIAM
                 espace-de-mouhamadoul-amine-thiam-3   ← identique
```

`ProfileSwitcher` libelle chaque entrée par `profile.agency.name` (`useProfiles.ts`,
`profileLabel()`), et les deux profils pointent la même agence : les deux lignes ne peuvent pas
différer. Seule l'en-tête de groupe — « Administrateur » / « Propriétaire » — les sépare, et rien
n'explique ce que le choix change.

**Le choix n'est pas cosmétique** : les capacités sont additives par profil
([ADR-0003](../../adr/0003-capacites-enum-code-defined.md)) et le menu latéral en dépend, donc les
deux espaces n'ouvrent pas les mêmes écrans.

**Le suffixe `-3` est un second défaut, indépendant.** `uniqueSlug()` incrémente sur collision
**globale**, et le nom d'agence est dérivé du nom de la personne
(`onboarding.host.defaults.spaceNameOf`). Deux homonymes se marchent donc dessus, et un identifiant
destiné à être public finit par porter un rang qui ne signifie rien pour personne.

## Direction UX / Artistique

**Un sélecteur sert à choisir ; deux entrées indiscernables ne sont pas un choix, c'est un tirage.**
Deux sorties sont recevables et ce ticket demande qu'on en retienne une :

- **Fusionner** — pour une agence `individual`, l'espace est unique : le sélecteur ne s'affiche pas,
  ou n'affiche qu'une entrée. Les deux profils continuent d'exister en base, mais la personne n'a pas
  à connaître la distinction. C'est la lecture la plus fidèle au mot « particulier ».
- **Distinguer** — les deux entrées restent, et chacune dit ce qu'elle ouvre. La distinction devient
  alors une fonctionnalité assumée, pas un effet de bord de la transaction d'onboarding.

**Ce qu'il ne faut pas faire : garder les deux lignes en les rendant seulement plus jolies.** Le
défaut n'est pas typographique.

**Le slug d'une agence `individual` n'a pas à être montré.** Il sert d'identifiant d'URL publique
pour une agence professionnelle ; sous le nom d'un particulier, il n'apporte rien et expose un rang
de collision.

Référence obligatoire : [`docs/design-guidelines.md`](../../design-guidelines.md).

## Contraintes strictes (métier)

1. **Ne pas supprimer l'un des deux profils.** L'`AgencyAdminProfile` porte l'administration de
   l'agence, l'`OwnerProfile` porte le KYC du propriétaire (`features.md#21`, § Profils) — ce ne
   sont pas des doublons, ce sont deux natures. Le défaut est de **présentation**.
2. **Le profil actif reste `agency_admin` après l'onboarding.** C'est ce que TCK-271 a décidé et ce
   que le cookie porte ; ce ticket ne le renégocie pas.
3. **Une agence `standard` n'est pas concernée.** Un vrai administrateur d'agence qui est aussi
   propriétaire d'un bien chez elle a deux espaces qui ont un sens : la règle porte sur
   `kind: individual`, et se lit dans le modèle, pas dans une heuristique de nom.
4. **Aucun compte existant ne perd d'accès.** Quelle que soit l'issue, toutes les capacités restent
   atteignables.
5. **Le nom d'agence dérivé du nom de la personne reste possible**, mais un slug ne se montre pas
   pour ça — et un rang de collision ne s'affiche jamais à l'utilisateur.

## Delta à produire

**Frontend — intentionnel**

- [ ] Le sélecteur cesse de proposer deux entrées indiscernables pour une agence `individual`
- [ ] Le slug n'est plus affiché là où il n'identifie rien
- [ ] Si l'issue retenue conserve les deux entrées, chacune dit ce qu'elle ouvre
- [ ] Tests : un particulier issu de l'assistant hôte ; un compte multi-agences, qui ne doit rien
      perdre ; un `agency_admin` d'agence `standard` également propriétaire, dont les deux espaces
      restent distincts

**Backend — prescriptif**

- [ ] `App\Http\Resources\Api\Me\ProfileResource` — expose de quoi distinguer deux profils d'une même
      agence sans que le front ait à le déduire d'un nom
- [ ] Tests : `MeProfilesTest` — deux profils d'une même agence restent tous deux listés et
      commutables ; la charge utile porte de quoi les séparer

## Critères d'acceptation

- [ ] **AC1** — Un compte issu de l'assistant hôte ne voit plus deux entrées portant le même libellé.
      *Ce test échoue sur le code actuel.*
- [ ] **AC2** — Aucun slug n'est affiché sous le nom d'une agence `individual`.
- [ ] **AC3** — Toutes les capacités des deux profils restent atteignables : aucun écran accessible
      avant ne devient inaccessible.
- [ ] **AC4** — Un `agency_admin` d'une agence `standard` qui y est aussi propriétaire conserve deux
      espaces distincts et lisibles.
- [ ] **AC5** — `GET /api/me/profiles` continue de lister les deux profils : le changement est de
      présentation, pas de contrat.
- [ ] **AC6** — Suites back et front vertes ; Pint propre ; `npm run lint` et `npx tsc --noEmit`
      propres ; aucune chaîne affichée en dur hors dictionnaire.

## Hors périmètre

- La stratégie de nommage et d'unicité des slugs d'agence en général : le rang de collision cesse
  d'être **affiché**, `uniqueSlug()` n'est pas réécrit.
- La suppression ou la fusion des deux profils en base.
- Le choix du profil actif après onboarding (TCK-271).
- Le passage d'une agence `individual` en `standard`, qui a son propre parcours.

## Notes d'implémentation

_(à remplir par implementing-specs)_
