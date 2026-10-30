<?php

namespace App\Services\Ai;

use App\Ai\Agents\SocleAgent;
use App\Models\AiCall;
use App\Models\AiUsageSetting;
use App\Models\Enums\AiCallOutcome;
use App\Models\Enums\AiDataClass;
use App\Models\Enums\AiModelRole;
use App\Models\Enums\AiRefusalReason;
use App\Services\Ai\Exceptions\AiRefused;
use App\Services\Ai\Exceptions\AiUnavailable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Laravel\Ai\Exceptions\FailoverableException;
use Laravel\Ai\Responses\Data\FinishReason;
use Laravel\Ai\Responses\StructuredAgentResponse;
use Throwable;

/**
 * TCK-2383 (ADR-0076 §5) — l'UNIQUE point d'appel d'un modèle. Dans cet ordre, non négociable :
 * autorité de l'appelant, coupe-circuit, budget, données (refus, masquage), cache par empreinte,
 * appel maillon par maillon avec bascule, journal. Chaque refus, chaque tentative auprès d'un
 * fournisseur et un rôle sans modèle ont leur ligne de `ai_calls`. Une évaluation (`AiRequest::$evaluation`) ne juge ni l'autorité ni le budget et
 * n'emprunte pas le cache : elle doit mesurer le modèle, pas une réponse gardée.
 *
 * TCK-2386 — une requête à pièces jointes, pour un usage `AttachmentsUseVision`, joue la chaîne du
 * rôle `vision` et chacune de ses lignes de journal porte ce rôle (`roleFor()`).
 */
final class AiGateway
{
    /** Le suffixe du double, sortie par outil, d'un fournisseur ({@see self::providerFor()}). */
    public const TOOL_OUTPUT_SUFFIX = '-sortie-par-outil';

    public function __construct(
        private readonly AiUsageRegistry $registry,
        private readonly ModelResolver $resolver,
        private readonly AiBudget $budget,
        private readonly AiDataGuard $dataGuard,
        private readonly AiAuthority $authority,
        private readonly PromptRepository $prompts,
        private readonly AiCostCalculator $costs,
    ) {}

    public function run(AiRequest $request): AiResult
    {
        $usage = $this->registry->get($request->usageKey);
        $setting = AiUsageSetting::query()->where('usage_key', $usage->key())->first();

        if (! $request->evaluation && ! $this->authority->allows($request->actor, $usage->authority(), $request->agencyId)) {
            throw $this->refuse($usage, $request, AiRefusalReason::Forbidden);
        }
        if ($setting !== null && ! $setting->enabled) {
            throw $this->refuse($usage, $request, AiRefusalReason::KillSwitch);
        }
        if (! $request->evaluation && $this->budget->exhausted($usage, $setting, $request->agencyId)) {
            throw $this->refuse($usage, $request, AiRefusalReason::Budget);
        }
        if (($reason = $this->dataGuard->refusalFor($usage, $request->dataClasses)) !== null) {
            throw $this->refuse($usage, $request, $reason);
        }
        $input = $this->dataGuard->prepare($usage, $request->input);

        $chain = $request->link !== null ? [$request->link] : $this->resolver->chainFor($usage, $setting, $this->roleFor($usage, $request));
        if ($chain === []) {
            $this->journal($usage, $request, ['outcome' => AiCallOutcome::Error, 'error_code' => 'ai.role_unassigned']);

            throw new AiUnavailable('ai.role_unassigned');
        }

        // Seuls les usages publics sont mis en cache : la clé ne porte ni agence ni acteur, et la
        // réponse d'un usage non public pourrait fuiter ou se révéler d'une agence à l'autre.
        $cacheable = $usage->cacheTtlSeconds() > 0 && $usage->maxDataClass() === AiDataClass::Publique && $request->attachments === [] && ! $request->evaluation;
        $cacheKey = $this->cacheKey($usage, $input, $chain[0]);
        $hit = $cacheable ? $this->cacheGet($usage, $cacheKey) : null;
        if (is_array($hit)) {
            $call = $this->journal($usage, $request, [
                'provider' => $hit['provider'], 'model' => $hit['model'],
                'outcome' => AiCallOutcome::CacheHit, 'cost_estimate' => 0,
            ]);

            return new AiResult($hit['text'], $hit['structured'], $call, true);
        }

        $instructions = $this->prompts->load($usage->key(), $usage->promptVersion());
        $last = null;
        foreach ($chain as $link) {
            $started = hrtime(true);
            try {
                $agent = app($usage->agentClass())->configure($instructions, $link->maxTokens, count($chain));
                $response = $agent->prompt($input, $request->attachments, provider: $this->providerFor($agent, $link), model: $link->model);
            } catch (FailoverableException $e) {
                $this->journal($usage, $request, $this->linkColumns($link) + [
                    'outcome' => AiCallOutcome::FailedOver, 'error_code' => AiErrorCode::fromThrowable($e), 'duration_ms' => $this->elapsed($started),
                ]);
                $last = $e;

                continue;
            } catch (Throwable $e) {
                $this->journal($usage, $request, $this->linkColumns($link) + [
                    'outcome' => AiCallOutcome::Error, 'error_code' => AiErrorCode::fromThrowable($e), 'duration_ms' => $this->elapsed($started),
                ]);

                throw $e;
            }

            $cost = $this->costs->estimate($link->provider, $link->model, $response->usage);
            $stop = $response->steps->last()?->finishReason;
            $spent = $this->linkColumns($link) + [
                'stop_reason' => $stop?->value,
                'input_tokens' => $response->usage->inputTokens,
                'output_tokens' => $response->usage->outputTokens,
                'cache_read_tokens' => $response->usage->cacheReadInputTokens ?? 0,
                'cache_write_tokens' => $response->usage->cacheWriteInputTokens ?? 0,
                'cost_estimate' => $cost,
                'warning' => $cost === null ? 'model_unpriced' : null,
                'duration_ms' => $this->elapsed($started),
            ];
            // TCK-2399 — une réponse coupée ou filtrée est inexploitable : le maillon a échoué, mais il
            // a été payé (ses jetons comptent au budget). Elle n'entre pas dans le cache.
            $unusable = match ($stop) {
                FinishReason::Length => 'ai.response_truncated',
                FinishReason::ContentFilter => 'ai.response_filtered',
                default => null,
            };
            if ($unusable !== null) {
                $this->journal($usage, $request, $spent + ['outcome' => AiCallOutcome::FailedOver, 'error_code' => $unusable]);
                $last = new AiUnavailable($unusable);

                continue;
            }

            $structured = $response instanceof StructuredAgentResponse ? $response->toArray() : null;
            $call = $this->journal($usage, $request, $spent + ['outcome' => AiCallOutcome::Success]);
            if ($cacheable) {
                $this->cachePut($usage, $cacheKey, [
                    'text' => $response->text, 'structured' => $structured,
                    'provider' => $link->provider, 'model' => $link->model,
                ]);
            }

            return new AiResult($response->text, $structured, $call, false);
        }

        throw new AiUnavailable('ai.providers_unavailable', $last);
    }

    /** Un cache indisponible est un cache vide : il ne doit jamais coûter une réponse déjà payée. */
    private function cacheGet(AiUsage $usage, string $key): mixed
    {
        try {
            return Cache::get($key);
        } catch (Throwable $e) {
            Log::warning('ai.cache_unavailable', ['usage' => $usage->key(), 'error' => class_basename($e)]);

            return null;
        }
    }

    /** @param  array<string, mixed>  $value */
    private function cachePut(AiUsage $usage, string $key, array $value): void
    {
        try {
            Cache::put($key, $value, $usage->cacheTtlSeconds());
        } catch (Throwable $e) {
            Log::warning('ai.cache_unavailable', ['usage' => $usage->key(), 'error' => class_basename($e)]);
        }
    }

    private function refuse(AiUsage $usage, AiRequest $request, AiRefusalReason $reason): AiRefused
    {
        return new AiRefused($reason, $this->journal($usage, $request, [
            'outcome' => AiCallOutcome::Refused, 'refusal_reason' => $reason,
        ]));
    }

    /** @param  array<string, mixed>  $columns */
    private function journal(AiUsage $usage, AiRequest $request, array $columns): AiCall
    {
        return AiCall::query()->create($columns + [
            'usage_key' => $usage->key(),
            'role' => $this->roleFor($usage, $request),
            'prompt_version' => $usage->promptVersion(),
            'is_evaluation' => $request->evaluation,
            'agency_id' => $request->agencyId,
            'actor_id' => $request->actor?->getKey(),
            'subject_type' => $request->subject?->getMorphClass(),
            'subject_id' => $request->subject?->getKey(),
        ]);
    }

    /** Le rôle joué : `vision` quand la requête porte des pièces jointes et que l'usage le demande. */
    private function roleFor(AiUsage $usage, AiRequest $request): AiModelRole
    {
        return $request->attachments !== [] && $usage instanceof AttachmentsUseVision ? AiModelRole::Vision : $usage->role();
    }

    /**
     * TCK-2433 — le fournisseur que laravel/ai doit jouer pour ce maillon. Un agent non strict
     * ({@see SocleAgent::usesStrictSchema()}) reçoit un double du fournisseur configuré, à
     * `use_native_structured_output` faux : laravel/ai y demande la sortie par un outil forcé non strict
     * au lieu d'`output_config` (il ne le règle que par fournisseur). Le double n'existe qu'à l'exécution,
     * hors de la liste fermée de `config/ai.php` ; le journal, le coût et la chaîne gardent le nom réel.
     */
    private function providerFor(SocleAgent $agent, ModelLink $link): string
    {
        $base = config("ai.providers.{$link->provider}");
        if ($agent->usesStrictSchema() || ! is_array($base)) {
            return $link->provider;
        }
        $alias = $link->provider.self::TOOL_OUTPUT_SUFFIX;
        config(["ai.providers.{$alias}" => ['use_native_structured_output' => false] + $base]);

        return $alias;
    }

    /** @return array{provider: string, model: string} */
    private function linkColumns(ModelLink $link): array
    {
        return ['provider' => $link->provider, 'model' => $link->model];
    }

    private function elapsed(int $started): int
    {
        return (int) round((hrtime(true) - $started) / 1_000_000);
    }

    private function cacheKey(AiUsage $usage, string $input, ModelLink $first): string
    {
        return 'ai:'.hash('sha256', json_encode(
            [$usage->key(), $usage->promptVersion(), $first->provider, $first->model, $input],
            JSON_THROW_ON_ERROR,
        ));
    }
}
