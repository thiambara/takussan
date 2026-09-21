---
id: TCK-542
title: "Réduire les photos dans le navigateur avant l'envoi — dimensions plafonnées, format conservé"
status: todo
phase: P2
family: front
estimate: M
wave: 67
created: 2026-09-21
updated: 2026-09-21
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#27-médias--fichiers
  models:
    - docs/models-spec.md#spatielaravel-medialibrary
tags: [front, media, image, upload, performance, mobile]
---

## Objectif utilisateur

Qu'un agent ou un propriétaire qui publie les photos d'un bien depuis son téléphone, sur réseau
mobile, les envoie en quelques secondes au lieu d'attendre plusieurs mégaoctets par photo — sans
que la photo affichée ensuite soit moins nette.

## Contrat de données

Endpoints existants, inchangés : les envois de photos passent par les requêtes validées par
`MediaUploadRequest` et `GenericMediaUploadRequest` (`mimes:jpg,jpeg,png,webp`,
`MAX_PHOTO_KB = 10 * 1024`), plus l'avatar, le logo d'agence, les photos de maintenance et les
pièces jointes image de la messagerie.

Écrans qui envoient des photos (relevé du 2026-09-21, `type="file"` / dépôt) : assistant de
publication d'un bien, panneau de médias du tableau de bord et gestionnaire de médias, en-tête de
profil (avatar), configuration de l'agence (logo), formulaires de maintenance, fil de messagerie.

Pourquoi réduire et **pas** convertir : [ADR-0029](../../adr/0029-medias-sur-r2-servis-par-cloudflare-transformations.md)
§4-5 — le format servi se décide **à la livraison** (Transformations, `format=auto` → AVIF). Un
WebP produit par le navigateur ne rend rien de plus léger à l'affichage et ajoute une compression
avec perte avant celle de la livraison. La conversion `full` plafonne à 1 600 px (TCK-356) : une
source de 2 560 px de grand côté garde de la marge pour le filigrane et un DPR 2 sans jamais
agrandir.

## Direction UX / Artistique

Invisible quand tout va bien : l'utilisateur choisit ses photos, la réduction se fait pendant
l'aperçu, et la progression affichée est celle de l'envoi réduit. Pas de réglage de qualité
exposé. Si la réduction échoue sur une photo, elle part telle quelle — jamais de blocage, jamais
de message technique.

## Contraintes strictes (métier)

- **Le format ne change pas** : un JPEG reste un JPEG (qualité ≈ 0,9), un PNG reste un PNG, un
  WebP reste un WebP. Aucune conversion vers WebP ou AVIF.
- **Grand côté plafonné à 2 560 px**, proportions conservées ; une image plus petite n'est
  **ni agrandie ni réencodée** (elle part octet pour octet).
- **L'orientation est préservée** : une photo portrait prise au téléphone arrive en portrait. Le
  réencodage supprime l'EXIF ; l'orientation doit donc être appliquée aux pixels avant.
- **Si le résultat est plus lourd que l'original, l'original part.**
- **Repli sûr** : navigateur incapable de décoder le fichier (HEIC sur un navigateur qui ne le lit
  pas, fichier corrompu, mémoire insuffisante) → l'original part, la validation serveur tranche.
- **La validation serveur reste la seule garde** : types et taille inchangés côté API. La
  réduction est une optimisation, jamais une sécurité.
- Le travail ne gèle pas l'interface pendant une sélection de 20 photos de 12 Mpx.

## Delta à produire

- [ ] Une fonction de réduction partagée, appliquée à chaque écran d'envoi de **photos** listé
      au contrat.
- [ ] Tests unitaires : plafonnement, non-agrandissement, format conservé, orientation, repli sur
      l'original (échec de décodage, résultat plus lourd).
- [ ] Mesure notée dans les Notes d'implémentation : poids avant/après sur au moins trois vraies
      photos de téléphone (dont une portrait), et temps de réduction sur un téléphone d'entrée de
      gamme ou en émulation CPU ralentie.

## Critères d'acceptation

- [ ] AC1 — Une photo JPEG de 4 000 × 3 000 envoyée depuis l'assistant de publication arrive
      côté API en JPEG de 2 560 × 1 920.
- [ ] AC2 — Une photo de 1 200 × 900 arrive identique à l'original (même taille en octets).
- [ ] AC3 — Une photo portrait portant `Orientation = 6` s'affiche en portrait après l'envoi.
- [ ] AC4 — Un fichier que le navigateur ne sait pas décoder est envoyé tel quel, et l'API rend sa
      réponse de validation habituelle.
- [ ] AC5 — Chaque AC ci-dessus a un test qui **rougit** quand la réduction est retirée ou quand
      elle convertit le format (ablation notée).
- [ ] `npm run lint`, `npx tsc --noEmit`, tests touchés verts.

## Hors périmètre

- **Pièces KYC, documents, devis et justificatifs** : ce sont des pièces justificatives. Elles
  partent telles qu'elles ont été produites, même quand ce sont des images.
- La conversion de format (décidée contre : ADR-0029).
- Le HEIC → JPEG côté client. S'il faut accepter le HEIC, c'est un ticket à part (côté API).
- Les vidéos de biens.
- Tout changement des règles de validation de l'API.

## Notes d'implémentation

_(à remplir par implementing-specs)_
