<?php

namespace Database\Seeders\Support;

use Illuminate\Database\Seeder;

/**
 * Vérifie le jeu réaliste avant les cas limites et la couverture des filtres.
 *
 * Il ne corrige rien : un invariant qui ne tient pas fait échouer le seeding (TCK-2376,
 * {@see ReferentialIntegrityChecker}).
 */
class PostProcessingSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        if (! $this->ctx->config->ensureReferentialIntegrity) {
            return;
        }

        $this->command?->getOutput()?->writeln('  > Vérification des invariants du jeu semé...');

        (new ReferentialIntegrityChecker)->assertIntegrity();

        $this->command?->getOutput()?->writeln('  > Invariants tenus.');
    }
}
