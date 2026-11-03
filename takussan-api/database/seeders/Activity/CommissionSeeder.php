<?php

namespace Database\Seeders\Activity;

use App\Models\CommissionEntry;
use App\Models\Enums\LeaseStatus;
use App\Models\User;
use App\Services\Commission\CommissionLedgerService;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;

/**
 * TCK-2379 — le grand livre des commissions (ADR-0049 §3), par son service : à l'activation de
 * chaque bail, `CommissionLedgerService::generateFor()` ventile les frais d'agence
 * (`leases.commission_amount`) entre les collaborateurs du bien et le négociateur. Un renouvellement
 * n'en crée aucune, comme dans l'application.
 *
 * Puis le règlement : l'administrateur de l'agence verse la commission un mois environ après la
 * signature (`markPaid`) ; un bail résilié avant ce versement voit la sienne annulée (`cancel`) ;
 * les plus récentes restent dues.
 */
class CommissionSeeder extends Seeder
{
    public function __construct(
        private readonly SeedingContext $ctx,
        private readonly CommissionLedgerService $grandLivre,
    ) {}

    public function run(): void
    {
        $maintenant = CarbonImmutable::now();

        foreach ($this->ctx->leases->sortBy('id') as $lease) {
            if ($lease->status === LeaseStatus::Draft || $lease->signed_at === null || $lease->renewed_from_lease_id !== null) {
                continue;
            }
            $signeLe = CarbonImmutable::parse($lease->signed_at);
            Timeline::aLaDate($signeLe, fn () => $this->grandLivre->generateFor($lease));

            $administrateur = User::query()->find($this->ctx->agencies->get($lease->agency_id)?->primary_admin_id);
            if ($administrateur === null) {
                continue;
            }
            $resilieLe = $lease->terminated_at !== null ? CarbonImmutable::parse($lease->terminated_at) : null;

            foreach (CommissionEntry::query()->where('lease_id', $lease->id)->orderBy('id')->get() as $ligne) {
                $verseLe = Timeline::businessHour($signeLe->addDays(mt_rand(20, 45)));
                if ($resilieLe !== null && $resilieLe->lessThan($verseLe)) {
                    Timeline::aLaDate($resilieLe, fn () => $this->grandLivre->cancel($ligne, $administrateur));
                } elseif ($verseLe->lessThan($maintenant)) {
                    Timeline::aLaDate($verseLe, fn () => $this->grandLivre->markPaid($ligne, $administrateur));
                }
            }
        }
    }
}
