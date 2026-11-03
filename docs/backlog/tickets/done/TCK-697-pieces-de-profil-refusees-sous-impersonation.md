---
id: TCK-697
title: "Sous impersonation, les pièces (id_card, rib, ninea) rattachées à un profil sont refusées par DocumentPolicy::view et retirées de GET /api/documents"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
    - docs/features.md#110-documents--contrats
  models:
    - docs/models-spec.md#22-document-
    - docs/models-spec.md#83-impersonationsession-
  adr:
    - docs/adr/0055-impersonation-en-lecture-seule-sans-jeton-dans-la-page.md
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-23--lectures-de-données-personnelles-sans-step-up-face-à-refused_reads
tags: [api, document, impersonation, rgpd, pistes]
---

## Contexte

Réf : **P23.01** du fichier de pistes, `validé` par le porteur (critère accordé : V2, avec V3 que
le classement nomme aussi).

ADR-0055 §3 range toute lecture `GET` qui rend une pièce d'identité dans
`EnforceImpersonationReadOnly::REFUSED_READS`. Seule `api/kyc/documents/*` y figure, qui ne sert
que les pièces d'un dossier KYC d'agence. Les pièces des assistants d'accueil
(`kind=cni|rib|ninea`) sont des `Document` rattachés à `OwnerProfile`, `AgentProfile` ou
`ServiceProviderProfile`, téléversés par le titulaire : sous le jeton d'impersonation,
`GET /api/documents` les liste, `GET /api/documents/{id}` les rend, et leur `file_url` signée
ouvre le fichier. Un préfixe de route ne suffit pas : `api/documents*` sert aussi les baux.

## Décision du porteur

refus sous impersonation des Document id_card, rib et ninea rattachés à un profil, dans DocumentPolicy::view et retirés de index ; un test par profil

## Objectif utilisateur

Un opérateur qui impersonne un bailleur, un agent ou un prestataire ne lit pas la pièce d'identité,
le RIB ni le NINEA que la cible a déposés à son accueil.

## Contrat de données

- Aucun changement de schéma ni de forme de réponse.
- `GET /api/documents` sous impersonation : les pièces de profil sont absentes de la liste.
- `GET /api/documents/{id}` (et `…/versions*`, qui autorisent par `view`) sous impersonation, sur une
  pièce de profil : 403.

## Contraintes strictes (métier)

- « Pièce » = `type` ∈ {`id_card`, `rib`, `ninea`} ; « rattachée à un profil » = `documentable_type`
  ∈ les cinq classes de `App\Models\Profiles\` qui sont des profils.
- Hors impersonation, rien ne change : la cible lit toujours ses pièces.
- Sous impersonation, un document de profil qui n'est pas une pièce (licence, photo, assurance)
  reste lisible.

## Delta à produire

- [x] `Document::PIECE_TYPES`, `Document::PROFILE_TYPES`, `isProfilePiece()` et le scope
      `excludingProfilePieces()`.
- [x] `DocumentPolicy::view()` refuse une pièce de profil quand `ImpersonationContext` est actif.
- [x] `DocumentController::index()` applique le scope quand `ImpersonationContext` est actif.
- [x] Test `tests/Feature/Admin/Platform/ImpersonationProfilePiecesTest.php` : un cas par profil.

## Critères d'acceptation

- [x] AC1 — Pour chacun des trois profils, une `cni` téléversée par la cible n'apparaît pas dans
      `GET /api/documents` sous le jeton d'impersonation, et `GET /api/documents/{id}` comme
      `GET /api/documents/{id}/versions` rendent 403.
- [x] AC2 — La même cible, sous son propre jeton, liste et lit sa pièce (200).
- [x] AC3 — Sous impersonation, la licence d'un agent (`type=other`) reste listée et lisible.

## Hypothèses (mode sans humain)

- Les profils retenus sont les cinq classes de profil (`OwnerProfile`, `AgentProfile`,
  `AgencyAdminProfile`, `ServiceProviderProfile`, `PlatformProfile`) : la décision dit « un profil »,
  sans en nommer. Seuls les trois premiers assistants écrivent des pièces aujourd'hui.
- `passport` n'est pas dans la liste : la décision nomme `id_card`, `rib` et `ninea`, et aucun
  assistant n'écrit de passeport.

## Hors périmètre

- `GET /api/search/documents` (`DocumentSearchService`) n'est pas touché : la décision nomme `view`
  et `index`. S'il rend les pièces du téléverseur, il les rend aussi sous impersonation (non
  mesuré).
- La journalisation des lectures de pièces (P23.04).

## Notes d'implémentation

- Ablation, deux fois : sans la clause de `view()`, 3 rouges (« Expected 403 but received 200 ») ;
  sans le scope dans `index()`, 3 rouges (« an array does not contain »). Le cas de la licence reste
  vert dans les deux : il garde l'étroitesse du refus, pas le refus.
- Le scope écrit la négation colonne par colonne, `NULL` compris : `NOT (a AND b)` écarterait aussi
  les lignes dont une colonne est nulle.
