---
id: TCK-541
title: "Bascule de la préproduction sur R2 : copie des médias, clés Dokploy, fin de la sauvegarde du volume, sauvegarde du seau privé"
status: done
phase: P1
family: technique
estimate: M
wave: 67
created: 2026-09-21
updated: 2026-09-22
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

- [x] Jeton R2 « Object Read & Write » limité aux deux seaux ; clés dans Dokploy, relevé des
      **clés** (jamais des valeurs) dans `docs/infra/hebergement.md`.
- [x] Migration par `media:move-disk public --to-declared` **puis** `media:move-disk local --to-declared`
      (les relevés bancaires vivaient sur `local` avant TCK-538) : chaque média part vers le disque que
      SA collection déclare (original et conversions séparément). ⚠ **Jamais
      `media:move-disk public r2-media` sans filtre** — c'était la première rédaction de ce critère,
      et la vérification adverse l'a démontré : elle rangeait les pièces KYC dans le seau PUBLIC
      (D1, 2026-09-21) ; la commande refuse désormais ce cas. Comptes d'objets avant/après notés ;
      une fiche de bien, un avatar et un logo servis depuis `media-preview.takussan.com` ; aucun
      original de photo lisible sur le seau public.
- [x] **AVANT la bascule : le `retry_after` effectif de la file, relevé dans Dokploy** (TCK-539,
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
- [x] **Photos sans trace de filigrane, dès le déploiement du code de TCK-539** (R1 de la seconde
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
- [x] **Les sources supprimées du volume après vérification** (`--delete-source`, ou retrait de
      `storage/app/public` du volume) : tant qu'elles y sont, Caddy continue de servir sous
      `preview.api.takussan.com/storage/…` les ORIGINAUX non filigranés et les pièces privées que la
      migration vient de mettre à l'abri — la bascule des lignes ne retire rien de l'ancien hôte.
      Vérifié par un `curl` sur une ancienne URL d'original → `404`.
- [x] Sauvegarde Dokploy du volume désactivée ; copie nocturne incrémentale du seau privé vers
      `vps-sauvegardes`, restauration à blanc d'un objet notée.
- [x] Sonde `_sonde/test.jpg` retirée du seau public.
- [ ] **Déployés ensemble** : l'image du front construite avec `NEXT_PUBLIC_MEDIA_URL` (TCK-540)
      et la bascule de l'API. Un front seul servirait les photos de `preview.api.takussan.com`
      en taille réelle, sans optimiseur, jusqu'à la bascule.
- [x] `docs/infra/hebergement.md` et `docs/infra/cdn.md` à jour.

## Relevé de la bascule — 2026-09-22

- **Jetons.** `takussan-preview-app` (*Object Read & Write*) lit et écrit les deux seaux de
  préproduction, refusé (`AccessDenied`) sur `vps-sauvegardes`. `takussan-preview-backup` lit et écrit
  `takussan-preview-private` et `vps-sauvegardes`, refusé sur le seau public. ⚠ L'écriture sur le seau
  privé n'était pas demandée : à restreindre à la lecture. Relevé par un script qui liste, écrit puis
  efface une sonde — n'imprime que `OK` / `refus`.
- **Clés.** Neuf clés posées par `compose.update` (71 → 80), l'API redéployée (`done` en 46 s), relue
  dans le conteneur : `r2-private` / `r2-media`, écriture sur le seau privé depuis `api`.
- **Filet.** Archive du volume du 2026-09-22 04:00 (902 Mo) et dump PostgreSQL de 03:00 présents dans
  `vps-sauvegardes` avant tout déplacement.
- **Photos sans trace.** Compté la veille, avant le déploiement de TCK-539 : 3 444 photos, toutes à
  trace complète ; `--untraced --dry-run` après déploiement : 0 cachée, 0 servie sans trace. Rien à
  rattraper.
- **Migration.** `--dry-run` : 3 444 photos (original → `r2-private`, conversions → `r2-media`), 81
  avatars et 4 logos (→ `r2-media`), aucune pièce privée dans le seed. Réel : 3 529 médias, 14 104
  fichiers, 0 échec, environ 70 médias par minute ; `local --to-declared` : 0. Comptes : seau privé
  3 444 objets (201,4 Mo), seau public 10 660 (483,1 Mo) + la sonde — 14 104 exactement.
- **Aucun original de photo sur le seau public.** Les 86 objets hors `/conversions/` sont les 81
  avatars, les 4 logos et la sonde (identifiants recoupés en base). Un original dérivé de l'URL de
  `full` → `404` sur `media-preview.takussan.com`.
- **Servi.** Catalogue public : 20 biens sur 20 avec photo, toutes sur `media-preview` ; fiche, avatar,
  logo `200`. Transformations : la même conversion `preview` en 45 Ko (JPEG direct), **16 Ko en AVIF**,
  17 Ko en WebP. Front : 48 images sur 48 de l'accueil en `/cdn-cgi/image/…`, aucune vers l'ancien hôte.
- **Sources.** Les 3 529 répertoires numérotés de `storage/app/public` (et rien d'autre : inventaire
  fait avant) supprimés. L'ancienne URL de l'original de la photo 1082 rendait `200` juste avant ;
  après : **`403`**, pas `404` (le serveur refuse le répertoire absent) — rien n'est plus servi.
- **Envoi neuf.** Une photo ajoutée par tinker au bien 1 : `r2-private` / `r2-media`, trois conversions
  produites **et** filigranées par `worker-media`, `full` servie en `200`, original dérivé en `404`,
  aucun job en échec ; supprimée ensuite, fichiers absents des deux seaux, ligne absente.
- **Sauvegarde.** Volume désactivé dans Dokploy (`enabled: false`). Copie nocturne
  (`deploy/server/sauvegarde-seau-prive.sh`, `bootstrap.sh` § 8, 02:30) : 3 444 objets au premier
  passage, rien au second ; restauration à blanc d'un objet, même md5 ; échec forcé → code 1 et alerte.
- **Sonde** `_sonde/test.jpg` supprimée, son URL publique → `404`.
- **« Déployés ensemble » : NON tenu.** Le front construit avec `NEXT_PUBLIC_MEDIA_URL` est parti
  avec la promotion #302 (2026-09-21, 23:30 Z) ; la bascule de l'API a suivi le 2026-09-22 vers 15:00
  Z. Pendant ces ~16 h, la préproduction a servi ses photos depuis `preview.api.takussan.com`, en
  taille réelle et sans optimiseur (`/_next/image` → `404`, mesuré). Fermé par la bascule ; le critère
  reste non coché parce qu'il n'a pas été tenu. **Pour la production (phase F), l'ordre est l'inverse :
  bascule de l'API d'abord, front ensuite.**

