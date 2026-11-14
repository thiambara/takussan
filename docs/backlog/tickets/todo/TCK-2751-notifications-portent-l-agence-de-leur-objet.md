---
id: TCK-2751
title: "Les notifications d'objets d'agence portent target.agency_id — la bascule d'espace de la cloche a enfin un objet"
status: todo
phase: P1
family: back
estimate: M
wave: 90
created: 2026-11-12
updated: 2026-11-12
depends_on: [TCK-2634]
blocks: []
spec_refs:
  features:
    - "docs/features.md"
  models:
    - "docs/models-spec.md"
tags: [back, notifications, multi-espaces, suite-de-tck-2634]
---

## Objectif utilisateur

Une personne qui travaille dans deux espaces (agent d'une agence, propriétaire dans une autre) ouvre depuis la cloche
une notification d'un objet d'agence et arrive sur l'objet, dans le bon espace, au lieu de « Vous n'avez pas accès à
cette action ».

## Constat (contre-vérification de TCK-2634, 2026-11-12, base de démo, lecture seule)

- Aucune des ~3 500 notifications de la démo ne porte `target.agency_id` (relevé SQL par code : `visit.requested`,
  `maintenance.*`, `lease_payment.*`, `booking.*`). Seuls `ThresholdAlertTriggered` et `AgencyUpgrade*` l'émettent.
- Conséquence vue : le compte 176 (agent agence 1, propriétaire agence 2), dans l'espace propriétaire, ouvre une
  « Intervention clôturée » de l'agence 1 → `/app/maintenance/111` rend « Vous n'avez pas accès à cette action.
  Réessayer », sans bascule ni pastille « Dans <espace> ». La bascule de TCK-2634 (AC5) n'a donc pas d'objet sur les
  données réelles.
- « Réessayer » sur un 403 est trompeur : réessayer ne change rien.

## Delta

1. Chaque émetteur de notification dont la cible appartient à une agence pose `target.agency_id` (inventaire des
   émetteurs d'abord, dans les Notes).
2. Les notifications déjà émises : décider (dans les Notes) entre une reprise des données et l'absence de reprise.
3. Le 403 d'un objet d'un autre espace ne propose pas « Réessayer ».

## Critères d'acceptation

- [x] AC1 — ~~une garde liste les émetteurs d'objets d'agence et rougit sur un émetteur qui ne pose pas `agency_id`.~~
  **Réécrit le 2026-11-14 (décision de la session déléguante)** : une garde classe chaque genre de cible
  (`NotificationTarget::PATHS`) en objet d'agence, section d'agence ou hors agence, et rougit sur un genre non classé ou
  sur un objet d'agence qui ne rend pas son agence au membre qui lit. _Motif_ : l'agence ne se pose plus à l'émission
  mais se résout à la lecture, pour le lecteur (cf. Notes) ; il n'y a donc plus d'émetteur à garder, mais des genres
  à classer et des résolveurs à éprouver.
  _Preuve_ : `AgenceDeLaCibleTest::test_chaque_genre_de_cible_est_classe_une_seule_fois` (ablation : `credits` retiré →
  rouge) ; `test_chaque_objet_d_agence_rend_son_agence_au_membre`.
- [x] AC2 — le compte 176, dans l'espace propriétaire, ouvre une notification de maintenance de l'agence 1 : la bascule
  vers l'espace agent part (PATCH active-profile), l'objet s'affiche.
  _Preuve_ : mesuré sur la démo, en lecture seule (requêtes dans le noyau, transaction annulée), le 2026-11-14 : compte 176
  sous `owner:29` → ses 34 notifications portent `agency_id`, celle de l'intervention 111 rend `agency_id: 1` ;
  `GET /api/maintenance-requests/111` rend 403 sous `owner:29` et 200 sous `agent:20`, le seul profil de 176 dans
  l'agence 1. Même scène en test : `test_l_agent_qui_lit_dans_un_autre_espace_recoit_l_agence_de_l_intervention`
  (`/api/me/profiles` liste `agent:<id>` dans l'agence A, `PATCH active-profile` rend 200), et côté front
  `cloche.tck-2751.test.tsx` : le verbe « Confirmer » d'une intervention de l'agence 1 appelle la bascule vers
  `agent:20`, puis ouvre `/app/maintenance/111` ; sans `agency_id`, la ligne reste un lien simple. Le parcours au
  navigateur n'a pas été rejoué (la bascule écrit `users.metadata` en base de démo).
- [x] AC3 — un 403 ne propose pas « Réessayer ».
  _Preuve_ : `QueryBoundary` (le bloc d'erreur des 17 vues qui l'emploient, dont la fiche d'intervention) ne rend plus la
  reprise sur un `ApiError` 403 ; `QueryBoundary.tck-2751.test.tsx` (ablation → rouge) ; 500 et erreur réseau la gardent.
  _Limite_ : les vues de détail qui ont leur propre bloc d'erreur (bail, bien, demande) n'ont pas été relues ; la
  réservation et la visite traitaient déjà le 403 à part (« relève d'une autre agence »).

## Notes d'implémentation

**Décision (2026-11-14, posée à team-lead en a/b ; sans réponse au moment de livrer, mise en œuvre sur la recommandation, réversible) : `agency_id` se résout à la LECTURE, pas à
l'émission.** `App\Domain\Notifications\AgenceDeLaCible`, appelée par `AppNotificationResource` et préchargée par
`NotificationController::index` (une requête par genre d'objet et par page) : genre + id de la cible → agence de
l'objet, rendue au lecteur **seulement** s'il tient un profil ACTIF dans cette agence (`User::activeAgencyIds()`).
Raisons :

- **Isolation** : posée à l'émission sans condition, la clé aurait révélé l'identifiant de l'agence au locataire, au
  client, au prestataire (profil sans agence) — et le front rend une ligne INERTE quand `agency_id` désigne une agence où
  le lecteur n'a pas de profil : leurs notifications auraient cessé d'être des liens. L'appartenance change après
  l'émission (départ, suspension) : seule la lecture peut la juger au bon moment.
- **Reprise (Delta 2) : aucune.** Les lignes déjà émises, y compris celles dont la cible se déduit de `data`
  (`NotificationTarget::derive()`), sont couvertes sans écriture en base.
- La lecture passe par le constructeur de requêtes, hors des portées d'Eloquent : la visibilité d'un objet dépend du
  profil actif, celui-là même qui n'est pas le bon.
- **Une seule porte pour les deux sources** (condition de la session, 2026-11-14) : l'agence déjà posée par
  `forAgency()` (section d'agence, TCK-1761) ne sort, elle aussi, que vers le lecteur qui tient un profil actif dans
  cette agence. Le membre parti ou suspendu qui relit ses anciennes notifications n'y lit plus l'identifiant
  (`test_l_agence_stockee_passe_la_meme_porte`, ablation de la porte → rouge). **Pour une section, la ligne reste
  inerte, comme avant** (décision de la session) : l'API rend `target: null`, que le front lit déjà comme une ligne
  sans lien ni verbe. Un lien simple vers `/app/agency/finances` aurait ouvert, sans le dire, les finances de l'agence
  du profil actif — la régression que TCK-1761 avait fermée (`test_le_membre_parti_actif_ailleurs_n_a_aucun_lien_vers_une_section`,
  ablation → 2 rouges ; front : `cloche.tck-2751.test.tsx`). Une cible d'OBJET garde son lien simple, comme avant : la
  fiche refuse elle-même (403). La famille de la ligne se lit toujours sur la cible stockée.
- **Un objet supprimé, en corbeille (ou dont le bien l'est) ou introuvable** ne rend pas de clé, sans erreur
  (`test_l_objet_supprime_ou_introuvable_ne_rend_pas_de_cle`, deux ablations → rouges).
- **Pas de N+1** : `test_le_nombre_de_requetes_ne_croit_pas_avec_la_page` (8 contre 20 lignes de quatre sources, même
  nombre de requêtes ; ablation de la précharge → rouge).

**Inventaire des genres de cible** (la liste fait foi dans `AgenceDeLaCible`, gardée par le test) :

- objets d'agence, résolus à la lecture : `lease` (`leases.agency_id`), `booking` (`bookings.agency_id`), `property`,
  `lead` (`property_contact_leads.agency_id`), `visit` et `maintenance` (par `properties.agency_id`). Émetteurs relevés :
  `VisitNotifier`, `SendPropertyVisitReminders`, `NotifyMaintenanceParticipants`, `MaintenanceRequestController`,
  `UrgentMaintenanceCreatedNotification`, `SendLeasePaymentReminders`, `LeasePaymentService`, `PaymentGatewayService`,
  `LeaseSignatureService`, `NotifyLandlordOfRentReview`, `NotifyPartiesOfRentRefund`, `SendRentReceiptAfterOnlinePayment`,
  `BookingNotificationParams`, `ContactLeadService`, les avis de bien et de boost, et les 29 classes sans cible
  (cible déduite de `data`) ;
- sections d'agence (l'émetteur pose `forAgency`) : `payments`, `payouts`, `payout_approvals`, `service_provider_bills`,
  `commissions`, `agency_kyc`, `finances`, `agency_billing`, `team`, `owners`, `service_providers`, `role_delegations`,
  `agency_settings`, `audit`, `review_moderation`, `property_moderation`, `credits` ;
- hors agence : `conversation`, `reviews`, `saved_searches`, `favorites`, `kyc_review`, `agency_upgrade_request`.

**Reste hors périmètre, relevé** (tickets à part, écrits par la session) : deux émetteurs de `payments` adressés au
personnel ne posent pas `forAgency` (`SendLeasePaymentReminders` digest des retards, `PaymentGatewayService` doublon sans
bail) ; les vues de détail qui ont leur propre bloc d'erreur sur un 403 (bail, bien, demande).

**Cas vérifié** : un prestataire assigné qui est aussi propriétaire dans l'agence reçoit la clé, la cloche le bascule sur
son profil de propriétaire, et l'intervention s'y ouvre (son accès de prestataire ne dépend pas du profil actif).
