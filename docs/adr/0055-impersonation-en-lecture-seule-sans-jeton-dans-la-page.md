# ADR-0055 — L'impersonation est une session de lecture de 15 minutes, dont le jeton ne quitte jamais le serveur du front

- **Statut** : Accepté
- **Date** : 2026-10-08
- **Tickets** : [TCK-600](../backlog/tickets/TCK-600-console-plateforme-gouvernance-et-exploitation.md)
- **Précise** : [ADR-0010](0010-auth-token-sanctum-en-cookie.md) (le jeton porté par cookie httpOnly)
  et [ADR-0033](0033-le-telephone-verifie-est-un-identifiant-de-connexion.md) (step-up 2FA par jeton).

## Contexte

Mesuré le 2026-10-08 sur `dev` (`bef65b3e`) :

- `UserImpersonationController::start` crée un jeton Sanctum **`['*']` de 60 minutes** et le rend
  **en clair** dans le JSON ; aucun motif ; seul refus, soi-même — un opérateur peut viser un autre
  opérateur ou un compte bloqué.
- Le proxy générique de la console (`src/app/api/super-admin/[...path]/route.ts`) relaie le corps tel
  quel : le jeton arrive au JavaScript de la page, qui le range en `localStorage`
  (`src/lib/impersonation.ts`).
- **Personne ne le lit** : après confirmation, la page fait `router.push('/app')` avec la session de
  l'opérateur. La fonction n'a jamais montré ce que voit l'utilisateur.
- Avec ce jeton, `PATCH /api/me` et `POST /api/me/data-exports` passent : aucune garde ne lit les
  capacités d'un jeton (grep `tokenCan|currentAccessToken()->can` → 0).
- `stop` prend un `user_id` libre ; l'expiration n'écrit rien ; la cible n'est jamais informée ;
  `activity_log` n'a aucune colonne d'imposteur.

Le **2026-10-06**, le porteur a tranché : *« la refaire correctement »*, avec onze invariants que cet
ADR ne rouvre pas (ticket, « Invariants de l'impersonation »).

## Décision

**Un opérateur `super_admin`, après un step-up 2FA récent et avec un motif, ouvre une session
d'impersonation de 15 minutes non prolongeable. Elle est portée par un jeton Sanctum dédié de
capacité unique `impersonation:read`, remis au seul route handler du BFF, rangé dans un cookie
httpOnly distinct, et en lecture seule.**

### 1. Le jeton et la session

- `POST /api/admin/users/{user}/impersonate` (même chemin, même action `start` : la liste step-up de
  TCK-589 l'apparie par action) ; corps `reason` (10..1000).
- `ImpersonationService::start` refuse en 422 : soi-même (`impersonation_target_self`), tout titulaire
  d'un `PlatformProfile` actif, tout niveau (`impersonation_target_operator`), tout compte dont
  `status ≠ active` (`impersonation_target_inactive`). Il ferme la session ouverte précédente de
  l'opérateur, crée le jeton `createToken('impersonation', ['impersonation:read'], now()+15 min)` —
  **pas** par `SessionTokenIssuer`, et sans jamais `two_factor_verified_at` — et une ligne
  `impersonation_sessions` (motif, début, échéance, jeton).
- **Durée : 15 minutes, non prolongeable.** Une nouvelle session redemande motif et step-up.
- La réponse `201 {data:{session_id, token, expires_at, target:{id, name}}}` n'est destinée qu'au
  route handler du BFF.

### 2. Validité à chaque requête

`AccessTokenGate` (TCK-589, la classe unique appelée par `Sanctum::authenticateAccessTokensUsing`)
reçoit **une branche** : un jeton nommé `impersonation` n'est valide que si sa session est ouverte,
non échue, et que l'opérateur détient toujours un `PlatformProfile` `super_admin` actif et un
compte `active`. La clause de statut de 589 couvre déjà la cible bloquée ; retirer ou bloquer
l'opérateur coupe le jeton à la requête suivante, avant même que la session soit fermée.

### 3. Lecture seule, et lectures refusées

`EnforceImpersonationReadOnly` (groupe `api`, après `ResolveActiveProfile`) lie un
`ImpersonationContext` (session, opérateur) quand le jeton courant appartient à une session ouverte,
puis :

- toute méthode autre que `GET` / `HEAD` / `OPTIONS` → **403 `impersonation_read_only`**. **Aucune
  écriture permise** ;
- **lectures refusées malgré tout**, même code : les téléchargements d'export (`me/data-exports/*`,
  `export/*`, exports de rapports), **toute la famille 2FA** (`auth/two-factor*` : codes de secours,
  et QR de la graine TOTP en cours d'enrôlement — verif-600 M1), les liens de partage d'un document
  (leur `token` ouvre le fichier sans session), et **toute action de la liste step-up**
  (`ProtectedActions::STEP_UP` et `STEP_UP_FOR_PLATFORM`) — le jeton d'impersonation ne porte jamais
  de confirmation 2FA ; `/api/admin/*` entier (la cible n'est jamais un opérateur, mais la règle ne
  repose pas sur cette seule garde).

### 4. Fin, expiration, révocation

- `POST /api/admin/impersonate/stop` (sans corps, **jeton de l'opérateur**) ferme la session ouverte
  **de l'appelant** ; 404 si aucune.
- `stop(session, cause)` est idempotent : supprime le jeton, pose `ended_at` / `end_reason`
  (`stopped | expired | operator_revoked | target_blocked`), journalise
  `super_admin_impersonation_stopped` (durée, cause), et **notifie la cible**
  (`ImpersonationEndedNotification`, base + courriel, clés `notifications.impersonation_ended.*`) —
  une fois par session, quelle que soit la cause.
- `impersonation:close-expired` (chaque minute, `withoutOverlapping`) ferme les sessions échues.
- Retirer (ADR-0047) ou bloquer un opérateur ferme ses sessions ; bloquer une cible ferme celles qui
  la visent.

### 5. Attribution

`activity_log.impersonator_id` (FK `users`, `nullOnDelete`). `Activity::creating` le renseigne depuis
`ImpersonationContext`. Début et fin journalisés sur la cible, motif compris ;
`GET /api/admin/users/{u}/activity` expose `impersonator {id, name}`.

### 6. Le front : aucun jeton dans la page

- Deux route handlers dédiés : `POST /api/impersonation/start` appelle l'API avec le jeton de
  l'opérateur, pose le cookie **`impersonation_token`** (httpOnly, `SameSite=Strict`, `Secure` en
  production, `maxAge` dérivé d'`expires_at`) et rend `{session_id, expires_at, target}` **sans
  jeton** ; `POST /api/impersonation/stop` appelle `stop` avec le jeton de l'opérateur et efface le
  cookie.
- Le proxy générique de la console **refuse** (404, sans appeler l'API) `users/*/impersonate` et
  `impersonate/stop`.
- Pendant la session, l'espace applicatif lit **en tant que la cible** : côté serveur, `getToken()`
  (`src/lib/session.ts`) rend le jeton d'impersonation et la console lit celui de l'opérateur
  (`getOperatorToken()`) ; côté navigateur, `apiRequest` passe par le relais same-origin
  `/api/impersonation/proxy/*`, qui ajoute le jeton côté serveur. `AuthContext` ne reçoit **aucun**
  jeton pendant la session. Le cookie de profil actif de l'opérateur n'est **jamais** transmis avec
  le jeton d'impersonation (invariant 11) : le profil actif est résolu pour la cible.
- La bannière (`GET /api/impersonation/current`, jeton d'impersonation) est montée dans l'espace
  applicatif : cible, « lecture seule », heure de fin, « Quitter » (retour à la fiche de la cible
  dans la console). À l'expiration, le relais efface le cookie et l'opérateur revient à la console.
- La déconnexion de l'opérateur efface les deux cookies.

## Alternatives écartées

- **Aucun second jeton, le jeton de l'opérateur plus un identifiant de session substitué côté API**
  (l'API répondrait « comme » la cible quand un en-tête nomme une session) : chaque lecteur de
  `$request->user()` — policies, résolveur de profil actif, `Gate::before` du super-admin — devrait
  apprendre la substitution, et un oubli servirait la cible avec **les pouvoirs de l'opérateur**
  (`Gate::before` ouvre tout au super-admin). Un jeton de la cible ne porte que les pouvoirs de la
  cible, moins l'écriture.
- **Durée de 60 minutes, ou prolongeable** : une lecture de support tient en quelques minutes ; une
  session longue est une session oubliée ouverte.
- **Écritures nommées permises** (« corriger le profil pour l'utilisateur ») : agir au nom d'un
  autre est un autre geste, avec un autre consentement. Hors périmètre, à décider par un ADR propre.

## Conséquences

- L'opérateur voit les données de la cible, et **seulement en lecture** ; une page qui écrit dit
  « lecture seule pendant l'impersonation » au lieu d'une erreur générique.
- Une session coûte un step-up, un motif, une ligne, deux activités et une notification : c'est
  voulu, chaque consultation laisse une trace que la cible peut lire.
- Le journal des consultations de données personnelles pendant la session est à TCK-601.

## Application

- API : `ImpersonationService`, `UserImpersonationController`, `EnforceImpersonationReadOnly`,
  `ImpersonationContext`, `AccessTokenGate`, `CloseExpiredImpersonations`, migrations
  `create_impersonation_sessions_table` et `add_impersonator_id_to_activity_log_table`.
- Front : `src/app/api/impersonation/{start,stop,current,proxy}`, `src/lib/session.ts`,
  `src/lib/api.ts`, `ImpersonationBanner` dans `AppShell`.
- Tests : `ImpersonationStartTest`, `ImpersonationReadOnlyTest`, `ImpersonationLifecycleTest`,
  `ImpersonationAttributionTest`, `UserImpersonationTest` ; côté front, les route handlers, le refus
  du proxy générique et la bannière.
