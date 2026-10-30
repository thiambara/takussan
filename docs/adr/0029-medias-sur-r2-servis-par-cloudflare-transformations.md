# ADR-0029 — Les médias vivent dans R2, deux seaux par environnement ; les images publiques sont servies par Cloudflare Transformations

- **Statut** : Accepté
- **Date** : 2026-09-21
- **Tickets** : TCK-538, TCK-539, TCK-540, TCK-541
- **Amendement du 2026-10-04 (TCK-585)** : les **photos de biens** ne passent plus par Transformations. Leurs conversions sont produites en WebP et servies telles quelles ; le §4 ne vaut plus que pour les autres images du seau public (avatars, logos, plans). Voir [§ Amendement du 2026-10-04](#amendement-du-2026-10-04--les-photos-de-biens-ne-passent-plus-par-transformations-tck-585).
- **Amendement du 2026-10-23 (P180.02)** : la route signée `media.private.show` sert aussi une **conversion nommée** dans l'URL signée et propre à la collection (d'abord la `preview` des `room_photos` de l'état des lieux, puis les photos de maintenance), pour que les vignettes privées ne chargent plus l'original. Voir le § *Amendement du 2026-10-23 — la route signée sert aussi une conversion nommée*.
- **Amendement du 2026-10-30 (TCK-2407)** : la copie nocturne du seau privé n'est plus une copie unique qui ne supprime jamais, mais un **instantané daté par jour**, marqué complet par `.complet`, dont les 14 plus récents sont gardés, jamais le dernier complet retiré. Un objet effacé du seau privé quitte la sauvegarde 14 jours au plus après son effacement, tant que les passages réussissent ; un objet vivant est dans chaque instantané complet ; la liste des effacements garde une copie jamais tournée. Voir le § *Amendement du 2026-10-30 — la copie du seau privé est un instantané par jour, gardé 14 jours*.
- **Complète** : [ADR-0028](0028-auto-hebergement-conteneurise-sur-le-vps.md) §6-7 (le volume de médias et sa sauvegarde) ; **rend caduc** le choix de Bunny comme CDN par défaut de [`docs/infra/cdn.md`](../infra/cdn.md) (TCK-105), jamais activé (`CDN_ENABLED=false` partout).

## Contexte

Mesuré le 2026-09-21.

**1. Les médias vivent dans un volume Docker, et sa sauvegarde est une copie intégrale.** Le volume
`takussan-api-preview-4iza80_storage` (monté sur `/app/storage/app` par
`deploy/takussan/compose.api.yml`) pèse 946 Mo pour 17 629 fichiers. Dokploy l'archive chaque nuit en
un `tar` **complet** vers R2 : à 7 exemplaires, 6,6 Go des 7,3 Go du seau `vps-sauvegardes`, pour des
médias de démonstration. La production doublerait la mise, et chaque photo ajoutée par un client se
paierait sept fois.

**2. Les images traversent le VPS, et le VPS les encode.** Même fichier (conversion `full`,
800 × 600), mesuré depuis le poste :

| Chemin | Poids | Temps |
|---|---|---|
| `preview.api.takussan.com/storage/…` (Caddy sur le VPS) | 81 636 o, JPEG | 0,44 à 1,78 s |
| `media-preview.takussan.com/cdn-cgi/image/width=640,format=auto/…` (R2 + Transformations) | 37 648 o, **AVIF** | 1,85 s au premier appel, puis **0,054 s** (`cf-cache-status: HIT`) |

L'optimiseur de `next/image` tourne dans le conteneur du front (plafond 512 Mio) : il encode l'AVIF
sur le CPU du VPS, et son cache vit dans le conteneur — **il repart à zéro à chaque déploiement**.

**3. Des fichiers privés sont sur le disque public.** `config/media-library.php:35` range toute
collection sans `useDisk()` sur `MEDIA_DISK`, qui vaut `public` — servi sans authentification sous
`/storage/{id}/…`. Seul `BankStatement` porte un disque privé. Pièces KYC, documents et leurs
versions, PDF générés, pièces jointes de messagerie, devis, remboursements de dépôt : tout est
adressable par qui connaît l'identifiant, et les identifiants sont séquentiels. Aucune donnée réelle
n'est exposée aujourd'hui (la préproduction n'en porte aucune de ces collections, relevé le
2026-09-21), mais la production l'aurait été dès le premier dossier KYC. La liste
`cdn.secure_collections` (`config/cdn.php:72-76`), censée protéger ces fichiers, **nomme trois
collections qui n'existent dans aucun modèle**.

**4. Le code n'est pas prêt pour un disque distant.** Le pilote S3 (`league/flysystem-aws-s3-v3`)
n'est pas installé, et cinq chemins supposent un fichier local (`$media->getPath()` passé à
`response()->file()`, `file_get_contents`, un lecteur CSV, et le filigrane qui réécrit les
conversions sur place).

## Décision

**Chaque environnement a deux seaux R2 — un public, un privé — et les images publiques sont servies
par Cloudflare Transformations depuis le domaine du seau public.**

1. **Seau public `takussan-<env>-media`**, région `WEUR` (la plus proche de Dakar), attaché à un
   domaine proxifié : `media-preview.takussan.com`, puis `media.takussan.com`. ⚠ **Un seul niveau
   de sous-domaine** : le certificat universel de l'offre gratuite couvre `*.takussan.com`, pas
   `*.media.takussan.com` — `preview.media.takussan.com` échouerait sur TLS. Porte les photos de
   biens, les avatars, les logos, les plans et les vidéos de biens.
2. **Seau privé `takussan-<env>-private`**, sans accès public ni domaine. Porte toute collection
   qui n'a pas vocation à s'afficher sur la surface publique. Un fichier privé ne se sert que par
   l'API, **après** la décision d'autorisation, par une URL présignée courte (`temporaryUrl`,
   5 minutes) ou en flux.
3. **La règle par défaut est privée.** Une collection est publique parce qu'elle est nommée dans le
   modèle comme telle ; une collection nouvelle qui oublie de se déclarer tombe sur le disque privé.
   L'erreur inverse — celle d'aujourd'hui — expose ; celle-ci casse un affichage, bruyamment.
4. **Le front ne passe plus par l'optimiseur de Next** : un `loaderFile` réécrit toute URL du seau
   public en `https://<domaine-média>/cdn-cgi/image/width=…,quality=…,format=auto,onerror=redirect/<chemin>`.
   Les largeurs sont **arrondies à un petit jeu fixe**, parce que Transformations facture la
   transformation **unique** (source × paramètres) : 5 000 par mois gratuites, puis 0,50 $ les
   1 000, et `format=auto` ne compte qu'une fois quel que soit le format servi. Au-delà du quota
   gratuit, une transformation neuve rend l'erreur `9422` ; `onerror=redirect` renvoie alors
   l'image source (même zone), ce qui dégrade le poids sans rien casser.
5. **L'original d'une photo de bien vit sur le seau PRIVÉ, ses conversions sur le seau public**
   (`useDisk(privé)->storeConversionsOnDisk(public)`). La règle de TCK-356 (`full` est le plafond
   public, l'original est réservé à `viewRaw`) ne peut pas tenir par la seule discrétion de l'API :
   ⚠ **la première rédaction de ce point l'affirmait, et c'était faux** — mesuré par la
   vérification adverse du 2026-09-21, l'original était à une clé qui se déduit de `full` (retirer
   `conversions/` et `-full`), sur le même domaine public, et Transformations l'aurait servi
   redimensionné. *Une URL qu'on ne publie pas n'est pas une URL privée.* Une conversion n'est
   servie publiquement qu'une fois filigranée (ou quand l'agence n'exige pas de filigrane) : l'API ne
   rend jamais l'URL d'une conversion nue.
6. **Les URL de médias sont versionnées** (`media-library.version_urls`) : une conversion
   régénérée — filigrane d'agence modifié — change d'URL, et le cache de Cloudflare n'a rien à
   purger.
7. **Le volume `storage` reste**, pour ce qui n'est pas un média : exports RGPD, exports du journal
   d'activité, fichiers temporaires. Il n'est plus sauvegardé : ce qu'il contient est éphémère et se
   régénère.
8. **Le seau privé se sauvegarde, le seau public non.** R2 n'a pas de versionnement d'objets : une
   suppression applicative est définitive. Le seau privé est copié chaque nuit vers
   `vps-sauvegardes` par copie **incrémentale** (seuls les objets neufs voyagent). Le seau public ne
   porte que des images dont l'original est dans le même seau, et une photo perdue se redemande à
   l'agence ; il reçoit la même copie en production, pas en préproduction.
9. **Les identifiants S3 sont par environnement et limités à ses deux seaux**, jamais ceux de
   `vps-sauvegardes` : une fuite du jeton de l'application ne doit pas atteindre les sauvegardes.

## Conséquences

- **Ce qui disparaît** : 6,6 Go d'archives nocturnes ; l'encodage d'images sur le VPS ; la perte du
  cache d'images à chaque déploiement ; l'exposition des fichiers privés par identifiant séquentiel.
- **Ce qui coûte** : R2 au-delà de 10 Go (0,015 $/Go-mois, sortie gratuite) ; Transformations au-delà
  de 5 000 transformations uniques par mois, qui exige l'offre payante d'Images. Le suivi se lit au
  tableau de bord (Images → Transformations).
- **Ce qui dépend désormais de Cloudflare** : l'affichage de toute image. Une panne de Cloudflare
  coupait déjà le front (proxifié) ; elle coupe maintenant aussi les images servies à un client
  mobile qui parlerait à l'API en direct.
- **Ce qui devient plus lent** : l'upload (l'API écrit vers R2 au lieu du disque) et la génération
  des conversions (lecture et écriture distantes). C'est pourquoi les conversions lourdes passent en
  file sur `worker-media`.
- **Le développement local ne change pas** : `MEDIA_PUBLIC_DISK=public` et `MEDIA_PRIVATE_DISK=local` par
  défaut, sans R2 ni MinIO. Le loader laisse passer telle quelle toute URL hors du domaine de médias.
  Le code distant est éprouvé par les tests sur un disque simulé, et en préproduction.
- **L'intégration CDN de TCK-105** (Bunny, signature, purge) n'est plus sur le chemin. Elle reste
  désactivée ; son retrait est un ticket à part.

## Application

- `config/filesystems.php` : disques `r2-media` et `r2-private`. `config/media-library.php` :
  `disk_name` lit `MEDIA_PRIVATE_DISK` (le défaut **est** le privé, point 3), `public_disk_name` lit
  `MEDIA_PUBLIC_DISK` ; `MEDIA_DISK` disparaît. Chaque collection publique le déclare par
  `useDisk(config('media-library.public_disk_name'))`, et un test énumère les collections publiques
  pour qu'une bascule silencieuse de l'une d'elles rougisse (TCK-538).
- Chemins locaux rendus indépendants du disque, filigrane compris (TCK-539).
- `takussan-web/src/lib/image-loader.ts` et `NEXT_PUBLIC_MEDIA_URL`, inlinée au build (TCK-540).
- Bascule de la préproduction, copie des médias existants, sauvegarde du seau privé, relevé dans
  [`docs/infra/hebergement.md`](../infra/hebergement.md) (TCK-541).

## Amendement du 2026-10-04 — les photos de biens ne passent plus par Transformations (TCK-585)

### Pourquoi

Transformations facture une transformation unique **une fois par 30 jours**, en cache ou non
(documentation de Cloudflare, relue le 2026-10-04). Le catalogue entier est donc recompté chaque
mois : les robots d'indexation suffisent à toucher chaque photo à chaque palier. La facture suit
le **nombre de photos**, pas le trafic, et le jeu de six paliers du §4 n'y change que le
multiplicateur.

Or l'API produit déjà les tailles servies (`thumbnail`, `preview` 800 × 600, `full` ≤ 1600), et
la sortie de R2 est gratuite. Ce qu'on payait à Cloudflare, c'est seulement le redimensionnement
au palier exact et le passage de JPEG à AVIF/WebP.

### Décision

1. **Les conversions des photos de biens sont produites en WebP** (`->format('webp')`), aux
   mêmes dimensions. Le filigrane est réencodé dans le même format (`WatermarkService` choisit
   son encodeur d'après l'extension).
2. **Le loader rend telle quelle une conversion de photo en `.webp`**, sans passer par
   `/cdn-cgi/image/`. Toute autre URL du seau public (avatars, logos, plans, et toute
   conversion encore en `.jpg`) garde le §4.
3. **Le loader ne fabrique jamais l'URL d'une conversion à partir d'une autre.** Seule l'API
   émet une URL de conversion (`PublicPhotoUrl`), après avoir vérifié qu'elle est produite et,
   si le bien l'exige, filigranée. Une URL dérivée par le front (`-preview` → `-full` selon la
   largeur) pourrait viser un fichier nu ou absent (TCK-547).
4. **Le format se décide par média, pas pour tout le parc.** `getUrl()` calcule l'extension à
   partir de la conversion *déclarée*, jamais du fichier présent : basculer toutes les
   déclarations d'un coup rendrait une URL `.webp` sur chaque fichier `.jpg` existant, soit un
   404 sur tout le parc jusqu'à sa régénération. Le marqueur
   `custom_properties.conversions_format = 'webp'` est posé à la **création** d'une photo, donc
   avant sa première conversion. Une photo plus ancienne n'en a pas, et ses URL restent en `.jpg`,
   sur des fichiers qui existent.
5. **La bascule d'une photo ancienne se fait photo par photo** (`media:convert-photos-to-webp`) :
   sous verrou, pose du marqueur, conversions marquées non produites et retirées de la trace ;
   puis suppression des anciens fichiers, puis production **et filigrane des trois conversions
   dans le même job**. Pendant cette fenêtre, l'API n'émet aucune URL de la photo (rien n'est
   produit). **Jamais un 404, jamais un fichier nu**, et rien n'est laissé à la file.

   ⚠ **La première version laissait `preview`, `full` et le filigrane à la file, et c'était
   faux.** Mesuré en préproduction le 2026-10-04 : 858 biens sur 858 exigent le filigrane. Les
   3 446 bascules mises en file d'un coup passaient devant tout ce qu'elles y ajoutaient : 71
   photos basculées sur 72 étaient cachées une minute après le lancement, et le catalogue entier
   l'aurait été pendant environ une heure. Les bascules restantes ont été retirées de la file
   (22:11 Z), et les photos déjà basculées ont réapparu une fois leurs jobs passés (22:15 Z :
   244 biens publics sur 244 avec photo, tous en 200). *Une file remplie d'un coup ne sert pas ce
   qu'on y ajoute ensuite.*

### Ce que ça coûte — mesuré le 2026-10-04 sur la préproduction, une photo réelle (800 × 600)

| Ce qui est servi | Poids |
|---|---|
| `preview` en JPEG, servie telle quelle (le repli `onerror=redirect` d'aujourd'hui) | 60 553 o |
| Transformations, AVIF, `width=384` | 12 573 o |
| Transformations, AVIF, `width=640` | 25 585 o |
| Transformations, AVIF, `width=960` (et 1280, 1920 : la source fait 800 px) | 34 378 o |
| La même `preview` réencodée en WebP qualité 75 par GD (l'encodeur de l'API) | 38 162 o |

```bash
curl -s -H 'Accept: image/avif,image/webp,*/*' -o /dev/null -w '%{size_download} %{content_type}' \
  "https://media-preview.takussan.com/cdn-cgi/image/width=640,quality=75,format=auto,onerror=redirect/1993/conversions/268d005ada12bebc61fbe5f02961dbd9769c4992-preview.jpg?v=1790091866"
```

**L'écart est accepté, et il est là où il est** : la galerie paie à peu près le même poids
(38 Ko contre 34). Une carte mobile (palier 640) paie +50 % (38 Ko contre 26). Une carte de
grille sur grand écran (palier 384) paie ×3 (38 Ko contre 13). Contre cela, la facture de
Transformations pour les photos tombe à zéro, quelle que soit la taille du catalogue, et le
poids reste inférieur à celui du JPEG que le quota dépassé servait déjà. Une conversion
intermédiaire (une `card` d'environ 480 px) rapprocherait la carte de l'AVIF à 640 sans rien
facturer. C'est un ticket à part, à décider sur mesure.

### Relevé après — 2026-10-05, préproduction basculée

Même photo (média 1993), même commande, sur l'URL que l'API émet désormais (`…-preview.webp`,
servie sans `/cdn-cgi/image/`) :

| Ce qui est servi | Poids |
|---|---|
| `preview` en WebP qualité 75, **filigranée**, servie telle quelle | 34 690 o |
| `full` (même fichier : la source fait 800 px, `full` n'agrandit rien) | 34 690 o |
| `thumbnail` | 10 002 o |

L'écart accepté plus haut se confirme : la galerie est au poids de l'AVIF (35 Ko contre 34), et
une carte mobile paie +36 % (35 Ko contre 26). Le compte de transformations sur 30 jours ne se
lit qu'au tableau de bord, et il ne baisse qu'en fenêtre glissante : il reste à relever, au plus
tôt le 2026-11-04 (TCK-585, AC7). Détail de la bascule et des relevés : le ticket.

## Amendement du 2026-10-23 — la route signée sert aussi une conversion nommée (P180.02)

Décision du porteur du 2026-10-23, sur la piste P180.02 (angle 180 du fichier de pistes,
`docs/plans/2026-10-15-pistes-d-amelioration.md`). Il précise le point 2 de la décision : comment
un fichier privé sort par l'API. Relu sur `pre-dev` 4a12ba515.

### Pourquoi

Un fichier privé ne sort que par une URL d'API signée. `PrivateMediaAccess::signedUrl()` l'émet
vers `media.private.show` (`GET /api/media/{media}/file`, `routes/api/media.php:22-24`), et
`PrivateMediaController` y répond par `PrivateMediaAccess::redirect($media)`. Cette réponse est une
URL présignée de 5 minutes vers **l'original**.

**La route ne sait servir que l'original.** `MediaResource::conversionUrl()` le dit : « la route
signée ne sert que l'original : une conversion privée n'a pas d'URL à exposer » (TCK-545).

Conséquence relevée le 2026-10-23 :

- **État des lieux.** `InventoryResource::roomPhotos()` sert l'original signé de chaque photo de
  pièce (l. 126). `InventoryDetail.tsx` l'affiche dans une grille de 3 à 6 colonnes. La collection
  a pourtant une conversion `preview` à 600 px (`Inventory::registerMediaConversions`,
  `PdfImageEmbedder::MAX_WIDTH`, en file depuis TCK-1425). Seul le PDF la lit.
- **Maintenance.** `MaintenanceRequestResource` sert de même l'original signé (l. 136).
  `MaintenanceGallery.tsx` le pose en `<img src>` dans des tuiles carrées. Les trois requêtes de
  photos acceptent jusqu'à 10 Mo par fichier (`max:10240`). `MaintenanceRequest` ne déclare aucune
  conversion.

Le téléphone d'un locataire ou d'un prestataire télécharge donc chaque photo entière, puis la
décode en pleine résolution pour une tuile d'une centaine de pixels. C'est déduit du code, pas
mesuré au navigateur.

### Décision

1. **`media.private.show` sert aussi une conversion nommée.** Le nom de la conversion fait partie
   de l'URL signée : un paramètre couvert par la signature, qui ne se modifie donc pas sans la
   casser. Sans ce paramètre, la route sert l'original, comme aujourd'hui.
2. **La conversion servie est propre à la collection.** Une liste, tenue en code, nomme pour chaque
   collection privée les conversions que la route peut servir. Une conversion absente de la liste,
   ou pas encore produite, n'est pas servie.
3. **La même décision d'autorisation couvre la conversion et l'original.** La signature est émise
   par une réponse déjà autorisée pour ce média (règle de TCK-539) : la ressource qui a le droit de
   rendre l'original a le droit de rendre sa vignette. Rien ne s'ouvre au-delà de ce que la réponse
   montrait déjà.
4. **La conversion vit sur le même disque privé que l'original.** Elle sort par la même porte,
   `PrivateMediaAccess` : présignature courte sur R2, flux sur un disque qui ne présigne pas. Elle
   n'est jamais publiée sur le seau public.
5. **Ordre d'application.**
   - **D'abord la `preview` des `room_photos`** de l'état des lieux : la conversion existe déjà.
     `InventoryResource` rend l'URL signée de la `preview` quand elle est produite, et garde
     l'original au clic.
   - **Puis les photos de maintenance** (`photos`, `before_photos`, `completion_photos`). Elles
     n'ont encore aucune conversion : leur ticket en déclare une, en file, puis la sert de même.

### Ce que ça change, et ce que ça ne change pas

- **Les vignettes privées ne chargent plus l'original.** Une `preview` fait 600 px de large au plus,
  en JPEG à 70 % (son poids n'est pas mesuré ici). L'original d'une photo de maintenance va jusqu'à 10 Mo, celui d'une
  photo d'état des lieux jusqu'à 5 Mo.
- **`MediaResource::conversionUrl()` change de règle.** Une conversion privée a désormais une URL :
  l'URL signée qui la nomme. Son commentaire (TCK-545) suit.
- **Une conversion privée qui n'est pas encore produite** (elle est en file) laisse la ressource
  rendre l'original. Rien ne casse pendant que la file tourne.
- **Le seau public et Transformations ne sont pas concernés.** Le point 5 et l'amendement du
  2026-10-04 valent pour les images publiques. Celui-ci ne vise que le disque privé.
- **La borne de 20 Mpx s'applique aussi aux photos de maintenance** (décision du porteur du
  2026-10-23). Produire leur conversion fait décoder ces images par le serveur (GD). Les trois
  requêtes de maintenance (`UploadPhotosMaintenanceRequestRequest`,
  `CompleteMaintenanceRequestRequest`, `ContestMaintenanceResolutionRequest`) gagnent donc
  `PixelsAuPlus`, la règle que portent déjà les photos de pièce
  (`UploadRoomPhotosInventoryRequest.php:42`). En pratique, aucune photo envoyée par l'application
  n'est refusée : le front réduit déjà chaque photo de maintenance à 2 560 px de grand côté avant
  l'envoi (`reduire-photo.ts`, TCK-542), soit moins de 7 Mpx. La borne ne refuse qu'un envoi direct
  à l'API, ou un envoi dont la réduction a échoué.

### Application

- `PrivateMediaAccess::signedUrl()` accepte une conversion. `PrivateMediaController` la lit,
  vérifie qu'elle figure dans la liste de la collection et qu'elle est produite, puis la sert par
  `redirect()`.
- `InventoryResource::roomPhotos()` rend l'URL de la `preview` à côté de celle de l'original.
  `InventoryDetail.tsx` affiche la vignette et ouvre l'original au clic.
- Les trois requêtes de photos de maintenance gagnent `PixelsAuPlus`, avec la conversion.
- **Gardes** :
  - un test de ressource qui attend une URL de vignette distincte de l'original ;
  - un test qui refuse en 422 un en-tête d'image de 10 000 × 10 000 sur les trois routes de photos
    de maintenance ;
  - un test de la route qui refuse une conversion hors de la liste, et une URL dont on a changé le
    nom de conversion (signature invalide) ;
  - un test qui affirme que la conversion servie est bien celle demandée.

  Chaque garde se vérifie par ablation.

## Amendement du 2026-10-30 — la copie du seau privé est un instantané par jour, gardé 14 jours (TCK-2407)

Décision prise en autonomie la nuit du 2026-10-29 au 30, à revoir avec le porteur
([TCK-2407](../backlog/tickets/TCK-2407-sauvegarde-du-seau-prive-conserve-les-fichiers-purges.md)).
Elle remplace la copie incrémentale du point 8.

### Pourquoi

Le point 8 copiait le seau privé par `rclone copy`, « jamais `sync` » : un objet supprimé du seau
restait dans la sauvegarde. C'était voulu contre une suppression par erreur, mais c'est **sans
limite**. Tout ce que l'application efface exprès y survit donc :

- les captures, photos et preuves que la purge du Radar efface à 90 jours, ou dès un STOP
  (`RadarPurger`, `RadarOrphanFiles`, TCK-2391) ;
- les pièces qu'un utilisateur fait supprimer (KYC, documents).

La politique de confidentialité promet l'inverse (`takussan-web/src/content/legal/privacy.ts`, § 6) :
« effacées dès que vous demandez à ne plus être contacté », puis « Sauvegardes : conservées au plus
14 jours, puis écrasées ».

### Options pesées

- **(a) Une règle de cycle de vie R2 qui expire les objets de la copie après 14 jours.** Écartée,
  car elle est fausse seule. Un objet vivant et inchangé n'est jamais recopié : il vieillirait dans la
  copie puis en disparaîtrait, alors qu'il vit encore.
- **(b) Un instantané complet par jour, et les 14 plus récents gardés.** Retenue.
- **(c) `rclone sync` vers une copie courante, et les objets retirés déplacés dans un dossier daté
  (`--backup-dir`).** Écartée. Elle est moins chère en opérations, mais le verrou de rétention de
  7 jours sur `vps-sauvegardes` (ADR-0069 § 5) refuse d'effacer ou d'écraser un objet de moins de
  7 jours. Un STOP le lendemain d'une capture ferait échouer la copie chaque nuit pendant une
  semaine, avec une alerte Telegram par nuit. Lever le verrou rouvrirait le risque qu'il ferme : un
  VPS compromis qui efface les sauvegardes.

### Décision

1. **Chaque passage copie le seau privé entier sous un préfixe daté** :
   `vps-sauvegardes/<seau>/jours/AAAA-MM-JJ/` (date UTC du passage). La copie reste un
   `rclone copy` de seau à seau, côté serveur. Elle n'efface et n'écrase rien dans un instantané
   existant. Un second passage le même jour complète l'instantané du jour.
2. **Un instantané n'est complet que s'il porte son marqueur.** Une copie réussie pose
   `jours/AAAA-MM-JJ/.complet`, une fois par jour : sous le verrou, le réécrire serait refusé. Une
   copie interrompue laisse un instantané **partiel**, sans marqueur : rclone 1.71 sort alors en
   code 8 avec une cible incomplète (reproduit par la vérification adverse). On ne restaure jamais
   depuis un instantané partiel. On restaure depuis le plus récent qui porte `.complet`.
3. **La rotation retire les instantanés datés de `RETENTION_JOURS` jours ou plus** (14 par défaut),
   **sauf le plus récent instantané complet**, et rien du tout s'il n'y en a aucun. Elle ne compte
   que les jours complets : un jour partiel n'est jamais pris pour le dernier complet. Elle tourne
   après chaque passage, même après une copie en échec. Une panne longue ne garde donc pas tout,
   mais elle ne retire jamais la seule sauvegarde complète qui reste.
4. **La rotation se fait dans le script, pas par une règle de cycle de vie R2.** Une règle
   effacerait aussi quand les copies s'arrêtent. Si le VPS tombe, la sauvegarde du seau privé
   disparaîtrait 14 jours plus tard, c'est-à-dire au moment où on en a besoin.
5. **Seuls les préfixes en forme de date sont retirés.** Tout autre préfixe sous `jours/`, y compris
   un instantané daté dans le futur, est laissé en place.
6. **La liste des effacements a, en plus, une copie jamais tournée** : `vps-sauvegardes/<seau>/effacements/`,
   par `rclone copy`, qui ne supprime rien. ADR-0044 § B avait choisi le seau privé parce que sa
   copie gardait cette liste sans limite. Sans cette copie, un préfixe `effacements/` effacé du seau
   (VPS compromis, erreur d'exploitation) quitterait la sauvegarde 14 jours plus tard. Une
   restauration de base ne pourrait plus rejouer les effacements, et les comptes reviendraient en
   clair. La liste ne porte que l'identifiant et l'instant : la garder sans limite ne heurte pas
   `privacy.ts` § 6.
7. **Le jeton ne change pas.** `takussan-preview-backup` lit le seau privé et écrit dans
   `vps-sauvegardes`. Il efface déjà dans `vps-sauvegardes`, au-delà de 7 jours, et il n'efface
   jamais dans le seau privé. Aucune règle de cycle de vie n'est posée.
8. **L'ancienne copie plate** (`vps-sauvegardes/<seau>/<id>/…`, depuis le 2026-09-22) se retire une
   fois, par `sauvegarde-seau-prive --retirer-copie-plate`. Cette commande refait d'abord un passage
   complet, puis efface tout ce qui est hors de `jours/` et de `effacements/`. Elle refuse une
   `CIBLE` à la racine d'un seau, qui emporterait les dumps et la configuration de Dokploy. Le
   porteur la lance au moins 8 jours après le premier passage du nouveau script, une fois sorti du
   verrou de 7 jours.
9. **Une configuration fautive n'arrête pas les sauvegardes en silence.** Un secret absent ou un
   `JOUR` mal formé est alerté sur Telegram. Un `RETENTION_JOURS` invalide est alerté, et le passage
   se fait quand même avec 14. Au-delà de 14, un avertissement est écrit au journal.

### Ce que ça garantit, et ce que ça coûte

- **Un objet effacé du seau privé** quitte la sauvegarde **au plus 14 jours** après son effacement,
  **tant que les passages réussissent**. Effacé entre le passage du jour J−1 et celui du jour J, son
  dernier instantané est celui de J−1, retiré au passage du jour J+13. Après une série d'échecs, le
  dernier instantané complet reste jusqu'au passage réussi suivant, et le timer
  (`RandomizedDelaySec`, `Persistent`) ajoute quelques minutes. Un objet effacé **par erreur** se
  restaure pendant 13 jours depuis un instantané complet d'avant l'effacement, contre « toujours »
  auparavant.
- **Un objet vivant** est dans chaque instantané complet, donc dans le plus récent, quel que soit son
  âge. La restauration à blanc de TCK-541 lit le dernier instantané complet.
- **La liste des effacements** est dans chaque instantané complet tant qu'elle vit dans le seau, et
  dans sa copie jamais tournée pour toujours.
- **Le verrou de 7 jours reste compatible.** Un instantané a 14 jours quand il est retiré.
  `RETENTION_JOURS` sous 8 serait refusé par le verrou et alerté chaque nuit. Au-delà de 14, la
  promesse de `privacy.ts` § 6 ne tiendrait plus.
- **Le coût est multiplié par 14 en stockage**, et chaque passage fait un CopyObject (classe A)
  par objet, soit environ 30 fois le nombre d'objets par mois. Relevé du 2026-09-22 : 3 444 objets,
  201,4 Mo, soit environ 2,8 Go et 100 000 opérations par mois. Le million d'opérations de classe A
  gratuit tombe vers **33 000 objets** (1 M / 30). Au-delà, 4,50 $ par million. Mais la gratuité de
  R2 (10 Go, 1 M d'opérations de classe A par mois) est **par compte**. Elle est partagée avec les
  dumps, les archives de Dokploy, l'archive du volume (902 Mo), `takussan-wal`, les deux seaux de
  médias et les écritures de l'application. Que tout cela reste gratuit n'est donc pas établi : la
  consommation du compte se relit au tableau de bord avant la production. Le repli est l'option (c),
  au prix d'un verrou limité à un préfixe.

### Application

- `deploy/server/sauvegarde-seau-prive.sh` : instantané daté, marqueur `.complet`, rotation qui
  garde le dernier complet, copie jamais tournée de `effacements/`, `RETENTION_JOURS`,
  `--retirer-copie-plate` (racine de seau refusée), alerte Telegram sur tout échec, configuration
  comprise.
- `scripts/test-sauvegarde-seau-prive.sh`, joué par `repo-ci.yml`, fait tourner le vrai script sur un
  R2 simulé en local, avec des dates simulées. Le talon reproduit la copie interrompue de rclone 1.71
  et son NOTICE sur stderr. Il vérifie :
  - l'objet effacé, absent au plus tard 14 jours après ;
  - l'objet vivant, toujours là avec le même md5 ;
  - la liste des effacements, gardée après sa disparition du seau ;
  - l'instantané partiel, sans marqueur, et le dernier complet jamais retiré ;
  - les alertes ;
  - `--essai`.

  Huit ablations ôtent chacune une garde et attendent un rouge.
- Relevé et procédure dans [`docs/infra/hebergement.md`](../infra/hebergement.md), ligne « Copie du
  seau privé des médias ».
