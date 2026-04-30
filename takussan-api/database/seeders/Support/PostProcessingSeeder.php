<?php

namespace Database\Seeders\Support;

use Illuminate\Database\Seeder;

/**
 * Seeder de post-traitement pour normaliser et vérifier les données.
 *
 * Doit être exécuté en dernier dans le pipeline de seeding pour :
 * - Vérifier la cohérence référentielle
 * - Compléter les données manquantes
 * - Générer les rapports de seeding
 */
class PostProcessingSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        if (! $this->ctx->config->ensureReferentialIntegrity) {
            return;
        }

        $this->command?->getOutput()?->writeln('  > Vérification de la cohérence référentielle...');

        $checker = new ReferentialIntegrityChecker($this->ctx);
        $checker->ensureIntegrity();

        $this->command?->getOutput()?->writeln('  > Cohérence vérifiée et corrigée.');
    }
}
