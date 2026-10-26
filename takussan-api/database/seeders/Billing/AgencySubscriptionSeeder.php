<?php

namespace Database\Seeders\Billing;

use App\Models\Plan;
use App\Services\Billing\AgencySubscriptionService;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Database\Seeders\System\PlanSeeder;
use Illuminate\Database\Seeder;

/**
 * TCK-2379 — l'abonnement de chaque agence, par le service de l'application et dans l'ordre du
 * temps : le plan gratuit à la fondation (son essai, puis sa conversion par la tâche des essais),
 * le passage au plan payant des deux plus grandes agences — l'une il y a des années, l'autre ces
 * derniers mois —, et la reconduction des périodes jusqu'à aujourd'hui (`renewPeriods`, la tâche
 * planifiée).
 */
class AgencySubscriptionSeeder extends Seeder
{
    public function __construct(
        private readonly SeedingContext $ctx,
        private readonly AgencySubscriptionService $subscriptions,
    ) {}

    public function run(): void
    {
        // DatabaseSeeder pose les plans avant ce pipeline ; un test qui le joue seul ne les a pas.
        app(PlanSeeder::class)->run();
        $gratuit = Plan::query()->where('code', 'free')->firstOrFail();
        $payant = Plan::query()->where('code', 'pro')->firstOrFail();
        $operateur = $this->ctx->operateur();
        $maintenant = CarbonImmutable::now();

        $plusGrandes = collect($this->ctx->tailles)->filter(fn (float $taille) => $taille >= 0.65)->keys()->values();

        foreach ($this->ctx->agencies->sortBy('id') as $agency) {
            $fondation = Timeline::businessHour(CarbonImmutable::parse($agency->founded_at ?? $agency->created_at));
            $finDEssai = $fondation->addDays($gratuit->trial_days);

            Timeline::aLaDate($fondation, fn () => $this->subscriptions->assign($agency, $gratuit, $operateur, [
                'trial_ends_at' => $finDEssai->toDateTimeString(),
            ]));
            if ($finDEssai->lessThan($maintenant)) {
                Timeline::aLaDate($finDEssai->addHour(), fn () => $this->subscriptions->processTrialExpirations());
            }

            $rang = $plusGrandes->search($agency->id);
            if ($rang === false) {
                continue;
            }
            $passage = $rang === 0
                ? Timeline::businessHour($fondation->addMonths(mt_rand(4, 10)))
                : Timeline::businessHour($maintenant->subDays(mt_rand(45, 150)));
            if ($passage->greaterThan($finDEssai) && $passage->lessThan($maintenant)) {
                Timeline::aLaDate($passage, fn () => $this->subscriptions->assign($agency, $payant, $operateur));
            }
        }

        $this->subscriptions->processTrialExpirations();
        $this->subscriptions->renewPeriods();
    }
}
