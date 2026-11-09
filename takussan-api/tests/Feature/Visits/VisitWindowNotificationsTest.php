<?php

namespace Tests\Feature\Visits;

use App\Domain\Notifications\NotificationCode;
use App\Models\Agency;
use App\Models\Enums\VisitStatus;
use App\Models\Enums\VisitWindow;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Notifications\CodedNotification;
use App\Services\Visit\VisitSchedulingService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\EnvoisParCode;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2502 (revue) — aucune notification de visite n'affiche une heure que l'agent n'a pas fixée.
 *
 * Une visite demandée par tranche porte, en `scheduled_at`, le DÉBUT de sa tranche (14:00 pour
 * l'après-midi) : c'est ce qui la range dans la journée, pas un rendez-vous. Son annulation — par
 * l'agence ou par le visiteur — dit donc le jour et la tranche (`visit.cancelled_window`,
 * `visit.cancelled_by_visitor_window`), jamais une heure. Les codes qui affichent `scheduled_at`
 * (confirmée, déplacée, déplacée par le visiteur) ne partent qu'une fois l'heure fixée, et la
 * tranche est alors tombée ; le rappel ignore une visite non fixée (VisitRemindersSkipUnfixedTest).
 */
class VisitWindowNotificationsTest extends ApiTestCase
{
    use EnvoisParCode;
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    /** Une heure, sous toutes ses formes rendues : 14:00, 14h00, 2:00 PM. */
    private const HEURE = '/\b\d{1,2}(:|h)\d{2}\b/';

    private Agency $x;

    private Property $bien;

    private User $agent;

    private CarbonImmutable $jour;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->x = $this->agence();
        $this->bien = $this->bienDe($this->x);
        $this->agent = $this->personnel($this->x, 'agent', null, ['preferred_language' => 'fr']);
        $this->jour = CarbonImmutable::now(VisitSchedulingService::TIMEZONE)->addDays(3)->startOfDay();
    }

    private function visiteATranche(array $attributes = []): PropertyVisit
    {
        return PropertyVisit::factory()->create($attributes + [
            'property_id' => $this->bien->id,
            'agent_id' => $this->agent->id,
            'status' => VisitStatus::Scheduled,
            'scheduled_at' => VisitWindow::Afternoon->startOn($this->jour->format('Y-m-d'))->utc(),
            'preferred_window' => VisitWindow::Afternoon,
            'duration_minutes' => 30,
        ]);
    }

    /** @return list<string> le SMS et le corps de l'e-mail, rendus pour ce destinataire */
    private function rendus(CodedNotification $n, object $notifiable): array
    {
        app()->setLocale($n->locale ?? 'fr');

        return [$n->toSms($notifiable), (string) $n->toMail($notifiable)->render()];
    }

    private function assertSansHeure(CodedNotification $n, object $notifiable): void
    {
        $this->assertArrayNotHasKey('scheduled_at', $n->params);
        $this->assertSame($this->jour->format('Y-m-d'), $n->params['date']);
        $this->assertSame('afternoon', $n->params['window']);

        foreach ($this->rendus($n, $notifiable) as $corps) {
            $this->assertDoesNotMatchRegularExpression(self::HEURE, $corps);
            $this->assertStringContainsString("l'après-midi", html_entity_decode($corps, ENT_QUOTES));
        }
    }

    public function test_l_agence_annule_une_tranche_le_visiteur_lit_le_jour_et_la_tranche(): void
    {
        $visite = $this->visiteATranche([
            'visitor_id' => null,
            'visitor_name' => 'Awa Diop',
            'visitor_email' => 'awa@example.com',
            'visitor_phone' => '+221771234567',
            'locale' => 'fr',
        ]);

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/property-visits/{$visite->id}/cancel", ['reason' => 'Bien loué'])->assertOk();

        $this->assertCount(0, self::envoisALaDemande(NotificationCode::VisitCancelled));
        $envois = self::envoisALaDemande(NotificationCode::VisitCancelledWindow);
        $this->assertCount(1, $envois);
        [$n, $canaux, $notifiable] = $envois->first();
        $this->assertSame(['mail', 'sms'], $canaux);
        $this->assertSansHeure($n, $notifiable);
    }

    public function test_le_visiteur_annule_sa_tranche_l_agent_lit_le_jour_et_la_tranche(): void
    {
        $visiteur = $this->client();
        $visite = $this->visiteATranche(['visitor_id' => $visiteur->id]);

        Sanctum::actingAs($visiteur);
        $this->postJson("/api/property-visits/{$visite->id}/cancel")->assertOk();

        Notification::assertNotSentTo($this->agent, CodedNotification::class, self::deCode(NotificationCode::VisitCancelledByVisitor));
        $envois = Notification::sent($this->agent, CodedNotification::class, self::deCodeSur(NotificationCode::VisitCancelledByVisitorWindow, $visite->id));
        $this->assertCount(1, $envois);
        $this->assertSansHeure($envois->first(), $this->agent);
    }

    /** Une visite à heure fixe garde ses codes : l'annulation dit l'heure. */
    public function test_une_visite_a_heure_fixe_garde_le_code_qui_dit_l_heure(): void
    {
        $visiteur = $this->client();
        $visite = $this->visiteATranche(['visitor_id' => $visiteur->id, 'preferred_window' => null]);

        Sanctum::actingAs($visiteur);
        $this->postJson("/api/property-visits/{$visite->id}/cancel")->assertOk();

        Notification::assertSentTo($this->agent, CodedNotification::class, self::deCodeSur(NotificationCode::VisitCancelledByVisitor, $visite->id));
    }

    /**
     * Confirmée À L'HEURE du début de tranche (14:00) : `scheduled_at` ne change pas, et c'est
     * pourtant désormais une heure fixée — la tranche tombe, la confirmation la dit.
     */
    public function test_confirmee_au_debut_de_tranche_la_confirmation_dit_l_heure_fixee(): void
    {
        $visite = $this->visiteATranche(['visitor_id' => $this->client()->id]);

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/property-visits/{$visite->id}/confirm", [
            'scheduled_at' => $this->jour->setTime(14, 0)->utc()->toIso8601String(),
        ])->assertOk()->assertJsonPath('data.preferred_window', null);

        $this->assertNull($visite->fresh()->preferred_window);
        // Annulée ensuite, elle dit l'heure : ce n'est plus une tranche.
        $this->postJson("/api/property-visits/{$visite->id}/cancel")->assertOk();
        $this->assertCount(0, Notification::sent($visite->visitor, CodedNotification::class, self::deCode(NotificationCode::VisitCancelledWindow)));
        Notification::assertSentTo($visite->visitor, CodedNotification::class, self::deCodeSur(NotificationCode::VisitCancelled, $visite->id));
    }

    /** L'agence déplace une visite à tranche à une heure précise : l'avis dit l'heure, la tranche tombe. */
    public function test_l_agence_fixe_l_heure_en_deplacant_la_tranche_tombe(): void
    {
        $visite = $this->visiteATranche(['visitor_id' => $this->client()->id]);

        Sanctum::actingAs($this->agent);
        $this->putJson("/api/property-visits/{$visite->id}", [
            'scheduled_at' => $this->jour->setTime(16, 15)->utc()->toIso8601String(),
        ])->assertOk()->assertJsonPath('data.preferred_window', null);

        $this->assertNull($visite->fresh()->preferred_window);
        Notification::assertSentTo($visite->visitor, CodedNotification::class, self::deCodeSur(NotificationCode::VisitRescheduled, $visite->id));
    }

    /**
     * L'agence fixe, par la modification, l'heure EXACTE du début de tranche (14:00) : `scheduled_at`
     * ne change pas — le crochet du modèle ne voit rien —, la tranche tombe quand même.
     */
    public function test_l_agence_fixe_par_modification_l_heure_du_debut_de_tranche(): void
    {
        $visite = $this->visiteATranche(['visitor_id' => $this->client()->id]);

        Sanctum::actingAs($this->agent);
        $this->putJson("/api/property-visits/{$visite->id}", [
            'scheduled_at' => $this->jour->setTime(14, 0)->utc()->toIso8601String(),
        ])->assertOk()->assertJsonPath('data.preferred_window', null);

        $this->assertNull($visite->fresh()->preferred_window);
    }

    /** Le visiteur reporte sa tranche à un créneau précis : l'agence lit l'heure, la tranche tombe. */
    public function test_le_visiteur_reporte_sa_tranche_a_une_heure_la_tranche_tombe(): void
    {
        $visiteur = $this->client();
        $visite = $this->visiteATranche(['visitor_id' => $visiteur->id]);

        Sanctum::actingAs($visiteur);
        $this->postJson("/api/property-visits/{$visite->id}/reschedule", [
            'scheduled_at' => $this->jour->addDay()->setTime(10, 0)->utc()->toIso8601String(),
        ])->assertOk();

        $this->assertNull($visite->fresh()->preferred_window);
        Notification::assertSentTo($this->agent, CodedNotification::class, self::deCodeSur(NotificationCode::VisitRescheduledByVisitor, $visite->id));
    }
}
