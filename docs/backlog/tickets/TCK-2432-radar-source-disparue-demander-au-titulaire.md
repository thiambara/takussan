---
id: TCK-2432
title: "Radar : bien publié dont l'annonce source a disparu — demander au titulaire si le bien est toujours disponible"
status: review
phase: P3
family: full
estimate: M
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2393]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, front, radar, observatoire, notifications, adr-0077, adr-0083]
---

## Objectif utilisateur

Un bien publié par le Radar ne reste pas en ligne des semaines après avoir été loué ou vendu ailleurs.

## Contexte

TCK-2393 lève une alerte (`radar_source_listing_gone`) quand l'annonce source d'un bien publié disparaît :
elle prévient l'équipe par les règles d'alerte de la console, rien de plus. Le titulaire du bien n'en sait
rien, et le bien reste public.

## Delta à produire

- [x] À la disparition, une notification au titulaire du bien (« votre bien est-il toujours disponible ? »),
      avec un geste pour le marquer loué, vendu ou toujours disponible.
- [x] Sans réponse après un délai en configuration, une proposition de retrait à l'équipe (jamais un
      retrait automatique).

## Critères d'acceptation

- [x] AC1 — La disparition d'une source notifie le titulaire une seule fois par disparition.

## Hors périmètre

- Retirer le bien automatiquement.

## Notes d'implémentation

- **Où vit la règle** : `RadarAvailabilityCheck` (question, réponse, proposition), appelé par `RadarSourceWatch::alert()`
  dans la transaction qui constate la disparition ; la proposition par `radar:observe-sources`. ADR-0083 amendé.
- **AC1 sous course** : marqueur `radar_listings.availability_asked_at`, posé par `UPDATE … WHERE … IS NULL` sous le verrou de
  la ligne du bien ; le retour de l'annonce l'efface avec la réponse et la proposition (`resetColumns()`). Prouvé par
  `RadarAvailabilityCheckTest` (rejeu de la commande, double appel avec copie périmée, retour puis nouvelle disparition).
- **Le titulaire est `properties.user_id`** : un compte, jamais un numéro. Code ni `mobile()` ni `reachesContacts()` ;
  `mobileBorne: false` en plus. Les annonces d'un annonceur STOP ou `do_not_contact` ne sont de toute façon pas jugées
  (ADR-0083 §3), et la révocation archive ses biens : le test couvre le seul cas restant (le doublon d'un tiers disparaît,
  la publication est d'un annonceur STOP) — la question part au compte, aucun envoi à la demande.
- **Préférences** : nouvel interrupteur `property_availability_check` (`PreferenceResolver::EVENTS`, matrice du front,
  groupe « Biens »). Cloche toujours, e-mail par défaut, aucun canal mobile.
- **Front** : `QuestionDeDisponibilite` sur la fiche `/app/properties/{id}` (cible de la notification), trois gestes ;
  textes du code dans `lang/*/notifications.php` et `messages/*.json` (`notifications.codes.property.source_listing_gone`).

### Décisions prises en autonomie, à revoir

1. **Déclencheur : la DERNIÈRE source en ligne du bien.** Retenu : on ne questionne que quand plus aucune annonce collectée
   du bien n'est en ligne (`other_sources_online` = 0). Écarté : questionner à chaque source disparue. Raison : le doublon
   d'un intermédiaire qui disparaît dit peu de chose, et le titulaire ne connaît peut-être pas cette annonce-là.
2. **Biens questionnés : ceux que le Radar a publiés.** Retenu : un bien dont une annonce collectée porte le `property_id`.
   Écarté : tout bien rattaché, doublons de biens du catalogue compris. Raison : ADR-0083 §4 — l'agence apprendrait que la
   plateforme surveille ses annonces ailleurs. L'équipe reste alertée par `radar_source_listing_gone`.
3. **Bien hors vitrine : pas de question, pas de proposition.** Retenu : `Property::public()` exigé. Écarté : questionner
   tout bien publié un jour. Raison : un bien loué, archivé ou privé n'a rien à retirer.
4. **Qui répond : qui peut modifier le bien** (policy `update`, comme `PUT …/status`). Écarté : le titulaire seul. Raison :
   moins restrictif — l'agent responsable ou l'admin de l'agence peuvent répondre à sa place.
5. **Loué/vendu sur un bien déjà sorti de la vitrine** : la réponse est notée, le statut n'est pas touché. Écarté : écraser
   un statut `draft`/`archived`. Raison : ne pas remettre `archived_at` à nul par une réponse à une question.
6. **Annonceur STOP devenu titulaire (compte réclamé)** : la question suit les préférences de son compte, comme toute
   notification produit (consigne du brief). Écarté : le taire. Raison : il a un compte, et c'est son bien.
7. **Interrupteur de préférence dédié**, cloche non désactivable comme partout. Écarté : code non désactivable
   (`preferenceEvent()` nul). Raison : c'est une question de produit, pas un avis de sécurité.
8. **Proposition = événement alertable** `radar_withdrawal_proposed` (règles de la console), une par bien. Écarté : une file
   dédiée à l'écran. Raison : modèle existant (`radar_source_listing_gone`), rien de neuf à maintenir ; une file pourra lire
   `withdrawal_proposed_at`.
9. **Délai** `radar.observe.owner_answer_days` = 7, en config sans variable d'environnement. Écarté : une clé `.env`. Raison :
   la CI prend `.env.example` comme environnement de test, une clé vide y écraserait le défaut.
10. **Réponse sans question ouverte** : 200 ; loué ou vendu s'appliquent quand même (le geste vaut `PUT …/status`),
    « toujours disponible » ne note rien. Écarté : 409. Raison : un geste en retard (annonce revenue entre-temps) ne doit
    pas afficher d'erreur.

## Reste sur dev

- Passe à `done` à la fusion de TCK-2392 (PR #1595) puis de TCK-2393 (`feat/radar-observatoire`) sur `dev` : cette branche
  en part. Tous les AC sont prouvés par des tests exécutés. Le porteur (ou la session) bascule le statut à la fusion.
- La PR de spec commune reporte le texte proposé dans le rapport (`features.md` § 2.12, préférences de notification).
