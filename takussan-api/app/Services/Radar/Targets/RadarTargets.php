<?php

namespace App\Services\Radar\Targets;

use App\Models\Enums\RadarTargetOrigin;
use App\Models\Enums\RadarTargetStatus;
use App\Models\RadarTarget;
use App\Models\User;
use App\Support\AdvisoryLock;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2468 (ADR-0087 §5) — les écritures d'une cible : créer, modifier, retirer. Le SEUL chemin qui en écrit une, pour que
 * les deux invariants tiennent quel que soit l'auteur (la console ici, la révision de la demande par l'IA en TCK-2470) :
 *
 *  - **au plus `radar.targets.max_active` cibles actives**, toutes origines → sinon `radar.targets.too_many` ;
 *  - **aucune cible vivante (non retirée) en double** : même empreinte de critères → `radar.targets.duplicate`
 *    (`params.target_id`). L'index unique partiel `radar_targets_live_signature_unique` en est le filet ; le contrôle est
 *    fait avant, sous le verrou, pour rendre un 422 et jamais une erreur SQL (piège PostgreSQL n° 1).
 *
 * Les deux se jugent sous UN verrou consultatif (`AdvisoryLock`, espace `radar_targets`) : deux créations simultanées ne
 * dépassent pas le plafond ensemble. Les refus sont des `abort_code(422, …)`.
 */
final class RadarTargets
{
    public const LOCK = 'radar_targets';

    /** @param  array<string, mixed>  $criteria  critères normalisés ({@see RadarTargetCriteria::normalize()}) */
    public function create(string $name, array $criteria, RadarTargetStatus $status, RadarTargetOrigin $origin, ?User $by, ?int $demandCount = null): RadarTarget
    {
        return DB::transaction(function () use ($name, $criteria, $status, $origin, $by, $demandCount): RadarTarget {
            AdvisoryLock::acquire(self::LOCK);
            $signature = RadarTargetCriteria::signature($criteria);
            $this->guard(null, $signature, $status);

            return RadarTarget::query()->create([
                'name' => $name,
                'origin' => $origin,
                'status' => $status,
                'pinned' => false,
                'criteria' => $criteria,
                'criteria_signature' => $signature,
                'demand_count' => $origin === RadarTargetOrigin::Demand ? ($demandCount ?? 0) : null,
                'matches_count' => 0,
                'created_by_id' => $by?->id,
            ]);
        });
    }

    /**
     * Les champs donnés seulement. Modifier les critères d'une cible `demand` l'épingle : la révision par l'IA ne la
     * touchera plus. TCK-2470 — `$pinsDemand` faux : la révision de la demande elle-même (`RadarDemandCurator`), qui
     * réécrit les critères d'une cible `demand` sans la soustraire à la révision suivante.
     *
     * Décision du porteur (2a, 2026-11-04) — **une cible retirée ne se modifie plus** : 422 `radar.targets.retired`
     * (`params.target_id`), jugé sous le verrou de sa ligne. Pour la reprendre, on en crée une nouvelle. `$editsRetired`
     * vrai : les deux seuls chemins qui le peuvent — la retirer de nouveau ({@see self::retire()}, sans effet) et
     * « défaire » une révision de la demande, qui rend une cible à l'état d'avant qu'elle avait elle-même changé.
     *
     * @param  array{name?: string, criteria?: array<string, mixed>, status?: RadarTargetStatus, pinned?: bool, demand_count?: int}  $changes
     */
    public function update(RadarTarget $target, array $changes, bool $pinsDemand = true, bool $editsRetired = false): RadarTarget
    {
        return DB::transaction(function () use ($target, $changes, $pinsDemand, $editsRetired): RadarTarget {
            // ADR-0073 § 3, règle 4 : le verrou de ligne d'abord, le verrou consultatif en dernier.
            $fresh = RadarTarget::query()->whereKey($target->id)->lockForUpdate()->firstOrFail();
            abort_code_if(! $editsRetired && $fresh->status === RadarTargetStatus::Retired, 422, 'radar.targets.retired', ['target_id' => $fresh->id]);
            AdvisoryLock::acquire(self::LOCK);

            $status = $changes['status'] ?? $fresh->status;
            $signature = isset($changes['criteria']) ? RadarTargetCriteria::signature($changes['criteria']) : $fresh->criteria_signature;
            $this->guard($fresh, $signature, $status);

            if (array_key_exists('name', $changes)) {
                $fresh->name = $changes['name'];
            }
            if (array_key_exists('pinned', $changes)) {
                $fresh->pinned = $changes['pinned'];
            }
            if (isset($changes['criteria'])) {
                if ($pinsDemand && $fresh->origin === RadarTargetOrigin::Demand && $signature !== $fresh->criteria_signature) {
                    $fresh->pinned = true;
                }
                $fresh->criteria = $changes['criteria'];
                $fresh->criteria_signature = $signature;
            }
            if (array_key_exists('demand_count', $changes) && $fresh->origin === RadarTargetOrigin::Demand) {
                $fresh->demand_count = $changes['demand_count'];
            }
            $fresh->status = $status;
            $fresh->save();

            return $fresh;
        });
    }

    /** Retirer : la cible ne borne plus rien et ne reçoit plus d'annonce ; elle ne s'efface jamais. Déjà retirée : rien ne change. */
    public function retire(RadarTarget $target): RadarTarget
    {
        return $this->update($target, ['status' => RadarTargetStatus::Retired], editsRetired: true);
    }

    /** Le plafond (pour une cible qui DEVIENT active) et le doublon (pour une cible vivante), sous le verrou. */
    private function guard(?RadarTarget $current, string $signature, RadarTargetStatus $status): void
    {
        if ($status === RadarTargetStatus::Retired) {
            return;
        }

        $duplicate = RadarTarget::query()
            ->where('criteria_signature', $signature)
            ->where('status', '<>', RadarTargetStatus::Retired->value)
            ->when($current !== null, fn ($q) => $q->whereKeyNot($current->id))
            ->value('id');
        abort_code_if($duplicate !== null, 422, 'radar.targets.duplicate', ['target_id' => (int) $duplicate]);

        $becomesActive = $status === RadarTargetStatus::Active && $current?->status !== RadarTargetStatus::Active;
        if ($becomesActive) {
            $max = (int) config('radar.targets.max_active', 50);
            $active = RadarTarget::query()->where('status', RadarTargetStatus::Active->value)->count();
            abort_code_if($active >= $max, 422, 'radar.targets.too_many', ['max' => $max]);
        }
    }
}
