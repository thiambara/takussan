# ADR-0054 — Un doublon d'annonce se soupçonne par l'empreinte de la photo ORIGINALE et par l'adresse, entre publieurs différents seulement ; il se signale à la plateforme, il ne se masque jamais seul

- **Statut** : Accepté
- **Date** : 2026-10-08
- **Tickets** : [TCK-597](../backlog/tickets/TCK-597-avis-signalements-et-moderation.md)
- **Complète** : [ADR-0043](0043-avis-cible-eligibilite-moderation-et-verrou-plateforme.md) (le
  verrou plateforme, que la décision `hide` d'un doublon réutilise).

## Contexte

Mesuré sur `dev` (`6dc81542`) :

- **Rien ne repère une annonce recopiée.** Une recherche de `phash|perceptual|imagehash|dhash` dans
  `takussan-api/` ne trouve rien. Un fraudeur qui republie sous une autre agence les photos d'un bien
  réel (l'arnaque au faux bailleur, S18) n'est vu que si un visiteur le signale.
- **La seule duplication existante est VOLONTAIRE** : `PropertyDuplicationService` (TCK-074) clone un
  bien dans la même agence, photos comprises (`copy_media`). Elle produit des doublons légitimes.
- **Les conversions publiques sont filigranées PAR AGENCE** (TCK-539) : la même photo, publiée par
  deux agences, n'a pas les mêmes octets dans ses conversions. Seul l'original est commun.
- **La file `media` et son processus `worker-media` existent** (`app/Jobs/Media/*`) ; GD est déjà
  chargé (`WatermarkService`). Aucun service ni dépendance neuve n'est nécessaire.
- Sur R2 (`r2-media`), `Media::getPath()` désigne un chemin local qui n'existe pas (TCK-539) : un
  fichier se lit par son disque.

## Décision

### 1. L'empreinte : dHash 64 bits, calculée sur l'original

`ComputePhotoFingerprintJob` (file `media`), déclenché par `MediaHasBeenAddedEvent` pour une photo
(`photos`) d'un `Property`. Il lit l'**original** par `Storage::disk($media->disk)` — jamais
`getPath()` — et calcule un **dHash** : l'image réduite à 9×8 en niveaux de gris, un bit par couple
de pixels voisins d'une ligne (gauche plus clair que droite), soit 64 bits.

Pourquoi dHash et pas un pHash : il tient en quelques lignes de GD, sans DCT ni dépendance, il est
stable à la recompression et au redimensionnement, et le cas visé — la **même** photo republiée —
ne demande pas de reconnaître une photo recadrée ou retouchée. Un fichier qui ne se décode pas
(HEIC, PDF, fichier tronqué) ne reçoit pas d'empreinte et ne fait pas échouer le job : il est
journalisé.

L'original, parce que le filigrane d'agence est posé sur les conversions : deux copies de la même
photo publiées par deux agences y différeraient, et deux photos différentes portant le même
filigrane s'y ressembleraient.

### 2. Le stockage et la recherche : quatre bandes de 16 bits indexées, seuil 3

`media_fingerprints` : `media_id` (unique), `property_id`, `agency_id`, `hash` (`bigint`, les 64
bits signés) et `band_0` … `band_3` (les quatre tranches de 16 bits, `integer`), **chacune
indexée** sous un nom explicite.

Le seuil est une **distance de Hamming ≤ 3**. Par le principe des tiroirs, deux empreintes à
distance ≤ 3 ont au moins une bande sur quatre **identique** : la recherche des candidats est donc
une égalité indexée sur l'une des bandes, et elle est **exacte** sous le seuil — aucun faux négatif
introduit par l'index. La distance se vérifie ensuite sur les candidats.

**Borne de passage à l'échelle** : au plus 200 candidats par photo, parmi ceux qui partagent une
bande, provenant des autres publieurs et de biens non supprimés. Ce sont les **plus proches** qui
passent : tri par `bit_count((hash # ?)::bit(64))`, puis par identifiant.

**Empreinte dégénérée** : une empreinte dont le poids de Hamming est inférieur à 8 ou supérieur à 56
ne se compare pas (`PhotoFingerprint::isDegenerate`), ni comme source, ni comme candidat. Elle est
pourtant stockée.

> **Corrigé après verif-597 (m2).** La première version tenait la borne pour une protection (« une
> bande partagée par plus de 200 photos est une image banale »). Elle triait les candidats par
> ancienneté, et la mesure l'a contredite. Un aplat rouge, un aplat bleu et un mur blanc légèrement
> bruité ont tous l'empreinte `0`. Deux agences qui publiaient une photo de mur créaient donc une
> suspicion, et chaque nouvelle photo dégénérée en créait jusqu'à 200. Sous la borne, un vrai
> doublon récent d'une empreinte courante n'était jamais comparé.

### 3. Entre publieurs différents seulement

Deux biens sont comparés seulement s'ils n'ont pas le **même publieur** : même `agency_id` non nul,
ou, sans agence, même `user_id`. La duplication volontaire de TCK-074 reste dans l'agence : elle
n'est jamais signalée, par construction et non par exception.

### 4. Le second signal : l'adresse normalisée

À chaque empreinte calculée, le détecteur compare aussi le bien par son **adresse** aux biens des
autres publieurs : ville et quartier repliés (`CaseInsensitive::fold`), position arrondie au
millième de degré (~110 m), même type de contrat, surface et prix à ±5 %. Tous ces critères à la
fois — un seul ne dit rien à Dakar, où des centaines de biens partagent un quartier.

Il est déclenché par le job de la photo, pas par chaque écriture du bien : `PropertyObserver` ne
porte que `updating` (TCK-599 possède `updated`), et une annonce frauduleuse sans photo n'est pas
le cas visé.

### 5. Une suspicion se signale, elle ne se juge pas seule

`duplicate_suspicions` : le bien soupçonné (`property_id`, le plus récent), celui qu'il recopie
(`matched_property_id`), le signal (`photo` | `address`), la distance, puis la décision
(`decision`, `resolved_by_id`, `reason_code`, `resolved_at`). **Une ligne par paire** : un index
unique sur `(LEAST(property_id, matched_property_id), GREATEST(…))`, et l'insertion se fait par
`insertOrIgnore` — jamais par une exception attendue (piège PostgreSQL n° 1).

La file unifiée gagne `source_type = suspected_duplicate`, décisions `hide` (le verrou plateforme
d'ADR-0043 sur le bien soupçonné) et `reject` (classée).

**Aucun masquage automatique.** Une empreinte proche n'est pas une preuve : deux agences peuvent
légitimement commercialiser le même bien (mandat simple), et un concurrent pourrait faire masquer
une annonce en publiant ses photos. La plateforme tranche.

### 6. Les avis suspects : un drapeau de tri, rien de plus

Un avis de la file porte `suspicious = true` quand l'un de ces faits est mesurable en SQL à la
lecture : **rafale** (au moins 3 avis sur le même sujet en 24 h), **compte récent** (auteur inscrit
depuis moins de 7 jours au dépôt), **empreinte partagée** (`metadata.ip_hash` commun à au moins deux
auteurs sur le même sujet). Il sert au tri de la file. Aucune action automatique.

## Conséquences

- Une photo ajoutée avant ce chantier n'a pas d'empreinte tant qu'elle n'est pas réajoutée ou
  rejouée ; une commande de rattrapage est un ticket de suite, pas ce chantier.
- Deux agences titulaires d'un mandat simple sur le même bien produisent une suspicion, classée par
  la plateforme. C'est le prix de ne pas masquer seul.
- Une recopie retouchée (recadrage, miroir) échappe au dHash. Accepté : le cas mesuré est la
  republication telle quelle.

## Alternatives écartées

- **Empreinte sur une conversion** : filigranée par agence, elle distingue deux copies de la même
  photo et rapproche deux photos différentes.
- **pHash / bibliothèque d'imagerie** : une dépendance et une DCT pour un cas que le dHash couvre.
- **Comparaison à toutes les empreintes** : linéaire en nombre de photos ; les bandes la rendent
  indexée et exacte sous le seuil.
- **Distance calculée en SQL (`bit_count`) pour le seuil** : sur les seuls candidats déjà retenus
  par les bandes, le calcul en PHP est équivalent et plus lisible. `bit_count` sert en revanche à
  **trier** les candidats sous la borne (verif-597 m2).
- **Auto-masquage après une suspicion, ou après N signalements** : contournable et retournable
  contre un concurrent.
- **Comparer aussi dans la même agence** : chaque duplication volontaire deviendrait une suspicion.

## Application

- `App\Jobs\Media\ComputePhotoFingerprintJob`, `App\Listeners\Media\FingerprintAddedPhotoListener`,
  `App\Services\Moderation\DuplicateListingDetector`, `App\Support\PhotoFingerprint` ;
  `tests/Feature/Moderation/DuplicateListingDetectorTest.php`.
- `UnifiedModerationService` (`suspected_duplicate`, drapeau `suspicious`) ;
  `tests/Feature/Api/Admin/SuspiciousReviewFlagTest.php`.
