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
        return $this->decideOnce($suggestion, [
            'decision' => AiSuggestionDecision::Rejected, 'decided_by_id' => $by->id, 'decided_at' => now(),
        ]);
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
            if (self::canonical($from) !== self::canonical($to)) {
                $diff[$key] = ['from' => $from, 'to' => $to];
            }
        }
        ksort($diff);

        return $diff;
    }

    /**
     * `$until` est la borne haute INCLUSE (la fin du dernier jour de la période, côté appelant) ;
     * absente, la fenêtre est ouverte.
     *
     * @return array<string, array{decided: int, accepted: int, edited: int, rejected: int, rate: float|null}>
     */
    public function acceptanceRates(CarbonInterface $since, ?CarbonInterface $until = null): array
    {
        $rows = AiSuggestion::query()
            ->where('decided_at', '>=', $since)
            ->when($until, fn ($query) => $query->where('decided_at', '<=', $until))
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
        $diff = self::diff($suggestion->proposal, $final);

        return $this->decideOnce($suggestion, [
            'decision' => $diff === [] ? AiSuggestionDecision::Accepted : AiSuggestionDecision::Edited,
            'final_value' => $final,
            'correction_diff' => $diff,
            'decided_by_id' => $by->id,
            'decided_at' => now(),
        ]);
    }

    /**
     * La décision se prend une fois, et c'est la base qui l'arbitre : l'UPDATE conditionnel
     * (`decision = pending`) est atomique, là où une garde sur le modèle en mémoire laisse deux
     * instances chargées « en attente » écrire l'une par-dessus l'autre. Les colonnes passent par
     * les casts du modèle (un `update()` de requête n'encode ni les JSON ni l'enum).
     *
     * @param  array<string, mixed>  $columns
     */
    private function decideOnce(AiSuggestion $suggestion, array $columns): AiSuggestion
    {
        $updated = AiSuggestion::query()
            ->whereKey($suggestion->getKey())
            ->where('decision', AiSuggestionDecision::Pending->value)
            ->update((new AiSuggestion)->forceFill($columns)->getAttributes());

        if ($updated === 0) {
            throw new LogicException('ai.suggestion_already_decided');
        }

        return $suggestion->refresh();
    }

    /** Forme comparable : clés triées (jsonb réordonne), 100 et 100.0 égaux, les chaînes numériques restent des chaînes. */
    private static function canonical(mixed $value): mixed
    {
        if (is_int($value) || is_float($value)) {
            return (float) $value;
        }
        if (! is_array($value)) {
            return $value;
        }
        $value = array_map(self::canonical(...), $value);
        if (! array_is_list($value)) {
            ksort($value);
        }

        return $value;
    }
}
