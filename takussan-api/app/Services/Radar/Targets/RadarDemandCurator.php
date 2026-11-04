<?php

namespace App\Services\Radar\Targets;

use App\Ai\Agents\RadarDemandTargets;
use App\Ai\Usages\RadarDemandTargetsUsage;
use App\Exceptions\ApiError;
use App\Models\AiCall;
use App\Models\Enums\AiDataClass;
use App\Models\Enums\RadarTargetOrigin;
use App\Models\Enums\RadarTargetStatus;
use App\Models\RadarDemandSetting;
use App\Models\RadarTarget;
use App\Models\RadarTargetRevision;
use App\Models\User;
use App\Services\Ai\AiErrorCode;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiRequest;
use App\Services\Ai\Exceptions\AiRefused;
use App\Services\Ai\Exceptions\AiUnavailable;
use App\Support\AdvisoryLock;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * TCK-2470 (ADR-0087 §6) — un passage des cibles de la demande, et son « défaire ».
 *
 * Un passage, dans cet ordre :
 *  1. **Rien sans opérateur** : réglage éteint, ou opérateur disparu → aucun signal lu, aucun appel ({@see RadarDemandSetting}).
 *  2. Les signaux, lus et regroupés par le code ({@see RadarDemandSignals}) — ni texte saisi, ni compte.
 *  3. **Pas de passage inutile** : la même empreinte que la dernière révision (défaite ou non : un « défaire » n'est pas
 *     refait tant que la demande n'a pas changé) → aucun appel. L'empreinte porte les signaux ET le nombre de places
 *     libres (`max_demand` moins les cibles `demand` actives, compté APRÈS la révision) : une place que l'opérateur libère
 *     relance le modèle (revue adverse du 2026-11-04, D8), celle qu'un « défaire » libère non ({@see self::revert()}).
 *     **Aucun signal** : aucun appel ; les cibles que l'IA peut toucher (`demand`, actives, non épinglées) sont retirées
 *     SANS IA, dans une révision qui se défait, motif {@see self::REASON_NO_DEMAND} (D7) — une seule fois : défaite, elle
 *     n'est pas refaite tant que des signaux ne sont pas revenus.
 *  4. L'appel à l'usage `radar.cibles`, au nom de l'opérateur, HORS de toute transaction.
 *  5. **Le modèle propose, le code valide** : chaque opération passe `RadarTargetCriteria`, le plafond des cibles `demand`
 *     (`radar.targets.max_demand`), et celui et le doublon de {@see RadarTargets}. Une création, un réglage ou une fusion
 *     doit couvrir ({@see RadarDemandSignals::covers()}) au moins l'un des signaux qu'elle cite (`signal_refs`), sinon
 *     {@see self::DISCARD_UNCOVERED} (D3 : une cible sans lien avec la demande ouvrirait tout un site). Une opération qui vise une cible de
 *     l'opérateur, épinglée, en pause ou retirée est écartée. Une opération écartée est consignée dans la révision
 *     (`discarded`, avec son code) et au journal ; les autres s'appliquent. Chaque opération est atomique (point de
 *     sauvegarde) : une fusion refusée à mi-chemin ne laisse rien.
 *  6. La révision : ce qui a été appliqué, ce qui a été écarté, l'état d'avant de chaque cible touchée.
 *  7. `demand_count` de chaque cible `demand` vivante = la somme des signaux qu'elle couvre (sans IA, à chaque passage).
 *
 * Verrous (ADR-0073 § 3) : la ligne du réglage d'abord (deux passages, ou un passage et un « défaire », se sérialisent),
 * puis les cibles visées, par identifiant croissant, puis le verrou consultatif de {@see RadarTargets} — l'ordre de
 * `RadarTargets::update()`, pour qu'une écriture de la console en même temps n'interblogue pas.
 */
final class RadarDemandCurator
{
    public const OUTCOME_APPLIED = 'applied';

    public const OUTCOME_UNCHANGED = 'unchanged';

    public const OUTCOME_NO_SIGNALS = 'no_signals';

    /** Revue adverse du 2026-11-04 (D7) — aucun signal, et des cibles de la demande ont été retirées sans IA. */
    public const OUTCOME_NO_SIGNALS_RETIRED = 'no_signals_retired';

    /** Le motif (un code, pas un texte : le front le libelle) d'un retrait fait sans IA, faute de demande. */
    public const REASON_NO_DEMAND = 'radar.demand.no_demand';

    public const OUTCOME_INVALID_OUTPUT = 'radar.demand.invalid_output';

    public const DISCARD_INVALID_OPERATION = 'radar.demand.invalid_operation';

    public const DISCARD_INVALID_NAME = 'radar.demand.invalid_name';

    public const DISCARD_UNKNOWN_TARGET = 'radar.demand.unknown_target';

    public const DISCARD_PROTECTED_TARGET = 'radar.demand.target_protected';

    public const DISCARD_TOO_MANY = 'radar.demand.too_many';

    /** Revue adverse du 2026-11-04 (D3) — les critères ne couvrent aucun des signaux cités. */
    public const DISCARD_UNCOVERED = 'radar.demand.uncovered';

    public const NAME_MAX = 120;

    public function __construct(
        private readonly RadarDemandSignals $signals,
        private readonly AiGateway $gateway,
        private readonly RadarTargets $targets,
    ) {}

    /** Un passage ; rend son issue, aussi inscrite sur le réglage (`last_run_outcome`). */
    public function run(): string
    {
        $setting = RadarDemandSetting::current();
        $blocked = $setting->blockedReason();
        if ($blocked !== null) {
            return $this->finish($blocked);
        }
        /** @var User $operator */
        $operator = $setting->operator;

        $collected = $this->signals->collect();
        if ($collected['signals'] === []) {
            $this->recount([]);

            return $this->finish($this->retireWithoutDemand($collected['signature']));
        }
        $lastSignature = RadarTargetRevision::query()->orderByDesc('id')->value('signals_signature');
        if ($lastSignature === self::stamp($collected['signature'], self::freePlaces())) {
            $this->recount($collected['signals']);

            return $this->finish(self::OUTCOME_UNCHANGED);
        }

        try {
            $result = $this->gateway->run(new AiRequest(
                RadarDemandTargetsUsage::KEY,
                $this->input($collected['signals']),
                [AiDataClass::Publique],
                actor: $operator,
            ));
        } catch (AiRefused $e) {
            return $this->finish('ai.'.$e->reason->value);
        } catch (AiUnavailable $e) {
            return $this->finish($e->getMessage());
        } catch (Throwable $e) {
            // Journalisée par la passerelle ; le passage suivant retentera.
            report($e);

            return $this->finish(AiErrorCode::fromThrowable($e));
        }

        $operations = $result->structured['operations'] ?? null;
        if (! is_array($operations) || ! array_is_list($operations)) {
            return $this->finish(self::OUTCOME_INVALID_OUTPUT);
        }

        $this->apply($operations, $collected, $result->call);
        $this->recount($collected['signals']);

        return $this->finish(self::OUTCOME_APPLIED);
    }

    /**
     * L'entrée du modèle : des signaux (critères structurés et comptes) et les cibles vivantes. Rien d'autre — c'est ce que
     * AC4 éprouve sur l'entrée réellement envoyée.
     *
     * @param  list<array{ref: string, count: int, sources: array<string, int>, criteria: array<string, mixed>}>  $signals
     */
    public function input(array $signals): string
    {
        $targets = RadarTarget::query()
            ->where('status', '<>', RadarTargetStatus::Retired->value)
            ->orderBy('id')
            ->get(['id', 'name', 'origin', 'status', 'pinned', 'criteria', 'demand_count'])
            ->map(fn (RadarTarget $t): array => [
                'id' => $t->id,
                'origin' => $t->origin->value,
                'status' => $t->status->value,
                'editable' => $this->editable($t),
                'name' => $t->name,
                'criteria' => array_intersect_key(RadarTargetCriteria::ordered((array) $t->criteria), array_flip(RadarDemandTargets::CRITERIA_KEYS)),
                'demand_count' => $t->demand_count,
            ])
            ->all();

        return json_encode([
            'limits' => ['max_demand_targets' => self::maxDemand()],
            'signals' => array_map(static fn (array $s): array => [
                'ref' => $s['ref'],
                'count' => $s['count'],
                'sources' => $s['sources'],
                'criteria' => array_intersect_key($s['criteria'], array_flip(RadarDemandTargets::CRITERIA_KEYS)),
            ], $signals),
            'targets' => $targets,
        ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    /**
     * Défaire une révision : chaque cible touchée revient à son état d'avant ; une cible créée est retirée (une cible ne
     * s'efface jamais). Refusé (409) si la révision est déjà défaite, si une révision postérieure non défaite touche l'une
     * des mêmes cibles, si l'opérateur a depuis épinglé l'une d'elles (elle est à lui) ou changé son statut (retirée, mise
     * en pause : D5) ; refusé (422 `radar.targets.too_many`) s'il remettait plus de `max_demand` cibles actives (D6).
     */
    public function revert(RadarTargetRevision $revision, User $by): RadarTargetRevision
    {
        return DB::transaction(function () use ($revision, $by): RadarTargetRevision {
            RadarDemandSetting::current();
            RadarDemandSetting::query()->whereKey(RadarDemandSetting::ID)->lockForUpdate()->first();
            $fresh = RadarTargetRevision::query()->whereKey($revision->id)->lockForUpdate()->firstOrFail();
            abort_code_if($fresh->reverted_at !== null, 409, 'radar.targets.revision_reverted');

            $ids = $fresh->touchedTargetIds();
            if ($ids !== []) {
                $later = RadarTargetRevision::query()
                    ->where('id', '>', $fresh->id)
                    ->whereNull('reverted_at')
                    ->orderBy('id')
                    ->get(['id', 'before'])
                    ->first(fn (RadarTargetRevision $r): bool => array_intersect($ids, $r->touchedTargetIds()) !== []);
                abort_code_if($later !== null, 409, 'radar.targets.revision_superseded', ['revision_id' => (int) $later?->id]);
            }

            $current = RadarTarget::query()->whereKey($ids)->orderBy('id')->lockForUpdate()->get()->keyBy('id');
            $pinned = $current->first(fn (RadarTarget $t): bool => $t->pinned);
            abort_code_if($pinned !== null, 409, 'radar.targets.revision_superseded', ['target_id' => (int) $pinned?->id]);
            // Revue adverse du 2026-11-04 (D5) — une cible dont le statut a changé depuis la révision (retirée ou mise en
            // pause par l'opérateur, qui ne l'épingle pas) : la défaire effacerait ce geste en silence.
            $left = self::statusesLeftBy($fresh);
            $moved = $current->first(fn (RadarTarget $t): bool => isset($left[$t->id]) && $t->status->value !== $left[$t->id]);
            abort_code_if($moved !== null, 409, 'radar.targets.revision_superseded', ['target_id' => (int) $moved?->id]);
            AdvisoryLock::acquire(RadarTargets::LOCK);
            $freeBefore = self::freePlaces();

            // Les créées d'abord (retirées), puis celles qui revenaient retirées, puis les autres : une cible rendue à ses
            // critères d'avant ne bute pas sur le doublon d'une cible que la révision avait créée ou fusionnée.
            $states = collect((array) $fresh->before)
                ->sortBy(fn (array $s): int => ($s['created'] ?? false) ? 0 : (($s['status'] ?? null) === RadarTargetStatus::Retired->value ? 1 : 2))
                ->values();
            foreach ($states as $state) {
                $target = $current->get((int) $state['id']);
                if ($target === null) {
                    continue;
                }
                if ($state['created'] ?? false) {
                    if ($target->status !== RadarTargetStatus::Retired) {
                        $this->targets->retire($target);
                    }

                    continue;
                }
                $this->targets->update($target, [
                    'name' => (string) $state['name'],
                    'criteria' => (array) $state['criteria'],
                    'status' => RadarTargetStatus::from((string) $state['status']),
                    'demand_count' => (int) ($state['demand_count'] ?? 0),
                    // Une cible que la révision avait retirée (retrait, fusion) revient : seul chemin qui en reprend une.
                ], pinsDemand: false, editsRetired: true);
            }

            // Revue adverse du 2026-11-04 (D6) — le plafond des cibles de la demande se juge aussi en défaisant (sous le
            // verrou) : refusé si défaire le dépasse et y ajoute.
            $max = self::maxDemand();
            $activeAfter = $max - self::freePlaces();
            abort_code_if($activeAfter > $max && $activeAfter > $max - $freeBefore, 422, 'radar.targets.too_many', ['max' => $max]);

            $this->restamp($freeBefore);
            $fresh->forceFill(['reverted_at' => now(), 'reverted_by_id' => $by->id])->save();

            return $fresh;
        });
    }

    /**
     * @param  list<mixed>  $operations
     * @param  array{signals: list<array<string, mixed>>, signature: string}  $collected
     */
    private function apply(array $operations, array $collected, AiCall $call): RadarTargetRevision
    {
        $refs = array_column($collected['signals'], 'criteria', 'ref');

        return DB::transaction(function () use ($operations, $collected, $call, $refs): RadarTargetRevision {
            RadarDemandSetting::query()->whereKey(RadarDemandSetting::ID)->lockForUpdate()->first();
            $ids = [];
            foreach ($operations as $op) {
                if (is_array($op)) {
                    $ids = [...$ids, ...self::ids($op['target_id'] ?? null), ...self::ids($op['merge_ids'] ?? null)];
                }
            }
            RadarTarget::query()->whereKey(array_values(array_unique($ids)))->orderBy('id')->lockForUpdate()->get(['id']);
            AdvisoryLock::acquire(RadarTargets::LOCK);

            $applied = [];
            $discarded = [];
            /** @var array<int, array<string, mixed>> $before */
            $before = [];
            foreach ($operations as $op) {
                $op = is_array($op) ? $op : [];
                try {
                    // Un point de sauvegarde par opération : un refus à mi-chemin (fusion) ne laisse rien.
                    $applied[] = DB::transaction(function () use ($op, $refs, &$before): array {
                        return $this->applyOne($op, $refs, $before);
                    });
                } catch (InvalidRadarTargetCriteria $e) {
                    $discarded[] = $this->discard($op, $e->errorCode, $e->params);
                } catch (ApiError $e) {
                    $discarded[] = $this->discard($op, $e->errorCode, $e->params);
                }
            }

            return RadarTargetRevision::query()->create([
                'operations' => $applied,
                'discarded' => $discarded,
                'before' => array_values($before),
                // D8 — les places libres APRÈS la révision : le passage suivant, à demande égale, ne rappelle pas le modèle.
                'signals_signature' => self::stamp($collected['signature'], self::freePlaces()),
                'signals_count' => count($collected['signals']),
                'ai_call_id' => $call->id,
            ]);
        });
    }

    /**
     * Une opération validée puis appliquée ; lève `ApiError` ou `InvalidRadarTargetCriteria` pour l'écarter. Les états
     * d'avant des cibles touchées s'ajoutent à `$before` seulement si elle aboutit.
     *
     * @param  array<string, mixed>  $op
     * @param  array<string, array<string, mixed>>  $refs  référence d'un signal → ses critères
     * @param  array<int, array<string, mixed>>  $before
     * @return array<string, mixed> l'opération telle qu'appliquée
     */
    private function applyOne(array $op, array $refs, array &$before): array
    {
        $kind = $op['op'] ?? null;
        $signalRefs = array_values(array_unique(array_intersect(array_map('strval', array_filter((array) ($op['signal_refs'] ?? []), 'is_scalar')), array_map('strval', array_keys($refs)))));
        $reason = mb_substr(trim(is_string($op['reason'] ?? null) ? $op['reason'] : ''), 0, 500);
        $record = ['op' => $kind, 'target_id' => null, 'merge_ids' => [], 'name' => null, 'criteria' => null, 'reason' => $reason, 'signal_refs' => $signalRefs];
        $touched = [];

        switch ($kind) {
            case 'create':
                $criteria = self::criteria($op['criteria'] ?? null);
                $name = self::name($op['name'] ?? null);
                self::assertCovers($criteria, $signalRefs, $refs);
                $max = self::maxDemand();
                $active = RadarTarget::query()
                    ->where('origin', RadarTargetOrigin::Demand->value)
                    ->where('status', RadarTargetStatus::Active->value)
                    ->count();
                if ($active >= $max) {
                    abort_code(422, self::DISCARD_TOO_MANY, ['max' => $max]);
                }
                $target = $this->targets->create($name, $criteria, RadarTargetStatus::Active, RadarTargetOrigin::Demand, null, 0);
                $touched[$target->id] = ['id' => $target->id, 'created' => true];
                $record = ['target_id' => $target->id, 'name' => $name, 'criteria' => RadarTargetCriteria::ordered($criteria)] + $record;
                break;

            case 'update':
                $target = $this->editableTarget($op['target_id'] ?? null);
                $criteria = self::criteria($op['criteria'] ?? null);
                $name = self::name($op['name'] ?? null, $target->name);
                self::assertCovers($criteria, $signalRefs, $refs);
                $touched[$target->id] = self::state($target);
                $this->targets->update($target, ['name' => $name, 'criteria' => $criteria], pinsDemand: false);
                $record = ['target_id' => $target->id, 'name' => $name, 'criteria' => RadarTargetCriteria::ordered($criteria)] + $record;
                break;

            case 'merge':
                $ids = self::ids($op['merge_ids'] ?? null);
                $keptId = self::ids($op['target_id'] ?? null)[0] ?? ($ids[0] ?? null);
                $ids = array_values(array_unique([...($keptId !== null ? [$keptId] : []), ...$ids]));
                if (count($ids) < 2) {
                    abort_code(422, self::DISCARD_INVALID_OPERATION, ['field' => 'merge_ids']);
                }
                // Toutes jugées AVANT d'en toucher une : une fusion qui atteindrait une cible protégée est écartée entière.
                $merged = array_map(fn (int $id): RadarTarget => $this->editableTarget($id), $ids);
                $criteria = self::criteria($op['criteria'] ?? null);
                $name = self::name($op['name'] ?? null);
                self::assertCovers($criteria, $signalRefs, $refs);
                foreach ($merged as $target) {
                    $touched[$target->id] = self::state($target);
                    if ($target->id !== $keptId) {
                        $this->targets->retire($target);
                    }
                }
                $kept = $merged[array_search($keptId, $ids, true)];
                $this->targets->update($kept, ['name' => $name, 'criteria' => $criteria], pinsDemand: false);
                $record = ['target_id' => $keptId, 'merge_ids' => $ids, 'name' => $name, 'criteria' => RadarTargetCriteria::ordered($criteria)] + $record;
                break;

            case 'retire':
                $target = $this->editableTarget($op['target_id'] ?? null);
                $touched[$target->id] = self::state($target);
                $this->targets->retire($target);
                $record = ['target_id' => $target->id] + $record;
                break;

            default:
                abort_code(422, self::DISCARD_INVALID_OPERATION, ['field' => 'op']);
        }

        foreach ($touched as $id => $state) {
            $before[$id] ??= $state;
        }

        return $record;
    }

    /** Une cible que l'IA peut toucher : `demand`, vivante et active, non épinglée. Sinon l'opération est écartée. */
    private function editableTarget(mixed $id): RadarTarget
    {
        $id = self::ids($id)[0] ?? null;
        $target = $id === null ? null : RadarTarget::query()->find($id);
        if ($target === null || $target->status === RadarTargetStatus::Retired) {
            abort_code(422, self::DISCARD_UNKNOWN_TARGET, ['target_id' => $id]);
        }
        if (! $this->editable($target)) {
            abort_code(422, self::DISCARD_PROTECTED_TARGET, ['target_id' => $target->id]);
        }

        return $target;
    }

    /**
     * Cible de l'opérateur, épinglée, ou mise en pause (un geste de l'opérateur : l'IA ne crée que des cibles actives) :
     * jamais touchée par l'IA.
     */
    private function editable(RadarTarget $target): bool
    {
        return $target->origin === RadarTargetOrigin::Demand && ! $target->pinned && $target->status === RadarTargetStatus::Active;
    }

    /**
     * @param  array<string, mixed>  $op
     * @param  array<string, mixed>  $params
     * @return array<string, mixed>
     */
    private function discard(array $op, string $code, array $params): array
    {
        $targetId = self::ids($op['target_id'] ?? null)[0] ?? null;
        $entry = [
            'op' => is_string($op['op'] ?? null) ? $op['op'] : null,
            'target_id' => $targetId,
            // Le nom de la cible visée quand elle existe : la console le cite au lieu de son numéro.
            'target_name' => $targetId === null ? null : RadarTarget::query()->whereKey($targetId)->value('name'),
            'merge_ids' => self::ids($op['merge_ids'] ?? null),
            'name' => is_string($op['name'] ?? null) ? mb_substr($op['name'], 0, self::NAME_MAX) : null,
            'reason' => is_string($op['reason'] ?? null) ? mb_substr($op['reason'], 0, 500) : null,
            'code' => $code,
            'params' => $params,
        ];
        Log::warning('radar.demand.operation_discarded', ['op' => $entry['op'], 'target_id' => $entry['target_id'], 'code' => $code]);

        return $entry;
    }

    /**
     * `demand_count` de chaque cible `demand` vivante = la somme des signaux qu'elle couvre ({@see RadarDemandSignals::covers()}).
     *
     * @param  list<array{count: int, criteria: array<string, mixed>}>  $signals
     */
    private function recount(array $signals): void
    {
        RadarTarget::query()
            ->where('origin', RadarTargetOrigin::Demand->value)
            ->where('status', '<>', RadarTargetStatus::Retired->value)
            ->orderBy('id')
            ->get(['id', 'criteria', 'demand_count'])
            ->each(function (RadarTarget $target) use ($signals): void {
                $sum = 0;
                foreach ($signals as $signal) {
                    if (RadarDemandSignals::covers((array) $target->criteria, $signal['criteria'])) {
                        $sum += $signal['count'];
                    }
                }
                if ($target->demand_count !== $sum) {
                    RadarTarget::query()->whereKey($target->id)->update(['demand_count' => $sum]);
                }
            });
    }

    /**
     * D7 — aucun signal : les cibles que l'IA peut toucher sont retirées, sans IA, dans une révision qui se défait (son
     * empreinte : celle d'un jeu de signaux vide, sans les places). Rien si la dernière révision est déjà celle-là, défaite
     * ou non : la demande n'a pas bougé depuis.
     */
    private function retireWithoutDemand(string $emptySignature): string
    {
        return DB::transaction(function () use ($emptySignature): string {
            RadarDemandSetting::query()->whereKey(RadarDemandSetting::ID)->lockForUpdate()->first();
            if (RadarTargetRevision::query()->orderByDesc('id')->value('signals_signature') === $emptySignature) {
                return self::OUTCOME_NO_SIGNALS;
            }
            $targets = RadarTarget::query()
                ->where('origin', RadarTargetOrigin::Demand->value)
                ->where('status', RadarTargetStatus::Active->value)
                ->where('pinned', false)
                ->orderBy('id')
                ->lockForUpdate()
                ->get();
            if ($targets->isEmpty()) {
                return self::OUTCOME_NO_SIGNALS;
            }
            AdvisoryLock::acquire(RadarTargets::LOCK);

            $operations = [];
            $before = [];
            foreach ($targets as $target) {
                $before[] = self::state($target);
                $this->targets->retire($target);
                $operations[] = ['op' => 'retire', 'target_id' => $target->id, 'merge_ids' => [], 'name' => null, 'criteria' => null,
                    'reason' => self::REASON_NO_DEMAND, 'signal_refs' => []];
            }
            RadarTargetRevision::query()->create([
                'operations' => $operations,
                'discarded' => [],
                'before' => $before,
                'signals_signature' => $emptySignature,
                'signals_count' => 0,
                'ai_call_id' => null,
            ]);

            return self::OUTCOME_NO_SIGNALS_RETIRED;
        });
    }

    /**
     * D8 — après un « défaire », la dernière révision garde son sens (« demande déjà traitée ») : si elle valait l'état
     * d'avant (mêmes signaux, mêmes places), elle prend les places d'après. Une place que défaire libère ne relance donc
     * pas le modèle ; une demande qui a bougé entre-temps, si.
     */
    private function restamp(int $freeBefore): void
    {
        $last = RadarTargetRevision::query()->orderByDesc('id')->lockForUpdate()->first(['id', 'signals_signature']);
        if ($last === null) {
            return;
        }
        $signature = $this->signals->collect()['signature'];
        if ($last->signals_signature === self::stamp($signature, $freeBefore)) {
            RadarTargetRevision::query()->whereKey($last->id)->update(['signals_signature' => self::stamp($signature, self::freePlaces())]);
        }
    }

    /**
     * D3 — des critères qui couvrent au moins l'un des signaux cités ; sinon l'opération est écartée.
     *
     * @param  array<string, mixed>  $criteria
     * @param  list<string>  $signalRefs
     * @param  array<string, array<string, mixed>>  $refs
     */
    private static function assertCovers(array $criteria, array $signalRefs, array $refs): void
    {
        foreach ($signalRefs as $ref) {
            if (RadarDemandSignals::covers($criteria, (array) $refs[$ref])) {
                return;
            }
        }
        abort_code(422, self::DISCARD_UNCOVERED, ['signal_refs' => $signalRefs]);
    }

    /**
     * D5 — le statut où la révision a laissé chaque cible qu'elle a touchée, dans l'ordre de ses opérations.
     *
     * @return array<int, string>
     */
    private static function statusesLeftBy(RadarTargetRevision $revision): array
    {
        $left = [];
        foreach ((array) $revision->operations as $operation) {
            $id = (int) ($operation['target_id'] ?? 0);
            foreach ((array) ($operation['merge_ids'] ?? []) as $merged) {
                if ((int) $merged !== $id) {
                    $left[(int) $merged] = RadarTargetStatus::Retired->value;
                }
            }
            if ($id > 0) {
                $left[$id] = ($operation['op'] ?? null) === 'retire' ? RadarTargetStatus::Retired->value : RadarTargetStatus::Active->value;
            }
        }

        return $left;
    }

    /** D8 — l'empreinte d'un passage : les signaux et les places libres. */
    private static function stamp(string $signalsSignature, int $freePlaces): string
    {
        return hash('sha256', $signalsSignature.'|free:'.$freePlaces);
    }

    /** `max_demand` moins les cibles `demand` actives (négatif si la configuration a baissé sous le compte). */
    private static function freePlaces(): int
    {
        return self::maxDemand() - RadarTarget::query()
            ->where('origin', RadarTargetOrigin::Demand->value)
            ->where('status', RadarTargetStatus::Active->value)
            ->count();
    }

    private function finish(string $outcome): string
    {
        RadarDemandSetting::current();
        RadarDemandSetting::query()->whereKey(RadarDemandSetting::ID)->update(['last_run_at' => now(), 'last_run_outcome' => $outcome]);

        return $outcome;
    }

    /** @return array<string, mixed> l'état d'une cible que « défaire » rétablit */
    private static function state(RadarTarget $target): array
    {
        return [
            'id' => $target->id,
            'name' => $target->name,
            'status' => $target->status->value,
            'pinned' => $target->pinned,
            'criteria' => RadarTargetCriteria::ordered((array) $target->criteria),
            'demand_count' => $target->demand_count,
        ];
    }

    /**
     * Les critères proposés, restreints à ce que le modèle peut proposer, puis normalisés (lève `InvalidRadarTargetCriteria`).
     *
     * @return array<string, mixed>
     */
    private static function criteria(mixed $proposed): array
    {
        if (! is_array($proposed) || ($proposed !== [] && array_is_list($proposed))) {
            throw new InvalidRadarTargetCriteria('radar.targets.invalid_criteria', ['field' => 'criteria']);
        }
        $extra = array_diff(array_keys($proposed), RadarDemandTargets::CRITERIA_KEYS);
        if ($extra !== []) {
            throw new InvalidRadarTargetCriteria('radar.targets.unknown_criterion', ['field' => 'criteria.'.reset($extra)]);
        }

        return RadarTargetCriteria::normalize($proposed);
    }

    private static function name(mixed $name, ?string $fallback = null): string
    {
        $name = is_string($name) ? trim((string) preg_replace('/\s+/u', ' ', $name)) : '';
        if ($name === '' && $fallback !== null) {
            return $fallback;
        }
        if ($name === '') {
            abort_code(422, self::DISCARD_INVALID_NAME);
        }

        return mb_substr($name, 0, self::NAME_MAX);
    }

    /** @return list<int> */
    private static function ids(mixed $value): array
    {
        $values = is_array($value) ? $value : [$value];

        return array_values(array_unique(array_map('intval', array_filter($values, static fn (mixed $v): bool => is_int($v) && $v > 0))));
    }

    private static function maxDemand(): int
    {
        return (int) config('radar.targets.max_demand', 20);
    }
}
