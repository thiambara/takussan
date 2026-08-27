---
id: TCK-362
title: "File KYC super-admin — décider depuis la file, et nommer les agences"
status: todo
phase: P1
family: front
estimate: M
wave: 46
created: 2026-08-26
updated: 2026-08-26
depends_on: [TCK-357]
blocks: []
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
    - docs/features.md#29-administration--configuration
  models: []
tags: [front, super-admin, kyc, moderation]
---

## Objectif utilisateur

Le super-admin traite un dossier KYC sans quitter la file : il voit de quelle agence il s'agit — par son nom —, ouvre les pièces, vérifie ou rejette avec motif, et passe au suivant.

## Contrat de données

Endpoints existants, aucun à créer :

- `GET /api/admin/kyc` — la file (paginée)
- `GET /api/admin/kyc/{dossier}` — le détail
- `POST /api/admin/kyc/{dossier}/verify` · `POST /api/admin/kyc/{dossier}/reject`

`postKycReview` est déjà écrit côté front et déjà câblé — mais depuis la fiche agence, pas depuis la file. Le nom de l'agence est à obtenir via `include=` sur la file plutôt qu'en `N+1` requêtes.

## Direction UX / Artistique

L'écran actuel liste des dossiers, affiche « Agence #12 » — l'identifiant technique à la place du nom — et son seul bouton renvoie vers la fiche agence. **Une file d'attente qu'on ne peut pas vider depuis la file n'est pas une file, c'est un index.** C'est le seul défaut du lot qui coûte du temps humain tous les jours.

- **Le patron existe déjà dans le dépôt** : `ModerationDecisionPanel` de `/super-admin/moderation` fait exactement ce travail — file à gauche, décision à droite, motif obligatoire, invalidation après décision. Le reprendre plutôt que d'en inventer un second.
- Le nom de l'agence est le sujet de la ligne ; l'identifiant est un détail secondaire.
- Filtre par statut (`pending`, `submitted`, `verified`, `rejected`) : la file ne se lit pas sans lui.
- La pagination locale (deux boutons écrits sur place, alors que le composant `Pagination` existe et que les clés i18n `superAdmin.pages.pagination` sont déjà partagées) passe sur le composant commun.
- État vide via `EmptyState`, pas un `<p>` « Aucun dossier ».

## Contraintes strictes (métier)

- Un rejet **exige un motif** — même règle que la modération et que les actions support.
- La décision invalide immédiatement la file et le compteur associé ; l'opérateur ne doit jamais décider deux fois sur le même dossier.
- Le workflow d'états du dossier (`pending → submitted → verified | rejected`) est porté par l'API : le front n'en propose que les transitions que l'API autorise pour l'état courant.
- Aucune requête par ligne pour obtenir le nom de l'agence.

## Delta à produire

- [ ] Panneau de décision latéral sur `/super-admin/kyc`, sur le patron de `ModerationDecisionPanel`
- [ ] Nom d'agence dans la file via `include=` (plus aucun « Agence #ID » affiché seul)
- [ ] Filtre par statut, porté par l'URL pour que la vue soit partageable
- [ ] Remplacement de la pagination locale par le composant `Pagination`
- [ ] État vide via `EmptyState`
- [ ] Tests : décision depuis la file (vérifier / rejeter), rejet sans motif refusé, invalidation de la file après décision, filtre par statut

## Critères d'acceptation

- [ ] AC1 — un dossier peut être vérifié **et** rejeté sans quitter `/super-admin/kyc`
- [ ] AC2 — aucune ligne de la file n'affiche un identifiant numérique en guise de nom d'agence
- [ ] AC3 — un rejet sans motif est refusé côté UI **et** le test le prouve en tentant la soumission (un AC coché par un simple champ `required` en HTML ne suffit pas : le test doit soumettre)
- [ ] AC4 — après une décision, la file et le compteur associé sont à jour sans rechargement de page
- [ ] AC5 — le filtre par statut est reflété dans l'URL et rejoué au rechargement
- [ ] AC6 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent

## Hors périmètre

- Le KYC par profil (`OwnerProfile`, `AgentProfile`…), distinct du KYC d'agence.
- La fiche agence, qui garde son propre bloc KYC.
- Toute modification du workflow d'états côté API.

## Notes d'implémentation

**Le ticket disait « le nom de l'agence est à obtenir via `include=` » — et l'`include` ne suffisait
pas.** `KycController::index` chargeait `subject` depuis toujours (`->with(['subject', 'reviewer'])`)
et `fetchAdminAgencyKyc` envoyait déjà `include=subject,reviewer` ; ce qui manquait était côté
SORTIE : `KycDossierResource` n'émettait que `subject_id`. La relation était chargée et jamais
sérialisée. Le correctif touche donc l'API (`KycDossierResource`), ce que le ticket ne prévoyait pas.

**Le motif n'est exigé que pour le REJET**, contrairement au patron de `ModerationDecisionPanel` qui
l'exige pour ses quatre décisions : `KycController::verify` ne prend aucun motif, et
`RejectKycDossierRequest` pose `min:5`. Le plancher de 5 est recopié dans `kyc-queue.tsx`
(`MOTIF_LONGUEUR_MIN`) faute de contrat qui le transporte.

**Le bouton « Rejeter » reste actif sans motif et l'annonce** au lieu d'être désactivé — c'est ce qui
rend AC3 éprouvable en soumettant réellement, et un bouton grisé sans explication renvoie l'opérateur
chercher ce qui bloque.

**Le motif se vide par `key={dossier.id}` sur le panneau, pas par un effet.** Le React Compiler
(ADR-0015) refuse `setState` synchrone dans un `useEffect`
(`Calling setState synchronously within an effect can trigger cascading renders`).

**Le compteur « À instruire » est une requête distincte** (`per_page=1`, seul `meta.total` est lu)
plutôt que `meta.total` de la file : il doit rester juste quand l'opérateur regarde les vérifiés. Il
vit sous le préfixe `['super-admin', 'kyc']`, donc la décision l'invalide avec la file en un appel.

**Vérifié par ablation** — chaque garde retirée fait rougir son test : `include=subject` (1 rouge),
la garde du motif (1), l'invalidation (1), le filtre écrit dans l'URL (1), et le `subject` de la
ressource côté API (1).

⚠ **Le `N+1` de médias n'est PAS traité** : `KycDossierResource` appelle `getMedia('documents')` par
dossier, soit une requête par ligne de file. Hors périmètre de ce ticket (qui ne parle que du nom de
l'agence), mais le test API le contourne explicitement en ne comptant que les requêtes touchant
`agencies` — un compteur global confondrait les deux.
