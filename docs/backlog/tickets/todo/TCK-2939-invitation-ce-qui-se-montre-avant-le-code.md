---
id: TCK-2939
title: "Invitation : ce qui se montre avant le code (biens du bailleur avec leur quartier, adresse de l'agence, chiffres de l'étape du numéro), le numéro d'une invitation SMS modifiable, et les essais restants d'un code faux"
status: todo
phase: P2
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2941, TCK-2949]
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
    - "docs/features.md#21-authentification--comptes"
  models:
    - "docs/models-spec.md#48-invitation-"
tags: [back, entree, invitation, securite, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

L'invité reconnaît, avant d'entrer, l'agence et les biens qui l'attendent ; il corrige le numéro que l'agence a mal saisi ; et sait combien d'essais il lui reste quand il se trompe de code.

## Contrat de données

Écarts de TCK-2611 (`#2`, `#3`, `#4`, `ignorer` « essais restants ») et de TCK-2613 (`#8`, « rien avant le code »). Relevé du 2026-11-15 : l'aperçu public (`PublicInvitationPreviewResource`) rend la **ville seule** de l'agence et, pour un bailleur, ses biens sans quartier ni photo ; le code d'une invitation SMS part au numéro de l'invitation, sans modification possible ; `…/verify` répond `invitation.code_invalid` sans compte d'essais ; l'étape du numéro des assistants ne rend aucun chiffre avant le code.

- Aperçu public : `agency.address` (adresse publique de la fiche d'agence), et pour un bailleur `pending_properties[]` : `title`, `neighborhood`, `cover_url` (vignette).
- `POST /api/public/invitations/{token}/code` accepte `phone` même pour une invitation SMS (numéro corrigé), avec les règles du § 5 réécrites par l'ADR.
- `…/verify` (422) rend `attempts_left`.
- Lien expiré (410, ADR-0094 § 2) : `inviter_first_name` (prénom seul, comme l'aperçu du § 1) — écart de l'audit, invitation e2 (« nom de l'invitante remplacé par la date »).
- Assistants (étape du numéro, bailleur / agent / prestataire) : `GET /api/me/profiles/{profile}/invite-summary` (`InviteSummaryController`) rend le résumé chiffré du rôle (« N biens suivis par l'agence » + titres, « Ton dernier loyer », « N pièces à envoyer »), au titulaire du profil, **dès que l'invitation est acceptée** et avant la vérification du numéro. Si l'amendement le refuse, AC4 sort du ticket et TCK-2949 est clos `obsolete`.

## Contraintes strictes (métier)

- **Contredit [ADR-0094](../../../adr/0094-l-invitation-se-lit-avant-d-entrer-et-s-accepte-par-code.md)** § 3 (« jamais une adresse d'agence au-delà de la ville ») et § 5 (« pour une invitation par SMS, le code part au numéro de l'invitation ») : le premier item du delta est l'**amendement d'ADR-0094**, validé par le porteur, avant tout code. Il tranche aussi la décision « rien avant le code » de TCK-2613 (`#8`). Ce qui n'est pas accepté par le porteur sort du ticket et reste un écart motivé dans les fiches.
- L'adresse de l'agence est celle que sa fiche publique montre déjà (aucune adresse privée) ; le quartier d'un bien est celui que l'annonce publique montre (jamais l'adresse exacte d'un bien non publié).
- Numéro modifié : l'invitation est alors acceptée sur ce numéro vérifié ; mêmes limiteurs, même verrou (ADR-0033 § 5-6) ; journalisé (« numéro corrigé par l'invité »).
- `attempts_left` est celui du verrou existant, jamais une seconde comptabilité ; aucune énumération (même réponse qu'un compte existe ou non).

## Delta à produire

- [ ] Amendement d'ADR-0094 (§ 3, § 5) et de la décision « rien avant le code » (TCK-2613 #8).
- [ ] `PublicInvitationPreviewResource` : adresse de l'agence, quartier et vignette des biens du bailleur.
- [ ] `InvitationCodeController@send` : numéro corrigé d'une invitation SMS ; `@verify` : `attempts_left`.
- [ ] `invite-summary` ; `inviter_first_name` sur le 410.
- [ ] Tests : `PublicInvitationPreviewTest` (adresse, vignettes, rien de privé), `InvitationCodePhoneChangeTest`, `InvitationCodeAttemptsLeftTest`, `InviteNumberStepSummaryTest`.

## Critères d'acceptation

- [ ] AC1 — L'aperçu d'une invitation de bailleur avec 3 biens en attente rend, pour chacun, titre, quartier et vignette ; l'agence a son adresse publique. Un bien non publié ne rend jamais d'adresse exacte (test).
- [ ] AC2 — Pour une invitation par SMS au numéro A, `POST …/code` avec `phone: B` envoie le code à B ; `…/verify` avec ce code accepte l'invitation pour le compte au numéro B vérifié ; le journal porte le changement.
- [ ] AC3 — Un code faux rend 422 `invitation.code_invalid` avec `attempts_left: 2` après le premier essai, `1` après le second ; au verrou, la réponse actuelle du verrou.
- [ ] AC4 — Un jeton expiré rend 410 avec `inviter_first_name` (prénom seul ; jamais le nom de famille ni le contact de l'invitant).
- [ ] AC5 — `invite-summary` d'un bailleur invité dont l'agence suit 3 biens et a encaissé un loyer de 350 000 le 5 nov. reçoit `{properties_count: 3, titles: […], last_rent: {amount: 350000, paid_at: …}, missing_documents: 2}` (selon l'ADR amendé) ; avant acceptation de l'invitation, rien.

## Hors périmètre

- Les écrans (TCK-2941 invitation, TCK-2949 étape du numéro). La voie par appel (TCK-2940).

## Notes d'implémentation

2026-11-15 — implémenté (agent délégué, arbre `takussan-manques`). Amendement écrit AVANT le code :
[ADR-0094, § « Amendement du 2026-11-15 »](../../../adr/0094-l-invitation-se-lit-avant-d-entrer-et-s-accepte-par-code.md)
(« valide tes choix » du porteur : l'option la plus sûre à chaque point).

**Prémisses re-mesurées, et ce qui différait** :
- **L'adresse de l'agence** : la fiche publique (`PublicAgencyController::show`) ne rend **que la ville** — aucune « adresse
  publique » au-delà. L'aperçu rend déjà `agency.city` : **aucun champ d'adresse ajouté**, ADR-0094 § 3 maintenu sur ce point
  (amendement § 1). AC1 « l'agence a son adresse publique » est tenu par `city`.
- **Le code d'erreur** : un code faux rend `phone_code_invalid` (celui que le front lit), pas `invitation.code_invalid`, qui
  n'existe pas. Gardé tel quel, `attempts_left` ajouté.
- **AC3 « 2 puis 1 »** ne correspond à aucun compteur existant : le limiteur `auth-phone-verify` (4 / 15 min) arrête
  l'invité le premier, les essais du code (5) et le verrou `LoginLock` (10) ensuite. `attempts_left` = le **plus petit** des
  trois restes, sans seconde comptabilité → **3, 2, 1, 0** puis 429 (et 423 quand le verrou du numéro est déjà entamé).
- « Si l'amendement le refuse, **AC4** sort » vise en fait **AC5** (`invite-summary`) ; l'amendement l'accepte (§ 6).
- `awaiting.properties_count` n'était pas borné à l'agence qui invite : il l'est désormais (bien d'une autre agence ni
  compté ni montré).

**Décisions tranchées (sécurité — l'aperçu est lu sans compte par quiconque tient le lien)** :
- `awaiting.pending_properties[]` : **3 au plus**, clés exactes `title`, `neighborhood` (quartier seul, comme l'annonce
  publique), `cover_url` (vignette publique `PublicPhotoUrl::upTo(…, 'thumbnail')`, jamais l'original). Ni rue, ni libellé,
  ni coordonnées, ni identifiant, ni prix, ni locataire — un test par champ refusé (`rue`, `label`, lat/long, prix, nom du
  fichier original, `id`, `slug`) et un test de clés exactes.
- 410 : `inviter_first_name` (prénom seul) sur **tous** les états clos (expiré, révoqué, accepté) — la même exposition que
  l'aperçu ; ni nom de famille ni contact (testé).
- Numéro corrigé (invitation par SMS) : le code part au numéro du corps, l'invitation est **réadressée** au numéro vérifié du
  compte dans la transaction de l'acceptation (un refus la défait), journal `invitation_phone_corrected` avec numéros
  **masqués** (libellé `admin.audit.events.invitation_phone_corrected` posé). Seau du limiteur de vérification = numéro
  effectif. **Invitation partagée (ADR-0123) : correction refusée (422)**, plus une garde 403 dans le service.
  La voie mot de passe et l'acceptation connectée gardent la règle d'avant.
- `GET /api/me/profiles/{profile}/invite-summary` (`profile` composite `owner:12`, résolu par
  `ActiveProfileResolver::resolve` — titulaire ET actif, sinon 404) : `{role, properties_count, titles (3 au plus),
  last_rent: {amount, paid_at}|null, missing_documents}`. Bailleur : biens du compte dans l'agence du profil + biens encore
  saisis pour le profil ; dernier loyer = `LeasePayment` de type `rent`, `paid`, le plus récent. Agent : parc de son agence,
  ni titres ni loyer. Prestataire : pièces seules (`properties_count` nul). Pièces = `PiecesDuProfil`, obligatoires et
  `missing`.

- Exposition résiduelle assumée : `title` est le texte libre saisi par l'agence (AC1 l'exige) ; le nom du locataire d'un
  bail sur un bien en attente ne sort pas (testé).
- Mesuré : l'acceptation passe tout profil brouillon à `active` (`AcceptationNActiveQueLeBrouillonTest`), donc la résolution
  « titulaire ET actif » répond dès l'acceptation (test par la voie réelle : code → verify → session → résumé). Aucun index
  unique sur `invitations.phone` : le réadressage ne peut pas lever de contrainte.

**Preuves** : `PublicInvitationPreviewTest` 16/16, `InvitationCodePhoneChangeTest` 6/6, `InvitationCodeAttemptsLeftTest`
4/4, `InviteNumberStepSummaryTest` 7/7 ; voisins `InvitationAcceptByCodeTest` 15/15 (son cas « numéro du corps ignoré
par SMS » réécrit : c'est désormais une correction), `AgentInvitationShareTest` 12/12 ; `ImpersonationReadSweepTest`
(paramètre `profile` rempli), `ValeursEnListeParcoursDesRoutesTest` (route déclarée hors parcours), `DateInventoryByValueTest`,
trois gardes d'architecture, `scripts/check-*.mjs` tous verts ; front : `AuditTrail -t TCK-2676`, `check:i18n`.
Ablations une à une (restaurées par `cp`, md5 vérifié) toutes rouges : `street` ajoutée, borne d'agence retirée (aperçu),
`inviter_first_name` en nom complet, `cover_url` original, réadressage retiré, `prohibitedIf` retiré, seau du limiteur
remis sur le numéro de l'invitation, `attempts_left` retiré, borne d'agence retirée (résumé), résolution du profil sans titulaire.
