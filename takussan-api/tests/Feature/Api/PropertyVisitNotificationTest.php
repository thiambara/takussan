<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Notifications\VisitCancelledNotification;
use App\Notifications\VisitConfirmedNotification;
use App\Notifications\VisitNotification;
use App\Notifications\VisitRescheduledNotification;
use App\Services\Visit\VisitSchedulingService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-590 — le visiteur, avec ou sans compte, apprend ce que l'agence décide ; l'agence apprend
 * ce que le visiteur décide (AC6b, AC8, AC9, AC9b).
 *
 * `notifyConfirmed` sortait dès que `visitor` était nul : le visiteur sans compte — celui qui a
 * laissé son seul téléphone sur le site — n'apprenait jamais que sa visite était confirmée.
 */
class PropertyVisitNotificationTest extends ApiTestCase
{
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

    private function visiteAnonyme(array $attributes = []): PropertyVisit
    {
        return PropertyVisit::factory()->create($attributes + [
            'property_id' => $this->bien->id,
            'visitor_id' => null,
            'visitor_name' => 'Awa Diop',
            'visitor_email' => 'awa@example.com',
            'visitor_phone' => '+221771234567',
            'notes' => 'Je passerai avec ma soeur',
            'locale' => 'en',
            'scheduled_at' => CarbonImmutable::now(VisitSchedulingService::TIMEZONE)->addDays(2)->setTime(10, 0)->utc(),
            'status' => VisitStatus::Scheduled,
        ]);
    }

    /** L'envoi à la demande vers l'e-mail ET le téléphone saisis, avec ces canaux. */
    private function assertEnvoyeALaDemande(string $classe, array $canaux): VisitNotification
    {
        $trouve = null;
        Notification::assertSentOnDemand($classe, function (VisitNotification $n, array $channels, AnonymousNotifiable $notifiable) use ($canaux, &$trouve) {
            $ok = $channels === $canaux
                && ($notifiable->routes['mail'] ?? null) === 'awa@example.com'
                && ($notifiable->routes['sms'] ?? null) === '+221771234567';
            if ($ok) {
                $trouve = $n;
            }

            return $ok;
        });
        Notification::assertSentOnDemandTimes($classe, 1);

        return $trouve;
    }

    /** AC9 (R) — confirmer une visite anonyme prévient le visiteur, dans sa langue, à l'heure de Dakar. */
    public function test_confirmer_une_visite_anonyme_previent_le_visiteur(): void
    {
        $visite = $this->visiteAnonyme();

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/property-visits/{$visite->id}/confirm")->assertOk();

        $n = $this->assertEnvoyeALaDemande(VisitConfirmedNotification::class, ['mail', 'sms']);
        $this->assertSame('en', $n->locale);

        $notifiable = Notification::route('mail', 'awa@example.com');
        app()->setLocale($n->locale);
        [$sms, $mail] = [$n->toSms($notifiable), $n->toMail($notifiable)->render()];
        $this->assertStringContainsString('10:00 (Dakar time)', $sms);
        $this->assertStringContainsString('confirmed', $sms);
        $this->assertStringContainsString('10:00 (Dakar time)', (string) $mail);
    }

    /** AC9b (R) — l'agence annule : le visiteur sans compte est prévenu, sans son nom ni son texte libre. */
    public function test_l_agence_annule_une_visite_anonyme(): void
    {
        $visite = $this->visiteAnonyme(['status' => VisitStatus::Confirmed, 'agent_id' => $this->agent->id]);

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/property-visits/{$visite->id}/cancel", ['reason' => 'Bien loué'])->assertOk();

        $n = $this->assertEnvoyeALaDemande(VisitCancelledNotification::class, ['mail', 'sms']);
        $notifiable = Notification::route('mail', 'awa@example.com');
        foreach ([$n->toSms($notifiable), (string) $n->toMail($notifiable)->render()] as $corps) {
            $this->assertStringNotContainsString('Awa', $corps);
            $this->assertStringNotContainsString('soeur', $corps);
        }
    }

    /** AC9b (R) — le visiteur annule la sienne : l'agent assigné, sinon les admins, sont prévenus. */
    public function test_le_visiteur_annule_l_agence_est_prevenue(): void
    {
        $visiteur = $this->client();
        $admin = $this->personnel($this->x, 'agency_admin');

        $assignee = PropertyVisit::factory()->create([
            'property_id' => $this->bien->id, 'visitor_id' => $visiteur->id, 'agent_id' => $this->agent->id,
        ]);
        $libre = PropertyVisit::factory()->create([
            'property_id' => $this->bien->id, 'visitor_id' => $visiteur->id, 'agent_id' => null,
        ]);

        Sanctum::actingAs($visiteur);
        $this->postJson("/api/property-visits/{$assignee->id}/cancel")->assertOk();
        Notification::assertSentTo($this->agent, VisitCancelledNotification::class, fn ($n) => $n->visit->id === $assignee->id);
        Notification::assertNotSentTo($admin, VisitCancelledNotification::class, fn ($n) => $n->visit->id === $assignee->id);

        $this->postJson("/api/property-visits/{$libre->id}/cancel")->assertOk();
        Notification::assertSentTo($admin, VisitCancelledNotification::class, fn ($n) => $n->visit->id === $libre->id);
        Notification::assertNotSentTo($visiteur, VisitCancelledNotification::class);
    }

    /** AC8 (R) — l'agent planifie pour un client sans compte : visite confirmée, SMS au client. */
    public function test_l_agent_planifie_pour_un_client_sans_compte(): void
    {
        $fiche = $this->ficheClient($this->x, null, ['phone' => '+221776543210', 'email' => null]);

        Sanctum::actingAs($this->agent);
        $id = $this->postJson('/api/property-visits', [
            'property_id' => $this->bien->id,
            'customer_id' => $fiche->id,
            'scheduled_at' => $this->creneau(heure: 8),
        ])->assertCreated()->json('data.id');

        $visite = PropertyVisit::query()->findOrFail($id);
        $this->assertNull($visite->visitor_id);
        $this->assertSame($fiche->id, $visite->customer_id);
        $this->assertSame('+221776543210', $visite->visitor_phone);
        $this->assertSame($this->agent->id, $visite->agent_id);
        $this->assertSame(VisitStatus::Confirmed, $visite->status);

        Notification::assertSentOnDemand(
            VisitConfirmedNotification::class,
            fn ($n, array $channels, AnonymousNotifiable $notifiable) => $channels === ['sms']
                && $notifiable->routes['sms'] === '+221776543210',
        );
    }

    /** AC8 — sans fiche, le prospect se donne par nom + téléphone ; l'un sans l'autre → 422. */
    public function test_sans_fiche_nom_et_telephone_sont_exiges(): void
    {
        Sanctum::actingAs($this->agent);

        $this->postJson('/api/property-visits', [
            'property_id' => $this->bien->id,
            'visitor_name' => 'Moussa Fall',
            'scheduled_at' => $this->creneau(),
        ])->assertUnprocessable()->assertJsonValidationErrors(['visitor_phone']);

        $this->postJson('/api/property-visits', [
            'property_id' => $this->bien->id,
            'visitor_name' => 'Moussa Fall',
            'visitor_phone' => '+221771112233',
            'scheduled_at' => $this->creneau(),
        ])->assertCreated()->assertJsonPath('data.status', VisitStatus::Confirmed->value);
    }

    /** AC6b (R) — l'agence déplace l'heure : le visiteur est prévenu, une fois ; hier → 422. */
    public function test_l_agence_deplace_la_visite(): void
    {
        $visiteur = $this->client();
        $avecCompte = PropertyVisit::factory()->create([
            'property_id' => $this->bien->id, 'visitor_id' => $visiteur->id, 'agent_id' => $this->agent->id,
            'status' => VisitStatus::Confirmed,
        ]);
        $anonyme = $this->visiteAnonyme(['status' => VisitStatus::Confirmed, 'agent_id' => $this->agent->id]);

        Sanctum::actingAs($this->agent);

        $this->patchJson("/api/property-visits/{$avecCompte->id}", ['scheduled_at' => now()->subDay()->toIso8601String()])
            ->assertUnprocessable()->assertJsonValidationErrors(['scheduled_at']);

        $this->patchJson("/api/property-visits/{$avecCompte->id}", ['scheduled_at' => $this->creneau(jours: 4)])->assertOk();
        Notification::assertSentToTimes($visiteur, VisitRescheduledNotification::class, 1);

        $this->patchJson("/api/property-visits/{$anonyme->id}", ['scheduled_at' => $this->creneau(jours: 5)])->assertOk();
        $this->assertEnvoyeALaDemande(VisitRescheduledNotification::class, ['mail', 'sms']);

        // Une modification sans changement d'heure ne prévient personne.
        $this->patchJson("/api/property-visits/{$avecCompte->id}", ['notes' => 'Portail bleu'])->assertOk();
        Notification::assertSentToTimes($visiteur, VisitRescheduledNotification::class, 1);
    }
}
