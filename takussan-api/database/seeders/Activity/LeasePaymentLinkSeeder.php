<?php

namespace Database\Seeders\Activity;

use App\Jobs\SendLeasePaymentReminders;
use App\Models\Customer;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use App\Models\LeasePaymentLink;
use App\Models\User;
use App\Services\Notifications\ContactSansCompte;
use App\Services\Payments\LeasePaymentLinkService;
use App\Services\Payments\PaymentGatewayService;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;

/**
 * TCK-2379 — les liens de paiement (ADR-0051) que les relances de loyer ont émis ces deux derniers
 * mois, par le service (`LeasePaymentLinkService::urlFor`).
 *
 * Un lien porteur ne part qu'au locataire SANS compte (un compte a sa cloche), qui a un téléphone
 * (`SendLeasePaymentReminders::notifyTenant()`). Deux émetteurs, ceux de l'application :
 *
 *  - la relance « bientôt dû », trois jours avant l'échéance — seulement si l'agence encaisse en
 *    ligne (`PaymentGatewayService::availableProviders`) ;
 *  - l'agent, depuis la fiche de l'échéance encore due (`LeasePaymentLinkController::store`), qui
 *    l'envoie lui-même au locataire.
 *
 * ⚠ Les intégrations Wave et Orange Money qu'IntegrationSeeder pose n'ont pas les clés que leurs
 * pilotes exigent (`CREDENTIAL_KEYS`) : aucune agence semée n'encaisse en ligne, et tous les liens
 * viennent donc de l'agent. Le lien est ensuite ouvert — avant le paiement quand le loyer a été réglé.
 */
class LeasePaymentLinkSeeder extends Seeder
{
    /** Ancienneté des échéances relancées par lien, en jours. */
    private const FENETRE_EN_JOURS = 60;

    public function __construct(
        private readonly SeedingContext $ctx,
        private readonly LeasePaymentLinkService $liens,
        private readonly PaymentGatewayService $encaissement,
    ) {}

    public function run(): void
    {
        $maintenant = CarbonImmutable::now();
        $baux = $this->ctx->leases->filter(fn ($l) => $l->status === LeaseStatus::Active)->keyBy('id');

        $echeances = LeasePayment::query()
            ->whereIn('lease_id', $baux->keys())
            ->where('payment_type', LeasePaymentType::Rent)
            ->whereBetween('due_date', [$maintenant->subDays(self::FENETRE_EN_JOURS)->toDateString(), $maintenant->addDays(SendLeasePaymentReminders::DUE_SOON_DAYS)->toDateString()])
            ->orderBy('due_date')->orderBy('id')
            ->get();

        /** @var array<int, true> les agences dont un agent a déjà envoyé un lien */
        $servies = [];
        foreach ($echeances as $echeance) {
            $bail = $baux->get($echeance->lease_id);
            $locataire = Customer::query()->find($bail->tenant_id);
            if ($locataire === null || $locataire->user_id !== null || ! ContactSansCompte::fromCustomer($locataire)->hasPhone()) {
                continue;
            }
            if (! $this->liens->isPayableByNature($echeance)) {
                continue;
            }
            $relance = $this->encaissement->availableProviders($echeance) !== [];
            // Un agent sur l'échéance encore due, deux fois sur cinq — et au moins une fois par agence.
            if (! $relance && isset($servies[(int) $bail->agency_id]) && mt_rand(1, 100) > 40) {
                continue;
            }

            $echeanceLe = CarbonImmutable::parse($echeance->due_date);
            $emisLe = $relance
                ? $echeanceLe->subDays(SendLeasePaymentReminders::DUE_SOON_DAYS)->setTime(9, mt_rand(0, 30))
                : Timeline::businessHour($echeanceLe->addDays(mt_rand(-3, 6)));
            $payeLe = $echeance->status === PaymentStatus::Paid && $echeance->paid_at !== null ? CarbonImmutable::parse($echeance->paid_at) : null;
            // Émis avant le règlement : un lien ne s'émet que pour une échéance encore due.
            if ($emisLe->greaterThan($maintenant) || ($payeLe !== null && $payeLe->lessThanOrEqualTo($emisLe))) {
                continue;
            }

            $agent = $relance ? null : User::query()->find($this->ctx->agentAu((int) $bail->agency_id, $emisLe));
            Timeline::aLaDate($emisLe, fn () => $this->liens->urlFor($echeance, $agent));
            $servies[(int) $bail->agency_id] = true;

            $this->ouvertures($echeance, $emisLe, $payeLe ?? $maintenant, $payeLe !== null);
        }
    }

    /** Le compteur que `touch()` tient à chaque lecture publique du lien. */
    private function ouvertures(LeasePayment $echeance, CarbonImmutable $emisLe, CarbonImmutable $jusquA, bool $paye): void
    {
        $nombre = $paye ? mt_rand(1, 3) : mt_rand(0, 2);
        $ecart = max(1, $jusquA->diffInMinutes($emisLe, true));
        if ($nombre === 0) {
            return;
        }

        LeasePaymentLink::query()->where('lease_payment_id', $echeance->id)->whereNull('revoked_at')->update([
            'access_count' => $nombre,
            'last_accessed_at' => $paye ? collect([$emisLe, $jusquA->subMinutes(mt_rand(2, 30))])->max() : $emisLe->addMinutes(mt_rand(1, (int) $ecart)),
        ]);
    }
}
