---
id: TCK-1492
title: "Contrôle puis insertion : sept gestes verrouillent leur ligne mère avant le contrôle, un double envoi ne rend plus 500 (P92.07)"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-92"
  features:
    - "docs/features.md"
tags: [api, concurrency, pistes]
---

## Objectif

Qu'un double envoi (double clic, deux onglets, nouvel essai réseau) sur sept gestes qui contrôlent
« déjà là ? » puis écrivent sous une contrainte d'unicité rende l'issue que chaque geste écrit déjà,
et non un 500 `UniqueConstraintViolationException`.

## Contexte

Réf : **P92.07** du fichier de pistes (angle 92), `validé` le 2026-10-21 (validation en bloc ;
critère V7 accordé : le choix de la voie et de l'issue du second envoi).

Le contrôle courait sans verrou, et pour trois gestes hors de toute transaction. Le mesureur a
rejoué la course pour `addParticipants` et `replaceCapabilities` (500 sur l'index) ; les cinq autres
sont établis à la lecture. `takussan-api/CLAUDE.md` § Migrations, piège 2, écrit déjà la règle :
le point de sérialisation portable est la ligne parent.

## Décision du porteur

> validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

### Choix de l'implémenteur

La `Piste` propose trois voies : verrou de la ligne mère, `insertOrIgnore` et relecture, filet
global (P92.09). Retenue : **celle qu'elle cite en premier, et que recommande la `Mesure` du
délégué** : `lockForUpdate()` sur la ligne mère, dans la transaction qui écrit, avant le contrôle.
Le second envoi, sérialisé derrière le premier, rend l'issue que le geste écrit déjà :

| Geste | Ligne mère verrouillée | Issue du second envoi (inchangée) |
|---|---|---|
| `GroupConversationService::addParticipants` | la conversation | membre déjà présent sauté (contrat du docblock) |
| `AgencyRoleService::replaceCapabilities` | le rôle | dernier enregistrement gagnant ; `added`/`removed` lus sous le verrou |
| `AgencyUpgradeRequestService::submit` | l'agence (contrôle entré dans la transaction) | 422 `pending_exists` |
| `BankStatementController::store` | l'agence (contrôle entré dans une transaction) | 422 `reconciliation.duplicate_file` |
| `IntegrationController::store` | l'agence ; **verrou consultatif** par fournisseur pour une intégration de plateforme (`agency_id` nul, sans ligne mère), comme `SuperAdminCooptationService::lockCooptationSlot` | 422 `provider` |
| `PropertyCollaboratorController::store` | le bien (contrôle entré dans la transaction, avant le plafond de commission) | 422 `property.collaborator_exists` |
| `InvitationService::ensureServiceProviderCollaboration` | le profil du prestataire (déjà dans la transaction d'acceptation) | 409 `already_member` |

Pas d'`insertOrIgnore` (il masquerait la course au lieu de la trancher), pas de filet global
(P92.09, décision structurelle à écrire d'abord en ADR).

Hypothèse : le relevé bancaire n'entre pas en V1 — aucun montant n'est calculé ni écrit
autrement ; seul l'ordre du contrôle de doublon change. Les capacités d'un rôle n'entrent pas en
V2 — la table de vérité ne change pas, seul l'ordre de deux enregistrements simultanés est fixé.

## Delta produit

- [x] Les sept sites ci-dessus.
- [x] `tests/Feature/Concurrency/DoubleEnvoiVerrouilleLaLigneMereTest.php` (8 cas : un par site,
      deux pour l'intégration).

## Critères d'acceptation

- [x] AC1 — pour chaque geste, le `SELECT … FOR UPDATE` de la ligne mère (ou le
      `pg_advisory_xact_lock`) précède le contrôle, et le contrôle comme l'écriture courent au même
      niveau de transaction que le verrou, au-dessus de celui de `RefreshDatabase`.
- [x] AC2 — les refus séquentiels écrits restent inchangés (classes voisines vertes).

## Notes d'implémentation

- **Ce que le test observe** : l'ordre des requêtes et leur niveau de transaction, par
  `DB::listen`. Deux connexions réelles ne sont pas jouables sous `RefreshDatabase` : la ligne mère,
  créée dans la transaction jamais validée du test, est invisible à l'autre connexion.
- **Piège** : `StoreBankStatementRequest` fait déjà un `exists()` sur `(agency_id, file_hash)`,
  hors verrou ; c'est un refus anticipé lisible, et le motif du test vise le contrôle du contrôleur.
- **Ablation** : les sept fichiers d'`app/` remis à `pre-dev` → 8 rouges sur 8 (7 sans verrou,
  1 — le collaborateur — avec le verrou du plafond après le contrôle) ; correctif remis → 8/8.
