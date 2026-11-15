---
id: TCK-2847
title: "Coque, côté API : dire qu'une fiche introuvable existe dans un autre de vos espaces, et la ligne d'activité de chaque espace (« 4 demandes · 2 visites aujourd'hui »)"
status: todo
phase: P1
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2848]
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
    - "docs/features.md#profils--contexte-actif-tck-138--tck-142"
  models:
    - "docs/models-spec.md#2-agency"
tags: [back, coque, espaces, introuvable, audit-ux, app]
---

## Objectif utilisateur

L'agent de deux agences qui ouvre un lien vers une fiche de l'autre agence apprend où elle est et y bascule ; et, avant de changer d'espace, il voit ce qui l'attend dans chacun.

## Contrat de données

Relevé le 2026-11-15 sur `dev` (8c60f4c58) :

- Une fiche d'une autre agence répond 404 (cloisonnement, principe 2) : l'API **ne distingue pas** « inexistant » de « dans une autre de vos agences ». TCK-2619 l'a écarté pour cette raison (hors périmètre). Seules les notifications connaissent l'agence de leur objet (`LienDansLAgence`).
- `GET /api/me/profiles` (`MeProfilesController::index`) rend les profils actifs (`ProfileResource` : agence, rôle, ville) — **aucun compteur par espace**. TCK-2621 l'a écarté (« l'API ne les sert pas », ticket « — »).
- Les compteurs de l'espace **actif** existent (compteurs du menu, `useCompteursDuMenu`).

## Contraintes strictes (métier)

- **Écrire l'ADR d'abord** (premier item du delta) : révéler qu'une fiche existe dans une autre agence touche la frontière d'isolation (principe 2). La règle proposée : la réponse ne nomme l'autre agence **que si l'appelant y a un profil actif qui peut lire la fiche** (même Policy que si l'espace était actif) ; sinon 404 inchangé, sans aucune différence de forme ni de temps observable.
- **Où-est-elle** — `GET /api/me/locate?type={bien|demande|client|bail|intervention|visite|reservation|bailleur}&id={id}` (nom définitif au choix de l'implémentation, documenté dans `docs/spatie-query-builder.md` si filtré) :
  - rend `{profile_id, agency {id, name}, role}` du premier profil actif de l'appelant qui peut lire l'objet ;
  - 404 sinon (objet absent, ou aucun profil qui le lit) ;
  - jamais le titre ni aucune donnée de l'objet.
- **Activité par espace** — ajoutée à `GET /api/me/profiles` sous `include=activity` (ou lecture dédiée) : pour chaque profil actif, les compteurs que la persona du profil affiche dans « Aujourd'hui » (agent/admin : demandes non traitées, visites du jour ; bailleur : biens, loyers en retard ; prestataire : interventions du jour ; locataire : échéance due). Chaque compteur est calculé **comme si ce profil était actif** (mêmes règles que les compteurs du menu, sans les recopier).
- Pas de N+1 : nombre de requêtes borné et indépendant du nombre d'objets ; mesuré entre 1 et 4 profils.
- **Notifications** (audit app-notifications e1, écart « donnée ») : la maquette compte **toutes** les notifications par famille (`app-notifications.tsx` l. 436-445 : « Toutes 42 » = somme des familles), l'API ne rend que les non lues. La lecture des comptes par famille gagne le total (à côté du non lu, sans le remplacer).

## Delta à produire

- [ ] ADR (numéro suivant libre) : « une fiche d'une autre de vos agences se nomme, sans se montrer », avant le code.
- [ ] Endpoint de localisation + tests `LocateAcrossProfilesTest` (fiche de l'agence B ouverte depuis A → agence B ; profil B suspendu → 404 ; aucun profil → 404 ; forme identique entre « inexistant » et « illisible »).
- [ ] `include=activity` sur les profils + `MeProfilesActivityTest` (agent de deux agences : compteurs différents par espace ; requêtes constantes).
- [ ] Compte total par famille des notifications + test (42 notifications dont 3 non lues → total 42, non lues 3).

## Critères d'acceptation

- [ ] AC1 — Agent actif dans « Dakar Immo » (actif) et « Thiès Properties » : `locate?type=bien&id={bien de Thiès}` rend `agency.name = "Thiès Properties"` et le `profile_id` de ce profil ; même appel par un utilisateur sans profil à Thiès : 404 avec le même corps qu'un id inexistant.
- [ ] AC2 — Profil de Thiès passé `blocked` : 404.
- [ ] AC3 — `me/profiles?include=activity` rend, pour l'agent, `{unhandled_leads: 4, visits_today: 2}` à Dakar et des valeurs propres à Thiès (fixtures distinctes) ; pour un bailleur, `{properties: 2, rent_overdue: 1}`.
- [ ] AC4 — Ablation : forcer la Policy à vrai fait rougir AC1 (cas sans profil) ; c'est elle, et non un `where agency_id`, qui garde la réponse.

## Hors périmètre

- L'écran (page introuvable, menu du compte, choix d'espace) : TCK-2848.

## Notes d'implémentation

_(à remplir par implementing-specs)_
