<?php

namespace App\Console\Commands;

use App\Services\Ai\EmbeddingsTable;
use Illuminate\Console\Command;

/**
 * TCK-2423 — à lancer une fois, après qu'un superutilisateur a posé l'extension `vector` : la migration a réussi sans créer
 * la table et ne se rejoue pas. Idempotente. Une extension toujours absente ou refusée n'est pas une erreur du déploiement,
 * mais la commande sort en échec pour que celui qui la lance le voie.
 */
class AiInstallEmbeddings extends Command
{
    protected $signature = 'ai:install-embeddings';

    protected $description = 'Crée la table des embeddings, une fois l\'extension vector posée.';

    public function handle(EmbeddingsTable $table): int
    {
        $outcome = $table->install();
        $this->line("ai:install-embeddings — {$outcome}");

        return $outcome === EmbeddingsTable::INSTALLED ? self::SUCCESS : self::FAILURE;
    }
}
