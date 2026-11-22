<?php

namespace Tests\Feature\Visits;

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
 * TCK-2743, lot 1 — une heure de visite envoyée avec son décalage (`11:00+01:00`) désigne un instant,
 * et c'est cet instant qui s'écrit. Le cast `datetime` écrivait l'heure MURALE reçue : `11:00+01:00`,
 * jugée 10:00 à Dakar « sur la grille » par `CreneauDeVisite`, était stockée 11:00. Un écrivain par
 * test : la demande du visiteur, la planification par l'agence, le `PATCH`, le report, la
 * confirmation unitaire et en lot, la demande publique. Sans décalage, rien ne change.
 */
class HeureDeVisiteAvecDecalageTest extends ApiTestCase
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

    /** Le même instant, écrit avec un autre décalage : `…T10:00:00+00:00` → `…T11:00:00+01:00`. */
    private static function avecDecalage(string $instant, string $decalage = '+01:00'): string
    {
        return CarbonImmutable::parse($instant)->setTimezone($decalage)->toIso8601String();
    }

    private function assertStockeA(string $instant, int $visitId): void
    {
        $stocke = PropertyVisit::query()->findOrFail($visitId)->getRawOriginal('scheduled_at');
        $this->assertSame(CarbonImmutable::parse($instant)->utc()->format('Y-m-d H:i:s'), substr((string) $stocke, 0, 19), 'l\'instant désigné, en UTC');
    }

    private function visite(array $attributes = []): PropertyVisit
    {
        return PropertyVisit::factory()->create($attributes + [
            'property_id' => $this->bien->id,
            'visitor_id' => $this->client()->id,
            'agent_id' => $this->agent->id,
            'scheduled_at' => CarbonImmutable::parse($this->creneau(2, 10)),
            'status' => VisitStatus::Confirmed,
        ]);
    }

    public function test_ac1_le_visiteur_demande_avec_decalage_l_instant_s_ecrit_et_se_relit(): void
    {
        $creneau = $this->creneau(3, 9);
        Sanctum::actingAs($this->client());

        $reponse = $this->postJson('/api/property-visits', [
            'property_id' => $this->bien->id,
            'scheduled_at' => self::avecDecalage($creneau),
        ])->assertCreated();

        $this->assertStockeA($creneau, $reponse->json('data.id'));
        $this->assertSame(CarbonImmutable::parse($creneau)->utc()->toIso8601String(), $reponse->json('data.scheduled_at'));
    }

    public function test_hors_grille_une_fois_converti_reste_refuse(): void
    {
        // 10:15 à Dakar, écrit 11:15+01:00 : la règle et l'écriture jugent le même instant.
        Sanctum::actingAs($this->client());
        $this->postJson('/api/property-visits', [
            'property_id' => $this->bien->id,
            'scheduled_at' => self::avecDecalage($this->creneau(3, 10, 15)),
        ])->assertUnprocessable()->assertJsonValidationErrors(['scheduled_at']);
    }

    public function test_la_meme_demande_en_decalage_puis_en_z_est_un_doublon(): void
    {
        $creneau = $this->creneau(3, 11);
        Sanctum::actingAs($visiteur = $this->client());

        $premiere = $this->postJson('/api/property-visits', ['property_id' => $this->bien->id, 'scheduled_at' => self::avecDecalage($creneau)])->json('data.id');
        $seconde = $this->postJson('/api/property-visits', ['property_id' => $this->bien->id, 'scheduled_at' => $creneau])->json('data.id');

        $this->assertSame($premiere, $seconde);
        $this->assertSame(1, PropertyVisit::query()->where('visitor_id', $visiteur->id)->count());
    }

    public function test_l_agence_planifie_avec_decalage(): void
    {
        $creneau = $this->creneau(3, 14, 30);
        Sanctum::actingAs($this->agent);

        $id = $this->postJson('/api/property-visits', [
            'property_id' => $this->bien->id,
            'scheduled_at' => self::avecDecalage($creneau, '-02:00'),
            'visitor_name' => 'Awa Diop',
            'visitor_phone' => '+221771234567',
        ])->assertCreated()->json('data.id');

        $this->assertStockeA($creneau, $id);
    }

    public function test_ac2_le_patch_du_meme_instant_en_decalage_n_annonce_aucun_deplacement(): void
    {
        $visite = $this->visite();
        Sanctum::actingAs($this->agent);

        $this->patchJson("/api/property-visits/{$visite->id}", ['scheduled_at' => self::avecDecalage($this->creneau(2, 10))])->assertOk();

        $this->assertStockeA($this->creneau(2, 10), $visite->id);
        $this->assertSame(0, self::nombreDEnvois($visite->visitor, NotificationCode::VisitRescheduled));
    }

    public function test_le_patch_d_un_autre_instant_en_decalage_l_ecrit_et_l_annonce(): void
    {
        $visite = $this->visite();
        $nouveau = $this->creneau(4, 16);
        Sanctum::actingAs($this->agent);

        $this->patchJson("/api/property-visits/{$visite->id}", ['scheduled_at' => self::avecDecalage($nouveau)])->assertOk();

        $this->assertStockeA($nouveau, $visite->id);
        $this->assertSame(1, self::nombreDEnvois($visite->visitor, NotificationCode::VisitRescheduled));
    }

    public function test_le_visiteur_reporte_avec_decalage(): void
    {
        $visite = $this->visite();
        $nouveau = $this->creneau(4, 15, 30);
        Sanctum::actingAs($visite->visitor);

        $this->postJson("/api/property-visits/{$visite->id}/reschedule", ['scheduled_at' => self::avecDecalage($nouveau)])->assertOk();

        $this->assertStockeA($nouveau, $visite->id);
    }

    public function test_confirmer_en_fixant_l_heure_avec_decalage(): void
    {
        $jour = CarbonImmutable::now(VisitSchedulingService::TIMEZONE)->addDays(3)->format('Y-m-d');
        $visite = $this->visite([
            'status' => VisitStatus::Scheduled, 'agent_id' => null,
            'scheduled_at' => VisitWindow::Afternoon->startOn($jour)->utc(), 'preferred_window' => VisitWindow::Afternoon,
        ]);
        $heure = $this->creneau(3, 15);
        Sanctum::actingAs($this->agent);

        $this->postJson("/api/property-visits/{$visite->id}/confirm", ['scheduled_at' => self::avecDecalage($heure)])->assertOk();

        $this->assertStockeA($heure, $visite->id);
    }

    public function test_confirmer_en_lot_avec_decalage(): void
    {
        $jour = CarbonImmutable::now(VisitSchedulingService::TIMEZONE)->addDays(3)->format('Y-m-d');
        $visite = $this->visite([
            'status' => VisitStatus::Scheduled, 'agent_id' => null, 'visitor_phone' => '+221771111111',
            'scheduled_at' => VisitWindow::Morning->startOn($jour)->utc(), 'preferred_window' => VisitWindow::Morning,
        ]);
        $heure = $this->creneau(3, 10, 30);
        Sanctum::actingAs($this->agent);

        $this->postJson('/api/property-visits/bulk-confirm', ['visits' => [
            ['id' => $visite->id, 'scheduled_at' => self::avecDecalage($heure)],
        ]])->assertOk()->assertJsonPath('data.0.ok', true);

        $this->assertStockeA($heure, $visite->id);
    }

    public function test_la_demande_publique_avec_decalage(): void
    {
        $creneau = $this->creneau(3, 16, 30);

        $this->postJson("/api/public/properties/{$this->bien->slug}/visit-request", [
            'visitor_name' => 'Awa Diop', 'visitor_phone' => '+221771234567', 'scheduled_at' => self::avecDecalage($creneau),
        ])->assertCreated();

        $this->assertStockeA($creneau, (int) PropertyVisit::query()->where('property_id', $this->bien->id)->latest('id')->value('id'));
    }

    public function test_sans_decalage_rien_ne_change(): void
    {
        // Une heure murale sans décalage se lit à Dakar, comme avant (UTC+0).
        $mural = CarbonImmutable::parse($this->creneau(3, 9, 30))->setTimezone(VisitSchedulingService::TIMEZONE)->format('Y-m-d\TH:i:s');
        Sanctum::actingAs($this->client());

        $id = $this->postJson('/api/property-visits', ['property_id' => $this->bien->id, 'scheduled_at' => $mural])->assertCreated()->json('data.id');

        $this->assertStockeA($this->creneau(3, 9, 30), $id);
    }
}
