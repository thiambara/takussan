<?php

namespace App\Console\Commands;

use App\Models\Enums\MessageType;
use App\Models\Message;
use Illuminate\Console\Command;

/**
 * TCK-2958 (ADR-0128 § 3) — retire de l'index de recherche les messages dont `content` est un CODE
 * (`system`, `event`, `card`), que `Message::shouldBeSearchable` n'indexe plus.
 *
 * Les avis système d'avant TCK-2958 y sont avec leur phrase française (`humanise`) : la migration
 * `2026_11_18_295801` réécrit leur `content` par SQL, et une réimportation (`scout:import`, que
 * `docker/release.sh` joue sur un écart de forme) FILTRE les documents non indexables sans jamais les
 * retirer. Cette commande le fait, en synchrone (le retrait ne dépend pas d'un worker).
 *
 * Idempotente : retirer un document absent ne fait rien. Jouée une fois par environnement, après la
 * migration (`docs/deploiement/actions/2026-11-18-sauvegarder-avant-la-conversion-des-avis.md`).
 */
class MessagesUnindexCoded extends Command
{
    protected $signature = 'messages:unindex-coded {--chunk=500 : Taille des lots}';

    protected $description = 'Retire de l\'index de recherche les messages system, event et card (leur contenu est un code).';

    public function handle(): int
    {
        $types = array_map(fn (MessageType $type) => $type->value, MessageType::aContenuCode());
        $retires = 0;

        Message::withTrashed()
            ->whereIn('type', $types)
            ->chunkById(max(1, (int) $this->option('chunk')), function ($messages) use (&$retires): void {
                $messages->unsearchableSync();
                $retires += $messages->count();
            });

        $this->info("messages:unindex-coded retired={$retires}");

        return self::SUCCESS;
    }
}
