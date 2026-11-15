---
id: TCK-2937
title: "« Créer mon espace pro » ouvre une agence tout de suite, vérifiée ensuite"
status: todo
phase: P2
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2938]
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#2-agency"
tags: [back, entree, orientation, agence, pro, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

Le professionnel qui crée son espace depuis l'orientation travaille tout de suite dans un espace d'agence (équipe, bailleurs, mandats), et la vérification de l'agence suit sous 48 h.

## Contrat de données

Écarts de TCK-2608 (`ecarts_acceptes[9]`, `[10]`) : aujourd'hui « Créer mon espace pro » ouvre un espace **individuel** puis renvoie à la demande de passage en pro (`/app/settings/agency/upgrade`, `agencies/{agency}/upgrade-requests`), revue par le super-admin. La maquette promet « Ton espace d'agence s'ouvre tout de suite : équipe, bailleurs, mandats », puis « Sous 48 h · Notre équipe vérifie l'agence (NINEA, registre du commerce) ».

- La création depuis l'orientation (`EtapePro`) produit une agence de type `standard` à l'état « non vérifiée », dont l'appelant est l'admin principal, avec les champs saisis (raison sociale, ville principale, téléphone) ; la demande de vérification (dossier KYC) est ouverte dans le même geste.

## Contraintes strictes (métier)

- **Décision structurelle** (contredit le chemin actuel « individuel puis passage en pro sur approbation », et touche ce que l'agence non vérifiée peut faire) : l'ADR s'écrit AVANT (numéro suivant libre), validé par le porteur. À y trancher : ce qu'une agence non vérifiée peut faire avant la vérification (inviter, publier, encaisser — les reversements restent suspendus comme pour toute agence non vérifiée, [ADR-0104](../../../adr/0104-l-identite-legale-de-l-agence-n-a-qu-une-source.md)) ; le sort de l'agence refusée ; la promesse « sous 48 h » (engagement de service de la plateforme, ou phrase retirée).
- La voie actuelle (espace individuel → passage en pro) reste pour qui l'a déjà.
- Unicité : NINEA ou RIB déjà portés par une autre agence → même refus que le passage en pro (TCK-601).

## Delta à produire

- [ ] ADR « l'espace pro de l'orientation est une agence, vérifiée ensuite ».
- [ ] `POST /api/me/agencies` (`MeAgencyController@store`, `StoreOwnAgencyRequest`) : agence + profil d'admin principal + dossier de vérification, dans une transaction.
- [ ] Liste des villes principales servie pour le champ (référentiel géo existant).
- [ ] Tests : `OrientationCreateAgencyTest` (agence `standard` non vérifiée, admin principal = appelant, dossier ouvert, doublon NINEA refusé, appelant déjà admin d'une agence → 409).

## Critères d'acceptation

- [ ] AC1 — Après création, l'appelant a un profil d'admin d'agence **actif** sur une agence `standard`, non vérifiée, dont il est `primary_admin_id`, et une demande de vérification en attente ; aucun espace individuel n'est créé.
- [ ] AC2 — Cette agence peut inviter un agent (route d'invitation 201) ; ses reversements restent bloqués tant qu'elle n'est pas vérifiée (test).
- [ ] AC3 — Un NINEA déjà porté par une autre agence rend 422 avec le code du doublon ; un appelant déjà admin d'une agence rend 409.

## Hors périmètre

- L'écran (TCK-2938).

## Notes d'implémentation

_(à remplir par implementing-specs)_
