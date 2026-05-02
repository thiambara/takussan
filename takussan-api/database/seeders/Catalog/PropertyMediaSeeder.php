<?php

namespace Database\Seeders\Catalog;

use App\Models\Property;
use Database\Seeders\Support\SeedingContext;
use Illuminate\Database\Seeder;

/**
 * Registers placeholder media metadata on properties and optionally downloads
 * real files if the SEED_DOWNLOAD_MEDIA environment variable is set.
 *
 * Iterates `Property::all()` so any property created by an upstream seeder
 * (PropertySeeder, FilterCoverageSeeder, EdgeCaseSeeder) is processed —
 * defensive against seeders that forget to call `SeedingContext::registerProperty`.
 * Skips properties that already have media in the `photos` collection so the
 * pass is idempotent.
 */
class PropertyMediaSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        Property::query()
            ->orderBy('id')
            ->chunk(200, function ($properties) {
                foreach ($properties as $property) {
                    if ($property->getMedia('photos')->isNotEmpty()) {
                        continue;
                    }

                    $count = random_int(2, 6);
                    $urls = [];
                    for ($i = 1; $i <= $count; $i++) {
                        $urls[] = "https://picsum.photos/seed/property-{$property->id}-{$i}/800/600";
                    }

                    $metadata = $property->metadata ?? [];
                    $metadata['media_placeholders'] = $urls;
                    $property->forceFill(['metadata' => $metadata])->saveQuietly();

                    foreach ($urls as $url) {
                        $this->ctx->downloadMedia($property, $url, 'photos');
                    }
                }
            });
    }
}
