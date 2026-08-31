---
id: TCK-495
title: "Le courtier est un profil commutable sans aucune surface — lui en donner une, ou le retirer"
status: done
phase: P2
family: applicatif
estimate: M
wave: 56
created: 2026-08-30
updated: 2026-08-31
depends_on: [TCK-494]
blocks: []
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
    - docs/features.md#112-agence--équipe
  models:
    - docs/models-spec.md#36-brokerprofile-
    - docs/models-spec.md#38-brokeragencycollaboration-
tags: [back, front, broker, profils, decision-produit]
---

> **`status: done` — et c'est le sens du ticket.** Il porte une décision produit, pas un delta
> déjà tranché : *le courtier fait-il partie de Takussan aujourd'hui ?* Les deux issues sont
> légitimes et le delta n'est pas le même. Le ticket se débloque quand la réponse est donnée.

## Objectif utilisateur

Un rôle qu'on peut choisir mène quelque part. Aujourd'hui, un compte qui obtiendrait un profil de
courtier pourrait le sélectionner dans le sélecteur d'espaces et se retrouverait devant un produit
qui ne le connaît pas.

## Contrat de données

**Ce qui existe**, et c'est réel : `BrokerProfile`, `BrokerAgencyCollaboration`, leurs migrations et
leurs factories ; l'alias `broker` dans `ActiveProfileResolver::TYPE_MAP`, donc dans le sélecteur de
profil et dans `GET /api/me/profiles` ; `broker` émis par `profileTypes()`, donc dans `roles` ;
`BrokerProfile` lu par `PropertyResource` ; la spec, qui le décrit
(`features.md#22-rôles--permissions`, `models-spec.md#36-brokerprofile-`) et qui cite explicitement
« un courtier indépendant collaborant avec C et D » comme cas d'usage du multi-profil.

**Ce qui n'existe pas**, mesuré le 2026-08-30 :

```
php artisan route:list --json | (uri | action | name contenant "broker")   →  0
find takussan-web/src/app -ipath '*broker*'                                →  0
grep 'broker' takussan-web/src/types/user.ts                               →  0
```

Zéro route API, zéro page, absent de l'union `UserRole` côté front, aucun assistant d'onboarding,
aucun chemin — invitation comprise — qui crée un `BrokerProfile`.

**La conséquence si un compte en obtenait un** : `isAgent()`, `isOwner()`, `isAdmin()`,
`isServiceProvider()` rendraient tous `false`, et le menu serait vide. C'est le défaut de
[TCK-492](TCK-492-customer-et-tenant-jamais-emis-dans-roles.md), en pire : là, au moins, le compte
n'a pas choisi son espace.

## Contraintes strictes (métier)

1. **Les deux issues sont recevables, la situation actuelle ne l'est pas.** Un rôle sélectionnable
   qui ne mène nulle part est plus coûteux que pas de rôle du tout.
2. **Si le courtier reste** : il lui faut une porte (par quel chemin obtient-on le profil ?), un
   menu qui le reconnaît, et des capacités déclarées dans `MembershipCapabilityResolver`. Un profil
   sans capacité déclarée **refuse tout en silence** — c'est la panne la plus discrète de cette
   couche (`takussan-api/CLAUDE.md`, § Autorisation).
3. **Si le courtier part** : il sort de `TYPE_MAP` — donc du sélecteur — et de `profileTypes()`. Les
   modèles et leurs migrations ne se suppriment pas dans le même geste : une migration de
   suppression est irréversible en pratique, et la spec le décrit encore.
4. **Dans les deux cas, la spec suit.** `features.md` et `models-spec.md` décrivent le courtier au
   présent ; si le produit tranche autrement, c'est une PR de spec, jamais une divergence de plus
   (`/sync-specs`).
5. **Aucune décision par défaut.** Ne pas trancher « en attendant » en retirant l'alias : ce serait
   décider le retrait sans l'avoir décidé.

## Delta à produire

**Issue A : le courtier reste — NON RETENUE.** Ces quatre lignes restent lisibles telles quelles :
elles sont le devis de la réexposition, le jour où le produit voudra du courtage.

- [ ] ~~Un chemin qui crée un `BrokerProfile` (invitation, ou déclaration en libre-service)~~
- [ ] ~~Les capacités du courtier déclarées dans `MembershipCapabilityResolver`, chacune avec son test~~
- [ ] ~~Un menu qui le reconnaît, et les écrans que ses capacités ouvrent~~
- [ ] ~~`broker` ajouté à l'union `UserRole` et aux prédicats (recoupe TCK-494)~~

**Issue B : le courtier sort — RETENUE.**

- [x] `broker` retiré de `ActiveProfileResolver::TYPE_MAP` et de `profileTypes()`
- [x] **(hors ticket, et obligatoire)** `broker` retiré de `HasProfiles::profiles()` — sans quoi
      `GET /api/me/profiles` rend 500 ; cf. Notes d'implémentation
- [x] Les gardes de parité suivent d'elles-mêmes (TCK-329, TCK-494) — rougissent avant, verdissent
      après, vérifié par ablation
- [x] `features.md` et `models-spec.md` mis à jour
- [x] `BrokerProfile` et `BrokerAgencyCollaboration` marqués comme non exposés, sans suppression de
      schéma

## Critères d'acceptation

- [x] **AC1** — La décision est écrite quelque part de durable :
      [ADR-0027](../../adr/0027-le-courtier-sort-de-la-surface-commutable.md), inscrit à
      `docs/adr/README.md`. Elle est structurelle : elle change la composition de `TYPE_MAP`, dont
      le docblock dit que les alias sont des « stable wire identifiers ».
- [x] **AC2** — Vérifié par une GARDE et non par une relecture :
      `AppSidebar.audience.test.tsx` lit `TYPE_MAP` **dans le fichier PHP** et exige de chaque alias
      (a) qu'il soit un `UserRole` que le front connaît, (b) qu'il ouvre au moins un écran au-delà
      du socle `/app`, `/app/messages`, `/app/documents`. Ablation : remettre `broker` dans
      `TYPE_MAP` la fait rougir en le nommant.
      ⚠ **Ce qu'elle ne prouve pas** : que les écrans ouverts soient les bons, ni qu'ils répondent à
      ces `href`. C'est un plancher — « ce rôle mène quelque part » —, pas une preuve de justesse.
- [x] **AC3** — Les deux specs sont en accord avec le code. **Mesuré, non déduit** : les 30
      occurrences résiduelles de `broker`/`courtier` dans `models-spec.md` ont été relues une par
      une ; celles qui décrivent les MODÈLES (§36, §38, index, contraintes d'unicité) sont justes et
      restent, sous le bandeau ⚠ *non exposé* ; les trois qui affirmaient un RÔLE — l'inventaire des
      profils porteurs de rôle, la nature métier du User, la liste des rôles métier — sont
      corrigées. `check-models-spec.mjs` et `gen-features-by-actor.mjs --check` verts.
      ⚠ *Le workflow `/sync-specs` n'a pas été lancé* : ce qui est affirmé ici est ce qui a été
      relu, pas ce qu'un outil a confirmé.
- [x] **AC4** — Suites back et front vertes ; les trois gardes de parité passent (TCK-329, TCK-494,
      et celle d'AC2).

## Hors périmètre

- La suppression des tables `broker_profiles` et `broker_agency_collaborations` : irréversible en
  pratique, et hors de portée d'un ticket d'arbitrage.
- La parité `UserRole` ↔ `profileTypes()` en elle-même → TCK-494, dont ce ticket dépend pour que
  l'écart soit visible avant d'être arbitré.
- Le sort des autres profils sans porte en libre-service (agent, prestataire) — ardoise D-60, autre
  question : eux ont des écrans, il leur manque une entrée.

## Notes d'implémentation

**Issue retenue : B — le courtier sort.** Le raisonnement complet, et ce que la réexposition
demandera, sont dans [ADR-0027](../../adr/0027-le-courtier-sort-de-la-surface-commutable.md). Ce qui
suit est ce que l'implémentation a appris **en plus du ticket**.

### Le point que le ticket n'avait pas vu, et qui cassait

Le delta prescrivait deux retraits — `TYPE_MAP` et `profileTypes()`. Il en fallait un **troisième** :
`HasProfiles::profiles()`. `ProfileResource::toArray()` demande son alias à
`ActiveProfileResolver::aliasFor()`, qui **lève `InvalidArgumentException`** pour une classe absente
de `TYPE_MAP`. Les trois appelants de `profiles()` — le sélecteur, l'auto-bascule de
`ResolveActiveProfile`, `User::getAgencyIdAttribute()` — traitent tous son résultat comme « un profil
qu'on peut rendre actif ».

Sans ce troisième retrait, `GET /api/me/profiles` rendait **500** pour tout compte portant un
`BrokerProfile` — pas un cas de laboratoire : `UserSeeder` et `TestSeeder` en fabriquent un.
Ablation faite, l'exception se reproduit au mot près :
`InvalidArgumentException: Unknown profile class: App\Models\Profiles\BrokerProfile`.

*Retirer un alias d'une carte n'est pas une soustraction : c'est un changement de contrat pour tout
ce qui traduit vers cette carte.*

### La garde d'AC2 a d'abord été un faux vert

Écrite en un seul temps — *« cet alias ouvre plus que le socle »* —, elle est restée **VERTE** sous
ablation. Cause : `broker` n'étant plus un `UserRole`, aucun prédicat ne le reconnaît,
`isCustomerOnly()` rend `true`, et `buildNavItems` lui sert le parcours **client complet** — treize
entrées. La garde mesurait donc « il mène quelque part » sur un menu attribué par défaut à un rôle
que le produit ne sait pas nommer.

D'où le premier temps, ajouté après l'ablation : *chaque alias de `TYPE_MAP` doit être un `UserRole`
que le front connaît.* **Une garde qu'on n'a pas vue rougir n'est pas une garde** — et celle-ci
serait passée pour telle.

### Ce que la garde de parité de TCK-494 ne pouvait pas décider

`user-roles.parity.test.ts` aurait été verte dans les **deux** sens : back et front d'accord sur
`broker` présent, ou d'accord sur `broker` absent. *Un test de parité tient l'accord entre deux
listes, jamais la justesse de ce qu'elles contiennent.* Son cas nommé n'a donc pas été supprimé mais
**retourné**, avec la trace de ce qui a réellement tranché — pour que quiconque voudra « remettre
broker pour faire propre » lise d'abord pourquoi il n'y est plus.

### Trois listes recopiées, découvertes en chemin

1. **`TYPES_ATTENDUS` de `scripts/check-profile-badge-contrast.mjs`** — recopiait les cinq types.
   Elle a rougi sur un défaut de CONTRASTE inexistant, en accusant la table du composant d'être
   « amputée » alors qu'elle était juste. Elle **dérive** maintenant de `PROFILE_TYPES`, et son
   cliquet `MESURES_ATTENDUES` se calcule au lieu d'être écrit.
2. **`expect(mesures).toBe(10)` dans `ProfileBadge.test.tsx`** — même motif, même jour : un compte
   recopié mesure la date à laquelle on l'a écrit. Dérivé, avec une clause `> 0` qui conserve ce que
   le littéral apportait vraiment.
3. **`ROLE_SLUGS` de `announcements.tsx`** — `broker` y ciblait zéro compte en silence. Retiré. ⚠ Il
   lui manque `customer` et `tenant`, émis depuis TCK-492 : **non corrigé ici**, parce que ce serait
   ouvrir un ciblage neuf. Inscrit à l'ardoise en **D-64**.

### Ce qui reste, et pourquoi c'est juste

La relation `brokerProfile()`, `hasProfile(BrokerProfile::class)`, `isProfessional()`,
`PropertyResource::ownerActsAsAgent()`, la console super-admin (`UserDetailResource`, filtre
`filter[role]=broker`, badge et sa clé i18n `superAdmin.userDetail.profiles.broker`), l'export RGPD,
et les seeders. Ce sont des **lectures de données existantes** ; elles restent vraies. Les seeders
sont même utiles : le compte courtier qu'ils créent est exactement la fixture qui aurait rendu 500.

`--chart-4` redevient libre dans la table de couleurs de `ProfileBadge`. Les quatre types survivants
**ne sont pas renumérotés** : ça changerait la couleur de trois badges existants pour rien.
