# ADR-0004 — Le profil actif est résolu par middleware, avec cinq niveaux de repli

- **Statut** : Accepté
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
  `active_profile_id` est effacé avec `auth_token` à chaque `set-token` et à chaque `clearToken`.
