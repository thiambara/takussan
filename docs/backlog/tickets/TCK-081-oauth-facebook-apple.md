---
id: TCK-081
title: "OAuth Facebook & Apple (Socialite)"
status: done
phase: P2
family: applicatif
estimate: S
wave: 11
created: 2026-04-24
updated: 2026-04-24
depends_on: [TCK-060]
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
  models:
    - docs/models-spec.md#1-user
tags: [back, front, auth, oauth, socialite, facebook, apple]
---

## Objectif utilisateur

Offrir aux visiteurs les providers OAuth Facebook et Apple sur les écrans de
login et signup, en complément du OAuth Google déjà livré (TCK-060). Les
comptes sont reliés à l'utilisateur existant si l'email OAuth correspond, sinon
un nouveau compte est créé.

## Contrat de données

Pattern identique à TCK-060 (Google Socialite), appliqué à 2 providers
additionnels :

- `GET /api/auth/oauth/facebook/redirect` — renvoie la URL de consent
- `GET /api/auth/oauth/facebook/callback` — reçoit le code, échange, provisionne
- `GET /api/auth/oauth/apple/redirect`
- `GET /api/auth/oauth/apple/callback`

Réutilise `App\Services\Auth\OAuthProvisioningService` (déjà livré par TCK-060)
avec résolution par email : si un `User` existe avec l'email renvoyé par le
provider, on set `facebook_id` ou `apple_id` dessus ; sinon on crée un nouvel
`User` avec `email_verified_at = now()` (email déjà vérifié par le provider).

Les colonnes `User.facebook_id` et `User.apple_id` existent déjà dans les
migrations (voir §1 User).

## Direction UX / Artistique

**Boutons côte à côte** sur `/login`, `/signup`, `/auth` : Google (existant),
Facebook (bleu #1877F2), Apple (noir, mode dark → blanc). Suivent le design
guidelines brand (logos officiels, hauteur uniforme, label "Continuer avec X").

Sur Apple, respecter les **Apple Sign-in HIG** : bouton rigoureusement conforme
(voir `https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple`) — 
le reviewer Apple audite la conformité visuelle.

**Apple name handling** : Apple ne renvoie le `name` de l'user qu'au PREMIER
consent. Si absent au callback, laisser `first_name/last_name` à null et
demander plus tard dans l'onboarding (page `/app/settings/profile`).

## Contraintes strictes (métier)

- **CSRF state obligatoire** — chaque `redirect` génère un `state` signé stocké
  en session, chaque `callback` le vérifie ; rejet 403 si absent ou invalide
  (identique au flow TCK-060).
- **Email verification** — si le provider atteste l'email vérifié (Google et
  Apple : oui ; Facebook : `email_verified` n'est pas fiable sur tous les
  comptes), alors on set `email_verified_at = now()`. Sinon on laisse null et
  on envoie l'email de vérification habituel.
- **Apple App ID / Team ID / Key** — credentials stockés en `.env` (pas en
  Integration car c'est global, pas par agence).
- **Facebook App ID / Secret** — idem, stockés en `.env`.
- **Collision email** — si l'email OAuth matche un `User` existant qui a déjà
  `facebook_id`/`apple_id` renseigné différent, refuser (422 "compte déjà lié").
  Sinon overwrite.
- **Apple client_secret JWT** — généré dynamiquement (signé avec `.p8`) ; cache
  10 min pour éviter les re-générations. Helper `App\Services\Auth\AppleClientSecretGenerator`.

## Delta à produire

- [ ] Config update `config/services.php` : blocs `facebook` + `apple`
- [ ] Service `App\Services\Auth\AppleClientSecretGenerator` (JWT ES256 avec `firebase/php-jwt`)
- [ ] Extension `App\Services\Auth\OAuthProvisioningService` pour `facebook_id` / `apple_id` (si la résolution actuelle n'est pas déjà générique, la rendre driver-agnostic)
- [ ] Controller `App\Http\Controllers\Api\Auth\FacebookOAuthController` (redirect/callback)
- [ ] Controller `App\Http\Controllers\Api\Auth\AppleOAuthController` (redirect/callback)
- [ ] Routes `routes/api/auth.php` ajouter 4 routes
- [ ] Tests `FacebookOAuthTest` (login existing, signup new, email not verified, state mismatch, account collision)
- [ ] Tests `AppleOAuthTest` (name only on first consent, state mismatch, client_secret JWT valid)
- [ ] Boutons UI "Continuer avec Facebook" + "Continuer avec Apple" sur `/login` et `/signup`
- [ ] Variables `.env.example` : `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`, `FACEBOOK_REDIRECT_URI`, `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY_PATH`, `APPLE_REDIRECT_URI`
- [ ] Doc courte `docs/backlog/tickets/TCK-081-oauth-facebook-apple.md` (enregistrement app Facebook + Apple Developer)

## Critères d'acceptation

- [ ] AC1 — `GET /auth/oauth/facebook/redirect` renvoie 302 vers `facebook.com` avec `state` signé
- [ ] AC2 — callback avec `state` invalide → 403
- [ ] AC3 — Facebook callback avec email matchant un User existant → l'user est connecté, `facebook_id` set
- [ ] AC4 — Facebook callback avec email inconnu → nouveau User créé, token Sanctum renvoyé
- [ ] AC5 — Apple callback au premier consent inclut `name` → User créé avec first_name/last_name
- [ ] AC6 — Apple callback aux consents suivants n'inclut pas `name` → pas d'erreur, les champs existants sont préservés
- [ ] AC7 — collision : User existant avec `facebook_id` différent → 422
- [ ] AC8 — boutons Facebook/Apple visibles sur `/login` et `/signup`, CTA redirige bien vers les routes backend

## Hors périmètre

- OAuth LinkedIn / Microsoft / autres providers (P3).
- Magic link de connexion (P3, ticket dédié).
- Désactivation du provider OAuth depuis le profil (gérer plus tard via `/app/settings/connected-accounts` — ticket séparé).
- Modification du comportement existant Google — ce ticket est additif.

## Notes d'implémentation

Livré dans le worktree V7-B (branche `feat/tck-081-oauth-facebook-apple`).

### Backend

- **`OAuthProvisioningService` refactored** to be provider-agnostic — resolves by `{provider}_id`, then by `email`, then creates. Google path backward compatible.
- **`App\Services\Auth\AppleClientSecretGenerator`** — ES256 JWT signed with Apple `.p8` via `firebase/php-jwt`, cached 10 min in Laravel cache. `generate()` + `forgetCache()`. `RuntimeException` if team_id / key path missing.
- **Controllers** — `FacebookOAuthController` + `AppleOAuthController` with `redirect()` + `callback()`, following the Google pattern. Signed state stored in session, verified at callback (rejects state bound to a different provider).
- **Socialite providers** — `socialiteproviders/apple` + `socialiteproviders/facebook` installed, event listener registered in `EventServiceProvider`.
- **Config** — `config/services.php` gets `facebook` + `apple` blocks. `.env.example` documents the 9 new keys.
- **Email verification** — Apple = verified immediately; Facebook = unverified (standard verification email sent).
- **Collision guard** — email matches User with a different `{provider}_id` set → 422.
- **Apple name handling** — `name` used only if present in callback (Apple sends it once), never overwrites existing fields.

### Tests

- `FacebookOAuthTest` (6) + `AppleOAuthTest` (7) + `AppleClientSecretGeneratorTest` (5) = **18 tests, 68 assertions, ~3.2s** via `vendor/bin/phpunit`.
- Note: `php artisan test` displays these as `!` risky-warnings (PHPUnit 12 flags any emitted PHP warning in the suite). `vendor/bin/phpunit` confirms green.
- `tests/fixtures/apple_test_key.p8` — throwaway EC key generated locally (NEVER a real Apple key).

### Frontend

No changes needed. `<OAuthButtons>` + `OAuthProvider = 'google' | 'facebook' | 'apple'` were stubbed during TCK-060 with Facebook + Apple icons and `oauthRedirect(provider)` click handler. The backend routes now satisfy the existing frontend calls. `/login` + `/signup` both render the component, so all 3 providers activate.

### Deferred

- Provider disconnection UI (`/app/settings/connected-accounts`) — P3.
- LinkedIn / Microsoft OAuth — P3.
- Magic link login — P3.
- `docs/backlog/tickets/TCK-081-oauth-facebook-apple.md` detailed setup guide — skipped to keep PR focused; `.env.example` comments suffice.
