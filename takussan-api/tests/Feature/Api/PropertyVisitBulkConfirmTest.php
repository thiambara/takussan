<?php

namespace Tests\Feature\Api;

use App\Domain\Notifications\NotificationCode;
use App\Models\Agency;
use App\Models\Enums\VisitStatus;
use App\Models\Enums\VisitWindow;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Visit\VisitSchedulingService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\EnvoisParCode;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2585 — `POST /api/property-visits/bulk-confirm` : chaque ligne est le geste unitaire
 * (`confirm`), le lot n'est pas atomique, chaque client confirmé est prévenu une fois.
 */
class PropertyVisitBulkConfirmTest extends ApiTestCase
{
    use EnvoisParCode;
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $x;

    private Property $bien;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->x = $this->agence();
        $this->bien = $this->bienDe($this->x);
        $this->agent = $this->personnel($this->x);
    }

    private function visite(string $telephone, array $attributes = []): PropertyVisit
    {
        return PropertyVisit::factory()->create($attributes + [
            'property_id' => $this->bien->id,
            'visitor_id' => null,
            'visitor_name' => 'Visiteur '.$telephone,
            'visitor_phone' => $telephone,
            'locale' => 'fr',
            'scheduled_at' => CarbonImmutable::parse($this->creneau(2, 10)),
            'status' => VisitStatus::Scheduled,
        ]);
    }

    private function jour(): string
    {
        return CarbonImmutable::now(VisitSchedulingService::TIMEZONE)->addDays(3)->format('Y-m-d');
    }

    /**
     * AC3 (R) — un lot de trois : une confirmée ; une déjà confirmée par un collègue et une à tranche
     * sans heure, refusées chacune avec le code du geste unitaire ; un seul SMS.
     */
    public function test_ac3_lot_mixte_une_confirmee_deux_refusees_un_sms(): void
    {
        $libre = $this->visite('+221771111111');
        $priseParUnCollegue = $this->visite('+221772222222', ['scheduled_at' => CarbonImmutable::parse($this->creneau(2, 15))]);
        $tranche = $this->visite('+221773333333', [
            'scheduled_at' => VisitWindow::Afternoon->startOn($this->jour())->utc(),
            'preferred_window' => VisitWindow::Afternoon,
        ]);

        Sanctum::actingAs($this->personnel($this->x));
        $this->postJson("/api/property-visits/{$priseParUnCollegue->id}/confirm")->assertOk();
        Notification::fake();

        // Le geste unitaire, pour comparer les codes.
        Sanctum::actingAs($this->agent);
        $unitaire = [
            $this->postJson("/api/property-visits/{$priseParUnCollegue->id}/confirm")->assertStatus(422)->json('code'),
            $this->postJson("/api/property-visits/{$tranche->id}/confirm")->assertStatus(422)->json('code'),
        ];
        $this->assertSame(['visit.not_scheduled_confirm', 'visit.time_required'], $unitaire);

        $response = $this->postJson('/api/property-visits/bulk-confirm', ['visits' => [
            ['id' => $libre->id],
            ['id' => $priseParUnCollegue->id],
            ['id' => $tranche->id],
        ]])->assertOk();

        $this->assertSame([
            ['id' => $libre->id, 'ok' => true, 'sms_sent' => true],
            ['id' => $priseParUnCollegue->id, 'ok' => false, 'code' => 'visit.not_scheduled_confirm', 'status' => 422],
            ['id' => $tranche->id, 'ok' => false, 'code' => 'visit.time_required', 'status' => 422],
        ], $response->json('data'));
        $this->assertSame(['ok' => 1, 'failed' => 2], $response->json('meta'));

        $this->assertSame(VisitStatus::Confirmed, $libre->fresh()->status);
        $this->assertSame(VisitStatus::Scheduled, $tranche->fresh()->status);
        $envois = self::envoisALaDemande(NotificationCode::VisitConfirmed);
        $this->assertCount(1, $envois);
        $this->assertSame('+221771111111', $envois->first()[2]->routes['sms'] ?? null);
    }

    /**
     * AC3, lecture littérale — une visite ATTRIBUÉE à un collègue et encore en attente : le geste
     * unitaire la confirme (personnel de l'agence du bien), le lot aussi. Aucun 409 n'existe sur
     * `confirm` ; consigné dans les notes du ticket, décision attendue.
     */
    public function test_une_visite_attribuee_a_un_collegue_se_confirme_comme_a_l_unite(): void
    {
        $collegue = $this->personnel($this->x);
        $attribuee = $this->visite('+221774444444', ['agent_id' => $collegue->id]);

        Sanctum::actingAs($this->agent);
        $this->postJson('/api/property-visits/bulk-confirm', ['visits' => [['id' => $attribuee->id]]])
            ->assertOk()->assertJsonPath('data.0.ok', true);

        $this->assertSame(VisitStatus::Confirmed, $attribuee->fresh()->status);
        $this->assertSame($collegue->id, $attribuee->fresh()->agent_id);
    }

    /** Avec son heure, la visite à tranche se confirme dans le lot, et la tranche tombe. */
    public function test_la_tranche_se_confirme_avec_son_heure(): void
    {
        $tranche = $this->visite('+221773333333', [
            'scheduled_at' => VisitWindow::Afternoon->startOn($this->jour())->utc(),
            'preferred_window' => VisitWindow::Afternoon,
        ]);
        $heure = CarbonImmutable::createFromFormat('!Y-m-d H:i', $this->jour().' 15:30', VisitSchedulingService::TIMEZONE)->utc();

        Sanctum::actingAs($this->agent);
        $this->postJson('/api/property-visits/bulk-confirm', ['visits' => [['id' => $tranche->id, 'scheduled_at' => $heure->toIso8601String()]]])
            ->assertOk()->assertJsonPath('data.0.ok', true);

        $tranche->refresh();
        $this->assertSame(VisitStatus::Confirmed, $tranche->status);
        $this->assertNull($tranche->preferred_window);
        $this->assertTrue($heure->equalTo($tranche->scheduled_at));
    }

    /** Une visite d'une autre agence et une visite absente : le même refus, et la ligne seule. */
    public function test_visite_etrangere_ou_absente_refusee_ligne_par_ligne(): void
    {
        $libre = $this->visite('+221771111111');
        $etrangere = PropertyVisit::factory()->create(['property_id' => $this->bienDe($this->agence())->id, 'status' => VisitStatus::Scheduled]);

        Sanctum::actingAs($this->agent);
        $rows = $this->postJson('/api/property-visits/bulk-confirm', ['visits' => [
            ['id' => $etrangere->id], ['id' => 999999], ['id' => $libre->id],
        ]])->assertOk()->json('data');

        $this->assertSame(['visit.staff_only', 'visit.staff_only', null], array_map(fn ($r) => $r['code'] ?? null, $rows));
        $this->assertSame(VisitStatus::Scheduled, $etrangere->fresh()->status);
        $this->assertSame(VisitStatus::Confirmed, $libre->fresh()->status);
    }

    /** Le bailleur du bien lit la visite mais ne la confirme pas : pas plus en lot qu'à l'unité. */
    public function test_le_bailleur_ne_confirme_rien(): void
    {
        $visite = $this->visite('+221771111111');

        Sanctum::actingAs(User::query()->findOrFail($this->bien->user_id));
        $this->postJson('/api/property-visits/bulk-confirm', ['visits' => [['id' => $visite->id]]])
            ->assertOk()->assertJsonPath('data.0.code', 'visit.staff_only');
        $this->assertSame(VisitStatus::Scheduled, $visite->fresh()->status);
    }

    public function test_le_lot_est_borne_et_sans_doublon(): void
    {
        $visite = $this->visite('+221771111111');
        Sanctum::actingAs($this->agent);

        $this->postJson('/api/property-visits/bulk-confirm', ['visits' => array_map(fn (int $i) => ['id' => $i], range(1, 51))])
            ->assertStatus(422)->assertJsonValidationErrors('visits');
        $this->postJson('/api/property-visits/bulk-confirm', ['visits' => [['id' => $visite->id], ['id' => $visite->id]]])
            ->assertStatus(422)->assertJsonValidationErrors('visits.0.id');
        $this->postJson('/api/property-visits/bulk-confirm', ['visits' => []])->assertStatus(422);

        $this->assertSame(VisitStatus::Scheduled, $visite->fresh()->status);
    }
}
