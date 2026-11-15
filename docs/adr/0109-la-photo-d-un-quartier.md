# ADR-0109 — La photo d'un quartier est choisie par le super-admin, sans crédit affiché, et Wikimedia n'en propose que de libres de toute attribution

- **Statut** : Accepté le 2026-11-15. Décisions du porteur : 1 (a) « le super-admin seul, mais faciliter en proposant depuis Wikimedia et Unsplash », 2 (a) « seulement les tuiles de l'accueil », 3 (c) « aucun crédit affiché », 4 (a) « la tuile de la maquette telle quelle ». Les modalités (import par titre, filtre de licence, recadrage centré, fusion) sont des décisions de la session, à revoir.
- **Date** : 2026-11-15
- **Tickets** : TCK-2844
- **S'appuie sur** : [ADR-0062](0062-referentiel-geographique-region-ville-quartier.md) (le référentiel des quartiers), [ADR-0029](0029-medias-sur-r2-servis-par-cloudflare-transformations.md) (seau public, images servies par Transformations), [ADR-0106](0106-la-maquette-retenue-fait-foi-au-pixel.md) (la maquette retenue fait foi)

## Contexte

Relevé sur `dev` (8c60f4c58) le 2026-11-15 :

- **La maquette de l'accueil dessine des tuiles photo.** TCK-2495 demandait « les quartiers en tuiles photo », et `TuileQuartier` (maquette `accueil.tsx`) pose une photo sous un dégradé. Les tuiles ont été livrées **sans photo** parce que l'API n'en servait aucune (TCK-2495, notes) : `GET /api/public/properties/neighborhoods` ne rend que `{value, count}`. Ce n'est pas une décision de produit, c'est un manque.
- **Aucune image n'est rattachée à un quartier** : ni colonne, ni collection de médias, ni route.
- **Le référentiel couvre le besoin** : 362 quartiers approuvés, dont 149 à Dakar ; en base de dev, les 411 adresses de biens publics qui nomment un quartier pointent toutes `geo_neighborhood_id`. L'accueil n'en montre que 8 par ville (`QUARTIERS_DE_L_ACCUEIL_MAX`) : une quarantaine de photos couvrent l'essentiel.
- **`TuilesDeQuartiers` écarte déjà la photo d'un bien prise pour celle du quartier** (« plutôt qu'une photo d'un bien prise pour celle du quartier, le motif bogolan »). La licence des CGU (`terms.ts`, l. 232) prend d'ailleurs fin quand l'annonce est retirée.
- **Les licences des banques d'images ne disent pas la même chose** :
  - Wikimedia Commons sert, par fichier, `extmetadata.AttributionRequired` : la plupart des photos sont en CC BY-SA (attribution due), une minorité en CC0 ou domaine public (`AttributionRequired = false`). L'API est publique, sans clé ; elle demande un `User-Agent` qui identifie l'appelant.
  - La **licence Unsplash** permet de télécharger et réutiliser une photo sans attribution. Mais les **conditions de l'API Unsplash** (clé obligatoire) imposent d'afficher le photographe et Unsplash, et de servir l'image depuis leurs serveurs (*hotlinking*) — ce que la décision 3 (c) et l'hébergement des médias excluent.

## Décision

**Un quartier porte au plus une photo, posée par le super-admin, servie depuis notre disque public, sans crédit affiché. Pour l'aider, la console propose des photos de Wikimedia Commons qui n'exigent aucune attribution, et ouvre la recherche Unsplash dans un nouvel onglet.**

### 1. Où vit la photo

- Collection de médias `cover` sur `GeoNeighborhood` : `singleFile()`, disque `media-library.public_disk_name` (comme le logo d'agence, ADR-0029 §3) ; JPEG, PNG ou WebP, 10 Mo au plus.
- Une conversion `display` : 1 200 px au plus sur le grand côté (`Fit::Max`, jamais d'agrandissement), WebP, **non différée** — l'URL est servable dès la réponse de l'envoi. L'API ne sert que cette conversion : elle borne le poids quand Cloudflare Transformations rend l'image source (`onerror=redirect`, ADR-0029 §4), et le front la redimensionne par son `loaderFile` comme tout logo ou avatar.
- Le carré de la tuile se cadre **au centre**, côté front (`object-cover`). Pas de recadrage interactif en v1 : l'aperçu de la tuile, dans la console, montre ce que le centrage garde.
- Aucune colonne neuve. La provenance s'écrit dans les `custom_properties` du média : `source` (`upload` | `wikimedia`), et pour Wikimedia `source_url` (page du fichier), `author`, `license`. Elle n'est **jamais affichée** au public (3 c) ; elle sert à répondre si un ayant droit se manifeste.

### 2. Qui la pose, et comment

- **Le super-admin seul** (`super-admin`, comme la modération du référentiel), et seulement sur un quartier **approuvé, non fusionné**.
- Trois gestes :
  - **envoyer un fichier** (`POST /api/admin/geo/neighborhoods/{neighborhood}/cover`) ;
  - **importer une proposition Wikimedia** (`POST …/cover/import`, `{ "source": "wikimedia", "title": "File:…" }`) ;
  - **retirer** (`DELETE …/cover`).
- **Les propositions** : `GET …/cover/suggestions` interroge l'API de Commons (espace de noms Fichier, « {quartier} {ville} », images bitmap), et **ne rend que les fichiers dont `AttributionRequired` vaut `false`** et dont la largeur atteint 800 px — c'est ce qui rend la décision 3 (c) tenable. Une panne ou un délai de Commons rend une liste vide marquée `unavailable`, jamais une erreur qui bloque l'envoi manuel.
- **L'import se fait par titre, jamais par URL** : le serveur relit le fichier sur Commons, revérifie `AttributionRequired = false`, télécharge la vignette de 1 600 px que Commons lui donne (arrondie par Commons à sa largeur standard, l'original quand il est plus petit) en exigeant qu'elle soit sur `upload.wikimedia.org` ou `thumb.wikimedia.org` — mesuré le 2026-11-15 : Commons sert ses vignettes sur `thumb.wikimedia.org` —, puis télécharge — aucune URL fournie par le client n'est appelée (pas de SSRF), et une licence changée entre la proposition et l'import est refusée (422 `geo_cover.attribution_required`) ; un hôte, un poids ou un type hors des règles rend 422 `geo_cover.source_invalid`.
- **Unsplash** : un lien « Chercher sur Unsplash » ouvre `unsplash.com/s/photos/{quartier}-{ville}` ; le super-admin télécharge la photo (licence Unsplash, sans attribution) et l'envoie comme un fichier. **Aucune intégration de l'API Unsplash** : elle imposerait crédit et hotlinking.

### 3. Où elle se voit

- **Les tuiles de quartier de l'accueil seulement** (2 a). `GET /api/public/properties/neighborhoods` ajoute à chaque ligne `photo` : l'URL de la conversion `display`, ou `null`.
- Le rapprochement se fait par le **référentiel** : le quartier approuvé, non fusionné, de la ville demandée dont le nom replié (`CaseInsensitive`) est celui de la ligne. Une ligne sans quartier du référentiel a `photo: null`.
- Avec photo, la tuile est celle de la maquette (4 a) : photo plein cadre, dégradé, nom et compte en clair. Sans photo, elle garde le motif bogolan d'aujourd'hui.

### 4. Ce que deviennent les photos dans la vie du référentiel

- **Renommer** ne touche pas la photo.
- **Fusionner** : la cible garde la sienne ; si elle n'en a pas, celle de la source lui est **déplacée**. Une source fusionnée n'a donc jamais de photo.
- **Refuser** un quartier (possible seulement en attente) : il n'a pas pu en recevoir.

## Conséquences

- Les tuiles prennent le rendu prévu par TCK-2495 dès qu'une photo est posée, sans attendre que toutes le soient.
- **Wikimedia proposera peu** : les photos libres de toute attribution sont rares pour les quartiers de Dakar. Ouvrir aux licences CC BY / BY-SA demanderait d'afficher un crédit, donc de revenir sur 3 (c).
- Une photo de quartier est un contenu éditorial de Takussan : l'hébergeur en répond. La provenance gardée dans le média est la seule trace en cas de réclamation.
- Les autres surfaces (pages de quartier indexables, recherche mobile, page « plus disponible ») ne lisent pas la photo ; les y ajouter est un ticket à part.

## Application

- API : `GeoNeighborhood::registerMediaCollections()` / `registerMediaConversions()`, `GeoNeighborhoodCoverController`, `WikimediaCovers`, `GeoNeighborhoodModeration::fusionner()`, `PublicPropertyController::neighborhoods()`.
- Front : `/super-admin/geo` (onglet des quartiers approuvés), `TuilesDeQuartiers`.
- Gardes : les tests de TCK-2844 (`GeoNeighborhoodCoverTest`, `PublicNeighborhoodsPhotoTest`) — dont un import refusé quand Commons répond `AttributionRequired = true`, et la photo déplacée à la fusion.
