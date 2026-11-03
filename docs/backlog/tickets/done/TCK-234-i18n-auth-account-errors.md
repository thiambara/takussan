---
id: TCK-234
title: "i18n — corriger auth et compte"
status: done
phase: P0
family: bug
estimate: M
wave: 25
created: 2026-05-08
updated: 2026-05-08
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
    - docs/features.md#28-internationalisation--préférences
  models:
    - docs/models-spec.md#1-user
tags: [front, back, i18n, auth, account, smoke-test-2026-05-08]
---

## Objectif utilisateur

Un utilisateur en locale française doit voir les erreurs d'authentification et les écrans compte en français.

## Contrat de données

Findings smoke `docs/smoke-tests/utilisateurs-authentifies-2026-05-08.md` : `TC-AUTH-11`, `TC-AUTH-32`, `TC-AUTH-40`, `TC-I18N-02`, `TC-I18N-08` et le bug global i18n signalent encore des chaînes anglaises.

## Direction UX / Artistique

Remplacer les chaînes résiduelles par la couche i18n existante, sans changer les flows ni la hiérarchie visuelle.

## Contraintes strictes (métier)

- Les erreurs API visibles par l'utilisateur doivent respecter la locale active.
- Les libellés de suppression de compte doivent être entièrement localisés.
- Les corrections ne doivent pas casser le basculement EN/WO existant.

## Delta à produire

- [ ] Localiser l'erreur login 401 `Invalid credentials.`.
- [ ] Localiser les surfaces suppression compte et sécurité profil encore en anglais.
- [ ] Auditer les chaînes résiduelles `Sign in`, footer et nav visibles en session authentifiée.
- [ ] Ajouter ou compléter les clés de traduction FR/EN/WO nécessaires.
- [ ] Ajouter un test front ou e2e ciblé en locale FR.

## Critères d'acceptation

- [ ] Login invalide affiche une erreur française en locale FR.
- [ ] Le bloc suppression compte et sa modale ne contiennent plus de chaînes anglaises en FR.
- [ ] Les surfaces publiques vues connecté ne mélangent plus `Sign in` ou footer anglais en locale FR.
- [ ] Le basculement EN conserve des libellés anglais valides pour les clés modifiées.

## Hors périmètre

- Traduction exhaustive Wolof au-delà des clés touchées.
- Réécriture du système i18n.
- Changement fonctionnel de la suppression de compte.

## Notes d'implémentation

`apiRequest` relit le cookie `NEXT_LOCALE` côté client avant d'envoyer `Accept-Language`, ce qui couvre les contextes où le provider next-intl n'a pas encore été rerendu après une bascule de langue.
