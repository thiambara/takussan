<?php

namespace App\Console\Commands;

use App\Services\Search\Suggestions\SuggestionIndexBuilder;
use Illuminate\Console\Command;
use Throwable;

/**
 * TCK-2474 (ADR-0088) — reconstruit l'index des suggestions de la barre de recherche (lieux, types, recherches
 * populaires, variantes) et l'échange avec l'index servi : jamais d'index à moitié rempli servi. Idempotente : elle relit
 * tout et remplace tout ; tout est dans {@see SuggestionIndexBuilder::build()}.
 *
 * `--if-missing` : ne construit que si l'index servi n'existe pas — la forme jouée par `docker/release.sh`, pour qu'un
 * premier déploiement (ou un Meilisearch recréé) n'attende pas l'heure suivante.
 */
class BuildSearchSuggestions extends Command
{
    protected $signature = 'search:build-suggestions {--if-missing : ne construit que si l\'index servi est absent}';

    protected $description = 'Reconstruit l\'index des suggestions de recherche et le met en service d\'un coup.';

    public function handle(SuggestionIndexBuilder $builder): int
    {
        if (config('scout.driver') !== 'meilisearch') {
            $this->warn('search:build-suggestions — SCOUT_DRIVER n\'est pas meilisearch : rien à construire.');

            return self::SUCCESS;
        }

        try {
            if ($this->option('if-missing') && $builder->isServed()) {
                $this->info('search:build-suggestions — index déjà servi, rien à faire (--if-missing).');

                return self::SUCCESS;
            }

            ['uid' => $uid, 'documents' => $documents, 'kinds' => $kinds] = $builder->build();
        } catch (Throwable $e) {
            $this->error('search:build-suggestions — échec, l\'index servi est inchangé : '.$e->getMessage());

            return self::FAILURE;
        }

        $detail = implode(', ', array_map(static fn (string $kind, int $n): string => "{$kind} {$n}", array_keys($kinds), $kinds));
        $this->info("search:build-suggestions — {$uid} : {$documents} documents ({$detail}).");

        return self::SUCCESS;
    }
}
