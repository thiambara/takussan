<?php

namespace Tests\Feature\Maintenance;

use App\Events\Maintenance\MaintenanceScheduleChanged;
use App\Events\Maintenance\MaintenanceStatusChanged;
use App\Exceptions\ApiError;
use App\Models\AppNotification;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\User;
use App\Services\Model\MaintenanceRequestService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-2680 — `POST /api/maintenance-requests/{id}/accept {scheduled_at?}` : le prestataire assigné
 * accepte ET propose son passage en un seul geste. Avec un créneau, `accepted_at` et `scheduled_at`
 * sont posés dans la même transaction, puis partent `MaintenanceStatusChanged` (acceptée) et
 * `MaintenanceScheduleChanged` (créneau) ; une date refusée ne pose rien. Sans corps, rien ne change
 * (`MaintenanceAcceptDeclineTest`, `MaintenanceAcceptSousVerrouTest`, inchangés).
 *
 * Rouge avant TCK-2680 : le corps était ignoré — `scheduled_at` restait nul, aucun avis de créneau,
 * et une date passée était acceptée (200).
 */
class MaintenanceAcceptWithSlotTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    private const SCHEDULE = 'maintenance.schedule_changed';

    protected function setUp(): void
    {
        parent::setUp();
        // Africa/Dakar est à UTC+0 : l'heure murale du créneau est l'heure stockée.
        $this->travelTo(Carbon::parse('2026-11-11 08:00:00', 'UTC'));
    }

    /** AC1 + AC2 — 200, deux colonnes posées ; le demandeur reçoit un seul avis daté, l'auteur aucun. */
    public function test_le_prestataire_accepte_avec_son_creneau(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'tenant' => $tenant, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned);

        Sanctum::actingAs($provider);
        $reponse = $this->postJson("/api/maintenance-requests/{$mr->id}/accept", ['scheduled_at' => '2026-11-12T10:00:00'])
            ->assertOk();

        $this->assertNotNull($reponse->json('data.accepted_at'));
        $this->assertTrue(Carbon::parse($reponse->json('data.scheduled_at'))->equalTo(Carbon::parse('2026-11-12 10:00:00', 'Africa/Dakar')));

        $mr->refresh();
        $this->assertNotNull($mr->accepted_at);
        $this->assertSame('2026-11-12 10:00:00', $mr->scheduled_at->format('Y-m-d H:i:s'));

        $avisDuDemandeur = AppNotification::query()->where('user_id', $tenant->id)->where('code', self::SCHEDULE)->get();
        $this->assertCount(1, $avisDuDemandeur);
        $this->assertTrue(Carbon::parse($avisDuDemandeur->first()->params['scheduled_at'])->equalTo(Carbon::parse('2026-11-12 10:00:00', 'Africa/Dakar')));

        // Le donneur d'ordre : l'acceptation ET le créneau, un avis par événement.
        $this->assertSame(1, $this->avis($landlord, self::SCHEDULE));
        $this->assertSame(1, $this->avis($landlord, 'maintenance.accepted'));

        // L'auteur ne reçoit rien de son propre geste.
        $this->assertSame(0, AppNotification::query()->where('user_id', $provider->id)->count());
    }

    /** Les deux événements partent, une fois chacun. */
    public function test_les_deux_evenements_partent_une_fois(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        Event::fake([MaintenanceStatusChanged::class, MaintenanceScheduleChanged::class]);

        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/accept", ['scheduled_at' => '2026-11-12T10:00:00'])->assertOk();

        Event::assertDispatchedTimes(MaintenanceStatusChanged::class, 1);
        Event::assertDispatched(MaintenanceStatusChanged::class, fn ($e) => $e->cause === MaintenanceStatusChanged::CAUSE_ACCEPTED);
        Event::assertDispatchedTimes(MaintenanceScheduleChanged::class, 1);
        Event::assertDispatched(MaintenanceScheduleChanged::class, fn ($e) => $e->actor?->id === $provider->id);
    }

    /** Une heure portant son décalage est lue comme l'instant qu'elle désigne, pas comme une heure murale. */
    public function test_un_decalage_explicite_est_converti(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned);

        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/accept", ['scheduled_at' => '2026-11-12T11:00:00+01:00'])->assertOk();

        $this->assertSame('2026-11-12 10:00:00', $mr->refresh()->scheduled_at->format('Y-m-d H:i:s'));
    }

    /** @return array<string, array{0: mixed}> */
    public static function datesRefusees(): array
    {
        return [
            'passée' => ['2026-11-10T10:00:00'],
            'maintenant moins une minute' => ['2026-11-11T07:59:00'],
            'illisible' => ['jeudi matin'],
            'liste' => [['2026-11-12T10:00:00']],
        ];
    }

    /** AC3 — 422 sur `scheduled_at`, et rien n'est posé à moitié : ni acceptation, ni créneau, ni avis. */
    #[DataProvider('datesRefusees')]
    public function test_une_date_refusee_ne_pose_rien(mixed $valeur): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned, ['scheduled_at' => null]);
        Event::fake([MaintenanceStatusChanged::class, MaintenanceScheduleChanged::class]);

        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/accept", ['scheduled_at' => $valeur])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('scheduled_at');

        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()->assertJsonPath('data.accepted_at', null);
        $mr->refresh();
        $this->assertNull($mr->accepted_at);
        $this->assertNull($mr->scheduled_at);
        Event::assertNotDispatched(MaintenanceStatusChanged::class);
        Event::assertNotDispatched(MaintenanceScheduleChanged::class);
    }

    /** `scheduled_at: null` vaut « sans créneau » : l'heure déjà fixée par le donneur d'ordre reste. */
    public function test_un_creneau_nul_accepte_sans_toucher_l_heure(): void
    {
        $heure = Carbon::parse('2026-11-13 09:00:00');
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned, ['scheduled_at' => $heure]);
        Event::fake([MaintenanceStatusChanged::class, MaintenanceScheduleChanged::class]);

        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/accept", ['scheduled_at' => null])->assertOk();

        $mr->refresh();
        $this->assertNotNull($mr->accepted_at);
        $this->assertTrue($mr->scheduled_at->equalTo($heure));
        Event::assertDispatchedTimes(MaintenanceStatusChanged::class, 1);
        Event::assertNotDispatched(MaintenanceScheduleChanged::class);
    }

    /** Témoin : l'heure déjà fixée, renvoyée telle quelle, n'est pas un passage déplacé (règle du `PATCH`). */
    public function test_la_meme_heure_renvoyee_n_annonce_rien(): void
    {
        $heure = Carbon::parse('2026-11-13 09:00:00');
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned, ['scheduled_at' => $heure]);
        Event::fake([MaintenanceStatusChanged::class, MaintenanceScheduleChanged::class]);

        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/accept", ['scheduled_at' => '2026-11-13T09:00:00'])->assertOk();

        Event::assertDispatchedTimes(MaintenanceStatusChanged::class, 1);
        Event::assertNotDispatched(MaintenanceScheduleChanged::class);
    }

    /** Un autre prestataire de l'agence : 403, avant même la validation d'une date passée. */
    public function test_un_prestataire_non_assigne_recoit_403(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::Assigned, ['scheduled_at' => null]);

        Sanctum::actingAs($this->providerFor($agency));
        $this->postJson("/api/maintenance-requests/{$mr->id}/accept", ['scheduled_at' => '2026-11-12T10:00:00'])->assertForbidden();
        $this->postJson("/api/maintenance-requests/{$mr->id}/accept", ['scheduled_at' => '2026-11-10T10:00:00'])->assertForbidden();

        $mr->refresh();
        $this->assertNull($mr->accepted_at);
        $this->assertNull($mr->scheduled_at);
    }

    /** Les refus existants tiennent avec un créneau : terminale et déjà acceptée, l'heure ne bouge pas. */
    public function test_les_refus_existants_ne_posent_pas_le_creneau(): void
    {
        ['mr' => $close, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Cancelled, ['scheduled_at' => null]);
        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$close->id}/accept", ['scheduled_at' => '2026-11-12T10:00:00'])
            ->assertUnprocessable()->assertJsonPath('code', 'maintenance.terminal_request');
        $this->assertNull($close->refresh()->scheduled_at);

        ['mr' => $acceptee, 'provider' => $autre] = $this->maintenanceScenario(MaintenanceStatus::Assigned, ['accepted_at' => now(), 'scheduled_at' => null]);
        Sanctum::actingAs($autre);
        $this->postJson("/api/maintenance-requests/{$acceptee->id}/accept", ['scheduled_at' => '2026-11-12T10:00:00'])
            ->assertUnprocessable()->assertJsonPath('code', 'maintenance.already_accepted');
        $this->assertNull($acceptee->refresh()->scheduled_at);
    }

    /**
     * Double acceptation concurrente avec créneau : le second appel tient un modèle chargé avant le
     * premier (rejeu sans concurrence de `MaintenanceAcceptSousVerrouTest`). Une seule passe, son
     * créneau reste, un seul couple d'événements.
     */
    public function test_double_acceptation_concurrente_une_seule_passe(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned, ['scheduled_at' => null]);
        $perime = MaintenanceRequest::query()->findOrFail($mr->id);
        Event::fake([MaintenanceStatusChanged::class, MaintenanceScheduleChanged::class]);
        $service = app(MaintenanceRequestService::class);

        $service->accept($mr, $provider, Carbon::parse('2026-11-12 10:00:00'));

        try {
            $service->accept($perime, $provider, Carbon::parse('2026-11-14 15:00:00'));
            $this->fail('La seconde acceptation aurait dû être refusée.');
        } catch (ApiError $e) {
            $this->assertSame('maintenance.already_accepted', $e->errorCode);
        }

        $this->assertSame('2026-11-12 10:00:00', $mr->refresh()->scheduled_at->format('Y-m-d H:i:s'));
        Event::assertDispatchedTimes(MaintenanceStatusChanged::class, 1);
        Event::assertDispatchedTimes(MaintenanceScheduleChanged::class, 1);
    }

    private function avis(User $user, string $code): int
    {
        return AppNotification::query()->where('user_id', $user->id)->where('code', $code)->count();
    }
}
