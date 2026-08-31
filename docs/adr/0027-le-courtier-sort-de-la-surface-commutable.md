# ADR-0027 — Le courtier sort de la surface commutable, sans quitter la base

- **Statut** : accepté
- **Date** : 2026-08-31
- **Ticket** : [TCK-495](../backlog/tickets/TCK-495-le-courtier-est-un-profil-sans-surface.md)
- **Remplace / amende** : rien. Précise l'application d'[ADR-0002](0002-role-est-un-profil-polymorphe.md).

## Contexte

`BrokerProfile` et `BrokerAgencyCollaboration` existent depuis la phase 1 : tables, migrations,
factories, seeders, relation `User::brokerProfile()`, lecture par `PropertyResource`, entrée
`broker` dans `ActiveProfileResolver::TYPE_MAP` — donc dans le sélecteur d'espaces — et émission
dans `roles` par `HasProfiles::profileTypes()`. `docs/features.md` §2.1 cite explicitement « un
courtier indépendant collaborant avec C et D » comme cas d'usage du multi-profil.

**Ce qui n'existait pas**, mesuré le 2026-08-30 :

```
php artisan route:list --json | (uri|action|name contenant "broker")  →  0
find takussan-web/src/app -ipath '*broker*'                          →  0
```

Zéro route API, zéro page, aucun assistant d'onboarding, **aucun chemin — invitation comprise — qui
crée un `BrokerProfile`**. Un compte qui en obtenait un pouvait le sélectionner dans le sélecteur
d'espaces et se retrouvait devant un produit qui ne le connaissait pas : `isAgent()`, `isOwner()`,
`isAdmin()`, `isServiceProvider()` rendaient tous `false`, et le menu latéral se réduisait au socle
— `/app`, `/app/messages`, `/app/documents`.

**Ce n'est pas un défaut découvert par hasard.** [TCK-494](../backlog/tickets/TCK-494-garde-de-parite-sur-l-axe-des-roles.md)
a posé la veille une garde de parité `UserRole` ↔ `profileTypes()`, dont l'effet immédiat a été
d'écrire noir sur blanc, dans la table d'audience du menu, la ligne
`broker: ['/app', '/app/messages', '/app/documents']`. *Une garde ne corrige rien ; elle rend
arbitrable ce qui vivait dans un angle mort.*

## Décision

**`broker` cesse d'être un profil commutable. Les modèles, tables, migrations, factories et
seeders restent.**

Concrètement :

1. `broker` sort d'`ActiveProfileResolver::TYPE_MAP` — il n'est plus sélectionnable, et la regex de
   `SelectActiveProfileRequest` le refuse d'elle-même, **parce qu'elle est dérivée de cette carte**
   et non recopiée.
2. `broker` sort de `HasProfiles::profileTypes()` — il n'est plus émis dans `roles`.
3. `broker` sort de `HasProfiles::profiles()`. **Ce troisième point n'était pas dans le ticket et
   il n'est pas optionnel** : `ProfileResource` demande son alias à `aliasFor()`, qui **lève** pour
   une classe absente de `TYPE_MAP`. Sans lui, `GET /api/me/profiles` rendait **500** à tout compte
   portant un `BrokerProfile` — et les seeders en fabriquent un.
4. Côté front, `broker` sort de `PROFILE_TYPES`, de `USER_ROLES`, du prédicat `isBroker()` (supprimé)
   et des cinq tables de libellés, de couleur et de rang. Les clés i18n correspondantes sont
   retirées des trois locales.
5. **Ce qui RESTE, délibérément** : la relation `brokerProfile()`, `hasProfile(BrokerProfile::class)`,
   `isProfessional()`, la lecture par `PropertyResource::ownerActsAsAgent()`, la console super-admin
   (`UserDetailResource`, filtre `role=broker`), l'export RGPD, et les seeders. Ce sont des lectures
   de données existantes ; elles restent justes.

## Pourquoi cette issue plutôt que l'autre

Le ticket posait deux issues recevables. Retenir « le courtier reste » demandait une porte de
création, des capacités déclarées dans `MembershipCapabilityResolver` avec un test chacune, et les
écrans que ces capacités ouvrent — **une fonctionnalité produit, pas un raccommodage**, et le
produit n'a aujourd'hui aucun courtier à servir.

**Ce qui départage n'est pas le coût, c'est l'asymétrie du risque.** Un rôle sélectionnable qui ne
mène nulle part est plus coûteux que pas de rôle du tout : il se choisit, et il déçoit. Un profil
retiré de la surface ne déçoit personne et se réexpose le jour où il a un produit derrière lui.

## Pourquoi rien n'est supprimé en base

Une migration de suppression est **irréversible en pratique** : le `down()` recrée un schéma vide,
jamais les lignes. Le retrait décidé porte sur l'EXPOSITION, pas sur la donnée. Les seeders
continuent d'ailleurs de créer un compte courtier — et c'est utile : il est exactement la fixture
qui aurait rendu 500 au point 3.

## Conséquences

- **Ce qui devient impossible et doit le rester** : ré-exposer `broker` en remettant l'alias.
  `AppSidebar.audience.test.tsx` porte une garde en deux temps — tout alias de `TYPE_MAP` doit être
  un `UserRole` connu du front, **et** ouvrir au moins un écran au-delà du socle.

  ⚠ **Le premier temps a été ajouté après une ablation qui n'a pas rougi.** Écrite en un seul temps,
  la garde était VIDE pour le cas qu'elle prétendait attraper : un alias absent de `UserRole` n'est
  reconnu par aucun prédicat, `isCustomerOnly()` le rend donc `true`, et `buildNavItems` lui sert le
  parcours client COMPLET. *Un rôle inconnu qui reçoit le menu le plus fourni est le pire des faux
  verts.*

- **Ce qu'une garde de parité ne pouvait pas décider.** `user-roles.parity.test.ts` aurait été verte
  dans les deux sens — back et front d'accord sur `broker` présent, ou d'accord sur `broker` absent.
  *Un test de parité tient l'accord entre deux listes, jamais la justesse de ce qu'elles
  contiennent.* C'est pourquoi cette décision est un ADR et non un ajustement de liste.

- **Un ciblage d'annonce en moins.** `AnnouncementResolver` croise `segment.roles` avec
  `profileTypes()` : `broker` y aurait désigné zéro compte, en silence. Le slug est retiré de la
  liste front. ⚠ Cette liste reste **recopiée** et il lui manque `customer` et `tenant` (émis depuis
  TCK-492) — écart inscrit à l'ardoise, hors périmètre ici.

- **`--chart-4` devient libre** dans la table de couleurs de `ProfileBadge`. Les quatre types
  survivants ne sont pas renumérotés : ça changerait la couleur de trois badges pour rien.

- **Le réexposer, plus tard, demande dans cet ordre** : une porte qui crée le profil, ses capacités
  déclarées (*un profil sans capacité déclarée refuse tout en silence*), ses écrans, puis l'alias.
  Remettre l'alias en premier est précisément ce que la garde interdit.

## Ce que cet ADR ne décide pas

- Le sort des tables `broker_profiles` et `broker_agency_collaborations` : elles restent, sans date.
- Le sort des autres profils sans porte en libre-service (agent, prestataire) — **autre question** :
  eux ont des écrans, il leur manque une entrée. Ardoise D-60.
- La stratégie de nommage et d'unicité des slugs d'agence (TCK-497, hors périmètre).
