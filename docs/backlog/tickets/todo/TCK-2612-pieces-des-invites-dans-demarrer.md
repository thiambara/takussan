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

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
