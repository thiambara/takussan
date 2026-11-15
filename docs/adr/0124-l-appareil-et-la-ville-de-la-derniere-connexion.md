# ADR-0124 — L'appareil et la ville de la dernière connexion

- **Statut** : Accepté le 2026-11-15 — décision prise à l'implémentation de TCK-2926, « valide tes choix » du porteur, à confirmer à la revue
- **Date** : 2026-11-15
- **Tickets** : TCK-2926 (API), TCK-2928 (écran)
- **S'appuie sur** : [ADR-0044](0044-donnees-personnelles-chiffrement-journal-d-agence-registre-des-droits.md) (données personnelles), [ADR-0032](0032-l-api-n-ecrit-plus-de-prose.md) (notifications à code), [ADR-0031](0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md) (personnel de l'agence)

## Contexte

Mesuré le 2026-11-15 : la fiche d'un membre de l'équipe, que la maquette montre avec « Dernière
connexion : aujourd'hui 09:12 · iPhone · Safari · Dakar » et « Double authentification activée le
3 sept. », ne peut rien en dire. `users` porte `last_login_at` seulement ; `two_factor_enabled` est un
booléen sans date ; aucune voie de connexion ne garde ni l'appareil ni le lieu. La connexion par Google
(`OAuthSessionOpener`) n'écrivait même pas `last_login_at`.

L'appareil et le lieu d'une connexion sont des **données personnelles neuves** : l'adresse IP et la
chaîne `User-Agent` complète identifient un appareil (empreinte), et leur réunion sur une ligne lue
par l'employeur est une surveillance que le besoin ne demande pas.

## Décision

**Seule la DERNIÈRE connexion est gardée, sous deux formes réduites : la famille d'appareil et de
navigateur, et la ville seule. Ni l'IP ni la chaîne `User-Agent` ne sont stockées. Elles se lisent sur
la fiche d'un membre par qui gère l'équipe de son agence, et nulle part ailleurs.**

### 1. Ce qui est gardé

- `users.last_login_device` (`varchar(64)`, nul) : la famille d'appareil et de navigateur, lue du
  `User-Agent` de la requête de connexion par `App\Services\Auth\FamilleDAppareil` — par exemple
  `iPhone · Safari`, `Android · Chrome`, `Windows · Edge`. Une liste fermée de familles ; rien d'autre
  de la chaîne (version, modèle, langue) n'est retenu. Agent illisible → `null`.
- `users.last_login_city` (`varchar(120)`, nul) : la ville seule, jamais le quartier, la région ni les
  coordonnées.
- **Jamais stockés** : l'adresse IP (ni en clair, ni hachée, ni tronquée) et la chaîne `User-Agent`.
  L'IP ne vit qu'en mémoire, le temps de la résolution.
- Les trois colonnes sont **écrasées** à chaque connexion : aucun historique.

### 2. D'où vient la ville

- D'une **résolution locale**, hors ligne : le contrat `App\Services\Auth\LoginCityResolver`. Aucune
  IP n'est envoyée à un service tiers, jamais.
- **Aucune base hors ligne n'est livrée aujourd'hui** : le lien par défaut est
  `NullLoginCityResolver`, qui rend `null`. La fiche affiche alors l'appareil sans ville. Brancher une
  base (fichier MMDB servi par l'image, licence à vérifier) est un geste à part, qui ne change ni les
  colonnes ni le contrat de lecture.

### 3. Toutes les voies de connexion, une seule écriture

`App\Services\Auth\LastLoginRecorder::record()` écrit `last_login_at`, `last_login_device` et
`last_login_city` ensemble, appelé par les trois voies qui ouvrent une session sur une preuve : le mot
de passe (`AuthController::login`), le code SMS (`PhoneLoginService`) et Google/Apple/Facebook
(`OAuthSessionOpener::issue`, qui n'écrivait rien jusqu'ici). L'inscription n'est pas une connexion :
elle n'écrit rien (inchangé). Le `User-Agent` et l'IP lus sont ceux que le front transmet pour le
visiteur (`apiFetch`/`apiRequest` posent `User-Agent` et `X-Forwarded-For` côté serveur ; seuls les
mandataires de `TrustedProxyList` sont crus).

### 4. La date de la double authentification

`users.two_factor_enabled_at` est posée par le modèle `User` dès que `two_factor_enabled` passe à
`true`, et remise à `null` quand il repasse à `false` — quel que soit l'écrivain (activation,
renouvellement, réinitialisation du support, effacement du compte). Les comptes déjà protégés avant la
migration gardent `null` : aucune date n'est inventée.

### 5. Qui le lit, combien de temps

- **Lu par** : qui gère l'équipe de l'agence dont la personne est membre
  (`AgentProfilePolicy::viewAny` pour l'agence), sur `GET /api/agencies/{agency}/team/{user}` ; la
  personne elle-même par l'export de ses données (`DataExportBuilder`, qui rend la ligne `users`).
  Les colonnes n'entrent pas dans `User::$queryFields` : aucune liste d'utilisateurs ne les sert, et
  le journal d'activité ne les enregistre pas (`logOnly` les ignore).
- **Rien de neuf pour un agent** sur un autre agent.
- **Conservé** tant que le compte vit, écrasé à la connexion suivante ; **effacé** par l'effacement du
  compte (`AccountDeletionService`), comme `two_factor_enabled_at`.

### 6. Le rappel de la double authentification

`POST /api/agencies/{agency}/team/{user}/two-factor-reminder` envoie au membre la notification à code
`account.two_factor_reminder` (cible : `/app/profile/security`), non désactivable (un avis de
sécurité). Refusé `409 team.two_factor_already_enabled` si elle est active, `429
team.two_factor_reminder_throttled` si le membre en a reçu un dans les 24 h (jugé sous le verrou de la
ligne `users`, sur les lignes `app_notifications` du code : deux clics simultanés n'en envoient qu'un).

## Conséquences

- La fiche dit d'où et sur quoi un membre s'est connecté la dernière fois, sans que la base garde de
  quoi le suivre d'une connexion à l'autre.
- Tant qu'aucune base de villes n'est branchée, `city` vaut `null` partout : l'écran doit le prévoir.
- Une voie de connexion neuve doit appeler `LastLoginRecorder` ; sinon elle laisse la dernière
  connexion d'une autre voie.
