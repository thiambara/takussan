<?php

namespace App\Services\Ai;

use App\Models\AiSuggestion;
use App\Models\Enums\AiSuggestionDecision;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use LogicException;

/**
 * TCK-2384 (ADR-0076 §7) — toute sortie qui modifierait une donnée devient une suggestion. La
 * décision se prend une fois ; une correction garde son différentiel exact, qui nourrit les jeux
 * d'évaluation. Le taux d'acceptation (acceptée telle quelle / décidée) mesure la qualité en
 * production.
 */
final class SuggestionRecorder
{
    public function record(AiResult $result, ?Model $subject = null, ?float $confidence = null, ?string $inputSnapshot = null): AiSuggestion
    {
        return AiSuggestion::query()->create([
            'usage_key' => $result->call->usage_key,
            'ai_call_id' => $result->call->id,
            'subject_type' => $subject?->getMorphClass(),
            'subject_id' => $subject?->getKey(),
            'proposal' => $result->structured ?? ['text' => $result->text],
            'confidence' => $confidence,
            'input_snapshot' => $inputSnapshot,
            'decision' => AiSuggestionDecision::Pending,
        ]);
    }

    public function accept(AiSuggestion $suggestion, User $by): AiSuggestion
    {
        return $this->decide($suggestion, $by, $suggestion->proposal);
    }

    /** @param  array<string, mixed>  $final */
    public function edit(AiSuggestion $suggestion, array $final, User $by): AiSuggestion
    {
        return $this->decide($suggestion, $by, $final);
    }

    public function reject(AiSuggestion $suggestion, User $by): AiSuggestion
    {
        $this->assertPending($suggestion);
        $suggestion->forceFill([
            'decision' => AiSuggestionDecision::Rejected, 'decided_by_id' => $by->id, 'decided_at' => now(),
        ])->save();

        return $suggestion;
    }

    /**
     * @param  array<string, mixed>  $proposal
     * @param  array<string, mixed>  $final
     * @return array<string, array{from: mixed, to: mixed}>
     */
    public static function diff(array $proposal, array $final): array
    {
        $diff = [];
        foreach (array_unique([...array_keys($proposal), ...array_keys($final)]) as $key) {
            $from = $proposal[$key] ?? null;
            $to = $final[$key] ?? null;
            if ($from !== $to) {
                $diff[$key] = ['from' => $from, 'to' => $to];
            }
        }
        ksort($diff);

        return $diff;
    }

    /** @return array<string, array{decided: int, accepted: int, edited: int, rejected: int, rate: float|null}> */
    public function acceptanceRates(CarbonInterface $since): array
    {
        $rows = AiSuggestion::query()
            ->where('decided_at', '>=', $since)
            ->where('decision', '!=', AiSuggestionDecision::Pending->value)
            ->selectRaw('usage_key, decision, count(*) as total')
            ->groupBy('usage_key', 'decision')
            ->get();

        $rates = [];
        foreach ($rows as $row) {
            $rates[$row->usage_key] ??= ['decided' => 0, 'accepted' => 0, 'edited' => 0, 'rejected' => 0, 'rate' => null];
            $rates[$row->usage_key][$row->decision->value] = (int) $row->total;
            $rates[$row->usage_key]['decided'] += (int) $row->total;
        }
        foreach ($rates as $key => $rate) {
            $rates[$key]['rate'] = round($rate['accepted'] / $rate['decided'], 4);
        }
        ksort($rates);

        return $rates;
    }

    /** @param  array<string, mixed>  $final */
    private function decide(AiSuggestion $suggestion, User $by, array $final): AiSuggestion
    {
        $this->assertPending($suggestion);
        $diff = self::diff($suggestion->proposal, $final);
        $suggestion->forceFill([
            'decision' => $diff === [] ? AiSuggestionDecision::Accepted : AiSuggestionDecision::Edited,
            'final_value' => $final,
            'correction_diff' => $diff,
            'decided_by_id' => $by->id,
            'decided_at' => now(),
        ])->save();

        return $suggestion;
    }

    private function assertPending(AiSuggestion $suggestion): void
    {
        if ($suggestion->decision !== AiSuggestionDecision::Pending) {
            throw new LogicException('ai.suggestion_already_decided');
        }
    }
}
