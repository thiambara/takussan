<?php

namespace Tests\Feature\Maintenance;

use App\Events\Maintenance\MaintenanceStatusChanged;
use App\Exceptions\ApiError;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Services\Maintenance\MaintenanceQuoteWorkflow;
use App\Services\Model\MaintenanceRequestService;
use Closure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Log;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * P211.03 et P211.04 (TCK-2193) — les transitions d'une intervention (`transition`, `complete`,
 * `contestResolution`) et les quatre gestes du devis relisent la ligne sous `lockForUpdate` dans une
 * transaction, y jugent la table et les gardes, et n'émettent qu'après le commit : le patron
 * d'`accept` (TCK-1822).
 *
 * La course se rejoue sans concurrence : le second geste reçoit un modèle chargé avant le premier,
 * ce que tient le second de deux appels simultanés, ou `maintenance:auto-close` pendant son passage.
 */
class MaintenanceTransitionsSousVerrouTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    private function refuse(Closure $geste, string $code = 'maintenance.status_transition_invalid'): void
    {
        try {
            $geste();
            $this->fail('Le geste sur une copie périmée aurait dû être refusé.');
        } catch (ApiError $e) {
            $this->assertSame(422, $e->getStatusCode());
            $this->assertSame($code, $e->errorCode);
        }
    }

    public function test_la_cloture_automatique_ne_passe_pas_sur_une_contestation(): void
    {
        ['mr' => $mr, 'tenant' => $tenant] = $this->maintenanceScenario(MaintenanceStatus::Completed, ['completed_at' => now()->subDays(8)]);
        $perime = MaintenanceRequest::query()->findOrFail($mr->id);
        Event::fake([MaintenanceStatusChanged::class]);
        $service = app(MaintenanceRequestService::class);

        $service->contestResolution($mr, $tenant, 'Toujours une fuite');
        $this->refuse(fn () => $service->confirmResolution($perime, null, MaintenanceStatusChanged::CAUSE_AUTO_CLOSED));

        $this->assertSame(MaintenanceStatus::InProgress, $mr->refresh()->status);
        $this->assertNull($mr->completed_at);
        Event::assertDispatchedTimes(MaintenanceStatusChanged::class, 1);
    }

    public function test_la_commande_saute_une_ligne_refusee_la_compte_et_la_journalise(): void
    {
        ['mr' => $conteste] = $this->maintenanceScenario(MaintenanceStatus::Completed, ['completed_at' => now()->subDays(8)]);
        ['mr' => $ordinaire] = $this->maintenanceScenario(MaintenanceStatus::Completed, ['completed_at' => now()->subDays(9)]);

        // La contestation arrive pendant le passage : après que la commande a chargé la ligne.
        $fait = false;
        MaintenanceRequest::retrieved(function (MaintenanceRequest $m) use ($conteste, &$fait): void {
            if (! $fait && $m->id === $conteste->id) {
                $fait = true;
                MaintenanceRequest::query()->whereKey($conteste->id)->update([
                    'status' => MaintenanceStatus::InProgress->value,
                    'completed_at' => null,
                ]);
            }
        });
        Log::spy();

        $this->artisan('maintenance:auto-close')
            ->expectsOutputToContain('Closed 1 maintenance request(s).')
            ->expectsOutputToContain('Skipped 1')
            ->assertSuccessful();

        $this->assertSame(MaintenanceStatus::InProgress, $conteste->refresh()->status);
        $this->assertSame(MaintenanceStatus::Closed, $ordinaire->refresh()->status);
        Log::shouldHaveReceived('warning')->withArgs(fn (string $message, array $context = []): bool => ($context['maintenance_request_id'] ?? null) === $conteste->id
            && ($context['code'] ?? null) === 'maintenance.status_transition_invalid')->once();
    }

    public function test_la_fin_des_travaux_ne_passe_pas_sur_une_annulation(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::InProgress);
        $perime = MaintenanceRequest::query()->findOrFail($mr->id);
        Event::fake([MaintenanceStatusChanged::class]);
        $service = app(MaintenanceRequestService::class);

        $service->transition($mr, MaintenanceStatus::Cancelled, $landlord);
        $this->refuse(fn () => $service->complete($perime, ['resolution_notes' => 'Fait'], [], $landlord));

        $mr->refresh();
        $this->assertSame(MaintenanceStatus::Cancelled, $mr->status);
        $this->assertNull($mr->completed_at);
        $this->assertNull($mr->resolution_notes);
        Event::assertDispatchedTimes(MaintenanceStatusChanged::class, 1);
    }

    public function test_la_contestation_ne_rouvre_pas_une_cloture(): void
    {
        ['mr' => $mr, 'tenant' => $tenant] = $this->maintenanceScenario(MaintenanceStatus::Completed, ['completed_at' => now()->subDay()]);
        $perime = MaintenanceRequest::query()->findOrFail($mr->id);
        Event::fake([MaintenanceStatusChanged::class]);
        $service = app(MaintenanceRequestService::class);

        $service->confirmResolution($mr, $tenant);
        $this->refuse(fn () => $service->contestResolution($perime, $tenant, 'Finalement non'));

        $this->assertSame(MaintenanceStatus::Closed, $mr->refresh()->status);
        $this->assertNotNull($mr->completed_at);
        Event::assertDispatchedTimes(MaintenanceStatusChanged::class, 1);
    }

    public function test_une_transition_deja_faite_sur_la_ligne_n_emet_rien(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::Open);
        $perime = MaintenanceRequest::query()->findOrFail($mr->id);
        Event::fake([MaintenanceStatusChanged::class]);
        $service = app(MaintenanceRequestService::class);

        $service->transition($mr, MaintenanceStatus::Acknowledged, $landlord);
        $rendue = $service->transition($perime, MaintenanceStatus::Acknowledged, $landlord);

        $this->assertSame(MaintenanceStatus::Acknowledged, $rendue->status);
        Event::assertDispatchedTimes(MaintenanceStatusChanged::class, 1);
    }

    public function test_une_approbation_apres_un_rejet_est_refusee(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::QuoteSubmitted, ['quote_amount' => 1000]);
        $perime = MaintenanceRequest::query()->findOrFail($mr->id);
        Event::fake([MaintenanceStatusChanged::class]);
        $workflow = app(MaintenanceQuoteWorkflow::class);

        $workflow->rejectQuote($mr, 'trop cher', $landlord->id, $landlord);
        $this->refuse(fn () => $workflow->approveQuote($perime, $landlord->id, $landlord));

        $mr->refresh();
        $this->assertSame(MaintenanceStatus::Rejected, $mr->status);
        $this->assertSame('trop cher', $mr->quote_rejection_reason);
        Event::assertDispatchedTimes(MaintenanceStatusChanged::class, 1);
    }

    public function test_un_rejet_apres_une_approbation_est_refuse(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::QuoteSubmitted, ['quote_amount' => 1000]);
        $perime = MaintenanceRequest::query()->findOrFail($mr->id);
        Event::fake([MaintenanceStatusChanged::class]);
        $workflow = app(MaintenanceQuoteWorkflow::class);

        $workflow->approveQuote($mr, $landlord->id, $landlord);
        $this->refuse(fn () => $workflow->rejectQuote($perime, 'trop cher', $landlord->id, $landlord));

        $mr->refresh();
        $this->assertSame(MaintenanceStatus::Approved, $mr->status);
        $this->assertNull($mr->quote_rejection_reason);
        Event::assertDispatchedTimes(MaintenanceStatusChanged::class, 1);
    }

    public function test_un_devis_ne_se_soumet_ni_ne_se_demande_deux_fois(): void
    {
        ['mr' => $mr, 'provider' => $provider, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        $perime = MaintenanceRequest::query()->findOrFail($mr->id);
        Event::fake([MaintenanceStatusChanged::class]);
        $workflow = app(MaintenanceQuoteWorkflow::class);

        $workflow->requestQuote($mr, $landlord);
        $this->refuse(fn () => $workflow->requestQuote($perime, $landlord));

        $perime = MaintenanceRequest::query()->findOrFail($mr->id);
        $lignes = ['lines' => [['label' => 'Main-d’œuvre', 'kind' => 'labour', 'quantity' => 1, 'unit_price' => 1000]]];
        $workflow->submitQuote($mr, $lignes, [], $provider);
        $this->refuse(fn () => $workflow->submitQuote($perime, ['lines' => [['label' => 'Autre', 'kind' => 'labour', 'quantity' => 1, 'unit_price' => 9000]]], [], $provider));

        $this->assertSame('1000.00', (string) $mr->refresh()->quote_amount);
        Event::assertDispatchedTimes(MaintenanceStatusChanged::class, 2);
    }

    public function test_l_equipe_ne_tranche_pas_un_devis_passe_au_bailleur_entre_temps(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::QuoteSubmitted, ['quote_amount' => 1000]);
        $agent = $this->agentOf($agency);
        $perime = MaintenanceRequest::query()->findOrFail($mr->id);
        // Un autre membre l'a approuvé au-delà du plafond : le devis attend le bailleur (ADR-0037).
        MaintenanceRequest::query()->whereKey($mr->id)->update(['status' => MaintenanceStatus::AwaitingOwner->value]);
        Event::fake([MaintenanceStatusChanged::class]);
        $workflow = app(MaintenanceQuoteWorkflow::class);

        $this->refuse(fn () => $workflow->approveQuote($perime, $agent->id, $agent));
        $this->refuse(fn () => $workflow->rejectQuote($perime->refresh()->setAttribute('status', MaintenanceStatus::QuoteSubmitted), 'non', $agent->id, $agent));

        $this->assertSame(MaintenanceStatus::AwaitingOwner, $mr->refresh()->status);
        Event::assertNotDispatched(MaintenanceStatusChanged::class);
    }

    public function test_la_validite_du_devis_se_juge_sur_la_ligne_fraiche(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::QuoteSubmitted, ['quote_amount' => 1000]);
        $perime = MaintenanceRequest::query()->findOrFail($mr->id);
        MaintenanceRequest::query()->whereKey($mr->id)->update(['quote_valid_until' => now()->subDays(2)->toDateString()]);
        Event::fake([MaintenanceStatusChanged::class]);

        $this->refuse(fn () => app(MaintenanceQuoteWorkflow::class)->approveQuote($perime, $landlord->id, $landlord), 'maintenance.quote_expired');

        $this->assertSame(MaintenanceStatus::QuoteSubmitted, $mr->refresh()->status);
        Event::assertNotDispatched(MaintenanceStatusChanged::class);
    }
}
