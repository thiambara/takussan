---
id: TCK-2351
title: "Le personnel invite le client d'une fiche sans compte à créer le sien : un lien à usage unique, et la fiche reçoit le compte à l'acceptation"
status: done
phase: P2
family: full
estimate: M
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: [TCK-2350]
blocks: [TCK-2352]
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#règle-1--user--customer"
    - "docs/models-spec.md#48-invitation-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-15--parcours-dune-agence-neuve"
  adr:
    - "docs/adr/0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md"
tags: [api, front, crm, customers, invitations, baux, pistes]
---

## Objectif

Une fiche saisie par l'agence (`/app/customers/new`, conversion d'un prospect) peut recevoir le compte
de son client : le personnel l'invite à créer son compte, et l'acceptation relie ce compte à la fiche.

## Contexte

Réf : **P15.01** du fichier de pistes, `validé` (critères V7 et V3 accordés). Second des deux tickets
que la décision demande ; le premier est TCK-2350.

`CustomerService::linkUser()` n'avait d'autre appelant que l'appariement de la candidature
(TCK-1710), et `StoreCustomerRequest` n'accepte pas `user_id`. Sur un bail tiré d'une fiche saisie,
« Demander la signature » s'affichait, puis l'API rendait 422 `lease_signature.tenant_without_account`
(`LeaseSignatureService::request`) : la signature par code (ADR-0042), l'espace du locataire et la
check-list d'entrée n'étaient jamais atteints. Seule restait la voie papier.

## Décision du porteur

validé — validation du porteur (2026-10-25) : en deux tickets : la fiche née d'une candidature naît dans l'agence du bien, rattachée seulement sur une coordonnée vérifiée (patron de TCK-1710), `first()` borné à cette agence ; un geste « inviter le locataire à créer son compte » (lien à usage unique, `linkUser()` à l'acceptation)

Consigne de la session : réutiliser l'infrastructure d'invitation existante (`InvitationService`) si
elle s'y prête. Elle s'y prête : jeton à usage unique de 64 caractères, expiration à 7 jours, rappel,
relance, révocation, e-mail ou SMS, acceptation par un compte neuf ou existant, et un seul point où
l'acceptation rattache (`finalizeAccept`). Il suffit d'un rôle `tenant` dont la cible est la fiche.

## Delta à produire

- [x] `InvitationService` : rôle `tenant` → `Customer` dans `INVITABLE_TYPE_BY_ROLE` ;
  `finalizeAccept` relit la fiche sous verrou et la lie (`linkUser`) avant toute autre écriture ;
  fiche liée entre-temps à un autre compte → 409 `invitation.tenant_already_linked` ; fiche
  supprimée → 410 `invitation.token_revoked`. La garde de statut des profils ne s'applique pas à une
  fiche (son statut est celui du CRM).
- [x] `App\Services\Crm\CustomerInvitationService` : destinataire = l'e-mail de la fiche, à défaut
  son numéro si `auth.phone_login.enabled` ; fiche déjà liée → 409 `customer.invite_already_linked` ;
  aucune coordonnée utilisable → 422 `customer.invite_no_contact`.
- [x] `CustomerPolicy::invite` : lire la fiche ET être du personnel de son agence.
- [x] `POST /api/customers/{customer}/invite` (`customers.invite`, `throttle:invitations-send`),
  `CustomerInvitationController`, `InviteCustomerRequest` (aucun corps, autorisation déléguée).
- [x] Libellés `invitations.roles.tenant`, `errors.customer.invite_*`,
  `errors.invitation.tenant_already_linked` en `fr`, `en` et `wo` (le texte français, wolof en pause).
- [x] Front : `InviterACreerSonCompte` dans l'en-tête de la fiche client, pour une fiche sans compte
  et un lecteur du personnel ; `inviteCustomerToAccount` dans `lib/queries/customers.ts`.
- [x] `docs/features.md` §1.6, `docs/models-spec.md` (Règle 1, Invitation), ADR-0031 (second volet de
  l'amendement P15.01).
- [x] `InvitationDuLocataireTest` (neuf), `InviterACreerSonCompte.test.tsx` (neuf).

## Critères d'acceptation

- [x] AC1 — un agent de A invite une fiche de A sans compte : 201, une invitation `tenant` qui cible
  la fiche, à son e-mail replié ; la fiche reste sans compte. L'acceptation par un compte neuf relie
  ce compte à la fiche, et le lien ne sert plus (410).
- [x] AC2 — un compte existant à cet e-mail, connecté, accepte : il est relié à la fiche.
- [x] AC3 — le compte de l'adresse existe, un autre compte connecté tente d'accepter : 401, la fiche
  reste sans compte, l'invitation reste `sent`.
- [x] AC4 — fiche déjà liée : 409, aucune invitation.
- [x] AC5 — fiche liée à un autre compte entre l'envoi et l'acceptation : 409, rien n'est écrit (ni
  compte, ni lien), l'invitation reste `sent`.
- [x] AC6 — ni e-mail ni numéro, ou numéro seul avec le lien par SMS fermé : 422, aucune invitation ;
  lien par SMS ouvert, le numéro seul suffit.
- [x] AC7 — le personnel d'une autre agence et le bailleur qui a ajouté la fiche : 403.
- [x] AC8 (front) — le bouton envoie l'invitation de la fiche, dit qu'elle est partie et ne se
  représente pas ; un refus de l'API s'affiche tel qu'elle le dit.

## Hypothèses

- Le destinataire n'est jamais saisi au geste : c'est la coordonnée de la fiche. Une adresse libre
  ferait relier la fiche au compte de n'importe quelle adresse (V3).
- Le geste n'est pas une action protégée par le second facteur (`ProtectedActions`), à la différence
  des invitations de bailleur ou d'agent : il ne donne au compte aucun accès à l'agence, seulement
  l'espace du locataire de cette fiche. La route vit donc dans `customers.php`, hors des familles.
- Un compte qui a déjà une fiche dans l'agence peut accepter : il en portera deux, ce que l'espace du
  locataire lit déjà (`DashboardTenantService`). Refuser aurait bloqué l'agence qui a ouvert le bail
  sur la fiche saisie.
- L'invité arrive sur `/app` après l'acceptation (`destinationDInvitation`, branche par défaut) : il
  n'y a pas d'assistant de locataire à ouvrir.
- Le message API de `lease_signature.tenant_without_account` (« signez sur papier ») n'est pas
  réécrit : sa version wolof ne peut pas l'être (wolof en pause).

## Hors périmètre

- Le geste depuis le panneau de signature du bail (le défaut s'y voit) : la décision demande « un
  geste », posé sur la fiche, où vivent les coordonnées du client.
- Relancer ou révoquer l'invitation sans `team.invite` (routes génériques inchangées).

## Notes d'implémentation

- Avant correctif : 8 rouges sur 8 (route absente, 404) ; front : module absent.
- Ablations : le lien de `finalizeAccept` retiré → 3 rouges (AC1, AC2, AC5) ; la clause « personnel
  de l'agence » de la policy retirée → AC7 rouge (201 au lieu de 403) ; la garde « déjà liée » retirée
  → AC4 rouge ; le drapeau du lien par SMS retiré → AC6 rouge. Front : branche « envoyée » et message
  de l'API retirés → 2 rouges. Correctifs remis → 8 et 2 verts.
- Piège : sous `perl -0`, la clause de la policy se trouvait d'abord dans `matchProperties`, qui porte
  la même ligne ; la première ablation, restée verte, visait le mauvais site.
