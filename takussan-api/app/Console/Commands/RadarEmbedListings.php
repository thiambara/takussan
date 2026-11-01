<?php

namespace App\Console\Commands;

use App\Services\Radar\Embeddings\RadarEmbeddingSweep;
use Illuminate\Console\Command;

/** TCK-2423 — met en file `ai` le prochain lot d'annonces sans vecteur à jour. Sans clé ni table, ne fait rien. */
class RadarEmbedListings extends Command
{
    protected $signature = 'radar:embed-listings';

    protected $description = 'Met en file le calcul des vecteurs des annonces du Radar qui n\'en ont pas à jour.';

    public function handle(RadarEmbeddingSweep $sweep): int
    {
        $this->line('radar:embed-listings — '.$sweep->run().' annonce(s) en file.');

        return self::SUCCESS;
    }
}
