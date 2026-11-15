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

_(à remplir par implementing-specs)_
