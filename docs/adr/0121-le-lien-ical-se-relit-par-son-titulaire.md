# ADR-0121 — Le lien d'abonnement d'agenda se relit par son titulaire, depuis une copie chiffrée

- **Statut** : Accepté le 2026-11-15 — décision prise à l'implémentation de TCK-2887, « valide tes choix » du porteur, à confirmer à la revue
- **Date** : 2026-11-15
- **Tickets** : TCK-2887 (API), TCK-2888 (écran)
- **Amende** : [ADR-0034](0034-l-agenda-sort-par-un-lien-secret-en-lecture-seule.md) § 1 (« le jeton en clair n'est rendu qu'une fois […] il n'est jamais relu ») et son option écartée « jeton en clair en base » (« le hachage ne coûte rien puisque le jeton n'a jamais à être relu »)
- **S'appuie sur** : [ADR-0055](0055-impersonation-en-lecture-seule-sans-jeton-dans-la-page.md) § 3 (aucun secret durable lu sous impersonation)

## Contexte

Mesuré le 2026-11-15 : `CalendarFeed` ne garde que `token_hash` (SHA-256) ; `GET /api/me/calendar-feed`
ne rend que `active`, `created_at`, `last_accessed_at`. Le lien n'est donc visible qu'au retour du
`POST` qui le crée. L'agent qui rouvre « S'abonner à mon agenda » pour l'ajouter à un second appareil,
le recopier ou l'ouvrir dans Google Agenda / Apple Calendrier n'a qu'un geste : en générer un
nouveau — ce qui **fait tourner** le lien et casse en silence l'abonnement déjà posé sur son
téléphone (ADR-0034 § 2). La maquette validée de l'agenda (audit du 2026-11-15, `app-agenda` e5)
montre le lien, « Copier » et « Ajouter à Google Agenda / Apple Calendrier » à la réouverture.

ADR-0034 avait écarté tout stockage relisible parce que le jeton « n'a jamais à être relu ». Cette
prémisse ne tient plus : il doit l'être, par son titulaire.

## Décision

**Le jeton reste vérifié par son empreinte ; une copie chiffrée, avec la clé de l'application, ne
sert qu'à le rendre à son titulaire authentifié.**

1. **Stockage** — colonne `calendar_feeds.token_encrypted` (`text`, nullable), cast Eloquent
   `encrypted` (AES-256-CBC + HMAC sous `APP_KEY`), masquée de toute sérialisation (`$hidden`).
   `token_hash` est inchangé et reste la **seule** voie de résolution d'un `.ics` : la copie n'est
   jamais cherchée, jamais comparée, jamais journalisée.
2. **Lecture** — `GET /api/me/calendar-feed` rend `url` (le lien complet, construit par le même code
   que la réponse du `POST`) au titulaire authentifié, pour son profil actif. Réponse en
   `Cache-Control: no-store`.
3. **Jamais sous impersonation** — sous une session d'impersonation (`ImpersonationContext::active()`),
   la clé `url` est **absente** : le lien est un secret durable qui survit à la session, exactement ce
   qu'ADR-0055 § 3 refuse. Le reste de l'état (`active`, dates) se lit encore. La garde
   `ImpersonationReadSweepTest` reconnaît désormais un lien `.ics` dans toute réponse.
4. **Révoquer efface la copie** — toute voie qui pose `revoked_at` pose `token_encrypted = null`
   dans la même écriture : `DELETE /api/me/calendar-feed`, la rotation de `POST`, le retrait d'un
   membre (`AgencyMemberRemovalService` → `CalendarFeedService::revoke`) le blocage d'un compte
   (`UserLifecycleController`) et son effacement (`AccountDeletionService`, qui garde la ligne `users`). Une copie ne survit donc jamais à son lien.
5. **Flux antérieurs** — un lien créé avant cette décision n'a pas de copie, et le jeton n'est pas
   rattrapable depuis son empreinte : `url` est `null`, l'écran propose « Générer un nouveau lien ».
6. **Rotation de la clé** — une copie chiffrée sous une clé retirée se déchiffre tant que l'ancienne
   clé figure dans `APP_PREVIOUS_KEYS` (`config/app.php`, `previous_keys`). Une copie
   indéchiffrable (clé perdue, valeur altérée) rend `url: null`, comme un flux antérieur — jamais une
   erreur 500 — et le flux `.ics` continue d'être servi par l'empreinte.

## Options écartées

- **Jeton en clair en base.** Toujours écarté : une copie de la base (sauvegarde, export, accès en
  lecture) livrerait tous les agendas.
- **Clé dédiée** (`CALENDAR_FEED_KEY` distincte d'`APP_KEY`). Écartée : elle ne protège que contre qui
  aurait la base et `APP_KEY` sans la seconde clé, alors que les deux vivent dans le même
  environnement du conteneur ; elle ajoute un secret à faire tourner et à sauvegarder. Le niveau
  retenu est celui des autres secrets chiffrés du dépôt (`LeasePaymentLink::token`,
  `AlertSubscriber::unsubscribe_token`, `PayoutMethod::account_identifier`).
- **Rendre le lien une seule fois et demander de le noter.** C'est l'état d'ADR-0034 : il pousse à
  régénérer, donc à casser l'abonnement déjà posé.
- **Lien dérivé du jeton par HMAC** (le jeton recalculable depuis l'identifiant et une clé). Écarté :
  il ne se révoque qu'en changeant la clé, pour tout le monde — le défaut même de l'URL signée
  écartée par ADR-0034.

## Conséquences

- Qui détient la base **et** `APP_KEY` lit les liens actifs : c'est le niveau des autres secrets
  chiffrés, et un lien d'agenda n'ouvre qu'un flux en lecture seule, sans données de tiers
  (ADR-0034 § 4). La révocation reste à un geste.
- Un lien révoqué ou tourné ne laisse aucune copie relisible.
- L'écran (TCK-2888) peut offrir « Copier » et l'ajout aux agendas à chaque ouverture, et ne propose
  « Générer un nouveau lien » qu'à un flux sans copie.

## Application

- Migration `2026_11_15_288700_add_token_encrypted_to_calendar_feeds`.
- `App\Models\CalendarFeed` (cast, `$hidden`, `readableToken()`), `App\Services\Calendar\CalendarFeedService`
  (`issue` écrit la copie, `revoke` et la rotation l'effacent), `App\Http\Controllers\Api\CalendarFeedController`
  (`current` rend `url`), `App\Http\Controllers\Api\Admin\UserLifecycleController` (blocage), `App\Services\Account\AccountDeletionService` (effacement).
- `tests/Feature/Calendar/CalendarFeedReadableUrlTest.php` ; marqueur « lien d'agenda » de
  `tests/Feature/Admin/Platform/ImpersonationReadSweepTest.php`.
