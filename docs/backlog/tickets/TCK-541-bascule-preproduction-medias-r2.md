---
id: TCK-541
title: "Bascule de la préproduction sur R2 : copie des médias, clés Dokploy, fin de la sauvegarde du volume, sauvegarde du seau privé"
status: todo
phase: P1
family: technique
estimate: M
wave: 67
created: 2026-09-21
updated: 2026-09-21
depends_on: [TCK-538, TCK-539, TCK-540, TCK-545]
blocks: []
spec_refs:
  features:
    - docs/features.md#27-médias--fichiers
tags: [infra, media, r2, dokploy, sauvegarde]
---

## Objectif utilisateur

Que la préproduction serve ses médias depuis R2, avec le même chemin que la production suivra en
phase F. Décision : [ADR-0029](../../adr/0029-medias-sur-r2-servis-par-cloudflare-transformations.md).

## Contrat de données

Déjà posé le 2026-09-21 (API Cloudflare) :

- seaux `takussan-preview-media` et `takussan-preview-private`, région `WEUR` ;
- domaine `media-preview.takussan.com` attaché au seau public, TLS ≥ 1.2 ;
- `transformations` et `image_resizing` à `on` sur la zone `takussan.com` ;
- sauvegarde Dokploy du volume `takussan-api-preview-4iza80_storage` ramenée de 7 à **1**
  exemplaire, et les 6 archives antérieures au 2026-09-21 supprimées de `vps-sauvegardes`
  (5,7 Go).

Reste à poser : un jeton R2 limité aux deux seaux de préproduction (le jeton de l'API Cloudflare
n'a pas le droit d'en créer : `9109`), les clés de TCK-538 dans Dokploy, la copie des médias.

## Critères d'acceptation

- [ ] Jeton R2 « Object Read & Write » limité aux deux seaux ; clés dans Dokploy, relevé des
      **clés** (jamais des valeurs) dans `docs/infra/hebergement.md`.
- [ ] Migration par `media:move-disk public --to-declared` **puis** `media:move-disk local --to-declared`
      (les relevés bancaires vivaient sur `local` avant TCK-538) : chaque média part vers le disque que
      SA collection déclare (original et conversions séparément). ⚠ **Jamais
      `media:move-disk public r2-media` sans filtre** — c'était la première rédaction de ce critère,
      et la vérification adverse l'a démontré : elle rangeait les pièces KYC dans le seau PUBLIC
      (D1, 2026-09-21) ; la commande refuse désormais ce cas. Comptes d'objets avant/après notés ;
      une fiche de bien, un avatar et un logo servis depuis `media-preview.takussan.com` ; aucun
      original de photo lisible sur le seau public.
- [ ] **AVANT la bascule : le `retry_after` effectif de la file, relevé dans Dokploy** (TCK-539,
      cinquième passe adverse, V5-1). Relever dans l'environnement de la préproduction
      `QUEUE_CONNECTION` (la connexion de file effective, attendue `database`) et la variable
      `*_QUEUE_RETRY_AFTER` de cette connexion (`DB_QUEUE_RETRY_AFTER` pour `database`, 90 s par
      défaut dans `config/queue.php`). Noter la **clé** et la valeur relevée, avec sa date, dans
      `docs/infra/hebergement.md`. **Exiger qu'elle dépasse STRICTEMENT le `$timeout` des jobs
      médias** : 75 s pour `RegenerateAgencyWatermarksJob` et `RegeneratePhotoConversionsJob`.
      - *Pourquoi.* Si `retry_after` ≤ `$timeout`, la file croit perdu un job qui tourne encore
        et le redonne au worker suivant. Deux copies réécrivent alors la même photo en même
        temps, et le rejeu compte une tentative de trop, ce qui peut mener à `failed()` pendant
        qu'une copie tourne encore.
      - *Pourquoi ici et pas par un test.* `RegenerationTimeoutTest` ne lit que la configuration
        chargée en TEST (`config/queue.php` avec l'environnement de `phpunit.xml`). Une variable
        posée dans Dokploy lui échappe entièrement : le test reste vert pendant que la production
        s'expose à la double exécution.
- [ ] **Photos sans trace de filigrane, dès le déploiement du code de TCK-539** (R1 de la seconde
      passe adverse). Une photo dont une conversion produite n'est ni filigranée ni exemptée est
      CACHÉE du public dès que son bien exige le filigrane. `watermark_enabled` vaut `true` par
      défaut, et les photos antérieures à la trace n'en ont aucune. ⚠ **C'est le code qui les
      cache, pas le changement de disque** : la fenêtre s'ouvre au déploiement, avant même
      `media:move-disk`. Le compte se prend donc sur la préproduction telle qu'elle est, juste
      avant de déployer.
      1. Compter : `media:regenerate-property-conversions --untraced --dry-run`. Noter le nombre
         relevé en préproduction, à la fois les photos « cachées aujourd'hui » et les photos
         « servies sans trace ».
      2. Rattraper : `media:regenerate-property-conversions --untraced`.
      3. Vider la file `media`.
      4. Recompter : le résultat doit être 0.
- [ ] **Les sources supprimées du volume après vérification** (`--delete-source`, ou retrait de
      `storage/app/public` du volume) : tant qu'elles y sont, Caddy continue de servir sous
      `preview.api.takussan.com/storage/…` les ORIGINAUX non filigranés et les pièces privées que la
      migration vient de mettre à l'abri — la bascule des lignes ne retire rien de l'ancien hôte.
      Vérifié par un `curl` sur une ancienne URL d'original → `404`.
- [ ] Sauvegarde Dokploy du volume désactivée ; copie nocturne incrémentale du seau privé vers
      `vps-sauvegardes`, restauration à blanc d'un objet notée.
- [ ] Sonde `_sonde/test.jpg` retirée du seau public.
- [ ] **Déployés ensemble** : l'image du front construite avec `NEXT_PUBLIC_MEDIA_URL` (TCK-540)
      et la bascule de l'API. Un front seul servirait les photos de `preview.api.takussan.com`
      en taille réelle, sans optimiseur, jusqu'à la bascule.
- [ ] `docs/infra/hebergement.md` et `docs/infra/cdn.md` à jour.
