# ADR-0029 — Les médias vivent dans R2, deux seaux par environnement ; les images publiques sont servies par Cloudflare Transformations

- **Statut** : Accepté
- **Date** : 2026-09-21
- **Tickets** : TCK-538, TCK-539, TCK-540, TCK-541
- **Amendement du 2026-10-04 (TCK-585)** : les **photos de biens** ne passent plus par Transformations. Leurs conversions sont produites en WebP et servies telles quelles ; le §4 ne vaut plus que pour les autres images du seau public (avatars, logos, plans). Voir [§ Amendement du 2026-10-04](#amendement-du-2026-10-04--les-photos-de-biens-ne-passent-plus-par-transformations-tck-585).
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
