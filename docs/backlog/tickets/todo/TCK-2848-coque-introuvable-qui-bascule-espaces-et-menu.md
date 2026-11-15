---
id: TCK-2848
title: "Coque : la page introuvable qui propose de basculer vers l'espace de la fiche, la ligne d'activité de chaque espace, « Réinitialiser le menu » dans la colonne, la langue en segments au bureau"
status: todo
phase: P1
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2847]
blocks: []
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
    - "docs/features.md#profils--contexte-actif-tck-138--tck-142"
    - "docs/features.md#23-notifications"
  models: []
tags: [front, coque, espaces, introuvable, menu, audit-ux, app]
---

## Objectif utilisateur

L'utilisateur de plusieurs espaces sait, depuis le menu du compte et le choix d'espace, où le travail l'attend ; un lien vers une fiche d'un autre espace l'y mène en un geste ; et il remet son menu à zéro là où il le modifie.

## Contrat de données

- `GET /api/me/locate` et `GET /api/me/profiles?include=activity` : **livrés par TCK-2847**.
- Le reste est déjà servi : épingles et réinitialisation (`preferences.navigation`, TCK-2480), langue (préférence du compte).

Relevé (audit-f3-coque.md, app-coque e3, e5, e6, e8) : `MenuDuCompte.tsx:169-245`, `FeuilleDuCompte.tsx:80-145`, `profile/ChoixDEspace.tsx:71-142` sans ligne d'activité ; `CorpsDeLIntrouvable.tsx`, `SecoursDeLIntrouvable.tsx` sans variante « autre espace » ; « Réinitialiser le menu » resté dans le profil, poignées sur les seules épingles (EA de TCK-2619) ; langue en boutons radio au bureau (EA TCK-2619).

## Direction UX / Artistique

**Référence de fidélité** — `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-coque.tsx` et `app-coque-pieces.tsx`, approche a :

- **e8 « Page introuvable »** — bureau (et téléphone, même contenu empilé) : quand TCK-2847 localise la fiche, la page dit « Cet élément est dans l'espace {agence} » avec le bouton « Basculer vers {agence} », qui active le profil puis rouvre l'URL demandée. Sinon, la page actuelle, inchangée.
- **e5 « Compte et espaces »** — téléphone (feuille du bas) et bureau (menu de 256 px) : sous chaque espace de « Vos espaces », la ligne d'activité (« 4 demandes · 2 visites aujourd'hui », « 2 biens · 1 loyer en retard »). Au **bureau**, la langue en contrôle segmenté FR · EN · WO (et non une liste radio).
- **e6 « Choisir un espace (connexion) »** — plein écran au téléphone, carte de 520 px au bureau : la même ligne d'activité sur chaque carte d'espace.
- **e3 « Menu (tiroir) »**, bureau, mode « Modifier le menu » : « Réinitialiser le menu » dans la colonne (en plus du profil) ; poignées sur **toutes** les lignes que la maquette dessine avec une poignée.

## Contraintes strictes (métier)

- La ligne d'activité n'affiche que les compteurs non nuls ; aucun compteur → pas de ligne (pas de « 0 demande »). Erreur ou chargement : pas de ligne, jamais de squelette qui décale les cartes.
- « Basculer » passe par le changement de profil existant (`PATCH /api/me/active-profile`), puis navigue vers l'URL d'origine ; un échec rend la page introuvable ordinaire.
- La 404 reste un vrai `HTTP 404` (TCK-2619).
- Réinitialiser demande une confirmation et écrit `preferences.navigation` comme le profil le fait (une seule écriture).
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel ; vouvoiement.

## Delta à produire

- [ ] Variante « autre espace » de la page introuvable.
- [ ] Ligne d'activité : menu du compte (bureau), feuille du compte (téléphone), choix d'espace.
- [ ] « Réinitialiser le menu » et poignées dans le mode « Modifier le menu » de la colonne.
- [ ] Langue en segments au bureau.
- [ ] Tests : variante rendue sur un `locate` positif et absente sur 404 ; ligne d'activité et son absence à zéro ; réinitialisation depuis la colonne ; segments de langue.

## Critères d'acceptation

- [ ] AC1 — Agent de Dakar et Thiès, espace Dakar actif, `/app/properties/{bien de Thiès}` : la page rend « Basculer vers Thiès Properties » ; le geste active le profil de Thiès et affiche la fiche du bien.
- [ ] AC2 — Même URL pour un id inexistant : aucune mention d'un autre espace.
- [ ] AC3 — Menu du compte à 1440 : sous « Dakar Immo », « 4 demandes · 2 visites aujourd'hui » ; un espace sans rien en cours n'a pas de ligne. Même chose dans la feuille à 390 et sur les cartes du choix d'espace.
- [ ] AC4 — En mode « Modifier le menu » à 1440, « Réinitialiser le menu » est présent dans la colonne ; après confirmation, les épingles reviennent au défaut de la persona.
- [ ] AC5 — Menu du compte à 1440 : la langue est un groupe de trois segments « FR », « EN », « WO », l'actif marqué `aria-pressed` ou `aria-checked`.
- [ ] AC6 — Vérifier au navigateur (audit, non vérifiables) : les puces de « Demandes » (app-coque e1) restent collées en haut au défilement au téléphone ; dans la cloche (app-notifications e0/e1), la chip « Dans {autre agence} » et le verbe « Valider » d'un bien à valider, avec un compte multi-agence — corriger si absents.
- [ ] AC7 — La colonne « Familles » de l'historique (app-notifications e1, bureau) affiche le compte **total** par famille servi par TCK-2847 (« Toutes 42 », « Demandes 3 »…), comme la maquette.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2848.json` : app-coque e3 (bureau, édition), e5, e6, e8, téléphone et bureau, avec un compte de deux espaces.
- [ ] AC-F2 — Zéro écart non expliqué ; la ligne d'activité et la variante « Basculer » ne sont plus rangées en « donnée » ni « hors périmètre ».
- [ ] AC-F3 — À 1024 et 768 : `scrollWidth − innerWidth = 0`.

## Hors périmètre

- Les récents en entités (TCK-2846), la palette (TCK-2845).

## Notes d'implémentation

_(à remplir par implementing-specs)_
