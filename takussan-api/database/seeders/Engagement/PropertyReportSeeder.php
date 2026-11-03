<?php

namespace Database\Seeders\Engagement;

use App\Models\Customer;
use App\Models\Property;
use App\Models\PropertyReport;
use App\Support\VisitorFingerprint;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\StatusDistribution;
use Database\Seeders\Support\Timeline;
use Database\Seeders\Support\Tirage;
use Illuminate\Database\Seeder;

/**
 * TCK-2379 — les signalements d'annonce que la file de modération a reçus
 * (`PublicPropertyController::report`) : déposés par un client connecté ou par un visiteur anonyme
 * (son empreinte, jamais son IP), puis classés sans suite par la plateforme après quelques jours.
 * Les plus récents attendent encore.
 *
 * Le classement est écrit dans la forme de `PropertyModerationService::resolveReport()` (décision
 * `reject`), journal compris, sans l'avis au publieur ni aux signalants. Aucun n'est retenu : une
 * décision `hide` retirerait le bien du site, et le jeu réaliste le garde publié.
 */
class PropertyReportSeeder extends Seeder
{
    /** @var array<string, int> */
    private const MOTIFS = ['misleading' => 35, 'other' => 30, 'spam' => 15, 'fraud' => 10, 'inappropriate_content' => 10];

    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        $maintenant = CarbonImmutable::now();
        $operateur = $this->ctx->operateur();

        foreach ($this->ctx->agencies->sortBy('id') as $agency) {
            $biens = Property::query()->public()->where('agency_id', $agency->id)->orderBy('id')->get();
            // Une agence sans annonce en ligne n'a rien à signaler.
            $comptes = ($this->ctx->customersByAgency[$agency->id] ?? collect())->whereNotNull('user_id')->sortBy('id')->values();

            foreach (Tirage::plusieurs($biens, min($biens->count(), max(1, intdiv($biens->count(), 30)))) as $bien) {
                $depose = Timeline::randomDateBetween(
                    collect([CarbonImmutable::parse($bien->published_at ?? $bien->created_at), $maintenant->subMonths(6)])->max(),
                    $maintenant->subHours(2),
                );
                $motif = StatusDistribution::pick(self::MOTIFS);
                /** @var Customer|null $client */
                $client = $comptes->isNotEmpty() && mt_rand(1, 100) <= 40 ? Tirage::un($comptes) : null;

                $signalement = Timeline::aLaDate($depose, fn () => PropertyReport::create([
                    'property_id' => $bien->id,
                    'reporter_user_id' => $client?->user_id,
                    'reporter_fingerprint' => VisitorFingerprint::ofIp('41.82.'.mt_rand(0, 255).'.'.mt_rand(1, 254)),
                    'reason' => $motif,
                    'details' => $this->ctx->texts()->detailDeSignalement($motif),
                ]));

                $tranche = Timeline::businessHour($depose->addDays(mt_rand(1, 5)));
                if ($tranche->lessThan($maintenant)) {
                    Timeline::aLaDate($tranche, function () use ($signalement, $operateur, $bien): void {
                        $signalement->update(['resolved_at' => now(), 'decision' => 'reject', 'resolved_by_id' => $operateur->id, 'reason_code' => null]);
                        activity('Property')->performedOn($bien)->causedBy($operateur)->withProperties([
                            'property_report_id' => $signalement->id,
                            'closed_report_ids' => [$signalement->id],
                            'decision' => 'reject',
                            'reason' => null,
                            'reason_code' => null,
                        ])->event('property.report_resolved')->log('property.report_resolved');
                    });
                }
            }
        }
    }
}
