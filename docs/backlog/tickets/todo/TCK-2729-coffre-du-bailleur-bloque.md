---
id: TCK-2729
title: "Le bailleur bloqué retrouve dans son coffre, en lecture seule, les dossiers de ses biens"
status: todo
phase: P2
family: full
estimate: M
wave: 88
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2655, TCK-2656]
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
  models:
    - "docs/models-spec.md#22-document-"
tags: [full, documents, coffre, bailleur, profil-bloque, suivi-lot-1, decision-porteur]
---

## Objectif utilisateur

Un bailleur que son agence a bloqué peut encore retrouver le contrat et les quittances de son bien dans « Documents »,
au lieu d'un coffre qui ne montre plus aucun de ses biens alors que l'API le laisse les lire.

## Contexte

Suivi de TCK-2656 (vérification du 2026-11-11). Un profil propriétaire `blocked` (`OwnerProfileStatus::Blocked`, posé
par `TeamMemberSuspensionService`) **ne s'active pas** : `ResolveActiveProfile` rend `403 profile.not_accessible`. Or
`DocumentVault::build()` ne range de dossier « bien » que pour un profil propriétaire **actif** (`$activeProfile
instanceof OwnerProfile` → `ownerProperties()`). Résultat : le coffre du bailleur bloqué n'a aucun dossier de bien,
alors que les policies lui laissent la lecture des générés de son bien — épinglé par
`DocumentVaultPrimedVerdictParityTest::test_the_blocked_landlord_reads_the_generated_entries_of_his_property`
(`GET /api/documents/generated?target=property:{id}` → le contrat du bail, téléchargeable). Il ne peut atteindre ces
documents qu'en connaissant l'identifiant du bien.

## Décision

**Décidé par le porteur le 2026-11-11 : (a), la recommandation (« je valide tes recommandations sur les dix points »).**

- **a) (recommandé)** le coffre range aussi, **en lecture seule**, les biens des profils propriétaires bloqués du compte,
  avec les seuls documents que les policies lui ouvrent déjà.
- b) le coffre ne les range pas, et l'écran le dit (« Votre accès bailleur chez <agence> est suspendu ; vos documents
  restent disponibles auprès de l'agence »).

## Contrat de données

- `GET` du coffre (route de `DocumentVaultController`), sans profil propriétaire actif : un dossier `property` par bien
  des profils propriétaires `blocked` du compte, portant `read_only: true` ; ses entrées sont les générés et téléversés que
  `DocumentPolicy::view` (et `Lease`/`Inventory` `view`) lui ouvrent — ni plus, ni moins que `documents/generated`.
- Les dossiers des profils actifs gardent `read_only: false` (ou la clé absente : à fixer, une seule forme).
- Aucun relevé de bailleur (`addStatements`) ni téléversement n'est offert dans un dossier `read_only`.

## Direction UX / Artistique

Le dossier du bien se reconnaît comme figé : pas d'« Ajouter un document », une mention discrète de l'accès suspendu ;
l'aperçu et le téléchargement fonctionnent comme ailleurs.

## Contraintes strictes (métier)

- **Une seule règle de lecture** : l'entrée d'un dossier `read_only` est rendue si et seulement si sa policy la rend
  lisible ; le coffre et `documents/generated` rendent les mêmes générés pour un même bien et un même lecteur.
- La constance du coffre sous amorce (TCK-2655, `MembershipCapabilityResolver::primed()`) vaut aussi pour ces dossiers
  (même nombre de requêtes pour 1 bien bloqué ou 10).
- Un bailleur dont le profil est actif ne voit aucune différence.
- Sous usurpation d'identité, la règle des pièces de profil (retenues) est inchangée.

## Delta à produire

- [ ] `DocumentVault::build()` : biens des profils propriétaires `blocked` du compte, dossier `read_only`, entrées filtrées
      par les policies.
- [ ] Front du coffre : dossier en lecture seule (pas de téléversement, mention de l'accès suspendu).
- [ ] Tests : `DocumentVaultBlockedLandlordTest` (API) ; test du dossier figé (front).
- [ ] `/sync-specs` : `docs/features.md` § 1.10 (le coffre du bailleur bloqué).

## Critères d'acceptation

- [ ] AC1 — Bailleur bloqué B de l'agence A, bien P avec un bail signé et deux quittances : le coffre de B (sans profil
      actif) contient un dossier `property:P`, `read_only: true`, dont les entrées générées égalent, au chemin près, celles
      de `GET /api/documents/generated?target=property:P` pour B.
- [ ] AC2 — Chaque `download_path` de ce dossier rend 200 pour B ; aucun relevé de bailleur n'y figure.
- [ ] AC3 — Un document téléversé du bien que `DocumentPolicy::view` refuse à B n'apparaît pas dans le dossier.
- [ ] AC4 — Le même compte, profil réactivé : le dossier `property:P` redevient normal (`read_only` faux), sous son profil
      actif.
- [ ] AC5 — Coffre d'un bailleur bloqué de 1 bien et de 10 biens : même nombre de requêtes.

## Hors périmètre

- Le blocage lui-même (`TeamMemberSuspensionService`) et ce qu'il ferme ailleurs.
- L'élargissement du test de parité amorcé / non amorcé (TCK-2731).

## Notes d'implémentation

**API (2026-11-13).**

- `DocumentVault::for()` lit une fois les agences des profils propriétaires `blocked` du compte
  (`blockedOwnerAgencies()`), les ajoute aux agences amorcées, et `build()` range leurs biens par le chemin des biens
  actifs (`ownerProperties()`, une requête pour toutes ces agences ; `addTargetFolder`, contrats, états des lieux,
  téléversés), avec `read_only: true`. Ils restent hors des cibles où joindre et aucun relevé ne s'ajoute.
- **Une seule forme** : chaque dossier porte `read_only` (faux par défaut).
- **Décision (team-lead, 2026-11-13)** : les dossiers figés sont ceux de TOUS les profils propriétaires BLOQUÉS du
  compte, **quel que soit le profil actif** ; `read_only` sur chaque dossier, une seule forme ; un bailleur parti
  (`inactive`) ne reçoit rien (ADR-0108, « pas de surface »), un profil `draft` non plus. L'agent de A bailleur
  bloqué de B voit B figé ; le bailleur actif dans A et bloqué dans B voit les deux, A normal.
- **Décision (team-lead, 2026-11-13) — le gel est tenu par l'API, pas seulement masqué** : sur un dossier figé, le
  bloqué n'ajoute aucun document (bien ou bail : 404 `document.owner_not_found`, comme un porteur introuvable),
  aucune version, ne partage ni ne supprime (403) — même sa propre pièce, téléversée quand il était actif. C'est
  la règle existante (`BasePolicy::landlordWrites`, `attachTo` en écriture) ; il n'existe pas de route de
  renommage. Épinglé par `test_nothing_is_written_into_a_frozen_folder`, témoin actif d'abord ; rouge si
  `landlordWrites` laisse passer le bloqué (ablation).
- **Fuites** : un autre bailleur actif de l'agence, l'admin d'une autre agence et le locataire du bail ne voient
  jamais ces dossiers (`test_no_one_else_sees_the_frozen_folders`). La garde est structurelle : les agences figées
  sont lues sur le compte de l'appelant, ses biens par `BailleurDuBien::restreindre`.
- `build()` garde un 3ᵉ argument optionnel (lues sans lui) : `DocumentVaultPrimedVaultParityTest` l'appelle sans
  amorce, et compare donc aussi ces dossiers amorcés et non amorcés.
- **AC3** : sur son bien, `view` refuse au bloqué ce qui tient à un bail d'un AUTRE bailleur (ancien bail du bien) :
  ses pièces, son contrat, ses états des lieux restent dehors — le filtre des baux d'`ownerProperties()`, éprouvé par
  ablation. Un document du bien lui-même, il le lit toujours (`BailleurDuBien`, de tout statut) : aucun n'y est refusé.
- `DocumentVaultBlockedLandlordTest` (12). Ablations : biens figés retirés 7 rouges ; non marqués 5 ; parti compris 1 ;
  baux non filtrés 1 ; `read_only` absent par défaut 1 ; agences bloquées non amorcées 1 (le test sous un profil
  actif d'une autre agence : sans profil actif, `ownAgencies()` amorce déjà toutes les agences du compte). Les biens
  figés offerts au rattachement : vert, la policy `attachTo` les refuse déjà (`bailleurEcrit`).

**Front** : le dossier figé est porté par le coffre de TCK-2656 (`lib/documents/coffre.ts` lit déjà `read_only`).


**Décision 5a du porteur (2026-11-13 ~18:50, point z) — le bailleur bloqué voit et révoque ses liens de partage (back-4).**
- **Le constat** (q1, préexistant) : un lien de partage public créé avant le blocage sert toujours le document, et le
  bailleur bloqué ne pouvait ni le voir ni le révoquer (`share` lui est refusé : `landlordWrites`, TCK-1144).
- **La règle** : `DocumentPolicy::manageOwnShareLinks` — le bailleur **`blocked`** dans l'agence du document (pas le
  bailleur parti, `inactive` : ADR-0108 § 5, il n'écrit rien), qui lit encore le document (`view`), jamais sur un
  document interne. `DocumentPolicy::revokeShareLink` : `share`, ou un lien dont il est le créateur
  (`created_by_id`) sous cette règle. C'est sa seule écriture : il ne crée toujours aucun lien, ne voit ni ne révoque
  ceux des autres.
- **`GET /api/documents/{id}/share-links`** : qui partage voit tous les liens actifs ; le bailleur bloqué, 200 avec ses
  seuls liens (le jeton des autres n'est jamais dans le corps) ; tout autre, 403 comme avant.
  **`DELETE /api/documents/{id}/share/{link}`** : 204 sur son lien, 403 sur celui d'un autre, 404 sous un autre
  document (après l'autorisation, comme avant). Les deux passent toujours par le relais `authorizeDocument`.
- **La fiche** : `abilities.manage_own_share_links`, vrai pour lui sur la fiche d'un document (`avecAuteurs`), jugé
  seulement quand `share` est refusé — faux sur une liste, sans requête de plus. `abilities.share` reste faux : le
  front n'offre pas « Partager », seulement la liste de ses liens et leur révocation (à faire côté front).
- **Tests** : `tests/Feature/Documents/LiensDuBailleurBloqueTest.php` (8) — ses seuls liens sans le jeton des autres ;
  il révoque le sien, pas celui de l'agence ; il ne crée toujours rien ; son
  lien cité sous un autre document → 404 ; parti → 403 partout ; document interne → 403 ; document qu'il ne lit pas →
  403 ; réactivé, il voit tout et partage. `TeamMemberSuspensionTest::test_un_bailleur_bloque_ne_liste_ni_ne_revoque_les_liens_de_partage`
  amendé : la liste lui répond 200 et vide (le lien est celui de l'agence), la révocation reste 403.
- **ADR-0031 § 2 amendé le 2026-11-13** (accord de team-lead) : le bailleur bloqué garde la lecture et la révocation de
  SES liens de partage, seule écriture qui lui reste.
- **L'ability de la fiche** (`abilities.manage_own_share_links`, `DocumentResource`) lit le marqueur de fiche
  `avecAuteurs` de TCK-2773 : elle se livre avec 2773 ou après, avec son épingle (`DocumentAbilitiesTest` : vraie
  sur la fiche du bailleur bloqué, fausse sur la liste, fausse pour le bailleur parti).
- `DocumentAbilitiesTest` amendé (avec l'ability, après 2773) : la fiche du bailleur bloqué porte
  `manage_own_share_links: true`, la liste `false`, le bailleur parti `false`.
  Voisins (abilities, documents internes, coffre du bailleur bloqué, parité amorcée, budget de requêtes de la liste,
  liens de partage, suspension, représentation des dates) : 117 verts.
- **Ablations, toutes rouges puis restaurées** (mesurées quand le test de la fiche vivait encore dans `LiensDuBailleurBloqueTest`) **:** `blocked` élargi aux statuts sans écriture (parti compris) → 2 ;
  `view` retiré de la règle → 1 ; filtre `created_by_id` de la liste retiré → 2 ; contrôle du créateur retiré de
  `revokeShareLink` → 1 ; `authorize('manageOwnShareLinks')` retiré de la liste → 3 ; ability de la fiche forcée à
  faux → 1.
