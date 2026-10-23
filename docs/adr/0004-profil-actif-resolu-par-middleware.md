# ADR-0004 — Le profil actif est résolu par middleware, avec cinq niveaux de repli

- **Statut** : Accepté, **§ Application amendé le 2026-10-23** (cf. § *Amendement du 2026-10-23 — le front porte l'indice sur tout appel authentifié*)
- **Date de la décision** : 2026-05 · **Rédigé rétroactivement** : 2026-08-12
- **Tickets** : TCK-138→142

## Contexte

[ADR-0002](0002-role-est-un-profil-polymorphe.md) donne à une personne plusieurs profils, dans
plusieurs agences. Toute requête doit donc savoir **sous quel profil elle s'exécute** — sans quoi
« lister mes biens » n'a pas de réponse.

C'est le préalable à la suppression de `users.agency_id` : tant qu'une colonne portait l'agence, la
question ne se posait pas ; elle avait une mauvaise réponse, mais elle en avait une.

## Décision

**Un middleware `ResolveActiveProfile`, appliqué en `append` sur le groupe `api`, résout le profil
actif dans cet ordre :**

1. header `X-Profile-Id` ou paramètre `?profile_id` — **403 si le profil n'appartient pas à l'utilisateur** ;
2. header `X-Active-Profile-Hint` — **ignoré silencieusement s'il est invalide** ;
3. cookie `active_profile_id` ;
4. auto-bascule si l'utilisateur n'a de profils que dans **une seule** agence ;
5. aucun profil (cas des super-admins, qui n'en ont pas besoin).

Le profil vit dans `$request->attributes['active_profile']` et se lit par la macro
`request()->activeProfile()`.

**L'asymétrie entre 1 et 2 est délibérée** : un signal **explicite** invalide est une erreur du
client et doit être bruyante ; un **indice** invalide est une optimisation ratée et doit être muet.
Confondre les deux donnerait soit des 403 sur un cache périmé, soit des scopes silencieusement faux.

Le middleware est en `append` — donc **après** l'authentification. Il résout Sanctum manuellement
(`$request->user('sanctum')` puis `Auth::setUser()`) pour les routes à authentification optionnelle,
où le user n'est pas encore posé au moment où il s'exécute.

## Conséquences

**`request()->activeProfile()->agency_id` devient la seule source du scope.** Toute requête qui
filtre par agence passe par là.

**`users.agency_id` a été supprimée** (TCK-142). L'accesseur `User::getAgencyIdAttribute()` subsiste
comme pont de compatibilité : il dérive l'agence du profil actif, avec auto-bascule si tous les
profils pointent vers une seule agence. Ce n'est **pas une colonne** — un `where('agency_id', …)`
sur `users` échoue.

**Le rate limiting ne peut pas s'appuyer dessus.** Les limiteurs nommés tournent **avant** ce
middleware : `visitorRateLimitKey()` doit donc résoudre le token Sanctum *directement* via
`PersonalAccessToken::findToken()` pour obtenir une clé `user:{id}`. C'est une duplication imposée
par l'ordre de la pile, pas un oubli.

**L'ordre des cinq niveaux n'est écrit que dans un docblock.** Le nombre de repli, l'asymétrie 403 /
silence, et l'auto-bascule mono-agence sont des règles que rien n'impose au-delà de
l'implémentation elle-même.

## Application

- `app/Http/Middleware/ResolveActiveProfile.php:38-145` — la résolution ; docblock des 5 niveaux en tête.
- `bootstrap/app.php` — `append` sur le groupe `api`.
- `app/Providers/AppServiceProvider.php:260` — la macro `Request::activeProfile()`.
- `app/Models/User.php:173-196` — l'accesseur de compatibilité `agency_id`.
- `database/migrations/2026_05_02_000007_drop_type_and_agency_id_from_users.php` — le cutover.
- Côté front : le header `X-Active-Profile-Hint` est posé par `src/lib/api.ts`, et le cookie
  `active_profile_id` est effacé avec `auth_token` par les route handlers `set-token`, `logout` et
  `session-expired` (TCK-509 : `logout` ne l'effaçait pas, `clearToken` a été retiré).

## Amendement du 2026-10-23 — le front porte l'indice sur tout appel authentifié

Décision du porteur du 2026-10-23, sur les pistes P174.01, P174.02 et P174.03 (angle 174 du fichier
de pistes, `docs/plans/2026-10-15-pistes-d-amelioration.md`). Il corrige le dernier point du
§ Application. Le middleware, ses cinq niveaux et l'asymétrie entre le niveau 1 et le niveau 2 ne
changent pas. Relu sur `pre-dev` 4a12ba515.

**Ce que le § Application disait, et ce qui était faux.** Il disait : « le header
`X-Active-Profile-Hint` est posé par `src/lib/api.ts` ». En réalité :

- `apiRequest` ne pose l'en-tête que si l'appelant passe `activeProfileId`
  (`takussan-web/src/lib/api.ts:794-796`).
- **Aucun appel du navigateur ne le passe.** `useApiQuery` et `useApiMutation` transmettent le jeton
  et la langue, jamais le profil (`src/hooks/useApiQuery.ts:51-75`).
- **Côté serveur**, seuls quelques relais BFF et quelques actions le passent. Les autres partent avec
  le seul jeton (P174.02 et P174.03 : 22 modules d'actions serveur ne nomment pas le profil,
  relevé du 2026-10-23).
- **Le cookie `active_profile_id` n'est pas un repli pour le navigateur.** Le relais
  `src/app/api/me/active-profile/route.ts:26-32` le pose en `httpOnly`, sur l'hôte du front.
  L'API vit sur une autre origine : `127.0.0.1:8002` en développement, face à `localhost:3000` ;
  `preview.api.takussan.com` en préproduction, face à `preview.takussan.com`. Le navigateur ne peut
  ni lire ce cookie, ni l'envoyer à l'API. Le `fetch` d'`apiRequest` ne passe d'ailleurs aucune
  option `credentials` (l. 829).

**Effet mesuré** (2026-10-23, tests temporaires retirés). Un agent actif dans deux agences A et B
interroge l'API sans indice, puis avec `X-Active-Profile-Hint: agent:<A>` :

| Appel | Sans indice | Avec l'indice |
|---|---|---|
| `GET /api/properties/{id}` (bien de A) | **403** | 200 |
| `GET /api/properties` | total **0** | total 1 |
| `GET /api/customers/{id}` | **403** | 200 |
| `GET /api/kpi-configs`, `GET /api/threshold-alerts` | **403** `agency.staff_only` | 200 |
| `POST /api/properties` | **403** | autorisé |

Sans indice, le niveau 4 (auto-bascule) ne joue que pour un compte d'**une seule** agence. Pour un
compte de deux agences, l'API ne voit donc jamais l'espace choisi à l'écran.

**Décision.**

1. **Tout appel authentifié à l'API porte l'en-tête `X-Active-Profile-Hint`** quand un profil
   actif est connu. Cela vaut côté serveur comme côté navigateur, pour les lectures comme pour les
   écritures.
2. **Jamais par le cookie.** Le front ne compte pas sur l'envoi du cookie `active_profile_id` à
   l'API (pas de `credentials: 'include'` pour cela). Ce cookie est `httpOnly`, posé sur l'hôte du
   front, et l'API ne le reçoit pas. Le niveau 3 du middleware reste en place, mais aucun appel du
   front ne s'appuie sur lui.
3. **Côté serveur**, `apiRequest` pose l'en-tête **par repli**, depuis le cookie lu par
   `getActiveProfileId()` (`src/lib/session.ts`). C'est le même mécanisme que les replis de la
   langue, de l'IP et de l'agent du visiteur. Deux exceptions :
   - **pendant une impersonation**, rien n'est posé : `getActiveProfileId()` rend déjà `undefined`,
     et le profil de l'opérateur n'accompagne jamais le jeton d'impersonation (ADR-0055, invariant
     11) ;
   - **un appelant qui passe son propre `activeProfileId` ou `X-Profile-Id` l'emporte.**
4. **Côté navigateur, la source est le layout racine.** `src/app/layout.tsx` lit le profil actif
   côté serveur et le transmet au client sous le nom `initialActiveProfileId`, comme il transmet
   déjà `initialToken` à `AuthProvider` (l. 72 et l. 110). `useSwitchActiveProfile`
   (`src/hooks/useProfiles.ts:64`) met cette valeur à jour quand l'utilisateur change de profil.
   `apiRequest` pose l'en-tête depuis cette valeur. Le relais d'impersonation continue de retirer
   l'en-tête (`api.ts`, branche `relais`).
5. **Le cache suit le profil.** Les clés de `useApiQuery` portent le profil actif : deux profils
   ne partagent jamais une entrée. Changer de profil **réinitialise le cache** de React Query, sauf
   `['me', 'profiles']`, que la bascule met à jour elle-même (mise à jour optimiste de
   `meta.active_profile_id`). Les invalidations au cas par cas de `useSwitchActiveProfile`
   (`['me', 'subscription']`, `['me', 'payouts']`, TCK-1899) deviennent un cas de cette règle.

**Conséquences.**

- **Un compte de plusieurs agences voit enfin l'agence qu'il a choisie**, sur les pages rendues par
  le serveur comme dans les lectures du navigateur. Les écritures se rangent dans cette agence
  (`PropertyController::store` lit `$request->user()->agency_id`, qui suit le profil actif).
- **Pas de préflight de plus.** Une requête authentifiée du navigateur porte déjà `Authorization`,
  qui n'est pas un en-tête « simple » au sens de CORS : le préflight existe déjà. Ajouter l'indice
  n'en crée pas un autre. `config/cors.php` admet tous les en-têtes (`allowed_headers => ['*']`).
- **Le profil sous lequel l'API juge change, pour des appels qui marchent aujourd'hui.** C'est le
  critère V2 que le mesureur a nommé. Pour un compte d'une seule agence qui a plusieurs profils
  (agent et bailleur), l'indice remplace l'auto-bascule, qui prenait le premier profil
  (`profiles->first()`). L'API juge alors sous le profil choisi à l'écran. C'est le comportement
  voulu, mais il diffère de celui d'aujourd'hui.
- **Lire le cookie dans `apiRequest` côté serveur** peut rendre dynamique une page qui ne l'était
  pas. Le ticket le mesure.
- **L'indice reste muet s'il est invalide** (niveau 2). Un profil retiré ou suspendu depuis le
  rendu du layout ne produit pas de 403 : l'API retombe sur les niveaux suivants, et la page
  suivante reprend une valeur fraîche.

**Application** (remplace le dernier point du § Application) :

- `src/lib/api.ts` : `apiRequest` pose `X-Active-Profile-Hint` depuis `activeProfileId` s'il est
  passé, puis depuis le cookie côté serveur, puis depuis la valeur du layout côté navigateur. Il le
  retire sur le chemin du relais d'impersonation.
- `src/app/layout.tsx` transmet `initialActiveProfileId`. `useSwitchActiveProfile` le met à jour
  et réinitialise le cache, sauf `['me', 'profiles']`. Les clés de `useApiQuery` le portent.
- Le cookie `active_profile_id` est toujours effacé avec `auth_token` par les route handlers
  `set-token`, `logout` et `session-expired` (TCK-509).
- **Gardes** :
  - un test d'`apiRequest` sous `next/headers` simulé : cookie présent → en-tête ; cookie
    d'impersonation → aucun en-tête ;
  - un test d'`apiRequest` dans le navigateur : profil connu → en-tête ;
  - un test de `useSwitchActiveProfile` : le cache est vidé, sauf `['me', 'profiles']` ;
  - un test API : un compte de deux agences lit une liste de `/app` avec l'indice.

  Chaque garde se vérifie par ablation.
