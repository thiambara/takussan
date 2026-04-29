<?php

namespace Database\Seeders\Core;

use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class AgencySeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        $targetAgencyCount = $this->ctx->config->agencies;

        // Agences de base (prédéfinies)
        $baseAgencies = [
            [
                'name' => 'Dakar Immo',
                'slug' => 'dakar-immo',
                'email' => 'contact@dakarimmo.sn',
                'phone' => '+221338212100',
                'website' => 'https://dakarimmo.sn',
                'commission_rate' => 8.00,
            ],
            [
                'name' => 'Thiès Properties',
                'slug' => 'thies-properties',
                'email' => 'contact@thies-properties.sn',
                'phone' => '+221338511010',
                'website' => 'https://thies-properties.sn',
                'commission_rate' => 6.50,
            ],
            [
                'name' => 'Saint-Louis Habitat',
                'slug' => 'saint-louis-habitat',
                'email' => 'contact@sl-habitat.sn',
                'phone' => '+221339612020',
                'website' => 'https://sl-habitat.sn',
                'commission_rate' => 7.00,
            ],
        ];

        // Générer des agences supplémentaires si nécessaire
        $agencies = array_slice($baseAgencies, 0, min($targetAgencyCount, count($baseAgencies)));

        $existingSlugs = collect($agencies)->pluck('slug')->all();

        for ($i = count($agencies); $i < $targetAgencyCount; $i++) {
            do {
                $city = $this->ctx->faker()->senegaleseCity();
                $suffix = strtolower(Str::random(4));
                $name = "{$city} Real Estate ".($i - 2);
                $slug = Str::slug($name).'-'.$suffix;
            } while (in_array($slug, $existingSlugs, true));

            $existingSlugs[] = $slug;

            $agencies[] = [
                'name' => $name,
                'slug' => $slug,
                'email' => "contact@{$slug}.sn",
                'phone' => '+22133'.$this->ctx->faker()->numerify('######'),
                'website' => "https://{$slug}.sn",
                'commission_rate' => $this->ctx->faker()->randomFloat(2, 5, 12),
            ];
        }

        $foundedAt = Timeline::seedStart()->subYears(5);

        foreach ($agencies as $data) {
            $agency = Agency::updateOrCreate(
                ['slug' => $data['slug']],
                [
                    'name' => $data['name'],
                    'license_number' => strtoupper(Str::random(8)),
                    'description' => 'Agence immobilière spécialisée dans la location et la vente au Sénégal.',
                    'email' => $data['email'],
                    'phone' => $data['phone'],
                    'website' => $data['website'],
                    'commission_rate' => $data['commission_rate'],
                    'founded_at' => $foundedAt->toDateString(),
                    'is_verified' => true,
                    'verified_at' => $foundedAt,
                    'status' => AgencyStatus::Active,
                    'created_at' => $foundedAt,
                    'updated_at' => $foundedAt,
                ],
            );

            $this->ctx->registerAgency($agency);

            $logoUrl = 'https://ui-avatars.com/api/?name='.urlencode($agency->name).'&background=random&color=fff&size=512';
            $this->ctx->downloadMedia($agency, $logoUrl, 'logo');
        }
    }
}
