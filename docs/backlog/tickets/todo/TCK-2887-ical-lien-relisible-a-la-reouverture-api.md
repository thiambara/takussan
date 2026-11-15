---
id: TCK-2887
title: "API de l'abonnement iCal : le lien se relit à la réouverture (pour le copier, l'ajouter à Google Agenda ou à Apple Calendrier), sous une décision écrite qui revoit le choix de TCK-591"
status: todo
phase: P2
family: back
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2888]
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#72-calendarfeed-"
tags: [back, calendar, ical, securite, adr, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

L'agent qui rouvre « S'abonner à mon agenda » retrouve son lien, le copie ou l'ajoute à Google Agenda / Apple Calendrier, sans devoir en générer un nouveau qui casse l'abonnement déjà posé sur son téléphone.

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`audit-f5-commercial.md`, app-agenda e5). Le lien n'est montré qu'à sa génération : `CalendarFeed` ne garde que `token_hash` (`CalendarFeed::hashToken`, sha256) et `GET /api/me/calendar-feed` ne rend que `active`, `created_at`, `last_accessed_at` (`CalendarFeedController::current`). Choix de sécurité de TCK-591, accepté par la fiche de TCK-2597 ; la maquette validée montre l'inverse (lien, « Copier », « Ajouter à Google Agenda / Apple Calendrier » à la réouverture). Le porteur veut tout. **Revenir sur un choix de sécurité est une décision structurelle : l'ADR s'écrit d'abord.**

## Contrat de données

- `GET /api/me/calendar-feed` : + `url` (lien complet) pour le titulaire seul.
- Colonne neuve `calendar_feeds.token_encrypted`.

## Contraintes strictes (métier)

- Le jeton reste vérifié par son empreinte (`token_hash`, inchangé) ; la copie chiffrée (`encrypted`, clé de l'application) ne sert qu'à le **rendre à son titulaire**.
- `url` n'est servi qu'au titulaire authentifié, **jamais sous impersonation** ([ADR-0055](../../../adr/0055-impersonation-en-lecture-seule-sans-jeton-dans-la-page.md)) — `ImpersonationReadSweepTest` doit le voir absent.
- Un flux créé avant la migration n'a pas de copie : `url` nul, l'écran propose « Générer un nouveau lien » (pas de rattrapage possible d'un jeton non conservé).
- Révoquer efface la copie chiffrée.

## Delta à produire

- [ ] **Écrire l'ADR** (numéro suivant libre au moment de l'implémentation) : « le lien iCal se relit par son titulaire » — contexte TCK-591, risque (copie chiffrée en base, lisible par qui a la clé de l'application ; même niveau que les autres secrets chiffrés), garde-fous (titulaire seul, pas sous impersonation, révocation efface). Le porteur le valide avant le code.
- [ ] Migration `add_token_encrypted_to_calendar_feeds` (text nullable, cast `encrypted`) ; `down()`.
- [ ] `CalendarFeedService::issue` écrit la copie ; `revoke` l'efface.
- [ ] `CalendarFeedController::current` : `url` sous les règles ci-dessus.
- [ ] Tests : `CalendarFeedReadableUrlTest` (rendu au titulaire, absent sous impersonation, nul pour un flux ancien, effacé à la révocation, chiffré en base).

## Critères d'acceptation

- [ ] AC1 — Après `POST /api/me/calendar-feed`, `GET /api/me/calendar-feed` rend le même `url` que la création.
- [ ] AC2 — Sous impersonation, `url` est absent.
- [ ] AC3 — La colonne `token_encrypted` ne contient jamais le jeton en clair (lecture SQL brute).
- [ ] AC4 — Après révocation, `url` est nul et la colonne vide.

## Hors périmètre

- L'écran (TCK-2888).

## Notes d'implémentation

2026-11-15 — agent d'implémentation (vague 92).

**Prémisse re-mesurée** : identique au ticket — `CalendarFeed` ne gardait que `token_hash`,
`CalendarFeedController::current` ne rendait que `active`, `created_at`, `last_accessed_at`.

**ADR écrit d'abord** : [ADR-0121](../../../adr/0121-le-lien-ical-se-relit-par-son-titulaire.md)
(amende ADR-0034 § 1 et son option écartée ; ligne d'index et renvoi dans ADR-0034). « Valide tes
choix » du porteur : accepté, à confirmer à la revue. Option retenue : cast `encrypted` sous `APP_KEY`
(niveau des autres secrets chiffrés), rotation par `APP_PREVIOUS_KEYS` ; clé dédiée et lien dérivé
par HMAC écartés (motifs dans l'ADR).

**Livré** :
- migration `2026_11_15_288700_add_token_encrypted_to_calendar_feeds` (`text` nullable, `down()`) ;
- `CalendarFeed` : cast `encrypted`, `$hidden`, `readableToken()` (nul sans copie ou si indéchiffrable —
  décision mineure : une copie illisible se lit comme un flux ancien, jamais un 500) ;
- `CalendarFeedService::revocation()` : la seule écriture d'une révocation (`revoked_at` + copie à
  `null`), employée par `revoke`, la rotation d'`issue` et le blocage de compte ;
- `CalendarFeedController::current` : `url` (même helper `feedUrl()` que `store`), clé ABSENTE sous
  impersonation, `null` sans copie ; réponse `Cache-Control: no-store, private` (décision mineure).

**Écarts / effets voisins corrigés** :
- **Une voie de révocation hors du ticket** : `UserLifecycleController::block` posait `revoked_at`
  directement — il passe par `CalendarFeedService::revocation()` (bloc marqué TCK-2887).
  `AgencyMemberRemovalService` passe déjà par `revoke`.
- **`ImpersonationReadSweepTest` ne pouvait pas voir le lien** (il ne cherchait que `"token":"…"` et la
  cible n'avait pas de lien) : marqueur « lien d'abonnement d'agenda » (`/calendar-feed/<40>.ics`), lien
  émis pour la cible dans `garnirLaCible`, témoin sous le jeton de la cible. Blocs marqués TCK-2887.
- **Une troisième voie hors du ticket : l'effacement du compte.** `AccountDeletionService::anonymize`
  garde la ligne `users` (suppression douce) : la cascade ne jouait pas, le lien restait actif (non
  servi, le compte n'étant plus actif) et sa copie chiffrée aurait survécu au compte. Il révoque
  désormais par `CalendarFeedService::revocation()` (bloc TCK-2887) ; test `test_erasing_the_account_clears_the_copy`.
- Type front `CalendarFeedState.url` : `string | null`, documenté (rendu à la relecture, nul sans copie,
  absent sous impersonation) — `takussan-web/src/types/agent-crm.ts`, pour TCK-2888.
- Docblocks devenus faux corrigés (modèle, service, contrôleur). Inventaires de colonnes chiffrées
  (`EncryptedColumnsAreHiddenTest`, `BackupVerifyEncryption`) : par découverte des casts, la colonne y
  entre seule — `EncryptedColumnsAreHiddenTest` joué vert.

**Mesures** : `CalendarFeedReadableUrlTest` (9), `CalendarFeedTest` (8), `ImpersonationReadSweepTest`
(3) et les trois gardes d'architecture : 27 verts. Ablations une à une, restaurées par `cp`, md5
vérifié : garde d'impersonation retirée → AC2 et le balayage rougissent (`GET api/me/calendar-feed :
lien d'abonnement d'agenda`) ; copie gardée à la révocation → révocation, rotation, blocage rouges ;
copie non écrite → AC1 rouge ; `try/catch` retiré → copie indéchiffrable rouge (500) ; blocage revenu à
l'ancienne écriture → son test rouge ; révocation retirée de l'effacement → son test rouge. Gardes racine : seule `check-valeurs-arbitraires-app` rouge, sur
`ReglagesDeBail.tsx` (TCK-2921, en cours, pas à moi).
