# ADR-0115 — Le fichier d'un export se garde sept jours, à son seul auteur

- **Statut** : Accepté le 2026-11-15 — décision du porteur « implémente tout », modalités à revoir
- **Date** : 2026-11-15
- **Tickets** : TCK-2866 (API), TCK-2868 (écrans)
- **Révise** : la décision de TCK-2627 / TCK-2629 « aucun fichier n'est conservé ni promis » (« Mes derniers exports » relus du journal, « Refaire » au lieu de « Retélécharger »)
- **S'appuie sur** : [ADR-0029](0029-medias-sur-r2-servis-par-cloudflare-transformations.md) (stockage privé), [ADR-0031](0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md) (périmètre du personnel), le précédent de l'archive du coffre (`DocumentVaultArchive`, TCK-2812) et de l'archive RGPD (`DataExport`, TCK-225)

## Contexte

La maquette de Rapports (`app-rapports`, « Exports ») porte « Retélécharger » sur chaque export passé. L'API ne le sert pas :

Mesuré le 2026-11-15 (worktree `feat/audit-manques-2026-11-15`) :

- `GET /api/export/{entity}` fabrique le fichier à la volée (`ExportController::show` → `ExportWriter::respond`) et n'en garde rien ; il écrit au journal `export` / `data_exported` l'entité, les bornes, le format et le nombre de lignes.
- `GET /api/me/exports` relit ce journal (`MeExportsController`, TCK-2627) et le dit dans son en-tête : « Rien n'est stocké ni retéléchargé : « Refaire » rejoue `export/{entity}` […] sous les capacités d'AUJOURD'HUI ».
- Les exports portent des **données personnelles** : fiches clients (nom, courriel, téléphone), baux et locataires, paiements et payeurs, impayés nommés.
- La politique de confidentialité (`takussan-web/src/content/legal/privacy.ts`, § 6) ne nomme que « l'archive d'export de vos données : 7 jours ».

Garder le fichier, c'est garder une copie de ces données hors des tables qu'elles décrivent : une rectification ou un effacement ne l'atteint pas. C'est une décision de rétention, qui doit dire combien de temps, où, pour qui, et comment elle finit.

## Décision

### 1. Le fichier produit est gardé `exports.retention_days` jours (défaut 7)

Chaque appel réussi de `GET /api/export/{entity}` écrit **le fichier même qu'il sert** (mêmes octets) sur le disque privé, et une ligne `export_files` qui le désigne :

- `user_id` (l'auteur), `agency_id` (l'agence active de l'auteur au moment de l'export, la même que le journal), `activity_id` (la ligne du journal `data_exported`), `entity`, `format`, `filename`, `mime`, `size_bytes`, `disk`, `path`, `expires_at`.
- `expires_at = created_at + exports.retention_days` (configuration `EXPORT_RETENTION_DAYS`, défaut **7**, comme l'archive RGPD et les exports de rapport de la console).
- Le disque est celui des fichiers privés de l'application, `config('media-library.disk_name')` (`MEDIA_PRIVATE_DISK` : `r2-private` en préproduction depuis ADR-0029, `local` en développement et en test), comme l'archive du coffre. Le chemin n'est jamais rendu par l'API.
- Le fichier est écrit **une fois**, puis servi depuis le disque : la réponse de l'export et le fichier gardé sont les mêmes octets.

### 2. Seul son auteur le retélécharge, et seulement tant qu'il pourrait le refaire

`GET /api/me/exports/{id}/download` (`{id}` : l'identifiant de la ligne de `GET /api/me/exports`, celui du journal) :

- authentifié (`auth:sanctum`) ; **403** si l'export n'est pas de l'appelant (aucune lecture d'un export d'un autre, super-admin compris : il n'est pas auteur) ;
- **410 `export.file_expired`** dès `expires_at` passé — que la purge ait tourné ou non ;
- **404** si aucun fichier n'a été gardé (export d'avant ce changement) ;
- **re-jugé sous les capacités d'aujourd'hui** : l'appelant doit encore tenir le droit d'exporter cette entité (`ShowExportRequest`, même règle, même ordre) **dans la même agence** que l'export. Un membre retiré de l'agence ou dont le rôle a perdu `crm.export` ne retélécharge plus : 403 `export.forbidden`. Le fichier n'élargit jamais ce que l'appelant pourrait refaire.
- Pas d'URL signée : le relais du front porte le jeton, et une URL signée serait un secret porteur de données personnelles dans l'historique d'un navigateur ou d'une messagerie. Chaque retéléchargement entre au journal (`export` / `data_export_redownloaded`).

`GET /api/me/exports` rend, par ligne, son `id` et `file: {available, expires_at}` (`available` faux après l'échéance, ou sans fichier).

### 3. La purge est planifiée

- `exports:purge-files` tourne **toutes les heures** : il efface le fichier de chaque ligne échue, puis la ligne. Idempotent (effacer un fichier absent ne fait rien).
- La ligne `export_files` part avec son auteur ou son agence (`cascadeOnDelete`). Un compte est d'ordinaire anonymisé, pas supprimé : son fichier reste alors jusqu'à l'échéance, **7 jours au plus** — c'est la durée qui borne ce cas, sans traitement à part. Une suppression en base laisserait le fichier sans ligne sur le disque privé ; aucune voie de l'application ne supprime un compte ainsi aujourd'hui.
- La ligne du journal reste (journal des exports : 5 ans, § 6 de la politique) ; seul le fichier s'efface. Un retéléchargement après la purge rend 410 (l'export est plus vieux que la durée de garde), un export d'avant cette décision 404 tant qu'il est plus récent.

### 4. La politique de confidentialité le dit

§ 6 (`takussan-web/src/content/legal/privacy.ts`, fr et en) : « **Fichiers exportés par le personnel d’une agence** (listes de clients, baux, paiements) : 7 jours, retéléchargeables par leur seul auteur, puis suppression automatique. »

## Conséquences

- **Ce que ça coûte** : une table, un disque écrit à chaque export (au plus 10 000 lignes CSV, 5 000 XLSX, 200 PDF), une purge horaire. Le fichier est produit en mémoire avant d'être écrit, au lieu d'être diffusé ligne à ligne : la borne de mémoire est celle d'aujourd'hui (`ExportMemoireAuPlafondTest`).
- **Ce que ça interdit** : retélécharger le fichier d'un autre ; retélécharger ce qu'on ne pourrait plus exporter ; garder un fichier plus longtemps que la configuration ne le dit.
- **Ce que ça rend possible** : « Retélécharger » (TCK-2868) ; une durée réglée par environnement.
- **Ce qui reste vrai** : une rectification ou un effacement faits pendant ces 7 jours n'atteignent pas un fichier déjà produit. C'est la durée qui borne ce défaut.

## Application

- `App\Models\ExportFile`, migration `2026_11_15_286601_create_export_files_table` ; `App\Services\Export\ExportFiles` (écriture, lecture, effacement) ; `ExportWriter::render()` / `serve()` (les octets rendus une fois) ; `App\Http\Controllers\Api\Me\MeExportsController::download` ; `ShowExportRequest::judge()` (la règle de l'export, partagée) ; `App\Console\Commands\PurgeExpiredExportFiles` (`exports:purge-files`, `routes/console.php`) ; `config/exports.php` (`EXPORT_RETENTION_DAYS`).
- Garde : `tests/Feature/Api/ExportRetentionTest.php` (2 jours → 200, mêmes octets, CSV et PDF ; 8 jours → 410, avant et après la purge ; export d'un autre, super-admin compris → 403 ; auteur sorti de l'agence → 403 ; la purge garde les fichiers non échus) ; `MeExportsTest` (forme de « Mes derniers exports »).
