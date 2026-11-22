<?php

namespace Tests\Feature\Visits;

use App\Domain\Notifications\NotificationCode;
use App\Models\Agency;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Notifications\CodedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2871 (AC3) — la maquette dit « prévenu par SMS et par e-mail » : un visiteur qui a un e-mail
 * et un mobile reçoit `visit.confirmed` par les DEUX canaux. Mesuré à l'écriture : l'e-mail partait
 * déjà (`CodedNotification::via()` — e-mail par défaut ; `contactChannels()` — l'e-mail laissé) ;
 * ce test le tient, et rougit si l'un des deux canaux manque.
 */
class VisitConfirmedChannelsTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    private Property $bien;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->agence = $this->agence();
        $this->agent = $this->personnel($this->agence);
        $this->bien = $this->bienDe($this->agence);
    }

    private function confirmer(array $attributs): void
    {
        $visite = PropertyVisit::factory()->create($attributs + [
            'property_id' => $this->bien->id,
            'agent_id' => $this->agent->id,
            'status' => VisitStatus::Scheduled,
            'scheduled_at' => $this->creneau(),
        ]);

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/property-visits/{$visite->id}/confirm")->assertOk();
    }

    public function test_ac3_le_compte_avec_e_mail_et_mobile_recoit_e_mail_et_sms(): void
    {
        $visiteur = $this->client([
            'email' => 'abdoulaye@example.test',
            'phone' => '+221771112233',
            'phone_verified_at' => now(),
            'phone_whatsapp' => false,
        ]);

        $this->confirmer(['visitor_id' => $visiteur->id, 'visitor_phone' => '+221771112233', 'visitor_email' => 'abdoulaye@example.test']);

        Notification::assertSentTo($visiteur, CodedNotification::class, function (CodedNotification $n, array $canaux): bool {
            return $n->code === NotificationCode::VisitConfirmed && in_array('mail', $canaux, true) && in_array('sms', $canaux, true);
        });
    }

    public function test_ac3_le_contact_sans_compte_avec_e_mail_et_mobile_recoit_e_mail_et_sms(): void
    {
        $this->confirmer([
            'visitor_id' => null,
            'visitor_name' => 'Abdoulaye Sow',
            'visitor_phone' => '+221771234567',
            'visitor_email' => 'abdoulaye@example.test',
        ]);

        Notification::assertSentOnDemand(CodedNotification::class, function (CodedNotification $n, array $canaux, AnonymousNotifiable $a): bool {
            return $n->code === NotificationCode::VisitConfirmed
                && in_array('mail', $canaux, true) && in_array('sms', $canaux, true)
                && ($a->routes['mail'] ?? null) === 'abdoulaye@example.test';
        });
    }
}
