---
id: TCK-1710
title: "La candidature d'un compte rattache la fiche que l'agence a déjà à ses coordonnées vérifiées, au lieu d'en créer une seconde"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#7-customer"
    - "docs/models-spec.md#règle-1--user--customer"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-158--fiches-client-créées-hors-de-customercontrollerstore"
tags: [back, crm, customers, bookings, pistes]
---

## Contexte

Réf : **P158.01** du fichier de pistes, `validé` (critères V7 et V3 accordés : le dernier
classement, celui du délégué, nomme V3). `CustomerService::findOrCreateFromUser()` ne cherche une
fiche que par `user_id`, puis en crée une dans l'agence du compte (`$user->agency_id`), sans
regarder les fiches que l'agence a déjà : la candidature publique et `POST /api/bookings` d'un
compte qui a un profil dans l'agence y laissent un doublon.

## Décision du porteur

validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

**Recommandation du délégué, retenue** : « dans `findOrCreateFromUser`, consulter
`CustomerDuplicateDetector` sur l'agence visée et rattacher la fiche trouvée seulement si elle n'a
pas de `user_id` et que la correspondance porte sur un téléphone ou un e-mail vérifiés du compte
(`phone_verified_at`, `email_verified_at`), sinon créer comme aujourd'hui ».

**Choix d'implémentation** : la recherche écrit les expressions mêmes du détecteur (téléphone
normalisé par `CustomerPhoneNormalizer`, e-mail replié par `CaseInsensitive`, donc les mêmes
index), sans appeler `CustomerDuplicateDetector::find()`, qui masque l'identifiant d'une fiche au
lecteur sans droit, ici le candidat. Plusieurs fiches trouvées : la plus ancienne (`id`).
L'agence visée reste `$user->agency_id` : la question de l'agence de naissance est P15.01.

## Delta à produire

- [x] `CustomerService::findOrCreateFromUser()` : après la recherche par `user_id`, la fiche de
  l'agence sans compte au téléphone vérifié ou à l'e-mail vérifié du compte reçoit `user_id`
  (`linkUser`) et est rendue ; sinon création comme avant.
- [x] `FicheDuCandidatRattacheeTest` (neuf).

## Critères d'acceptation

- [x] AC1 — fiche de l'agence `77 123 45 67` sans compte, compte `+221771234567` au téléphone
  vérifié : une seule fiche dans l'agence après la candidature, rattachée au compte.
- [x] AC2 — même chose par l'e-mail vérifié, à la casse près.
- [x] AC3 — aucune coordonnée vérifiée : la fiche existante reste sans compte, une fiche neuve est
  créée (comportement d'avant).
- [x] AC4 — fiche déjà liée à un autre compte : elle ne bouge pas, une fiche neuve est créée.

## Hors périmètre

- L'agence où la fiche doit naître pour un visiteur sans profil d'agence (P15.01).
- La sérialisation de la détection et de la création (P158.02).

## Notes d'implémentation

- Ablation : service remis à `43c553036` → 2 rouges (AC1, AC2) ; correctif remis → 4/4 verts.
  `PropertyBookingRequestTest`, `BookingTest`, `CustomerPhoneAndDuplicateTest`,
  `CustomerScopeTest`, `ReservationRejoueeTest` verts.
