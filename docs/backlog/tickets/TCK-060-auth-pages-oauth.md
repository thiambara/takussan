---
id: TCK-060
title: "Cycle auth front + OAuth multi-provider"
status: done
phase: P0
family: applicatif
estimate: M
created: 2026-04-20
updated: 2026-04-21
depends_on: [TCK-013, TCK-054, TCK-055, TCK-056, TCK-057, TCK-058, TCK-059]
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
  models:
    - docs/models-spec.md#1-user
tags: [front, back, auth, oauth, login, register]
---

## Contexte

Le backend `TCK-013` expose déjà le cycle d'auth complet (register, login, logout, forgot/reset password, verify email, phone OTP, 2FA, sessions multi‑device, OAuth Google). Côté front, les pages `/auth/*` existent mais :

- Elles sont rédigées en anglais alors que le reste du site est en français
- `AuthLayout` est minimaliste (`bg-gray-50 + card blanche centrée`), sans lien visuel avec le design hero de la home / résultats de recherche / fiche bien
- Aucun bouton OAuth (Google OAuth câblé backend mais invisible front)
- Aucune gestion multi‑provider — les colonnes `facebook_id`/`apple_id` existent mais aucun endpoint ne les alimente

## Objectif utilisateur

Un visiteur arrive sur `/auth/login` (ou tout autre page d'auth) et vit une expérience cohérente avec le reste du site : visuel immobilier premium à gauche, formulaire clair à droite, choix OAuth évident (Google, Facebook, Apple) ou email/mot de passe, messages d'erreur pédagogiques en français.

## Contrat de données

### Backend — à créer / compléter

**Config & env :**

- `config/services.php` — ajouter les blocs `google`, `facebook`, `apple` (`client_id`, `client_secret`, `redirect`)
- `.env.example` — ajouter `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` + équivalents `FACEBOOK_*` et `APPLE_*`
- `laravel/socialite` est **déjà installé** (`composer.json` → `"laravel/socialite": "^5.26"`) — remplacer l'implémentation HTTP manuelle de `OAuthController::handleGoogleCallback` par Socialite pour uniformiser les 3 providers

**OAuth endpoints — refonte :**

- `GET /api/auth/oauth/{provider}/redirect` — génère l'URL de redirection + stocke `state` en session ou cache (clé temporaire 10 min)
- `GET /api/auth/oauth/{provider}/callback` — valide le `state` reçu, échange le code, upsert `User` (par `{provider}_id` ou `email`), retourne `{ token, user }`
- `provider` ∈ `google | facebook | apple`
- Conservation du token `state` anti‑CSRF : générer côté redirect, vérifier côté callback, supprimer après usage

**Existants consommés (déjà implémentés par TCK-013) :**

- `POST /api/auth/register` — `{ first_name, last_name, email, password, password_confirmation }`
- `POST /api/auth/login` — `{ email, password }` → `{ token, user }`
- `POST /api/auth/forgot-password` — `{ email }`
- `POST /api/auth/reset-password` — `{ token, email, password, password_confirmation }`
- `POST /api/auth/email/resend` — (auth)
- `GET /api/auth/verify-email/{id}/{hash}` — (signée)

### Frontend — à consommer

- Route handler Next existant `/api/auth/set-token` pour stocker le cookie httpOnly après auth (réutilisé par OAuth callback)
- Nouvelle route handler Next `/auth/oauth/callback?provider=google&code=...&state=...` qui appelle le callback API puis set‑token puis redirige

## Direction UX / Artistique

**Composition — split screen moderne, responsive :**

- **Desktop ≥ lg** : grille 45/55. Colonne gauche = image immobilière premium (photo villa/intérieur, qualité équivalente au Hero home) + gradient sombre overlay + logo **Takussan** blanc en haut + accroche narrative blanche en bas ("Votre porte d'entrée vers l'immobilier du Sénégal", varie selon la page : login / register / forgot). Colonne droite = fond `--surface` ou blanc, form vertical, max‑width raisonnable, centré verticalement, padding généreux.
- **Mobile / < lg** : image en bandeau 25–30vh en haut (même qualité, crop cinematic), form en dessous sur toute la largeur avec padding horizontal.

**Style du form (toutes pages d'auth) :**

- Titre en **Manrope** (`font-headline`), taille ~3xl, poids bold, tracking tight
- Sous‑titre courte phrase gris (`text-muted-foreground`)
- Boutons OAuth **en haut** (ordre : Google, Apple, Facebook), cartes égales, icône provider + libellé "Continuer avec {Provider}", fond blanc, border `outline`, hover lift/shadow
- Séparateur horizontal "ou" centré (ligne fine de chaque côté, texte `muted-foreground`)
- Champs email/password avec labels flottants **ou** labels classiques mais soignés, focus ring couleur primary (`--ring`)
- Toggle show/hide mot de passe sur les champs password (icône `Eye` / `EyeOff` lucide)
- Lien "Mot de passe oublié ?" aligné à droite sous le champ password (login)
- CTA principal **plein width**, `rounded-full` (cohérent avec les boutons home), couleur `primary`, hover `primary/90`, état loading avec spinner + texte dynamique
- Lien bas de form : "Pas encore de compte ? **S'inscrire**" (login) / "Déjà un compte ? **Se connecter**" (register)
- Animations : `animate-fade-in-up` existant (déjà dans `globals.css`) sur la card form à l'arrivée
- Messages d'erreur : bandeau rouge doux (`bg-red-50 text-red-600 rounded-lg px-4 py-3`) en haut du form, micro‑erreurs sous chaque champ en rouge plus petit
- Gestion 429 (rate limit login) : message explicite "Trop de tentatives, réessayez dans quelques minutes"

**Inspiration** : Airbnb (pattern OAuth en haut + séparateur + form), Linear (split screen minimaliste), SeLoger (photo immobilière background qualitative).

**Pages concernées** :

- `/auth/login` — variante complète (OAuth + email/password + forgot link)
- `/auth/register` — variante complète (OAuth + form prénom/nom/email/password + CGU)
- `/auth/forgot-password` — simple (email uniquement, confirmation visuelle après envoi)
- `/auth/reset-password` — simple (password + confirmation, retour login après succès)
- `/auth/verify-email` — état informatif (mail envoyé, bouton renvoyer)
- `/auth/verify-email/[id]/[hash]` — état succès/échec après click lien email
- `/auth/oauth/callback` — écran de transition (spinner + message "Connexion en cours…")

**Copy en français** — toutes les pages en français (pas d'anglais résiduel). Tonalité cohérente avec le reste du site.

## Contraintes strictes (métier)

- **i18n** : toutes les chaînes passent par le système i18n si TCK-058 est done au moment de l'exécution, sinon français en dur
- **Sécurité OAuth** :
  - `state` anti‑CSRF obligatoire (généré côté redirect, vérifié côté callback, supprimé après usage)
  - Le `redirect_uri` backend doit correspondre strictement à celui déclaré chez chaque provider
  - Les secrets (`client_secret`) ne fuient **jamais** côté front
- **Upsert OAuth** : si un user existe déjà avec le même `email`, on lie le `{provider}_id` au compte existant (pas de doublon). Si aucun user, on crée avec `email_verified_at = now()` (email validé par le provider) et un password aléatoire bcrypt
- **Rate limit** conservé côté backend (`throttle:5,10` sur `/login`) — front doit gérer le code 429 proprement
- **Password** : min 8 caractères, confirmation requise sur register/reset (déjà enforced backend via `confirmed`)
- **Erreurs 422** : le front affiche les erreurs champ par champ via `err.data.errors`
- **CGU** sur register : checkbox obligatoire "J'accepte les conditions générales et la politique de confidentialité" (texte + lien même si pages vides pour l'instant)
- **Post‑auth redirect** : respect de `?redirect=` sur login (déjà en place), idem sur OAuth callback (transmis via le `state` ou un param séparé)
- **Responsive** : fonctionne impeccable sur mobile 360px → desktop 1920px
- **Accessibilité** : labels sur tous les champs, `aria-*` appropriés, focus visibles, contraste AA minimum, `autoComplete` correct

## Delta à produire

### Backend (prescriptif)

- [ ] (Socialite déjà installé — pas de `composer require` nécessaire)
- [ ] `config/services.php` — ajouter `google`, `facebook`, `apple` avec `client_id`, `client_secret`, `redirect`
- [ ] `.env.example` — ajouter les 9 variables `{PROVIDER}_CLIENT_ID|CLIENT_SECRET|REDIRECT_URI`
- [ ] `app/Http/Controllers/Auth/OAuthController.php` — refactor complet :
  - `redirectTo(string $provider)` paramétrique, utilise Socialite, stocke `state` en cache (`Cache::put('oauth_state:'.$state, ['provider'=>$provider, 'redirect'=>$redirect], now()->addMinutes(10))`)
  - `handleCallback(string $provider)` paramétrique : valide `state` via cache, échange code via Socialite, upsert `User` (méthode `findOrCreateOAuthUser`), retourne `{ token, user }`
- [ ] `routes/api/auth.php` — remplacer les 2 routes `google` par 2 routes paramétrées `{provider}` avec contrainte `->whereIn('provider', ['google','facebook','apple'])`
- [ ] Tests :
  - `tests/Feature/Auth/OAuthRedirectTest.php` — 3 providers × (redirect URL contient bon `client_id` + `state` stocké)
  - `tests/Feature/Auth/OAuthCallbackTest.php` — mock Socialite : nouveau user créé, user existant lié par email, state invalide rejeté, state expiré rejeté

### Frontend (intentionnel — IA décide de la structure)

- [ ] Nouveau `AuthLayout` partagé (split screen responsive, photo + form panel) remplace l'existant
- [ ] Page `/auth/login` — refonte visuelle complète + boutons OAuth (3 providers) + show/hide password + copy FR
- [ ] Page `/auth/register` — refonte visuelle complète + boutons OAuth (3 providers) + checkbox CGU + show/hide password + copy FR
- [ ] Page `/auth/forgot-password` — refonte visuelle + copy FR + état confirmation après envoi
- [ ] Page `/auth/reset-password` — refonte visuelle + show/hide password + copy FR
- [ ] Page `/auth/verify-email` — refonte visuelle + bouton renvoi cohérent + copy FR
- [ ] Page `/auth/verify-email/[id]/[hash]` — refonte états succès/échec
- [ ] Route handler Next `/auth/oauth/callback` — récupère `code` + `state` + `provider` du query, appelle backend callback, set‑token, redirige vers `redirect` ou `/dashboard`
- [ ] Helpers dans `src/lib/auth.ts` : `oauthRedirect(provider)`, `oauthCallback(provider, code, state)`
- [ ] Types TypeScript : étendre `AuthResponse` / `User` si nécessaire pour `google_id`/`facebook_id`/`apple_id`

## Critères d'acceptation

- [ ] Un visiteur peut se connecter avec email/password sur `/auth/login` — le design respecte le système (split screen, Manrope, primary color, rounded-full CTA)
- [ ] Un visiteur peut cliquer "Continuer avec Google" → est redirigé vers Google → revient sur `/auth/oauth/callback` → est connecté et redirigé vers `/dashboard` ou `?redirect=`
- [ ] Idem pour Facebook et Apple
- [ ] Si un user existe déjà avec l'email retourné par un provider, son `{provider}_id` est lié au compte existant (pas de doublon)
- [ ] La vérification `state` anti‑CSRF rejette tout callback sans `state` valide (test automatisé)
- [ ] Les 7 pages d'auth (login, register, forgot, reset, verify‑email `/`, verify‑email `/[id]/[hash]`, oauth callback) partagent le même AuthLayout et sont en français
- [ ] Les pages sont responsive (test 360px, 768px, 1440px)
- [ ] Une tentative de login après 5 échecs en 10 min affiche un message 429 explicite
- [ ] Les erreurs 422 affichent les messages champ par champ
- [ ] Les secrets OAuth ne fuient jamais dans le bundle client (vérifier via `grep NEXT_PUBLIC_.*SECRET` côté web)
- [ ] Tests backend OAuth (redirect + callback × 3 providers) passent

## Hors périmètre

- Challenge 2FA sur login (flow TOTP intermédiaire) — à traiter dans un ticket séparé quand une vraie lib TOTP sera intégrée
- Magic link / passwordless — P3
- Page de gestion des sessions multi‑device côté front (`/settings/sessions`) — ticket dashboard séparé
- Page de gestion 2FA (activation, QR code, recovery codes) — ticket dashboard séparé
- Provider SMS réel pour OTP phone — ticket séparé

## Notes d'implémentation

_(à remplir par implementing-specs)_

### Lacunes backend à corriger pendant l'exécution

- `OAuthController::redirectToGoogle` génère un `state` random mais ne le stocke **pas** — aucune vérification CSRF réelle. À corriger lors du refactor.
- `config/services.php` ne contient **aucune** clé `google` actuelle alors que `OAuthController` les lit — donc l'OAuth Google ne fonctionne pas en pratique, juste en structure de code.
- Le callback Google fait `Http::asForm()->post(...)` manuellement : remplacer par Socialite pour uniformiser avec Facebook & Apple.

---

## Contexte technique (pour l'agent d'implémentation)

### Monorepo

```
takussan/
├── takussan-api/     # Laravel 13 + PHP 8.3 + Sanctum 4 + Socialite 5.26 + Spatie (permission/activitylog/medialibrary)
└── takussan-web/     # Next.js 16 (App Router) + React 19 + Tailwind 4 + shadcn + base-ui/react + lucide-react
```

### Stack backend (Laravel) — versions installées (`takussan-api/composer.json`)

- `php ^8.3`, `laravel/framework ^13.0`
- `laravel/sanctum ^4.3` (tokens via `HasApiTokens` trait sur `User`)
- `laravel/socialite ^5.26` **déjà installé**
- Outils : `laravel/pint` (style), `phpunit ^12`

### Stack frontend (Next.js) — versions (`takussan-web/package.json`)

- `next 16.2.3`, `react 19.2.4`
- `tailwindcss ^4`, `shadcn ^4.3.0`, `@base-ui/react ^1.4.0`
- `lucide-react ^1.8.0` (icônes)
- Scripts : `npm run dev`, `npm run build`, `npm run lint`

### Fichiers clés à toucher

**Backend (`takussan-api/`) :**

- `config/services.php` — ajouter blocs `google`, `facebook`, `apple`
- `.env.example` — ajouter variables OAuth
- `app/Http/Controllers/Auth/OAuthController.php` — refactor complet vers Socialite parammétré
- `routes/api/auth.php` — remplacer les 2 routes Google par routes `{provider}`
- `tests/Feature/Auth/OAuthRedirectTest.php` — **à créer**
- `tests/Feature/Auth/OAuthCallbackTest.php` — **à créer**

**Frontend (`takussan-web/src/`) :**

- `app/auth/layout.tsx` — refonte complète (split screen)
- `app/auth/login/page.tsx` — refonte visuelle + boutons OAuth
- `app/auth/register/page.tsx` — refonte visuelle + boutons OAuth + CGU
- `app/auth/forgot-password/page.tsx` — refonte visuelle + FR
- `app/auth/reset-password/page.tsx` — refonte visuelle + FR
- `app/auth/verify-email/page.tsx` — refonte visuelle + FR
- `app/auth/verify-email/[id]/[hash]/page.tsx` — refonte états succès/échec
- `app/auth/oauth/callback/page.tsx` — **à créer**
- `lib/auth.ts` — ajouter `oauthRedirect(provider)` et `oauthCallback(provider, code, state)`

### Environnement d'exécution

- Backend dev : `php artisan serve` sur `http://localhost:8002` (URL vue dans `takussan-web/src/lib/api.ts:4`)
- Front dev : `npm run dev` sur `http://localhost:3000`
- `.env` backend : `FRONTEND_URL=http://localhost:3000`, `SANCTUM_STATEFUL_DOMAINS=localhost:3000`
- Front : `.env.local` expose `NEXT_PUBLIC_API_URL=http://localhost:8002`

---

## Patterns à suivre (fichiers existants à imiter)

### Backend — style et conventions

| Pattern | Fichier de référence | Note |
|---|---|---|
| Contrôleur hérite de `Base\Controller` + helper `$this->json(...)` | `app/Http/Controllers/Base/Controller.php` | Toujours utiliser `$this->json()` plutôt que `response()->json()` direct |
| FormRequest pour validation | `app/Http/Requests/Auth/LoginRequest.php` | Validation sort du controller |
| Factory User | `database/factories/UserFactory.php` | Utilisé dans les tests |
| Test Feature Auth | `tests/Feature/Auth/AuthLoginTest.php` | Pattern `RefreshDatabase`, `postJson`, `assertJsonStructure` |
| Routes groupées par domaine | `routes/api/auth.php` | Auto-chargé via `routes/api.php` (glob) |

### Frontend — conventions et composants

| Pattern | Référence | Note |
|---|---|---|
| Design tokens | `app/globals.css` | `--primary: oklch(0.347 0.185 258.3)` (bleu nuit), `--font-headline: Manrope` |
| Animation `fadeInUp` | `app/globals.css:95-108` | Classe `animate-fade-in-up` disponible |
| Bouton | `components/ui/button.tsx` | `@base-ui/react` + `cva`, variantes `default/outline/ghost/link`, sizes `sm/lg/icon` |
| Input | `components/ui/input.tsx` | Composant shadcn standard |
| Hero visuel premium | `components/home/Hero.tsx` | Image Unsplash + gradient overlay — **réutiliser une URL Unsplash immobilier similaire pour le split screen** |
| Icônes provider | `components/home/Footer.tsx:5-16` | **Facebook/Apple/Google ne sont pas dans lucide-react** : utiliser SVG inline (pattern déjà en place pour Facebook/Instagram/Twitter/LinkedIn dans Footer) |
| Cookie auth httpOnly | `app/api/auth/set-token/route.ts` | Post à `/api/auth/set-token` après login/register/OAuth pour stocker le token en cookie |
| Client API + `ApiError` | `lib/api.ts` | `apiRequest<T>(path, { method, body, token, ... })`, lance `ApiError` avec `status` + `data` |
| Helpers auth | `lib/auth.ts` | Fonctions typées `login`, `register`, `forgotPassword`, `resetPassword` |
| Redirect post-auth sûr | `app/auth/login/page.tsx:14-15` | Pattern `raw.startsWith('/') && !raw.startsWith('//')` pour éviter open-redirect |

---

## Plan d'exécution séquentiel

Exécuter dans cet ordre. Chaque étape doit être vérifiée (tests verts + lint clean) avant de passer à la suivante.

### Étape 1 — Config backend OAuth

1. Éditer `config/services.php` : ajouter les 3 blocs (voir **Snippet backend ①** ci-dessous).
2. Éditer `.env.example` : ajouter les 9 variables OAuth (voir **Snippet backend ②**).
3. Éditer `.env` (local, non commit) avec des credentials de test valides ou des placeholders si l'agent n'a pas accès à des credentials réels — dans ce cas, les tests utiliseront `Socialite::fake()` donc ça n'est pas bloquant.
4. Vérifier : `cd takussan-api && php artisan config:clear && php -r "require 'vendor/autoload.php'; \$app = require 'bootstrap/app.php'; \$app->make('config')->get('services.google');"` doit retourner le tableau.

### Étape 2 — Refactor `OAuthController` vers Socialite

1. Remplacer entièrement `app/Http/Controllers/Auth/OAuthController.php` (voir **Snippet backend ③**).
2. Points clés :
   - Deux méthodes publiques uniquement : `redirect(string $provider)` et `callback(string $provider)`
   - Stocker le `state` en `Cache::put('oauth_state:'.$state, [...], now()->addMinutes(10))` et le vérifier + supprimer dans `callback`
   - Méthode privée `findOrCreateUser(string $provider, SocialiteUser $socialUser)` qui cherche par `{provider}_id` puis par `email`, et crée au besoin avec `email_verified_at = now()`
   - `Socialite::driver($provider)->stateless()` côté SPA (on gère le state nous-même via Cache)

### Étape 3 — Routes backend OAuth

1. Éditer `routes/api/auth.php` : remplacer le bloc actuel (lignes 60-64) par les routes parammétrées (voir **Snippet backend ④**).
2. Vérifier avec `php artisan route:list | grep oauth`.

### Étape 4 — Tests backend OAuth

1. Créer `tests/Feature/Auth/OAuthRedirectTest.php` (voir **Snippet backend ⑤**).
2. Créer `tests/Feature/Auth/OAuthCallbackTest.php` (voir **Snippet backend ⑥**).
3. Lancer `php artisan test --filter=OAuth`. Tous verts.

### Étape 5 — Lint backend

```bash
cd takussan-api && ./vendor/bin/pint
```

### Étape 6 — AuthLayout front (split screen)

1. Réécrire `src/app/auth/layout.tsx` en split screen responsive (voir **Snippet front ①**).
2. Récupérer une URL Unsplash immobilier premium (utiliser la même famille que `Hero.tsx:30` : villa/intérieur luxueux).
3. Logo "Takussan" blanc en haut à gauche de la colonne visuelle, lien vers `/`.

### Étape 7 — Page login refondue

1. Réécrire `src/app/auth/login/page.tsx` (voir **Snippet front ②**).
2. Ordre visuel : titre → sous-titre → 3 boutons OAuth → séparateur "ou" → form email/password → CTA principal → lien register.
3. Toggle show/hide password (icônes `Eye`/`EyeOff` de `lucide-react`).
4. Copy 100% FR.
5. Gestion 429 avec message explicite.

### Étape 8 — Page register refondue

1. Même structure que login + champs `first_name`/`last_name` en grille 2 cols + checkbox CGU obligatoire.
2. Traduire tout en FR.

### Étape 9 — Pages forgot/reset/verify

1. `forgot-password/page.tsx` : form email simple, état confirmation après envoi (card verte).
2. `reset-password/page.tsx` : form password+confirm, show/hide, redirect `/auth/login` après succès.
3. `verify-email/page.tsx` : card informative + bouton "Renvoyer" en FR.
4. `verify-email/[id]/[hash]/page.tsx` : états succès / expiré / déjà vérifié avec CTAs clairs.

### Étape 10 — OAuth callback front

1. Créer `src/app/auth/oauth/callback/page.tsx` (voir **Snippet front ③**).
2. Ce client component lit `provider`, `code`, `state` du query, appelle le backend, set-token, redirige.
3. Écran transitoire : spinner centré + "Connexion en cours…".

### Étape 11 — Helpers `lib/auth.ts`

1. Ajouter `oauthRedirect(provider)` → GET `/api/auth/oauth/{provider}/redirect`, renvoie `{ redirect_url }`.
2. Ajouter `oauthCallback(provider, code, state)` → GET `/api/auth/oauth/{provider}/callback?code=...&state=...`, renvoie `{ token, user }`.

### Étape 12 — Lint + build front

```bash
cd takussan-web && npm run lint && npm run build
```

### Étape 13 — Test manuel

1. `cd takussan-api && php artisan serve --port=8002` (dans un terminal)
2. `cd takussan-web && npm run dev` (dans un autre)
3. Visiter `http://localhost:3000/auth/login` → vérifier split screen + OAuth buttons.
4. Se connecter avec un user de seed (email/password).
5. Tester forgot-password (le lien sera dans `storage/logs/laravel.log` car `MAIL_MAILER=log`).

---

## Snippets de référence

### Snippet backend ① — `config/services.php` (ajout)

Ajouter à la fin du tableau retourné :

```php
'google' => [
    'client_id' => env('GOOGLE_CLIENT_ID'),
    'client_secret' => env('GOOGLE_CLIENT_SECRET'),
    'redirect' => env('GOOGLE_REDIRECT_URI'),
],

'facebook' => [
    'client_id' => env('FACEBOOK_CLIENT_ID'),
    'client_secret' => env('FACEBOOK_CLIENT_SECRET'),
    'redirect' => env('FACEBOOK_REDIRECT_URI'),
],

'apple' => [
    'client_id' => env('APPLE_CLIENT_ID'),
    'client_secret' => env('APPLE_CLIENT_SECRET'),
    'redirect' => env('APPLE_REDIRECT_URI'),
],
```

### Snippet backend ② — `.env.example` (ajout)

Ajouter un bloc en fin de fichier :

```env
# ==========================================
# OAuth Providers
# ==========================================
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI="${APP_URL}/api/auth/oauth/google/callback"

FACEBOOK_CLIENT_ID=
FACEBOOK_CLIENT_SECRET=
FACEBOOK_REDIRECT_URI="${APP_URL}/api/auth/oauth/facebook/callback"

APPLE_CLIENT_ID=
APPLE_CLIENT_SECRET=
APPLE_REDIRECT_URI="${APP_URL}/api/auth/oauth/apple/callback"
```

### Snippet backend ③ — `OAuthController` (remplacement complet)

```php
<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Base\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Laravel\Socialite\Contracts\User as SocialiteUser;
use Laravel\Socialite\Facades\Socialite;

class OAuthController extends Controller
{
    private const ALLOWED_PROVIDERS = ['google', 'facebook', 'apple'];

    public function redirect(string $provider): JsonResponse
    {
        abort_unless(in_array($provider, self::ALLOWED_PROVIDERS, true), 404);

        $state = Str::random(40);
        Cache::put('oauth_state:'.$state, ['provider' => $provider], now()->addMinutes(10));

        $url = Socialite::driver($provider)
            ->stateless()
            ->with(['state' => $state])
            ->redirect()
            ->getTargetUrl();

        return $this->json(['data' => ['redirect_url' => $url]]);
    }

    public function callback(string $provider, \Illuminate\Http\Request $request): JsonResponse
    {
        abort_unless(in_array($provider, self::ALLOWED_PROVIDERS, true), 404);

        $request->validate([
            'code' => ['required', 'string'],
            'state' => ['required', 'string'],
        ]);

        $cached = Cache::pull('oauth_state:'.$request->input('state'));
        abort_unless($cached && $cached['provider'] === $provider, 422, 'Invalid or expired OAuth state.');

        /** @var SocialiteUser $socialUser */
        $socialUser = Socialite::driver($provider)->stateless()->user();

        $user = $this->findOrCreateUser($provider, $socialUser);
        $token = $user->createToken($provider.'-oauth')->plainTextToken;

        return $this->json(['data' => [
            'token' => $token,
            'user' => ['id' => $user->id, 'email' => $user->email],
        ]]);
    }

    private function findOrCreateUser(string $provider, SocialiteUser $socialUser): User
    {
        $providerIdColumn = $provider.'_id';

        $user = User::where($providerIdColumn, $socialUser->getId())
            ->orWhere('email', $socialUser->getEmail())
            ->first();

        if ($user === null) {
            $nameParts = explode(' ', (string) $socialUser->getName(), 2);
            $user = User::create([
                'first_name' => $nameParts[0] ?? '',
                'last_name' => $nameParts[1] ?? '',
                'email' => $socialUser->getEmail(),
                $providerIdColumn => $socialUser->getId(),
                'email_verified_at' => now(),
                'password' => bcrypt(Str::random(32)),
            ]);
        } else {
            $user->update([$providerIdColumn => $socialUser->getId()]);
        }

        return $user;
    }
}
```

### Snippet backend ④ — `routes/api/auth.php` (remplacement des routes OAuth)

Remplacer le bloc lignes 60-64 par :

```php
// OAuth (public — SPA flow, state storé côté serveur via Cache)
Route::prefix('auth/oauth')->group(function () {
    Route::get('/{provider}/redirect', [OAuthController::class, 'redirect'])
        ->whereIn('provider', ['google', 'facebook', 'apple']);
    Route::get('/{provider}/callback', [OAuthController::class, 'callback'])
        ->whereIn('provider', ['google', 'facebook', 'apple']);
});
```

### Snippet backend ⑤ — `tests/Feature/Auth/OAuthRedirectTest.php`

```php
<?php

namespace Tests\Feature\Auth;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class OAuthRedirectTest extends TestCase
{
    use RefreshDatabase;

    /** @dataProvider providerDataProvider */
    public function test_redirect_returns_provider_url_and_stores_state(string $provider): void
    {
        config([
            "services.{$provider}.client_id" => 'test-client-id',
            "services.{$provider}.client_secret" => 'test-secret',
            "services.{$provider}.redirect" => 'http://localhost/api/auth/oauth/'.$provider.'/callback',
        ]);

        $response = $this->getJson("/api/auth/oauth/{$provider}/redirect");

        $response->assertStatus(200)
            ->assertJsonStructure(['data' => ['redirect_url']]);

        $url = $response->json('data.redirect_url');
        $this->assertStringContainsString('test-client-id', $url);

        parse_str(parse_url($url, PHP_URL_QUERY) ?? '', $params);
        $this->assertArrayHasKey('state', $params);
        $this->assertNotNull(Cache::get('oauth_state:'.$params['state']));
    }

    public function test_unknown_provider_returns_404(): void
    {
        $this->getJson('/api/auth/oauth/twitter/redirect')->assertStatus(404);
    }

    public static function providerDataProvider(): array
    {
        return [
            'google' => ['google'],
            'facebook' => ['facebook'],
            'apple' => ['apple'],
        ];
    }
}
```

### Snippet backend ⑥ — `tests/Feature/Auth/OAuthCallbackTest.php`

```php
<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Socialite\Contracts\User as SocialiteUser;
use Laravel\Socialite\Facades\Socialite;
use Mockery;
use Tests\TestCase;

class OAuthCallbackTest extends TestCase
{
    use RefreshDatabase;

    public function test_callback_creates_new_user_and_returns_token(): void
    {
        Cache::put('oauth_state:valid', ['provider' => 'google'], now()->addMinutes(5));

        $socialUser = Mockery::mock(SocialiteUser::class);
        $socialUser->shouldReceive('getId')->andReturn('google-123');
        $socialUser->shouldReceive('getEmail')->andReturn('new@example.com');
        $socialUser->shouldReceive('getName')->andReturn('Amine Thiam');

        Socialite::shouldReceive('driver->stateless->user')->andReturn($socialUser);

        $response = $this->getJson('/api/auth/oauth/google/callback?code=abc&state=valid');

        $response->assertStatus(200)
            ->assertJsonStructure(['data' => ['token', 'user' => ['id', 'email']]]);

        $this->assertDatabaseHas('users', [
            'email' => 'new@example.com',
            'google_id' => 'google-123',
        ]);
    }

    public function test_callback_links_existing_user_by_email(): void
    {
        $user = User::factory()->create(['email' => 'existing@example.com', 'google_id' => null]);
        Cache::put('oauth_state:valid', ['provider' => 'google'], now()->addMinutes(5));

        $socialUser = Mockery::mock(SocialiteUser::class);
        $socialUser->shouldReceive('getId')->andReturn('google-456');
        $socialUser->shouldReceive('getEmail')->andReturn('existing@example.com');
        $socialUser->shouldReceive('getName')->andReturn('Whatever');

        Socialite::shouldReceive('driver->stateless->user')->andReturn($socialUser);

        $this->getJson('/api/auth/oauth/google/callback?code=abc&state=valid')->assertStatus(200);

        $this->assertSame('google-456', $user->fresh()->google_id);
        $this->assertDatabaseCount('users', 1);
    }

    public function test_callback_rejects_invalid_state(): void
    {
        $this->getJson('/api/auth/oauth/google/callback?code=abc&state=unknown')
            ->assertStatus(422);
    }

    public function test_callback_rejects_state_for_wrong_provider(): void
    {
        Cache::put('oauth_state:mix', ['provider' => 'google'], now()->addMinutes(5));

        $this->getJson('/api/auth/oauth/facebook/callback?code=abc&state=mix')
            ->assertStatus(422);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }
}
```

### Snippet front ① — Squelette `app/auth/layout.tsx` (split screen)

```tsx
import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[45%_55%]">
      {/* Visual panel — desktop left / mobile top */}
      <div className="relative hidden lg:block">
        <Image
          src="https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1600&auto=format&fit=crop"
          alt="Villa contemporaine au Sénégal"
          fill
          priority
          className="object-cover"
          sizes="45vw"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/70 via-primary/40 to-black/60" />
        <div className="relative z-10 h-full flex flex-col justify-between p-12 text-white">
          <Link href="/" className="font-headline font-bold text-2xl tracking-tight">
            Takussan
          </Link>
          <div>
            <h2 className="font-headline text-4xl font-bold mb-3 leading-tight">
              L&apos;immobilier du Sénégal, à portée de clic.
            </h2>
            <p className="text-white/80 max-w-md">
              Des milliers de biens, une expérience soignée, des partenaires de confiance.
            </p>
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="relative flex items-center justify-center p-6 md:p-12 bg-background">
        {/* Mobile banner */}
        <div className="lg:hidden absolute top-0 inset-x-0 h-[25vh] overflow-hidden">
          <Image
            src="https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1200&auto=format&fit=crop"
            alt=""
            fill
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-primary/60 to-background" />
        </div>
        <div className="w-full max-w-md animate-fade-in-up lg:mt-0 mt-[20vh] relative z-10">
          {children}
        </div>
      </div>
    </div>
  );
}
```

### Snippet front ② — Structure attendue `app/auth/login/page.tsx`

Reprendre l'implémentation actuelle et y intercaler :

- Titre Manrope `font-headline text-3xl font-bold tracking-tight` : “Content de vous revoir”
- Sous-titre : “Connectez-vous pour accéder à votre espace”
- **Bloc OAuth** (composant local ou section) : 3 boutons `Button variant="outline"` pleine largeur avec icône SVG inline + libellé “Continuer avec Google/Apple/Facebook”. Au clic : `const { redirect_url } = await oauthRedirect('google'); window.location.href = redirect_url;`
- Séparateur : `<div className="relative my-6"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div><div className="relative flex justify-center text-xs"><span className="bg-background px-2 text-muted-foreground">ou continuer avec email</span></div></div>`
- Champs email/password avec labels FR + toggle show/hide sur password
- Lien “Mot de passe oublié ?” aligné droite
- CTA `Button className="w-full rounded-full h-11 text-base font-semibold"`
- Lien bas : “Pas encore de compte ? S’inscrire” (`text-primary`)
- Gestion 429 : `if (err instanceof ApiError && err.status === 429) setGlobalError('Trop de tentatives. Réessayez dans quelques minutes.')`

### Snippet front ③ — `app/auth/oauth/callback/page.tsx`

```tsx
'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { oauthCallback } from '@/lib/auth';
import { ApiError } from '@/lib/api';

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const provider = (params.get('provider') ?? '') as 'google' | 'facebook' | 'apple';
  const code = params.get('code');
  const state = params.get('state');

  useEffect(() => {
    if (!provider || !code || !state) {
      router.replace('/auth/login?error=oauth_invalid');
      return;
    }
    (async () => {
      try {
        const { token } = await oauthCallback(provider, code, state);
        await fetch('/api/auth/set-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        router.replace('/dashboard');
      } catch (err) {
        const msg = err instanceof ApiError ? 'oauth_failed' : 'oauth_unknown';
        router.replace(`/auth/login?error=${msg}`);
      }
    })();
  }, [provider, code, state, router]);

  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
      <p className="text-muted-foreground text-sm">Connexion en cours…</p>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense>
      <CallbackInner />
    </Suspense>
  );
}
```

**Important :** l'agent doit déclarer le `provider` via le query string au moment de rediriger depuis les boutons OAuth. Alternative : créer 3 routes `app/auth/oauth/{google,facebook,apple}/callback/page.tsx` qui dérivent le provider du pathname si la contrainte Google OAuth rejette un callback générique (à vérifier selon la config Google Console).

### Snippet front ④ — Ajouts `src/lib/auth.ts`

```ts
export type OAuthProvider = 'google' | 'facebook' | 'apple';

export async function oauthRedirect(provider: OAuthProvider): Promise<{ redirect_url: string }> {
  const res = await apiRequest<{ data: { redirect_url: string } }>(
    `/api/auth/oauth/${provider}/redirect`,
  );
  return res.data;
}

export async function oauthCallback(
  provider: OAuthProvider,
  code: string,
  state: string,
): Promise<{ token: string; user: { id: number; email: string } }> {
  const res = await apiRequest<{ data: { token: string; user: { id: number; email: string } } }>(
    `/api/auth/oauth/${provider}/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
  );
  return res.data;
}
```

---

## Vérification & tests

### Avant commit backend

```bash
cd takussan-api
./vendor/bin/pint                            # style
php artisan test --filter=Auth               # tous les tests auth doivent passer
php artisan test --filter=OAuth              # nouveaux tests OAuth
php artisan route:list | grep oauth          # doit montrer 6 routes (3 providers × redirect+callback)
```

### Avant commit frontend

```bash
cd takussan-web
npm run lint
npm run build                                 # doit passer sans erreur TypeScript
```

### Test manuel end-to-end (environnement local)

1. Avoir des credentials Google OAuth réels dans `.env` (Google Cloud Console, redirect URI = `http://localhost:8002/api/auth/oauth/google/callback`)
2. Lancer API + front (voir Étape 13)
3. Visiter `http://localhost:3000/auth/login`
4. Cliquer “Continuer avec Google” → redirection Google → consentement → retour sur `/auth/oauth/callback?code=...&state=...` → redirection `/dashboard`
5. Vérifier en DB : `select id, email, google_id from users where email = 'votre-email-google@gmail.com'` — `google_id` doit être rempli.

---

## Pièges à éviter

- **Ne pas exposer les secrets côté front** — toutes les variables OAuth restent en `.env` backend, jamais préfixées `NEXT_PUBLIC_`.
- **Socialite `stateless()` obligatoire** côté SPA : sans cela, Socialite vérifie un state via session cookie qu'on n'a pas (on a un token Sanctum, pas de session stateful sur l'API).
- **Ne pas oublier `Cache::pull()` au lieu de `get()`** dans le callback : le state doit être consommé (single-use), sinon replay attack possible.
- **Apple OAuth** retourne l'email uniquement au **premier** consentement — le test peut échouer si un user Apple a déjà autorisé l'app sans que `email` soit conservé côté Socialite. Adapter `findOrCreateUser` pour tolérer `getEmail() === null` et requérir alors l'email dans un second step (hors scope ici, mais documenter le gap).
- **Facebook** peut retourner `name` vide si le user n'a pas donné la permission `public_profile`. Code doit être défensif sur `getName()`.
- **`AuthLayout` s'applique à TOUTES les pages `/auth/*`** — vérifier que le split screen ne casse pas sur des pages comme `/auth/verify-email/[id]/[hash]` (état succès simple).
- **Ne pas supprimer** les pages en anglais existantes en premier : réécrire le contenu en FR puis valider — le code Next sinon échoue au build si un import référence une page supprimée.
- **Pint après chaque modif PHP** (rule user) : `./vendor/bin/pint` avant `git commit`.
- **Images Unsplash** : utiliser des URLs stables (`?w=1600&auto=format&fit=crop`) ; vérifier que `images.unsplash.com` est autorisé dans `next.config.ts` (voir le fichier, sinon ajouter via `images.remotePatterns`).
- **Cookie httpOnly partagé** : OAuth callback Next doit appeler `/api/auth/set-token` **côté même origine** (http://localhost:3000), sinon Safari bloquera.
- **Champ `google_id` existe déjà** dans `User::$fillable` (ligne 34 du modèle) — pas besoin de migration.
- **Les tests OAuth utilisent `Socialite::shouldReceive('driver->stateless->user')`** — ne pas toucher au vrai réseau.
- **La validation `->whereIn('provider', ...)`** sur les routes empêche un 500 inutile si un provider non supporté est appelé — laisse tomber en 404.
