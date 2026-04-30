<?php

namespace Database\Seeders\Catalog;

use Database\Seeders\Support\SeedingContext;
use Illuminate\Database\Seeder;

/**
 * Registers placeholder media metadata on properties and optionally downloads
 * real files if the SEED_DOWNLOAD_MEDIA environment variable is set.
 */
class PropertyMediaSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        foreach ($this->ctx->agencies as $agency) {
            $properties = $this->ctx->propertiesByAgency[$agency->id] ?? collect();
            foreach ($properties as $property) {
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
        }
    }
}
