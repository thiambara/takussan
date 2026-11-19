<?php

namespace App\Console\Commands;

use App\Models\AiSuggestion;
use App\Services\Messaging\Copilote\ReglagesDuCopilote;
use Illuminate\Console\Command;

/**
 * TCK-2974 (ADR-0131 § 6) — les propositions du copilote du fil (usages `fil.*`) s'effacent à 30 jours :
 * `proposal` vidé (`'[]'`), `final_value`, `input_snapshot` et `correction_diff` à nul, la LIGNE gardée pour le
 * taux d'acceptation — le patron de `RadarPurger::eraseSuggestions()`. Idempotente : seules les lignes encore
 * pleines sont choisies.
 */
class MessagingPurgeCopilotProposals extends Command
{
    protected $signature = 'messaging:purge-copilot-proposals';

    protected $description = 'Vide les propositions du copilote du fil de plus de 30 jours (la ligne reste).';

    public function handle(ReglagesDuCopilote $reglages): int
    {
        $videes = AiSuggestion::query()
            ->where('usage_key', 'like', 'fil.%')
            ->where('created_at', '<', now()->subDays($reglages->retentionEnJours()))
            ->whereRaw("(proposal <> '[]'::jsonb or input_snapshot is not null or final_value is not null or correction_diff is not null)")
            ->update(['proposal' => '[]', 'input_snapshot' => null, 'final_value' => null, 'correction_diff' => null]);

        $this->info("Propositions du copilote vidées : {$videes}.");

        return self::SUCCESS;
    }
}
