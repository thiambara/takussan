<?php

namespace App\Services\Radar;

use App\Jobs\Radar\PrepareRadarListingPhotos;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceKind;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Intervention\Image\Drivers\Gd\Driver as GdDriver;
use Intervention\Image\Exceptions\ImageException;
use Intervention\Image\ImageManager;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Throwable;

/**
 * TCK-2389 (ADR-0077 §6, décision 3a) — la réserve de photos d'une annonce `consented`, la collection `radar_photos` sur
 * le disque PRIVÉ par défaut : lues après l'accord confirmé (`PrepareRadarListingPhotos`) ou déposées à la main. Une
 * photo n'y entre qu'après `encode()` : bornes de pixels lues dans l'en-tête AVANT tout décodage, réencodage par GD
 * (l'EXIF, position comprise, ne survit pas). Même règle que {@see RadarCaptureReader}, pour des photos de bien.
 *
 * Les gestes de l'opérateur (relancer la lecture, déposer, retirer) exigent la prise en charge de l'annonceur et une
 * annonce `consented`, relus sous verrou — ordre : annonce → annonceur. Chacun est journalisé. Les fichiers s'écrivent
 * en DERNIER, juste avant le commit : la transaction rend les lignes, jamais les fichiers.
 */
final class RadarPhotoReserve
{
    public const COLLECTION = 'radar_photos';

    /** Les dimensions ou les pixels annoncés par l'en-tête dépassent les bornes : l'image n'est jamais décodée. */
    public const ERROR_TOO_LARGE = 'radar.photo.too_large';

    /** Pas une image d'un type accepté, ou le décodage de GD a échoué. */
    public const ERROR_UNREADABLE = 'radar.photo.unreadable';

    /** La réserve a atteint `radar.photos.reserve_max` : la photo lue n'y entre pas. */
    public const ERROR_RESERVE_FULL = 'radar.photo.reserve_full';

    /** Les types qui sortent d'ici : un GIF devient un JPEG (une image fixe, sans palette ni animation). */
    private const OUTPUT_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

    public function __construct(private readonly AdvertiserClaim $claim) {}

    /**
     * @return array{bytes: string, mime: string}|array{error: string}
     */
    public function encode(string $bytes): array
    {
        $size = @getimagesizefromstring($bytes);
        if ($size === false) {
            return ['error' => self::ERROR_UNREADABLE];
        }

        // Les bornes se lisent dans l'EN-TÊTE, avant que GD n'alloue largeur × hauteur × 4 octets.
        [$width, $height] = $size;
        $maxSide = (int) config('radar.photos.max_side');
        if ($width > $maxSide || $height > $maxSide || $width * $height > (int) config('radar.photos.max_pixels')) {
            return ['error' => self::ERROR_TOO_LARGE];
        }

        $mime = $size['mime'] === 'image/gif' ? 'image/jpeg' : $size['mime'];
        if (! in_array($mime, self::OUTPUT_MIMES, true)) {
            return ['error' => self::ERROR_UNREADABLE];
        }

        try {
            $encoded = (new ImageManager(new GdDriver))->decodeBinary($bytes)->encodeUsingMediaType($mime)->toString();
        } catch (ImageException) {
            return ['error' => self::ERROR_UNREADABLE];
        }

        return ['bytes' => $encoded, 'mime' => $mime];
    }

    /**
     * Range une photo ENCODÉE. Propriétés : `origin` (`fetched` | `uploaded`), `source_url` (lue seulement) et le SHA-256
     * des octets rangés. Le fichier est écrit sur le disque par défaut, privé ; l'appelant l'efface si la transaction
     * qui l'entoure échoue après ({@see self::discardFiles()}).
     */
    public function store(RadarListing $listing, string $bytes, string $mime, string $origin, ?string $sourceUrl = null): Media
    {
        $sha256 = hash('sha256', $bytes);
        $extension = match ($mime) {
            'image/png' => 'png',
            'image/webp' => 'webp',
            default => 'jpg',
        };

        return $listing->addMediaFromString($bytes)
            ->usingFileName(sprintf('photo-%s.%s', substr($sha256, 0, 12), $extension))
            ->withCustomProperties(array_filter(['origin' => $origin, 'source_url' => $sourceUrl, 'sha256' => $sha256], fn (mixed $v) => $v !== null))
            ->toMediaCollection(self::COLLECTION);
    }

    /** Efface les fichiers de ces médias : la transaction qui les entourait a rendu leurs lignes, jamais les fichiers. */
    public function discardFiles(array $medias): void
    {
        foreach ($medias as $media) {
            Storage::disk($media->disk)->delete($media->getPathRelativeToRoot());
        }
    }

    public function count(RadarListing $listing): int
    {
        return $listing->media()->where('collection_name', self::COLLECTION)->count();
    }

    /**
     * Remet la lecture des photos en file : ce qui a réussi reste, les éléments en erreur sont retirés pour être retentés.
     */
    public function refetch(RadarListing $listing, User $by): RadarListing
    {
        $this->check($listing, $by);

        return DB::transaction(function () use ($listing, $by): RadarListing {
            $locked = $this->lockHeld($listing, $by);
            abort_code_if(
                $locked->source_kind !== RadarSourceKind::Url || $locked->preparableUrls() === [],
                422,
                'radar.listing.no_source_photos',
            );

            $locked->photo_preparation = array_values(array_filter(
                (array) ($locked->photo_preparation ?? []),
                fn (array $element) => ! isset($element['error']),
            ));
            $locked->save();
            $this->journal($locked, $by, 'fetch', []);

            PrepareRadarListingPhotos::dispatch($locked->id);

            return $locked;
        });
    }

    /**
     * Déposer des photos : toutes encodées AVANT la moindre écriture (une image illisible refuse l'envoi), puis rangées
     * sous verrou si la réserve peut les prendre toutes.
     *
     * @param  list<UploadedFile>  $files
     */
    public function deposit(RadarListing $listing, array $files, User $by): RadarListing
    {
        $this->check($listing, $by);

        $encoded = [];
        foreach ($files as $file) {
            $photo = $this->encode((string) file_get_contents($file->getRealPath()));
            if (isset($photo['error'])) {
                abort_code(422, $photo['error']);
            }
            $encoded[] = $photo;
        }

        return DB::transaction(function () use ($listing, $by, $encoded): RadarListing {
            $locked = $this->lockHeld($listing, $by);
            abort_code_if(
                $this->count($locked) + count($encoded) > (int) config('radar.photos.reserve_max'),
                422,
                self::ERROR_RESERVE_FULL,
                ['max' => (int) config('radar.photos.reserve_max')],
            );

            $written = [];
            try {
                foreach ($encoded as $photo) {
                    $written[] = $this->store($locked, $photo['bytes'], $photo['mime'], 'uploaded');
                }
                $this->journal($locked, $by, 'upload', array_map(fn (Media $media) => $media->id, $written));
            } catch (Throwable $e) {
                $this->discardFiles($written);

                throw $e;
            }

            return $locked;
        });
    }

    /** Retirer une photo de la réserve : 404 si ce média n'est pas dans `radar_photos` de CETTE annonce. */
    public function remove(RadarListing $listing, Media $media, User $by): void
    {
        abort_code_unless(
            $media->model_type === $listing->getMorphClass()
                && (int) $media->model_id === $listing->id
                && $media->collection_name === self::COLLECTION,
            404,
            'radar.photo.not_found',
        );
        $this->check($listing, $by);

        DB::transaction(function () use ($listing, $media, $by): void {
            $this->lockHeld($listing, $by);
            $media->delete();
            $this->journal($listing, $by, 'delete', [$media->id]);
        });
    }

    /** Lecture libre : échouer vite, avant les images qui coûtent. Le jugement qui compte est {@see self::lockHeld()}. */
    private function check(RadarListing $listing, User $by): void
    {
        $advertiser = $listing->radar_advertiser_id === null ? null : RadarAdvertiser::query()->find($listing->radar_advertiser_id);
        abort_code_if($advertiser === null, 409, 'radar.advertiser.claim_required');
        $this->claim->check($advertiser, $by);
    }

    /** L'annonce `consented` relue sous verrou, puis son annonceur (annonce → annonceur), dont la prise est tenue par `$by`. */
    private function lockHeld(RadarListing $listing, User $by): RadarListing
    {
        $locked = RadarListing::query()->whereKey($listing->getKey())->lockForUpdate()->firstOrFail();
        abort_code_unless(
            $locked->stage === RadarListingStage::Consented,
            409,
            'radar.listing.stage_conflict',
            ['stage' => $locked->stage->value],
        );
        $advertiser = $locked->radar_advertiser_id === null
            ? null
            : RadarAdvertiser::query()->whereKey($locked->radar_advertiser_id)->lockForUpdate()->first();
        abort_code_if($advertiser === null, 409, 'radar.advertiser.claim_required');
        $this->claim->assertHeld($advertiser, $by);

        return $locked;
    }

    /** @param  list<int>  $mediaIds */
    private function journal(RadarListing $listing, User $by, string $action, array $mediaIds): void
    {
        activity('Admin')
            ->causedBy($by)
            ->performedOn($listing)
            ->withProperties(['action' => $action, 'media_ids' => $mediaIds])
            ->event('radar_listing_photos')
            ->log('Réserve de photos d\'une annonce du Radar modifiée');
    }
}
