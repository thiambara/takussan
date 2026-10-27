<?php

namespace App\Services\Ai\Evaluation;

use App\Models\AiSuggestion;
use App\Models\Enums\AiSuggestionDecision;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\File;

/**
 * TCK-2384 (ADR-0076 §7) — les corrections humaines (`edited`) deviennent des cas d'évaluation :
 * le contenu soumis en entrée, la valeur retenue en sortie attendue, l'un et l'autre anonymisés.
 * Un fichier par suggestion (`export-<id>.json`) : relancer l'export réécrit les mêmes fichiers.
 */
final class EvalCaseExporter
{
    public function __construct(
        private readonly EvalCaseAnonymizer $anonymizer,
        private readonly ?string $root = null,
    ) {}

    /** @return list<string> */
    public function export(string $usageKey, ?CarbonInterface $since = null): array
    {
        $dir = ($this->root ?? base_path('tests/AiEvals')).'/'.$usageKey.'/cases';
        $written = [];

        AiSuggestion::query()
            ->where('usage_key', $usageKey)
            ->where('decision', AiSuggestionDecision::Edited->value)
            ->whereNotNull('input_snapshot')
            ->when($since, fn ($query) => $query->where('decided_at', '>=', $since))
            ->orderBy('id')
            ->each(function (AiSuggestion $suggestion) use ($dir, &$written): void {
                $case = $this->anonymizer->anonymize($suggestion->input_snapshot, $suggestion->final_value ?? [], $suggestion->proposal ?? []);
                File::ensureDirectoryExists($dir);
                $path = $dir.'/export-'.$suggestion->id.'.json';
                File::put($path, json_encode($case, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)."\n");
                $written[] = $path;
            });

        return $written;
    }
}
