---
id: TCK-883
title: "Sauvegardes : la consigne avant une migration irréversible, la procédure après une restauration, la clé hors du serveur, la survie d'une donnée effacée"
status: done
phase: P1
family: technique
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: [TCK-885]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, sauvegardes, rgpd, adr-0028, adr-0044, pistes]
---

## Contexte

Pistes P42.01, P42.02, P42.05 et P42.06 du
[fichier de pistes](../../plans/2026-10-15-pistes-d-amelioration.md), décisions du porteur du
2026-10-18 (traitées hors agents, en session) :

- **P42.01** — D-05bis se disait « documenté » par un encadré du guide de déploiement ; ce guide,
  `docs/infra/deploy-preview.html`, a été supprimé le 2026-09-13 (9f6f6620a), et `release.sh` migre
  sans sauvegarde préalable.
- **P42.02** — ADR-0044 renvoyait à `hebergement.md` la garde d'`APP_KEY` hors de l'hébergeur ; rien
  n'y était écrit.
- **P42.05** — la restauration s'arrêtait au chargement : ni index de recherche, ni file `jobs`, ni
  jetons révoqués, ni effacements.
- **P42.06** — rien ne disait combien de temps une donnée effacée survit dans les sauvegardes, ni
  qu'une restauration ressuscite les comptes effacés depuis.

## Delta à produire

- `hebergement.md`, runbook : « Avant une migration irréversible », « Après une restauration » (six
  étapes, vérifiées contre le code : `account:execute-deletions`, colonnes de
  `account_deletion_requests`, marqueur `.search-shape-importee`, Redis de la pile depuis TCK-880).
- `hebergement.md`, relevé : la ligne `APP_KEY` hors du serveur, avec l'empreinte de la préproduction.
- ADR-0044 amendé (survie dans les sauvegardes, effacements rejoués, clé hors du serveur, volume
  `storage` de production non sauvegardé).
- Plan F3 : la clé de production rangée avant le premier déploiement ; la sauvegarde du volume
  `storage` retirée.
- L'ardoise : D-05bis renvoie à la consigne qui existe.

## Critères d'acceptation

- [x] **AC1** — L'empreinte de l'`APP_KEY` de la préproduction est mesurée sur le serveur et sur la
      copie du poste du porteur : `e3227fc80eb0` des deux côtés (2026-10-18), sans afficher la clé.
- [x] **AC2** — `node scripts/check-doc-links.mjs` passe : D-05bis, ADR-0044 et le plan renvoient à
      des fichiers présents.

## Hors périmètre

- La liste des effacements tenue hors de la base : [TCK-885](TCK-885-liste-des-effacements-hors-de-la-base.md).
- Ranger la clé dans le gestionnaire de mots de passe : au porteur.
