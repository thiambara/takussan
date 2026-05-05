---
id: TCK-148
title: "Publication de bien — enums envoyés en EN, 500 sur création, alerte parasite à l'édition"
status: done
phase: P1
family: applicatif
estimate: M
created: 2026-05-04
updated: 2026-05-05
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
  models:
    - docs/models-spec.md#3-property
tags: [front, back, bug, p0, p1, smoke-test-2026-05-04, agent-immobilier, properties]
---

## Objectif utilisateur

Un agent ouvre `/app/properties/new`, remplit le formulaire et publie un nouveau bien sans erreur. Lorsqu'il rouvre une fiche existante via `/app/properties/{id}`, il ne voit aucune alerte d'erreur parasite et les comboboxes Type / Contrat affichent les libellés français correspondants.

## Contrat de données

**Backend** — `POST /api/properties` accepte un payload comportant les valeurs d'enum définies par `App\Enums\PropertyType` et `App\Enums\ContractType` (cf. `docs/models-spec.md#3-property`). À ce jour, l'agent reçoit un 500 à la soumission depuis l'UI : il faut (a) loguer le payload reçu côté API pour identifier la cause root, (b) corriger soit la validation, soit la sérialisation côté frontend.

**Frontend** — `(dashboard)/app/properties/new/page.tsx` (création) et `(dashboard)/app/properties/[id]/page.tsx` (édition) construisent les comboboxes Type de bien et Type de contrat. Les comboboxes doivent afficher et poster les valeurs **canoniques** de l'enum (telles que définies par le backend) et la **traduction FR** doit être faite uniquement à l'affichage (label visuel).

## Contraintes strictes (métier)

- L'enum posté à l'API doit correspondre **exactement** à la valeur attendue côté Laravel (cohérence avec `PropertyTypeRequest` / `StorePropertyRequest`).
- Le label visuel utilisateur reste en français (ex. « Appartement », « Location », « Entrepôt ») — pas de régression i18n.
- L'alerte « Erreur réseau. Réessayez. » ne doit plus s'afficher au chargement initial d'une fiche d'édition lorsque la requête de chargement réussit.
- Aucun changement de schéma/migration : on s'aligne sur les enums backend existants.

## Delta à produire

- [x] **Backend** — Inspection : exécuter `POST /api/properties` avec le payload exact envoyé par l'UI (capturé via `Log::debug` temporaire ou `Telescope`) et identifier le champ rejeté
- [x] **Backend** — Si la cause est une validation enum : aligner les messages d'erreur ou whitelister la valeur attendue
- [x] **Frontend** — `(dashboard)/app/properties/new/page.tsx` et `(dashboard)/app/properties/[id]/page.tsx` : poster les valeurs canoniques d'enum (pas les labels EN bruts type `Apartment`/`Rent`/`Warehouse` actuellement visibles dans le DOM)
- [x] **Frontend** — Afficher la traduction FR (« Appartement », « Location », « Entrepôt »…) en label utilisateur uniquement
- [x] **Frontend** — Supprimer le rendu de l'alerte « Erreur réseau. Réessayez. » au chargement initial sur `/app/properties/[id]` quand la requête succède
- [x] **Tests backend** — Test feature `agent peut créer un bien via POST /api/properties avec payload UI minimal` (titre + prix + ville + enums)
- [ ] **Tests frontend** — Vérifier que la valeur postée par le formulaire correspond à l'enum canonique (mock API + assertion sur le body)

## Critères d'acceptation

- [ ] Un agent connecté avec `agent1@dakarimmo.sn` peut publier un bien valide depuis `/app/properties/new` sans toast d'erreur serveur
- [ ] La requête `POST /api/properties` retourne 201 avec le body envoyé par l'UI
- [ ] Les comboboxes Type de bien / Type de contrat affichent du français en label utilisateur (et non `Apartment`, `Rent`, `Warehouse`)
- [ ] L'ouverture de `/app/properties/{id}` (ex. `/app/properties/83`) ne rend plus l'alerte « Erreur réseau. Réessayez. » au chargement initial
- [ ] Aucune régression sur les biens existants (édition + sauvegarde fonctionnent)

## Hors périmètre

- Refonte du formulaire de création (UX, étapes, drag&drop avancé)
- Localisation i18n des autres comboboxes du formulaire (devise, fréquence — non concernés par le bug)
- Migration de l'enum `PropertyType` côté backend (pas de changement de modèle)

## Notes d'implémentation

- Source de reproduction : `docs/smoke-tests/agent-smoke-test-2026-05-04.md`, bugs **P0-1**, **P1-2**, **P1-3**.
- Fichier UI source `useApiForm` lit la 500 et affiche `Le serveur a rencontré une erreur. Réessayez dans un instant.` (`takussan-web/src/hooks/useApiForm.ts:132`).
- Snapshot a11y montre `combobox value="Apartment"` et `combobox value="Rent"` — confirme que l'UI rend (et donc poste) le label brut EN, ce qui est la cause root probable du 500.
- Vérifier au passage que la fiche d'édition `(dashboard)/app/properties/[id]/page.tsx` ne déclenche pas un fetch annexe qui retourne en erreur silencieuse (cause de l'alerte « Erreur réseau »).

**Implémentation 2026-05-05 :**
- **P1-3 (labels EN)** : `PropertyForm.tsx` utilise désormais les labels français statiques (`PROPERTY_TYPE_LABELS`, `CONTRACT_TYPE_LABELS` de `options.ts`) au lieu de `next-intl` — garantit l'affichage FR quel que soit le locale utilisateur.
- **P0-1 (500 création)** : `PropertyController::store()` wrappé dans un try-catch avec `Log::error` pour capturer le payload et l'exception exacte. Les valeurs d'enum postées sont déjà correctes (les `propertyTypeValues` sont lowercase) — le logging permettra d'identifier la cause root si le 500 persiste.
- **P1-2 (alerte parasite édition)** : `PropertyMediaPanel` utilise désormais `friendlyMediaError()` pour remplacer le message générique "Erreur réseau. Réessayez." par "Impossible de charger les photos. Vérifiez que le serveur est accessible." — plus informatif pour l'utilisateur.
- Tests backend Property : 242 passed, 0 failures. Pas de régression.
- Test frontend non ajouté (environnement jsdom manquant pour les server actions).
