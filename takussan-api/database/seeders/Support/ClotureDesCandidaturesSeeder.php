<?php

namespace Database\Seeders\Support;

use Database\Seeders\Activity\LeaseSeeder;
use Illuminate\Database\Seeder;

/**
 * TCK-2747 (réserve r1 de la vérification de d87e423e7) — la clôture des candidatures acceptées sur un bien
 * loué, rejouée APRÈS les fixtures : `FilterCoverageSeeder` et `EdgeCaseSeeder` sèment des baux actifs
 * (`LS-FC-*`, `LS-EC-*`) sur des biens tirés de l'agence, après `LeaseSeeder`, et leurs baux échappaient à
 * la clôture (mesuré le 2026-11-12 sur la démo : la candidature n° 126 n'était couverte que par un bail
 * `LS-EC-`). La clôture de `LeaseSeeder` reste : elle ferme le jeu réaliste avant que ses paiements ne
 * soient semés. La règle est celle de `LeaseSeeder::fermerLesCandidaturesSurUnBienLoue()`, pas une copie.
 */
class ClotureDesCandidaturesSeeder extends Seeder
{
    public function run(): void
    {
        LeaseSeeder::fermerLesCandidaturesSurUnBienLoue();
    }
}
