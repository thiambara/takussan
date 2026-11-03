---
id: TCK-768
title: "Créer au déploiement les règles d'alerte ops_* manquantes, destinées aux super-admins"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#26-audit--traçabilité"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-14--observabilité--ce-quon-ne-verrait-pas-en-production"
tags: [back, alertes, observabilite, pistes]
---

## Contexte

Réf : **P14.03** du fichier de pistes, `validé` (critère accordé : V5). Une alerte `ops_*` ne part
que vers une ligne `alert_rules` active (`AlertRuleService::dispatchForActivity`), et aucun seeder,
aucune commande, rien dans le déploiement n'en crée : sur une base neuve, `alerts:evaluate` écrit
au journal d'audit et nulle part ailleurs.

## Décision du porteur

une commande qui crée les trois règles ops_*, destinataire = les super-admins, appelée par release.sh

## Objectif

`alerts:ensure-ops-rules`, jouée par `takussan-api/docker/release.sh`, crée la règle de chaque
événement d'exploitation qui n'en a aucune.

## Delta à produire

- [x] Commande `alerts:ensure-ops-rules` : pour chaque événement `ops_*` d'`AlertableEvents`
      sans règle, une règle active, canal `email`, destinataires = courriels des super-admins
      actifs (`SuperAdminCooptationService::superAdmins()`).
- [x] `docker/release.sh` l'appelle après `tags:sync-catalog` ; un échec n'arrête pas le
      déploiement.
- [x] `scripts/test-release-reindex.sh` : deux vérifications (appel joué, échec toléré).

## Critères d'acceptation

- [x] AC1 — Base sans règle, deux super-admins : trois règles `ops_*`, actives, en courriel, vers
      ces deux adresses, et pas vers un compte qui n'est pas super-admin.
- [x] AC2 — Rejouée, la commande ne double rien, et une règle existante (coupée, autre canal)
      reste telle quelle.
- [x] AC3 — Sans super-admin, rien n'est créé et la commande réussit.

## Hypothèses (mode sans humain)

- **Une règle existante n'est jamais réécrite**, même si la liste des super-admins a changé : la
  console (`/super-admin/alerts`) reste maîtresse des règles une fois créées. Un super-admin
  ajouté plus tard ne s'ajoute donc pas aux destinataires d'une règle déjà créée.
- **Les événements viennent du catalogue** (`AlertableEvents`, préfixe `ops_`), pas d'une liste
  recopiée : ils sont trois aujourd'hui. Un événement d'exploitation ajouté au catalogue recevra
  sa règle au déploiement suivant.
- Sans super-admin (premier déploiement), la commande avertit et réussit.

## Hors périmètre

- La vérification dans le runbook de la phase F (`docs/infra/`, chemin fermé à l'implémenteur).

## Notes d'implémentation

- Ablation : commande retirée → `EnsureOperationalAlertRulesTest` 4 rouges ; appel retiré de
  `release.sh` → `test-release-reindex.sh` 1 rouge ; remis → 4 verts et 15 vérifications vertes.
