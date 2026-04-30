---
id: TCK-106
title: "Watermark auto photos biens"
status: done
phase: P2
family: applicatif
estimate: S
created: 2026-04-24
updated: 2026-04-27
depends_on: [TCK-016, TCK-050, TCK-035]
blocks: []
spec_refs:
  features:
    - docs/features.md#27-médias--fichiers
  models:
    - docs/models-spec.md#3-property
tags: [back, property, media, watermark]
---

## Objectif utilisateur

Permettre à une agence de protéger sa marque et le travail de ses agents
en garantissant que toute photo de bien diffusée publiquement (recherche,
fiche bien, partage) porte automatiquement un watermark (logo agence + URL
de l'agence ou du bien) sans que l'agent ait à intervenir.

## Contrat de données

**Backend — Aucune migration de schéma** :

- Le watermark est appliqué uniquement aux conversions Web
  (`card`, `web`, `gallery`) générées par media-library (TCK-050).
- L'**original reste intact** sur le storage — pas d'altération du fichier
  source uploadé par l'agent.
- Le rendu watermarké est stocké comme un variant supplémentaire (ex:
  `card-watermarked`) ou remplace la conversion existante selon la
  configuration agence.

**Configuration agence (TCK-035 settings)** :

- `agency.watermark_enabled` (bool, default true)
- `agency.watermark_position` (enum : `bottom_right` | `bottom_left` |
  `bottom_center` | `tile`)
- `agency.watermark_opacity` (int 10–100, default 60)
- Le logo source utilisé est l'avatar/branding agence existant
  (TCK-035) — pas de nouvel upload dédié.

**Pipeline** :

- Listener Spatie media-library `MediaHasBeenAddedEvent` sur la collection
  `property.photos` → enqueue `App\Jobs\Media\ApplyWatermarkJob`.
- Service `App\Services\Media\WatermarkService` qui prend une image source
  + métadonnées agence et produit la version watermarkée (Intervention
  Image / Imagick).
- L'URL retournée par les ressources continue de pointer vers la conversion
  watermarkée par défaut ; un flag `?raw=1` (admin-only) permet de
  récupérer la version sans watermark.

## Contraintes strictes (métier)

- **Original sacré** : le fichier source jamais modifié. Si le watermark
  doit être désactivé après coup (changement de logo, réglage), on
  régénère depuis l'original.
- **Watermark uniquement sur photos de biens publiées** : ne s'applique
  pas aux avatars, documents, fichiers de baux, justificatifs.
- **Performance** : la génération est asynchrone (queue) ; l'upload ne
  bloque pas. Pendant la génération, la conversion non-watermarkée peut
  être affichée temporairement (acceptable).
- **Lisibilité** : le watermark ne doit pas couvrir > 25 % de la surface
  utile, ni dégrader la lecture du bien (mode `tile` uniquement si l'agence
  l'active explicitement).
- **Régénération en lot** : si l'agence change son logo ou désactive le
  watermark, fournir un job `RegenerateAgencyWatermarksJob` qui itère sur
  toutes les photos de biens de l'agence.
- **Préserver les métadonnées EXIF** non sensibles (orientation), supprimer
  les données GPS de la version diffusée (cohérent avec privacy).
- **Contenu du watermark** : par défaut `{agency.name}` + URL publique de
  l'agence. Pas de tagline ni info personnelle d'agent.

## Delta à produire

- [ ] Service `App\Services\Media\WatermarkService`
- [ ] Job `App\Jobs\Media\ApplyWatermarkJob` (queue `media`)
- [ ] Job `App\Jobs\Media\RegenerateAgencyWatermarksJob` (commande artisan associée)
- [ ] Listener sur `MediaHasBeenAddedEvent` (collection `property.photos` uniquement)
- [ ] Migration ajoutant les colonnes settings watermark sur `agencies` (extension de TCK-035 si pas déjà couvert)
- [ ] Mise à jour `AgencySettingsRequest` pour valider les 3 nouveaux champs
- [ ] Endpoint `POST /api/agencies/{id}/regenerate-watermarks` (admin agence)
- [ ] Mise à jour `MediaUrlResolver` (TCK-105) pour servir la conversion watermarkée par défaut
- [ ] Tests `WatermarkServiceTest` (3 positions × 2 opacités × idempotence)
- [ ] Tests `ApplyWatermarkJobTest` (queue + relation property)
- [ ] Tests régression : suppression du watermark conserve l'original

## Critères d'acceptation

- [ ] AC1 — uploader une photo sur un bien d'une agence
  `watermark_enabled=true` génère la conversion `card` avec watermark
  visible (vérifié via comparaison de pixels sur position attendue)
- [ ] AC2 — l'original (`getOriginalUrl`) ne contient pas de watermark
  (hash inchangé avant/après job)
- [ ] AC3 — désactiver `watermark_enabled` puis lancer
  `RegenerateAgencyWatermarksJob` régénère toutes les conversions sans
  watermark
- [ ] AC4 — uploader une photo sur un bien d'une agence sans
  `watermark_enabled` ne déclenche pas le job
- [ ] AC5 — les avatars utilisateurs et documents de baux ne sont jamais
  watermarkés (test explicite)
- [ ] AC6 — la version watermarkée a ses métadonnées GPS retirées
- [ ] AC7 — un admin agence peut récupérer la version sans watermark via
  `?raw=1` ; un visiteur public reçoit 403

## Hors périmètre

- Watermark dynamique avec l'identité du visiteur (anti-fuite) — usage
  rare, ticket dédié si demandé.
- Watermark vidéo — pas de support vidéo en V1 (les photos suffisent).
- Watermark sur les PDF de fiches bien (peut être ajouté plus tard via
  les templates Blade de TCK-077).
- UI agent pour prévisualiser le résultat avant publication — basique,
  ticket UX dédié.
- Migration des photos déjà uploadées avant ce ticket — un script
  artisan one-shot peut être lancé manuellement post-déploiement.

## Notes d'implémentation

_(à remplir par implementing-specs)_
