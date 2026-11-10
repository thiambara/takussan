---
id: TCK-2621
title: "Choisir son espace : à la connexion d'un compte de plusieurs agences, et dans le menu du compte (coché, rôle et ville, jamais le slug)"
status: todo
phase: P1
family: front
estimate: S
wave: 87
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2620]
blocks: []
spec_refs:
  features:
    - "docs/features.md#profils--contexte-actif-tck-138--tck-142"
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, profils, coque, audit-ux, app]
---

## Objectif utilisateur

Un compte de plusieurs agences sait toujours dans quel espace il travaille. À sa première connexion, il choisit ; ensuite, il arrive là où il était. Il change d'espace en deux gestes, sans jamais lire un identifiant technique.

## Contrat de données

Lectures et écritures, toutes existantes ou ajoutées par TCK-2620 :

- `GET /api/me/profiles` : profils, avec `agency.name`, `agency.city` (TCK-2620) et `kind`.
- `GET /api/auth/me` : `active_profile_id` (TCK-2620).
- `PATCH /api/me/active-profile` : `profile_id` et `remember` (TCK-2620).

Le changement d'espace passe par le chemin unique actuel (`useSwitchActiveProfile`, ADR-0004 amendé), qui vide le cache.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-coque&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes). Écrans « Choisir un espace (connexion) » et « Compte et espaces ».
- **Choisir un espace** (repli de la décision 5 b de la famille) :
  - **Quand** : seulement pour un compte qui a des profils actifs dans au moins deux agences, et qui arrive sur `/app` sans profil lié (`active_profile_id` nul).
  - **Téléphone** : plein écran avec « Dans quel espace travaillez-vous ? » en 24 px, puis une grande carte par espace : nom de l'agence, rôle, ville. Viennent ensuite la case « Se souvenir de mon choix » (cochée), le bouton primaire « Continuer dans <agence> » et le lien « Continuer en tant que client ».
  - **Bureau** : un dialogue centré de 520 px, avec le même contenu et les cartes côte à côte.
- **Menu du compte** (feuille du bas au téléphone, menu au-dessus du pied au bureau) :
  - « Vos espaces » donne une carte ou une ligne par espace : agence, puis « rôle · ville » en sous-ligne ;
  - l'espace actif est coché ;
  - **jamais de slug** à l'écran.
- **Téléphone (360–390)** : deux cartes et le bouton tiennent sans défilement à 390 × 844. **Bureau (≥ 1280)** : le dialogue ne recouvre pas la colonne.

## Contraintes strictes (métier)

- **L'écran n'apparaît jamais** :
  - à un compte d'une seule agence (l'API l'auto-bascule) ;
  - pendant une impersonation ;
  - quand l'API a déjà lié un profil, par cookie ou par dernier espace retenu.
- **« Continuer en tant que client »** : le compte reste sans profil lié, et la question ne revient pas dans la même session.
- **Le persona de la coque suit le profil que l'API a LIÉ.** Sans cookie lisible, la coque lit `active_profile_id` de `/api/auth/me` avant de se rabattre sur l'ordre figé (`TYPE_DOMINANT`). Sinon, le menu d'un admin, aussi bailleur, retrouvé dans son espace d'admin serait celui du bailleur.
- **Pas de régression** :
  - la bascule actuelle (menu du compte, palette « Espaces ») ;
  - le regroupement des espaces par rôle ;
  - l'hôte présenté comme un seul espace (`espacesAProposer`, TCK-497) ;
  - le cache vidé au changement de profil.
- Le choix d'espace ne se mélange pas à la connexion de la famille 2 : il vient APRÈS elle, sur `/app`.
- Libellés neufs en `fr`/`en`/`wo` (`wo` = le français tel quel) ; vouvoiement (« Dans quel espace travaillez-vous ? »).

## Delta à produire

- [ ] L'écran « Choisir un espace » (plein écran au téléphone, dialogue au bureau) et ses conditions d'apparition.
- [ ] Le persona de la coque aligné sur `active_profile_id` quand aucun cookie n'est lisible.
- [ ] Le menu du compte : espace actif coché, rôle et ville en sous-ligne, slug retiré (`slugAAfficher` ne sert plus ici).
- [ ] Tests :
  - l'écran pour deux agences et aucun profil lié ;
  - aucun écran pour une agence, en impersonation, ou avec un profil lié ;
  - `remember` envoyé selon la case ;
  - aucun slug dans le menu du compte ;
  - le persona suit `active_profile_id`.

## Critères d'acceptation

- [ ] AC1 — Un compte agent chez Dakar Immo et propriétaire chez Thiès Properties, sans cookie et sans espace retenu, arrive sur `/app` et voit deux cartes : « Dakar Immo · Agent · Dakar » et « Thiès Properties · Propriétaire · Thiès ». Choisir Thiès envoie `{profile_id, remember: true}` (vérifié au réseau) et rend le menu du bailleur.
- [ ] AC2 — Après déconnexion et reconnexion, le même compte arrive directement dans le menu du bailleur, sans écran de choix.
- [ ] AC3 — Le menu du compte de ce compte ne contient aucun des deux slugs (`thies-properties`, `dakar-immo`), et la ligne de l'espace actif porte une coche.
- [ ] AC4 — Un compte d'une seule agence ne voit jamais l'écran : test, plus contrôle au navigateur à la connexion.

## Hors périmètre

- Les compteurs par espace de la maquette (« 3 demandes · 2 visites aujourd'hui »), que l'API ne sert pas sans une lecture par espace.
- Le bouton d'espace de l'en-tête de l'accueil au téléphone (TCK-2617) : il ouvre la feuille de ce ticket.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
