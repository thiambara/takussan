---
id: TCK-2612
title: "Les pièces des invités deviennent une liste à faire : NINEA en numéro, état par pièce, étape « Pièces » de « Démarrer » pour l'agent et le prestataire"
status: todo
phase: P1
family: back
estimate: M
wave: 86
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: [TCK-2613, TCK-2614]
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models:
    - "docs/models-spec.md#34-ownerprofile-"
    - "docs/models-spec.md#35-agentprofile-"
    - "docs/models-spec.md#37-serviceproviderprofile-"
    - "docs/models-spec.md#42-kycdossier-"
tags: [back, onboarding, kyc, audit-ux, app]
---

## Objectif utilisateur

Le bailleur, l'agent ou le prestataire invité qui n'a pas ses pièces sous la main entre quand même, et retrouve dans son espace la liste de ce qui reste à envoyer, avec l'état de chaque pièce ; le bailleur tape son NINEA au lieu de le photographier.

## Contrat de données

Re-mesure sur `dev` (1bce3798a) :

- Pièces : `POST /api/me/owner-profiles/{id}/kyc/upload|submit`, `POST /api/me/agent-profiles/{id}/kyc/upload|submit`, `POST /api/me/profiles/{sp_profile}/kyc/upload` (pas de `submit` prestataire). Le NINEA du bailleur ne s'envoie qu'en **fichier** (`DocumentType::Ninea`, `UploadKycOwnerProfileRequest`) ; le champ `owner_profiles.tax_id` existe, chiffré et masqué (TCK-601), mais **aucune route ne permet au bailleur de l'écrire**.
- « Démarrer » : `GET /api/me/espace/demarrage` (`DemarrageDeLEspace`, TCK-2479) rend `premier_bien` + `kyc` pour un bailleur, les étapes d'agence pour l'admin, et **rien** pour un agent ou un prestataire.
- Aucune lecture ne rend l'état **par pièce** (seule la soumission rend `docs`).

**À créer** :

- `PATCH /api/me/owner-profiles/{owner_profile}/tax-id` → `MeOwnerProfileController@updateTaxId`, `UpdateOwnerTaxIdRequest` : `tax_id` = NINEA, espaces retirés, 7 chiffres puis le COFI (un chiffre, une lettre, un chiffre), sinon 422 ; écrit chiffré ; réponse masquée.
- `GET /api/me/pieces` → `MePiecesController` : pour le profil actif (bailleur, agent, prestataire), la liste des pièces — `code`, `required` (booléen), `kind` (`file` | `number` | `file_and_number`), `state` (`missing` | `sent` | `verified` | `rejected`) — dérivée des `Document` vivants du profil et de la vérification portée par `KycDossier` ; si la vérification n'existe pas par pièce, `verified` se lit sur le dossier entier (à re-mesurer à l'ouverture du ticket, et à dire dans les notes).
- `DemarrageDeLEspace` : étape `pieces` pour `AgentProfile` et `ServiceProviderProfile`, `faite` quand toutes les pièces requises sont `sent` ou `verified` ; l'étape `kyc` du bailleur compte le NINEA saisi en numéro comme la pièce NINEA.

## Direction UX / Artistique

Sans objet : ticket back. L'écran qui consomme ce contrat est dit dans « Hors périmètre ».

## Contraintes strictes (métier)

- La pièce NINEA en fichier reste acceptée (aucun appelant ne casse) ; un NINEA saisi et une pièce NINEA envoyée valent tous deux « envoyé ».
- Lecture du NINEA en clair : règle d'aujourd'hui (admin de l'agence et super-admin, second facteur récent, journalisée — ADR-0070) ; le bailleur ne relit que la forme masquée.
- Les pièces restent **non bloquantes** : aucune route ne refuse l'usage de l'espace faute de pièce.
- Seul le titulaire du profil écrit son NINEA (`assertOwner`) ; 403 sinon.
- L'assurance RC pro du prestataire reste facultative (`required: false`).

## Delta à produire

- [ ] Route, contrôleur, FormRequest du NINEA.
- [ ] `MePiecesController` et sa ressource ; route `GET /api/me/pieces`.
- [ ] `DemarrageDeLEspace` : étape `pieces` (agent, prestataire), NINEA saisi compté pour le bailleur.
- [ ] Tests : `OwnerTaxIdTest` (format, chiffré en base, réponse masquée, autre compte → 403) ; `MePiecesTest` (trois profils, quatre états) ; `DemarrageDeLEspaceTest` étendu (agent sans pièce → `pieces` non faite ; toutes envoyées → faite ; bailleur à NINEA saisi → `kyc` compte la pièce).

## Critères d'acceptation

- [ ] AC1 — `PATCH …/tax-id {tax_id: "0 123 456 7G2"}` rend 200, la colonne en base n'est pas lisible en clair, la réponse porte la forme masquée ; `"12345"` rend 422.
- [ ] AC2 — Un agent sans pièce : `GET /api/me/espace/demarrage` contient `{code: "pieces", faite: false}` (sur `dev` : `etapes: []`).
- [ ] AC3 — `GET /api/me/pieces` d'un bailleur ayant envoyé son RIB et saisi son NINEA : RIB `sent`, NINEA `sent`, pièce d'identité `missing`.

## Hors périmètre

- La vérification des pièces par l'agence (famille 6, KYC).
- Les écrans (TCK-2613, TCK-2614).

## Notes d'implémentation

Re-mesure du 2026-11-11 sur `882002ea9` (branche `feat/audit-ux-app-lot-1`) :

- **La vérification est portée PAR PIÈCE, pas par un dossier** : `KycDossier` n'est attaché qu'aux agences (aucun profil n'en a un) ; chaque pièce de profil porte `documents.is_verified` (vidé à chaque nouvel envoi, `ProfilePieces`). `verified` se lit donc sur la pièce — l'inverse du repli que prévoyait le ticket.
- **`rejected` n'est jamais rendu** : rien ne consigne aujourd'hui le refus d'une pièce de profil (ni colonne, ni dossier). La valeur reste au contrat (`PiecesDuProfil::ETATS`) pour l'écran de TCK-2614 ; la vérification par l'agence est hors périmètre (famille 6).
- **Pièces et caractère requis** (décision d'implémentation, une seule constante dans `App\Services\Kyc\PiecesDuProfil`) : les pièces sont exactement celles que les envois acceptent (`KYC_KIND_TO_TYPE` des trois requêtes), `code` = la sorte de l'envoi — bailleur `cni`, `rib`, `ninea` ; agent `license`, `cni`, `photo` ; prestataire `cni`, `insurance`. Toutes requises sauf l'assurance RC pro (TCK-2614 ne marque « facultative » qu'elle). « Requise » ne bloque rien.
- **`kind`** : `file_and_number` pour le NINEA seul (tapé ou joint, l'un ou l'autre vaut `sent`) ; `file` pour le reste. Aucune pièce n'est `number` seul aujourd'hui ; la carte professionnelle de l'agent reste `file` — `agent_profiles.license_number` n'a aucun écrivain côté agent.
- **Étape `kyc` du bailleur** : faite si `metadata.kyc.submitted_at` est posé (la règle d'avant, gardée : aucun bailleur qui a soumis ne voit l'étape revenir) **ou** si ses pièces requises sont toutes envoyées, le NINEA tapé comptant comme la pièce.
- **Étape `pieces`** de l'agent et du prestataire : seule étape de leur « Démarrer ». Le front d'aujourd'hui (`demarrer.ts`) ignore un code qu'il ne connaît pas : rien ne s'affiche avant TCK-2614.
- **Pas de classe `Resource`** pour `GET /api/me/pieces` : une pièce n'est pas un modèle et ne porte aucune date ; le service rend les quatre clés, le contrôleur les sert telles quelles.
- **Format du NINEA** : 7 chiffres puis le COFI (chiffre, lettre, chiffre), espaces retirés et lettre mise en majuscule (`0 123 456 7g2` → `01234567G2`). Règle propre à la saisie du bailleur : le contrôle de forme du NINEA d'agence reste différé (D-68). Le titulaire est jugé dans `authorize()` (403 avant un 422) ; le super-admin y passe, comme pour l'envoi des pièces (`AuthorizesTransitionally::ownsProfile`).
- **Journal** : la saisie trace `owner_tax_id_set` (journal `Onboarding`) sans la valeur ; le journal du modèle ne relit que `status` et `agency_role_id` (`OwnerProfile::AUDIT_ONLY`). Le test vérifie qu'aucune ligne d'`activity_log` ne porte le numéro.
