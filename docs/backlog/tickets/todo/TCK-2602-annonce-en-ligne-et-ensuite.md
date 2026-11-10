---
id: TCK-2602
title: "« Votre annonce est en ligne » : partager, compléter, booster, au lieu d'un toast"
status: todo
phase: P2
family: front
estimate: S
wave: 86
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2601]
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  models:
    - "docs/models-spec.md#3-property"
tags: [front, publish, acquisition, boost, audit-ux, app]
---

## Objectif utilisateur

Le particulier qui vient de publier voit son annonce telle que les chercheurs la verront et sait quoi faire tout de suite pour qu'elle reçoive des demandes : la partager sur WhatsApp, ajouter des photos, la booster.

## Contrat de données

Existant : le bien créé (`GET /api/properties/{id}` avec `fields[properties]=` de la carte : titre, quartier, ville, prix, fréquence, référence, couverture, nombre de photos, statut), son URL publique, le lien « Booster » d'aujourd'hui (`LienBoosterApresPublication`). Aujourd'hui la sortie est un toast (« en ligne » / « en vérification » / « proposée », avec « Booster ») puis `/app/properties/{id}` (`PropertyWizard.tsx`, `terminer`).

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-entree-publier&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écran « En ligne ».
- **Téléphone (360-390 px)** : coche sauge, « Votre annonce est en ligne » et « Visible dès maintenant par les chercheurs · {référence} », la carte de l'annonce telle qu'en liste, « Partager sur WhatsApp » plein, puis « Copier le lien », « Ajouter des photos » (« N sur 10 · les annonces avec photos sont plus vues »), « Booster l'annonce » ; « Les demandes arrivent sur WhatsApp au … et dans votre espace » ; pied : « Voir mon annonce » et « Aller à mon espace ».
- **Bureau (≥ 1280 px)** : colonne de 560 px ; à droite, « Booster votre annonce » et « Et maintenant » (où elle paraît, où arrivent les demandes, modifiable à tout moment).
- Ton : **vouvoiement partout ([ADR-0095](../../../adr/0095-le-ton-suit-la-session.md), révisé le 2026-11-10) ; la maquette tutoie, elle n'est pas une référence de ton**.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0093](../../../adr/0093-publier-sans-compte-le-brouillon-vit-dans-le-navigateur.md), [ADR-0095](../../../adr/0095-le-ton-suit-la-session.md).
- L'écran ne sert que la publication d'un espace `individual` depuis l'assistant (le parcours d'TCK-2601, ou l'hôte connecté). Le personnel d'une agence `standard` garde la sortie d'aujourd'hui (toast + fiche), comme la proposition d'un bailleur.
- Statut `pending_review` : le titre dit « en vérification » et l'écran n'offre ni « Booster » ni le partage du lien public (rien de public à partager) ; comportement d'aujourd'hui pour le boost.
- « Booster » ouvre le parcours de boost existant ; le libellé ne promet que ce que le boost fait (« En tête de liste … pendant N jours » seulement si c'est le produit choisi par défaut).
- Échec partiel (photos non passées) : l'écran ne s'affiche pas, l'avertissement d'aujourd'hui reste.
- Aucune modale de bienvenue par-dessus l'écran, ni après « Aller à mon espace » (TCK-2615).
- Libellés en `fr`/`en`/`wo`.

## Delta à produire

- [ ] Écran de sortie de publication pour l'espace particulier, téléphone et bureau.
- [ ] Partage WhatsApp (message prérempli avec titre, prix et lien public), copie du lien, accès à l'étape photos du bien, boost.
- [ ] Tests : en ligne → écran avec partage et boost ; en vérification → ni boost ni partage ; agence `standard` → toast et fiche comme avant ; lien WhatsApp encodé.

## Critères d'acceptation

- [ ] AC1 — Après la publication d'un espace particulier, l'URL du partage WhatsApp contient l'URL publique du bien et son prix formaté.
- [ ] AC2 — Un agent d'agence `standard` qui publie arrive sur `/app/properties/{id}` avec le toast « Booster », comme sur `dev`.
- [ ] AC3 — Statut `pending_review` : aucun bouton « Booster » ni « Partager » dans le DOM.

## Hors périmètre

- Le contenu du parcours de boost.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
