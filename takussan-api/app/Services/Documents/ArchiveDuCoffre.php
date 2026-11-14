<?php

namespace App\Services\Documents;

use App\Exceptions\ApiError;
use App\Http\Controllers\Api\DocumentPdfController;
use App\Http\Controllers\Api\InventoryController;
use App\Http\Controllers\Api\OwnerStatementController;
use App\Models\Agency;
use App\Models\Document;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\User;
use App\Services\Media\PrivateMediaAccess;
use App\Services\Pdf\DocumentPdfService;
use App\Services\Privacy\PersonalDataAccessLogger;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Routing\Router;
use RuntimeException;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;
use ZipStream\ZipStream;

/**
 * TCK-2770 — l'archive `.zip` d'un dossier du coffre (`GET /api/me/document-vault/archive?folder=`).
 *
 * **L'archive contient exactement ce que le coffre de l'appelant montre dans ce dossier.** Elle ne juge
 * rien : elle prend le dossier dans le coffre que {@see DocumentVault::for()} rend à l'appelant, avec ses
 * règles. Aucun document interne hors du personnel (TCK-2759), la règle d'auteur, les pièces de profil
 * retirées sous impersonation (TCK-697), le dossier en lecture seule du bailleur bloqué (TCK-2729), qui
 * se lit et se télécharge donc. Un dossier absent du coffre de l'appelant rend 404 : jamais une archive vide.
 *
 *  - une pièce téléversée : son fichier qui fait foi ({@see Document::currentFile()}, TCK-2300), lu en
 *    flux par {@see PrivateMediaAccess::readStream()}. Jamais `getPath()` : les médias sont sur R2 (ADR-0029) ;
 *  - un document généré : rendu par le code de l'endpoint de son `download_path`, après l'autorisation
 *    que le coffre a déjà jugée (`renderLeaseContract`, `streamRentReceipt`, `renderPdf`). Seules les
 *    routes de {@see self::RENDUS} sont rendues ; toute autre refuse l'archive entière.
 *
 * **Tout se décide avant le premier octet.** L'archive s'écrit dans un fichier temporaire, une entrée à la
 * fois (ZipStream : rien ne tient en mémoire que l'entrée en cours), puis se sert en flux. Un refus ou une
 * entrée qui ne se rend pas rend donc un vrai code d'erreur, jamais un `.zip` tronqué sous un 200.
 *
 * **Les bornes** : {@see self::MAX_FICHIERS} entrées et {@see self::MAX_OCTETS} octets de pièces, au-delà un
 * 422 `document.archive_too_large`. La voie asynchrone du ticket (file `media` et lien signé) n'est pas
 * bâtie : au-delà des bornes, les documents se téléchargent un par un.
 *
 * **Les noms dans l'archive** ne portent ni identifiant technique ni chemin de stockage : la date et le
 * libellé de la catégorie pour un généré (celui du front, `vocabulaire-du-coffre.json`), le nom saisi et
 * l'extension du fichier pour une pièce. Séparateurs, caractères de contrôle et suites de points sont
 * neutralisés ({@see self::nomSur()}) ; deux noms égaux sont départagés par « (2) ».
 *
 * ZipStream (`maennchen/zipstream-php`) est déclarée dans `composer.json` (^3.1) : elle venait déjà de
 * `spatie/laravel-medialibrary` (`MediaStream`), la déclarer ne change aucune version du verrou.
 */
final class ArchiveDuCoffre
{
    /**
     * Le plafond d'entrées : les générés se rendent pendant la requête (dompdf), sous
     * `max_execution_time = 60` (`docker/php.ini`). Mesuré le 2026-11-14 sous dompdf, 8 cœurs : 40 quittances
     * en 12,8 s (load 4), 39 relevés et attestations en 13,0 s (load 7). ⚠ Sous le pilote `cloudflare`, onze
     * rendus d'affilée dépassent sa limite de débit (`Rate limit exceeded`, mesuré en local) : la borne ne
     * vaut que pour un pilote local, et le pilote de préproduction n'est pas mesuré. Re-mesurer :
     * `MESURE_ARCHIVE=1 php artisan test tests/Feature/Documents/DocumentVaultArchiveTest.php --filter=mesure`.
     */
    public const MAX_FICHIERS = 40;

    /** Le plafond des octets de pièces téléversées que l'archive réunit (100 Mo). */
    public const MAX_OCTETS = 100 * 1024 * 1024;

    /** Les routes des `download_path` que l'archive sait rendre. */
    public const RENDUS = ['leases.contract.pdf', 'leases.receipts.pdf', 'inventories.pdf', 'owner-statements.pdf'];

    private const LONGUEUR_DU_NOM = 120;

    /** Les secondes que le 503 d'une limite de débit du pilote PDF demande d'attendre (`Retry-After`). */
    private const REESSAYER_APRES = 60;

    public function __construct(
        private readonly DocumentVault $vault,
        private readonly PrivateMediaAccess $media,
        private readonly DocumentPdfService $pdf,
        private readonly PersonalDataAccessLogger $accessLog,
        private readonly Router $router,
    ) {}

    /**
     * L'archive du dossier `$cle` du coffre de l'appelant, écrite dans un flux temporaire rembobiné, que
     * l'appelant sert puis ferme.
     *
     * @return array{stream: resource, size: int}
     */
    public function construire(User $user, ?Model $activeProfile, string $cle): array
    {
        $dossier = collect($this->vault->for($user, $activeProfile)['folders'])->firstWhere('key', $cle);
        abort_if($dossier === null, 404);
        abort_code_if($dossier['kind'] === 'bills', 422, 'document.archive_unavailable');

        $entrees = $dossier['entries'];
        abort_code_if($entrees === [], 422, 'document.archive_empty');
        $this->refuserAuDela(count($entrees) > self::MAX_FICHIERS);

        $documents = Document::query()
            ->whereKey(array_values(array_filter(array_column($entrees, 'document_id'))))
            ->with('media')
            ->get()
            ->keyBy('id');
        $fichiers = $documents->map(fn (Document $document): ?Media => $document->currentFile());
        $this->refuserAuDela($fichiers->filter()->sum(fn (Media $m): int => (int) $m->size) > self::MAX_OCTETS);

        $out = tmpfile();
        if ($out === false) {
            throw new RuntimeException('Impossible de créer le fichier temporaire de l’archive.');
        }

        try {
            $zip = new ZipStream(outputStream: $out, sendHttpHeaders: false, defaultEnableZeroHeader: false);
            $noms = [];
            foreach ($entrees as $entree) {
                if ($entree['kind'] === DocumentVault::KIND_UPLOADED) {
                    $document = $documents->get($entree['document_id']);
                    $fichier = $fichiers->get($entree['document_id']);
                    // Une pièce sans fichier n'a pas d'octets à réunir (sa fiche le dit déjà).
                    if ($document === null || $fichier === null) {
                        continue;
                    }
                    $in = $this->media->readStream($fichier);
                    try {
                        $zip->addFileFromStream($this->unique($noms, $this->nomDeLaPiece($document, $fichier)), $in);
                    } finally {
                        if (is_resource($in)) {
                            fclose($in);
                        }
                    }
                    $this->accessLog->recordPlatformPieceRead($user, $document);

                    continue;
                }

                $zip->addFile($this->unique($noms, $this->nomDuGenere($entree)), $this->rendreOuRefuser($user, (string) $entree['download_path']));
            }
            $zip->finish();
        } catch (Throwable $e) {
            fclose($out);
            throw $e;
        }

        $size = (int) ftell($out);
        rewind($out);

        return ['stream' => $out, 'size' => $size];
    }

    /**
     * Le rendu d'un généré, ou un refus lisible quand le pilote PDF échoue en cours d'archive : jamais un 500
     * nu. Une limite de débit du pilote (`cloudflare` : « Rate limit exceeded », code 2001, HTTP 429) rend un
     * 503 `document.archive_render_busy` avec `Retry-After` ; tout autre échec du pilote un 502
     * `document.archive_render_failed`. L'échec est rapporté, et rien de l'archive n'est encore parti : elle
     * s'écrit dans un fichier temporaire que `construire()` ferme. Un refus HTTP du code de l'endpoint (403,
     * 404) passe tel quel.
     */
    private function rendreOuRefuser(User $user, string $chemin): string
    {
        try {
            return $this->rendre($user, $chemin);
        } catch (HttpExceptionInterface $e) {
            throw $e;
        } catch (Throwable $e) {
            report($e);

            if (preg_match('/rate limit|\b429\b|\b2001\b/i', $e->getMessage()) === 1) {
                throw (new ApiError(503, 'document.archive_render_busy', [], ['Retry-After' => (string) self::REESSAYER_APRES]))
                    ->with(['retry_after' => self::REESSAYER_APRES]);
            }

            abort_code(502, 'document.archive_render_failed');
        }
    }

    private function refuserAuDela(bool $condition): void
    {
        abort_code_if($condition, 422, 'document.archive_too_large', [
            'max_files' => self::MAX_FICHIERS,
            'max_mb' => intdiv(self::MAX_OCTETS, 1024 * 1024),
        ]);
    }

    /**
     * Les octets d'un généré, rendus par le code de l'endpoint de son `download_path`. Le chemin vient
     * du coffre jugé ; seules les routes de {@see self::RENDUS} se rendent.
     */
    private function rendre(User $user, string $chemin): string
    {
        $requete = Request::create($chemin, 'GET');
        $route = $this->router->getRoutes()->match($requete);
        $p = fn (string $nom): int => (int) $route->parameter($nom);

        $reponse = match ($route->getName()) {
            'leases.contract.pdf' => DocumentPdfController::renderLeaseContract($this->pdf, Lease::query()->findOrFail($p('lease'))),
            'leases.receipts.pdf' => DocumentPdfController::streamRentReceipt(
                $this->pdf,
                $lease = Lease::query()->findOrFail($p('lease')),
                LeasePayment::query()->where('lease_id', $lease->id)->findOrFail($p('payment')),
            ),
            'inventories.pdf' => app(InventoryController::class)->renderPdf(Inventory::query()->findOrFail($p('inventory'))),
            // Le relevé du coffre est celui de l'appelant (`landlord_id` = lui), dans l'agence du chemin.
            'owner-statements.pdf' => app(OwnerStatementController::class)->renderPdf(
                Agency::query()->findOrFail((int) $requete->query('agency_id')),
                $user,
                (string) $requete->query('period'),
            ),
            default => throw new RuntimeException("Le coffre ne sait pas archiver la route « {$route->getName()} »."),
        };

        $octets = $reponse->getContent();
        if ($reponse->getStatusCode() !== 200 || ! is_string($octets) || $octets === '') {
            throw new RuntimeException("Le rendu de « {$route->getName()} » n’a rien produit.");
        }

        return $octets;
    }

    /** `2026-10-05 Quittance.pdf` : la date de l'entrée, puis le libellé de sa catégorie. */
    private function nomDuGenere(array $entree): string
    {
        $libelles = RechercheDuCoffre::vocabulaire()['categories'][$entree['category']] ?? [];
        $libelle = $libelles[app()->getLocale()] ?? $libelles['fr'] ?? 'Document';
        $libelle = mb_strtoupper(mb_substr($libelle, 0, 1)).mb_substr($libelle, 1);

        return self::nomSur(trim(($entree['date'] ?? '').' '.$libelle)).'.pdf';
    }

    /** Le nom saisi de la pièce, puis l'extension de son fichier. */
    private function nomDeLaPiece(Document $document, Media $fichier): string
    {
        $extension = strtolower((string) pathinfo((string) $fichier->file_name, PATHINFO_EXTENSION));
        $extension = preg_match('/^[a-z0-9]{1,10}$/', $extension) === 1 ? $extension : '';
        $nom = self::nomSur((string) $document->name);
        if ($extension !== '' && str_ends_with(mb_strtolower($nom), '.'.$extension)) {
            $nom = mb_substr($nom, 0, -strlen($extension) - 1);
        }

        return $extension === '' ? $nom : "{$nom}.{$extension}";
    }

    /**
     * Un nom de fichier sûr dans une archive : ni séparateur (`/`, `\`), ni caractère de contrôle, ni
     * suite de points (« ../ » ne remonte plus), ni point ou espace en tête ou en fin ; 120 caractères
     * au plus. Vide, il devient « Document ».
     */
    public static function nomSur(string $nom): string
    {
        $nom = (string) preg_replace('/[\x00-\x1F\x7F]+/u', '', $nom);
        $nom = (string) preg_replace('#[/\\\\:*?"<>|]+#u', '-', $nom);
        $nom = (string) preg_replace('/\.{2,}/u', '.', $nom);
        $nom = (string) preg_replace('/\s+/u', ' ', $nom);
        $nom = trim(mb_substr(trim($nom, " .-\t"), 0, self::LONGUEUR_DU_NOM), " .\t");

        return $nom === '' ? 'Document' : $nom;
    }

    /**
     * Le nom, départagé par « (2) », « (3) »… d'un nom déjà pris (sans égard à la casse).
     *
     * @param  array<string, true>  $pris
     */
    private function unique(array &$pris, string $nom): string
    {
        $extension = pathinfo($nom, PATHINFO_EXTENSION);
        $base = $extension === '' ? $nom : mb_substr($nom, 0, -strlen($extension) - 1);
        $candidat = $nom;
        for ($n = 2; isset($pris[mb_strtolower($candidat)]); $n++) {
            $candidat = $extension === '' ? "{$base} ({$n})" : "{$base} ({$n}).{$extension}";
        }
        $pris[mb_strtolower($candidat)] = true;

        return $candidat;
    }
}
