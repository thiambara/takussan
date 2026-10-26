<?php

namespace Database\Seeders\Operations;

use App\Models\Document;
use App\Models\Enums\DocumentType;
use App\Models\Lease;
use App\Models\Property;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Database\Seeders\Support\Tirage;
use Illuminate\Database\Seeder;

class DocumentSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        foreach ($this->ctx->agencies as $agency) {
            $properties = $this->ctx->propertiesByAgency[$agency->id] ?? collect();
            $agents = $this->ctx->equipe($agency->id);
            $uploaderIds = $agents->isEmpty()
                ? collect([$agency->primary_admin_id])->filter()->values()
                : $agents->pluck('id')->values();

            if ($uploaderIds->isEmpty()) {
                continue;
            }

            foreach ($properties as $property) {
                if (! $this->ctx->faker()->boolean(60)) {
                    continue;
                }
                $createdAt = Timeline::randomDateBetween($property->created_at, Timeline::seedEnd());

                [$type, $name, $description] = $this->ctx->texts()->documentDeBien($property->reference_number);

                Document::create([
                    'documentable_id' => $property->id,
                    'documentable_type' => Property::class,
                    'uploaded_by' => Tirage::un($uploaderIds),
                    'name' => $name,
                    'type' => $type->value,
                    'description' => $description,
                    'is_verified' => $this->ctx->faker()->boolean(60),
                    'verified_at' => $this->ctx->faker()->boolean(60) ? $createdAt : null,
                    'created_at' => $createdAt,
                    'updated_at' => $createdAt,
                ]);
            }
        }

        foreach ($this->ctx->leases as $lease) {
            $agents = $this->ctx->equipe($lease->agency_id);
            $uploader = $agents->isNotEmpty() ? $agents->pluck('id')->values()->pipe(Tirage::un(...)) : $lease->landlord_id;

            Document::create([
                'documentable_id' => $lease->id,
                'documentable_type' => Lease::class,
                'uploaded_by' => $uploader,
                'name' => 'Contrat de bail '.$lease->reference_number,
                'type' => DocumentType::LeaseContract->value,
                'description' => 'Contrat de bail signé.',
                'is_verified' => true,
                'verified_at' => $lease->start_date,
                'verified_by' => $uploader,
                'created_at' => $lease->start_date,
                'updated_at' => $lease->start_date,
            ]);
        }
    }
}
