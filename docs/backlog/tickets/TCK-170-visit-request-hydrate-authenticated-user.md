---
id: TCK-170
title: Demande de visite — hydrater visitor_name/email/phone depuis l'utilisateur connecté
status: done
phase: P1
family: bug
estimate: S
created: 2026-05-05
updated: 2026-05-05
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#13-réservations-courte-durée--visites
  models:
    - docs/models-spec.md#17-propertyvisit
tags: [back, front, visits]
---

## Objectif utilisateur

Un locataire/acheteur connecté doit pouvoir demander une visite depuis la fiche bien sans devoir re-saisir son nom, son email et son téléphone — la requête doit être pré-remplie par son profil.

## Contrat de données

Bug bout-en-bout sur la demande de visite côté authentifié.

- La modale customer (`Demander une visite`) collecte uniquement `scheduled_at`, `type`, `notes`. Aucun champ Nom / Email / Téléphone.
- L'API attend pourtant `visitor_name`, `visitor_email`, `visitor_phone` (validation 422 observée sur le smoke test 2026-05-05) — pertinent pour les visites publiques anonymes mais pas pour les utilisateurs connectés.
- Endpoint concerné : POST création de visite (server action côté Next.js → API Laravel).

## Contraintes strictes (métier)

- Pour un visiteur **anonyme** (pas dans le scope de ce ticket — voir TCK-161 visiteur), les 3 champs restent obligatoires côté API.
- Pour un utilisateur **authentifié**, le backend doit auto-remplir `visitor_name = full_name`, `visitor_email = email`, `visitor_phone = phone` à partir de l'utilisateur courant si la requête ne les fournit pas.
- `customer_id` doit être renseigné sur la ligne `property_visits` créée pour l'utilisateur connecté (cf. TCK-171 pour la cohérence list/detail).
- Pas de leak d'informations — le `visitor_email` stocké est celui du compte, jamais un email arbitraire envoyé par le client.

## Delta à produire

- [ ] FormRequest `StorePropertyVisitRequest` : rendre `visitor_name`, `visitor_email`, `visitor_phone` `nullable` quand l'utilisateur est authentifié (`Auth::check()`), `required` sinon.
- [ ] Service / controller : si user authentifié, hydrater les 3 champs depuis `Auth::user()` avant persistance ; renseigner `customer_id = Auth::id()`.
- [ ] Server action côté Next.js : nettoyer la payload pour ne plus envoyer `$undefined` sur `notes` (observé `"notes":"$undefined"` dans le smoke test).
- [ ] Test `PropertyVisitCreateTest` : 3 scénarios — anonyme (422 si champs manquants), authentifié sans champs (201 + champs hydratés), authentifié avec champs custom (champs custom ignorés au profit du profil).
- [ ] Test e2e (manuel ou Playwright) : depuis `/properties/[slug]` connecté, modale → soumission → toast OK → visite visible dans `/app/visits`.

## Critères d'acceptation

- [ ] Un customer connecté soumet la modale sans erreur 422 ; la visite apparaît au statut `pending` dans `/app/visits`.
- [ ] La ligne `property_visits` créée a `customer_id`, `visitor_name`, `visitor_email`, `visitor_phone` renseignés (depuis `users`).
- [ ] Un POST anonyme (sans token) sur le même endpoint sans `visitor_*` continue de renvoyer 422.
- [ ] Le frontend n'envoie plus `"notes":"$undefined"` mais omet le champ ou envoie `null`.

## Hors périmètre

- Affichage de la liste des visites (TCK-171).
- Rappel J-1 par email/SMS (TC-LOC-10, hors scope).
- Re-design de la modale (libellés `in_person` à mapper en français : couvert par TCK-179 enums i18n).

## Notes d'implémentation

_(à remplir par implementing-specs)_
