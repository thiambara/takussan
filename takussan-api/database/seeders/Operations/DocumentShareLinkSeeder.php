<?php

namespace Database\Seeders\Operations;

use App\Models\Document;
use App\Models\DocumentShareLink;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class DocumentShareLinkSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        Document::query()
            ->inRandomOrder()
            ->limit((int) ceil(Document::count() * 0.2))
            ->chunkById(100, function ($documents) {
                foreach ($documents as $document) {
                    $createdAt = Timeline::randomDateBetween(
                        $document->created_at,
                        Timeline::seedEnd(),
                    );

                    DocumentShareLink::create([
                        'document_id' => $document->id,
                        'token' => Str::random(48),
                        'expires_at' => $createdAt->addDays(30),
                        'max_downloads' => $this->ctx->faker()->optional()->numberBetween(1, 10),
                        'downloads_count' => random_int(0, 5),
                        'created_by_id' => $document->uploaded_by,
                        'last_accessed_at' => $this->ctx->faker()->boolean(60)
                            ? $createdAt->addDays(random_int(1, 15))
                            : null,
                        'created_at' => $createdAt,
                        'updated_at' => $createdAt,
                    ]);
                }
            });
    }
}
