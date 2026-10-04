<?php

namespace App\Console\Commands;

use App\Jobs\Media\ConvertPhotoConversionsToWebpJob;
use App\Models\Property;
use App\Services\Media\PhotoConversionFormat;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Builder;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * TCK-585 — fait basculer en WebP les photos de biens antérieures au marqueur
 * (`PhotoConversionFormat`), une `ConvertPhotoConversionsToWebpJob` par photo, en file `media`.
 *
 * Une photo n'est cachée que pendant SA bascule, quelques secondes, puis se replie sur
 * `thumbnail` jusqu'à `preview` et `full` (cf. le job). Les autres restent servies en `.jpg`,
 * par Transformations, jusqu'à leur tour. Le parc entier n'est donc jamais caché à la fois.
 *
 * Ne sélectionne que les photos SANS marqueur. Une photo dont la bascule a échoué
 * définitivement porte déjà le marqueur : `media:regenerate-property-conversions --property=…`
 * la régénère, en WebP puisque le marqueur est posé.
 *
 * Opération manuelle, une fois par environnement : rien ne la planifie.
 */
class MediaConvertPhotosToWebp extends Command
{
    protected $signature = 'media:convert-photos-to-webp
        {--property= : Ne traiter qu\'un bien (id)}
        {--agency= : Ne traiter que les biens d\'une agence (id)}
        {--dry-run : Compter sans rien mettre en file}';

    protected $description = 'Met en file la bascule en WebP des conversions des photos de biens antérieures au marqueur (TCK-585).';

    public function handle(): int
    {
        $query = Media::query()
            ->select(['id'])
            ->where('model_type', Property::class)
            ->where('collection_name', 'photos')
            ->where(fn (Builder $q) => $q
                ->whereNull('custom_properties->'.PhotoConversionFormat::KEY)
                ->orWhere('custom_properties->'.PhotoConversionFormat::KEY, '!=', PhotoConversionFormat::WEBP));

        if ($id = $this->option('property')) {
            $query->where('model_id', (int) $id);
        }

        if ($agencyId = $this->option('agency')) {
            $query->whereIn('model_id', Property::query()->where('agency_id', (int) $agencyId)->select('id'));
        }

        if ($this->option('dry-run')) {
            $this->info('media:convert-photos-to-webp — '.$query->count().' photo(s) à basculer.');

            return self::SUCCESS;
        }

        $mises = 0;

        $query->lazyById(500)->each(function (Media $media) use (&$mises) {
            ConvertPhotoConversionsToWebpJob::dispatch((int) $media->getKey());
            $mises++;
        });

        $this->info("media:convert-photos-to-webp — {$mises} photo(s) mises en file `media`.");

        return self::SUCCESS;
    }
}
