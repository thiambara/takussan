<?php

namespace Database\Seeders\Activity;

use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PayoutMethodKind;
use App\Models\Lease;
use App\Models\PayoutMethod;
use App\Models\User;
use App\Services\Payout\PayoutMethodService;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\StatusDistribution;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;

/**
 * TCK-2379 — la destination où chaque bailleur reçoit ses loyers (ADR-0039) : déclarée avant son
 * premier bail, puis vérifiée par l'administrateur de chaque agence qui lui reverse
 * (`PayoutMethodService::verify`). PayoutSeeder y adresse ensuite les reversements.
 *
 * La déclaration est écrite dans la forme de `PayoutMethodService::create()`, sans son avis au
 * titulaire (`payout_method.added`, envoyé par SMS) : le seed ne fait aucun appel sortant.
 */
class PayoutMethodSeeder extends Seeder
{
    /** @var array<string, int> */
    private const NATURES = [
        PayoutMethodKind::Wave->value => 45,
        PayoutMethodKind::OrangeMoney->value => 28,
        PayoutMethodKind::BankTransfer->value => 22,
        PayoutMethodKind::FreeMoney->value => 5,
    ];

    public function __construct(
        private readonly SeedingContext $ctx,
        private readonly PayoutMethodService $moyens,
    ) {}

    public function run(): void
    {
        $baux = $this->ctx->leases
            ->filter(fn (Lease $l) => $l->status !== LeaseStatus::Draft && $l->landlord_id !== null)
            ->groupBy('landlord_id')
            ->sortKeys();

        foreach ($baux as $bailleurId => $sesBaux) {
            $bailleur = User::query()->find($bailleurId);
            if ($bailleur === null) {
                continue;
            }
            $premierBail = CarbonImmutable::parse($sesBaux->min('start_date'));
            $declareLe = Timeline::businessHour($premierBail->subDays(mt_rand(5, 20)));
            $nature = PayoutMethodKind::from(StatusDistribution::pick(self::NATURES));
            $numero = $nature === PayoutMethodKind::BankTransfer
                ? sprintf('SN%02d SN%03d %05d %012d %02d', mt_rand(10, 99), mt_rand(10, 99), mt_rand(10000, 99999), mt_rand(1, 999_999_999_999), mt_rand(10, 99))
                : (string) ($bailleur->phone ?? $this->ctx->faker()->senegalesePhoneNumber());

            $moyen = Timeline::aLaDate($declareLe, fn () => PayoutMethod::query()->create([
                'user_id' => $bailleur->id,
                'kind' => $nature,
                'account_identifier' => $numero,
                'account_holder_name' => trim($bailleur->first_name.' '.$bailleur->last_name),
                'masked_identifier' => PayoutMethod::mask($numero),
                'is_default' => true,
            ]));

            foreach ($sesBaux->pluck('agency_id')->filter()->unique()->sort() as $agencyId) {
                $verificateur = User::query()->find($this->ctx->agencies->get($agencyId)?->primary_admin_id);
                if ($verificateur !== null && (int) $verificateur->id !== (int) $bailleur->id) {
                    Timeline::aLaDate($declareLe->addDays(mt_rand(1, 3)), fn () => $this->moyens->verify($moyen, $verificateur));
                }
            }

            $this->ctx->moyensDeReversement[(int) $bailleur->id] = $moyen;
        }
    }
}
