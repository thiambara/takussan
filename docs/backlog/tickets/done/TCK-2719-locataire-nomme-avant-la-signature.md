---
id: TCK-2719
title: "Un bail ne part pas en signature tant que son locataire n'a pas de nom"
status: done
phase: P2
family: back
estimate: S
wave: 86
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2605]
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#82-leasesignature-"
    - "docs/models-spec.md#7-customer"
tags: [back, baux, signature, nom-absent, suivi-lot-1, decision-porteur]
---

## Objectif utilisateur

L'agent qui envoie un bail en signature apprend, avant que le contrat ne soit figé, que le locataire n'a pas de nom — et
le contrat signé désigne toujours son locataire par son nom.

## Contexte

Suivi de TCK-2605. Un compte ouvert par e-mail ou par téléphone naît sans prénom ni nom ; la fiche créée depuis ce compte
aussi (`CustomerService::rattacherOuCreer`). `LeaseSignatureService::request()` exige un compte au locataire
(`lease_signature.tenant_without_account`, ADR-0042 §5) mais **pas de nom** : le contrat est figé
(`contract_sha256`, octets conservés) avec une ligne « Locataire » vide ou, après TCK-2718, son seul repli (e-mail ou
téléphone). Un contrat signé ne se régénère jamais.

## Décision

**Décidé par le porteur le 2026-11-11 : (a), la recommandation (« je valide tout »).**

- **a) (recommandé)** la demande de signature est refusée tant que la fiche du locataire n'a ni prénom ni nom :
  `422 lease_signature.tenant_without_name`, l'agent complète la fiche puis renvoie.
- b) accepter le repli (e-mail ou téléphone, TCK-2718) comme désignation suffisante sur un contrat signé.

## Contrat de données

- `POST` de demande de signature (route existante de `LeaseSignatureController`) : `422 lease_signature.tenant_without_name`
  quand `trim(first_name.' '.last_name) === ''` sur la fiche du locataire **relue** (la lecture de base du service, pas le
  modèle de l'appelant).
- Rien ne change pour un bail déjà `pending_signature` ou signé.

## Contraintes strictes (métier)

- Le contrôle court **avant** tout gel (aucun `contract_sha256`, aucun média écrit) et dans l'ordre des refus existants :
  `not_requestable`, puis `tenant_without_account`, puis `tenant_without_name`.
- Le nom du **bailleur** n'est pas exigé (il a un repli et une raison sociale possible, TCK-2315).

## Delta à produire

- [ ] `LeaseSignatureService::request()` : garde du nom, après celle du compte.
- [ ] Code `lease_signature.tenant_without_name` dans `lang/{fr,en,wo}` (wo = français) ; le front affiche le message de
      l'API (aucun écran neuf).
- [ ] Tests : `LeaseSignatureTenantNameTest`.

## Critères d'acceptation

- [ ] AC1 — Bail `draft` dont la fiche du locataire (avec compte) a `first_name = last_name = ''` : la demande de
      signature rend 422 `lease_signature.tenant_without_name`, le bail reste `draft`, `contract_sha256` nul, aucun média
      `signed_contract` / contrat figé.
- [ ] AC2 — La même fiche reçoit « Awa » : la demande passe (comportement d'aujourd'hui).
- [ ] AC3 — Fiche sans compte ET sans nom : 422 `lease_signature.tenant_without_account` (l'ordre des refus est gardé).

## Hors périmètre

- Le repli d'affichage dans les PDF (TCK-2718).
- La voie papier (bail sans signature électronique).

## Notes d'implémentation

_(à remplir par implementing-specs)_

## Vérification (2026-11-11)

Vérification adverse acceptée : les 3 AC tiennent. Le 422 n'écrit rien : la ligne du bail, ses médias, ses signatures, le journal et les notifications restent identiques. L'agent lit la prose localisée de l'erreur, pas un code brut. `freezeRenewal` ne demande pas de signature : un renouvellement qui en exige une naît `pending_signature` et passe par la demande, déjà gardée. Il reste donc sans garde, et un test le confirme. Mineurs, corrigés au lot 2 :
- un locataire avec un nom seul n'était pas testé ;
- un nom fait d'une espace insécable passait la garde (`Str::trim`).
