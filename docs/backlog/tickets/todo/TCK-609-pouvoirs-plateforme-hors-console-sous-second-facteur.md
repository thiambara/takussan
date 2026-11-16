---
id: TCK-609
title: "Un pouvoir de la plateforme exige le second facteur où qu'il s'exerce : réponses d'avis, gestes du bail et tout ce que `Gate::before` ouvre hors de `/api/admin` (suites de TCK-597 passes 3-4 et TCK-596 passe 4)"
status: todo
phase: P1
family: back
estimate: M
wave: 76
created: 2026-10-08
updated: 2026-11-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
    - docs/features.md#22-rôles--permissions
    - docs/features.md#29-administration--configuration
    - docs/features.md#111-avis--réputation
    - docs/features.md#14-location-longue-durée-baux
  models:
    - docs/models-spec.md#1-user
tags: [back, securite, 2fa, plateforme, super-admin, gate-before, garde, adr-0033]
---

# TCK-609 — Un pouvoir de la plateforme exige le second facteur où qu'il s'exerce

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : partiellement fermé, le reste bloqué sur la décision du porteur.** `git log --grep=TCK-609` → vide.

- Fermé entre-temps : le volet **`featured`** — TCK-633 lot F (5e2fb25d0, ADR-0061 §5) le rend
  `prohibited` pour tout le monde (`UpdatePropertyRequest.php:78-79`, dérivé des boosts, écrit par
  `BoostLifecycle` seul) : 422 pour tous, plus aucun pouvoir plateforme à garder.
- Toujours vrai : `Gate::before` global (`AppServiceProvider.php:930`) ; `RequireTwoFactor`
  (`:62-82`) ne juge que des listes ; `reply`/`deleteReply` toujours exemptés
  (`ProtectedActions.php:388-389`) ; ni `terminate`, ni `rent` (`force`), ni `signature-request`
  dans `AGENCY_TWO_FACTOR`. `PlatformPowerTwoFactorTest` absent.
- Le nom `PLATFORM_POWER_EXEMPT` est **déjà pris** (`ProtectedActions.php:343-347`, step-up des
  actions qui *confèrent* un pouvoir plateforme) : la nouvelle liste prend un autre nom
  (p. ex. `PLATFORM_ANY_ROUTE_EXEMPT`).
- Reste à faire : décision, amendement d'ADR-0033 §8, `RequireTwoFactor` + exemptions motivées,
  gestes du bail, `PlatformPowerTwoFactorTest` + garde de parcours des routes mutantes, ablations.
- **Décision attendue du porteur** : (a) règle générale ou (b) liste étendue ? Et les gestes du
  bail (`terminate`, `rent` `force`, `signature-request`) entrent-ils dans la famille d'agence —
  oui pour les trois / oui pour `terminate` et `rent` seulement (recommandé) / non ?

## Objectif utilisateur

Un jeton de super-admin qui n'a pas vu le second facteur (jeton OAuth, jeton antérieur à
l'enrôlement, jeton volé) ne peut rien changer nulle part : ni dans la console, ni sur ~~une annonce,~~
un avis ou un bail d'agence *(l'annonce : caduc depuis TCK-633 lot F, `featured` n'est plus écrit
par personne)*.

## Contexte

TCK-589 a posé la 2FA exigée par **listes** (ADR-0033) : `/api/admin/*` entier pour un profil
plateforme, puis les actions mutantes listées dans `ProtectedActions`. Or `Gate::before` ouvre au
super-admin **toute** route de l'application : chaque route mutante hors de `/api/admin` est un
pouvoir plateforme, et seules celles qu'une liste nomme exigent le second facteur. TCK-597 l'a étendu
à sa modération (`PLATFORM_TWO_FACTOR`) et a renvoyé le reste à ce ticket ; verif-596 passe 4 a
mesuré le même trou sur le bail.

**Re-mesure sur `839be671` (2026-10-08)** :

- `RequireTwoFactor::handle` (`app/Http/Middleware/RequireTwoFactor.php:64-80` ; `:62-82` au 2026-11-16) : profil plateforme →
  2FA sur `api/admin/*`, puis sur les seules actions de `AGENCY_TWO_FACTOR`, `STEP_UP_FOR_PLATFORM` et
  `PLATFORM_TWO_FACTOR` (`app/Support/Security/ProtectedActions.php` — au 2026-11-16 : `AGENCY_TWO_FACTOR` l.138,
  `STEP_UP_FOR_PLATFORM` l.327, `PLATFORM_TWO_FACTOR` l.362). Depuis, `PLATFORM_TWO_FACTOR` couvre
  aussi `moderateBatch` (TCK-2672) et `SettingController@store/update/destroy` (TCK-600/651) :
  exemples de la liste (b) qui grossit à la main.
- ~~**`featured`** : écrit par `PUT /api/properties/{id}`, réservé au super-admin par
  `UpdatePropertyRequest`, hors de toute liste (verif-597 passe 3).~~ — caduc depuis TCK-633 lot F
  (5e2fb25d0) : `featured` est `prohibited` pour tous (422).
- **`ReviewController@reply` et `@deleteReply`** : exemptés comme « réponse du sujet »
  (`ProtectedActions.php:323-324` ; `:388-389` au 2026-11-16), mais le super-admin y passe par `Gate::before` et réécrit ou
  efface la réponse d'une agence sans 2FA (verif-597 passe 4, n5 : 200, `replied_by_id` = le
  super-admin). Le motif d'exemption renvoie lui-même à ce ticket.
- **Bail** : le super-admin **sans 2FA** obtient 200 sur `POST leases/{id}/terminate`, sur
  `PATCH leases/{id}/rent` avec `force` d'un bail antérieur, et sur `POST leases/{id}/signature-request`
  (verif-596 passe 4, Q4a). `activate` (papier) lui rend 403 (`LandlordSignatory`).
- `ProtectedActionsCoverageTest` ne vérifie que les familles déclarées : il ne peut pas voir une route
  qu'aucune famille ne nomme.

## Décision du porteur

**Tranché le 2026-11-16 :**

- (b) **liste étendue** — pas de règle générale : on étend la liste de ce que `RequireTwoFactor` garde
  aux pouvoirs plateforme exercés hors de `/api/admin` que le ticket recense (réponses d'avis
  `reply`/`deleteReply`, etc.).
- Gestes du bail entrant dans la famille gardée : **`terminate` et `rent` (`force`) seulement** ;
  `signature-request` reste hors liste.
- La nouvelle liste prend un nom NEUF : `PLATFORM_POWER_EXEMPT` existe déjà dans le code avec un
  autre sens.
- Amende ADR-0033 §8 en conséquence (section datée « Amendement du 2026-11-16 (TCK-609) »).

*Les options telles qu'elles étaient posées :*

**Règle générale ou liste étendue ?**

- **(a) Règle générale** : un profil plateforme dont le jeton n'a pas vu le second facteur reçoit
  `two_factor_required` / `two_factor_step_up_required` sur **toute** route mutante, sauf une liste
  d'exemptions motivées (se déconnecter, s'enrôler, confirmer, vérifier son second facteur, lire et
  modifier ses propres préférences). Les listes plateforme existantes deviennent redondantes pour
  ce profil.
- **(b) Liste étendue** : ajouter ~~`featured`,~~ `reply`/`deleteReply` (chemin super-admin) et les
  gestes du bail à `PLATFORM_TWO_FACTOR`, et faire suivre toute route future à la main.

*Recommandation de la session : (a).* C'est la seule forme qu'une route ajoutée demain ne contourne
pas : `Gate::before` est global, la règle doit l'être aussi. (b) reproduit le défaut qui a produit ce
ticket.

**Les gestes du bail entrent-ils dans la famille d'agence ?** `terminate`, `rent` avec `force`,
`signature-request` pour **l'admin d'agence** (pas seulement la plateforme) : c'est une décision de
famille d'ADR-0033 (« 2FA là où l'argent circule »). Recommandation : `terminate` et `rent` `force`
oui (ils engagent une indemnité ou un loyer), `signature-request` non (il ne fait que figer et
envoyer).

## Contraintes strictes (métier)

1. ADR-0033 est amendé **avant** le code, avec la règle retenue et la liste d'exemptions.
2. Un admin d'agence, un bailleur ou un client ne voient **aucun** changement, sauf la décision de
   famille sur le bail.
3. Le front gère déjà `two_factor_required` et `two_factor_step_up_required` (TCK-589) : aucun code
   d'erreur nouveau.
4. Le motif d'exemption de `reply` / `deleteReply` dit vrai après le ticket.

## Delta à produire

- [x] ADR-0033 amendé (décisions ci-dessus).
- [x] `RequireTwoFactor` : (a) branche « profil plateforme, méthode non sûre, action hors
      la liste d'exemptions (nom neuf : `PLATFORM_POWER_EXEMPT` est déjà pris) » ; ou (b) entrées ajoutées à `PLATFORM_TWO_FACTOR`.
- [x] `ProtectedActions::PLATFORM_ANY_ROUTE_EXEMPT` (ou autre nom neuf — `PLATFORM_POWER_EXEMPT`
      existe déjà avec un autre sens, l.343-347) : les exemptions, chacune motivée.
- [x] Bail (décision de famille) : `LeaseController@terminate`, `LeaseRentController@update` (`force`),
      éventuellement `LeaseSignatureController@request`, dans `AGENCY_TWO_FACTOR` avec la famille
      déclarée dans `FAMILIES` / `FAMILY_CONTROLLERS`.
- [x] Tests : `PlatformPowerTwoFactorTest`, `ProtectedActionsCoverageTest` étendu.

## Critères d'acceptation

- [x] **AC1 (rouge sur `839be671`).** Super-admin à 2FA, jeton qui ne l'a pas vue :
      ~~`PUT /api/properties/{id}` avec `featured: true` → 403 `two_factor_step_up_required`~~ —
      caduc depuis TCK-633 lot F (`featured` `prohibited`, 422 pour tous) ;
      `POST /api/reviews/{id}/reply` et `DELETE …/reply` sur l'avis d'une agence → 403 ;
      `POST leases/{id}/terminate`, `PATCH leases/{id}/rent` (`force`), `POST leases/{id}/signature-request`
      → 403. Le même jeton après vérification du second facteur → 200.
- [ ] ~~**AC2 (garde structurelle, si (a)).**~~ *(sans objet : option (b) retenue — voir AC2-bis)* Un test parcourt **`Route::getRoutes()`** — pas une liste
      écrite à la main — et, pour chaque route mutante (`POST`, `PUT`, `PATCH`, `DELETE`) servie par un
      contrôleur, affirme qu'un profil plateforme sans second facteur sur ce jeton est refusé par
      `RequireTwoFactor`, sauf si l'action figure dans la liste d'exemptions neuve (`PLATFORM_ANY_ROUTE_EXEMPT` ou
      équivalent) avec un motif non vide.
      Une route ajoutée demain sans décision rougit, avec son nom.
- [x] **AC2-bis (si (b)).** Le même parcours affirme que toute route mutante qu'un super-admin peut
      atteindre figure dans une liste ou dans une exemption motivée. *Une liste qu'on oublie de
      compléter doit rougir, pas passer.*
- [x] **AC3.** L'admin d'agence sans 2FA : `reply` sur un avis de son agence → 200 (inchangé) ;
      `terminate` → selon la décision de famille, 403 ou 200, affirmé dans les deux sens.
- [x] **AC4.** Un bailleur et un client sans 2FA : aucune route qu'ils atteignaient ne leur est
      refusée (rejeu des tests existants de leurs parcours).
- [x] **AC5.** Ablations consignées : retirer la branche plateforme de `RequireTwoFactor` rougit AC1
      et AC2 ; ajouter une route mutante factice non exemptée rougit AC2.

## Hors périmètre

- Le lien vers la console et l'enrôlement des opérateurs `viewer` / `support` (front, TCK-610).
- La 2FA des comptes d'agence hors des familles (inchangée).
- Le step-up (TOTP de moins de 10 min) : seul le second facteur du jeton est en jeu ici.

## Notes d'implémentation

_(à remplir par implementing-specs)_

## Livré (2026-11-16)

- **Lecture de « `signature-request` reste hors liste »** : hors de la famille d'AGENCE (l'admin
  d'agence l'envoie sans 2FA), mais inscrit dans `PLATFORM_TWO_FACTOR` pour tenir AC1 (super-admin
  sans second facteur → 403). Une ligne à retirer si le porteur voulait aussi l'ouvrir à la plateforme.
- `rent` n'est gardé **qu'avec `force`** : `ProtectedActions::AGENCY_TWO_FACTOR_WHEN` (action → champ),
  lu par `$request->boolean()` comme le service (`"1"` compte). Une révision ordinaire reste ouverte,
  plateforme comprise. `LeaseController` et `LeaseRentController` entrent dans `FAMILY_CONTROLLERS` ;
  leurs autres actions mutantes sont dans `EXEMPT`, motivées.
- Registre neuf `PLATFORM_ANY_ROUTE_EXEMPT` (`App\Support\Security\PlatformAnyRouteExempt`) :
  256 actions rangées par motif — `PUBLIC`, `SOI`, `SANS_ECRITURE` et **199 `NON_GARDE`** (pouvoir
  plateforme que `Gate::before` ouvre encore sans second facteur : décision (b), écrit tel quel). Il ne
  change aucun comportement ; pour garder l'une, la déplacer vers `PLATFORM_TWO_FACTOR`.
- AC1, AC3, AC4 : `PlatformPowerTwoFactorTest` (avis, résiliation, loyer forcé, envoi en signature ;
  jeton réel non vérifié puis vérifié ; admin d'agence dans les deux sens ; bailleur et locataire).
- AC2-bis, AC5 : `ProtectedActionsCoverageTest` — parcours de `Route::getRoutes()` (toute route
  mutante sous `/api` hors `/api/admin` et `/api/auth`), registre motivé sans contradiction, et une
  route factice non rangée qui rougit avec son nom (l'ablation rendue permanente).
- Ablations : branche plateforme de `RequireTwoFactor` retirée → AC1 rouge ; entrées retirées des listes → AC1/AC3 et la garde rouges ;
  restauration vérifiée par md5.

