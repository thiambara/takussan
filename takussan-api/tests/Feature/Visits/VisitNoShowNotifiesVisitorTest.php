<?php

namespace Tests\Feature\Visits;

use App\Domain\Notifications\NotificationCode;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Enums\VisitStatus;
use App\Models\Integration;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Support\LienFront;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2871 (AC1) — « Absent » prévient le visiteur (`visit.no_show`) et lui propose d'en reprendre
 * une : le SMS porte l'URL publique du bien, où « Demander une visite » existe.
 *
 * Bout en bout, à travers les vrais canaux : seule l'API du prestataire SMS est simulée. Le visiteur
 * SANS compte est le cas qui garde `reachesContacts()` : sans lui, `sendToContact` lève, le `catch`
 * de `VisitNotifier` l'avale, et rien ne part sans rouge.
 */
class VisitNoShowNotifiesVisitorTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    private Property $bien;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-11-12 15:00:00', 'UTC'));
        Integration::create([
            'provider' => 'sms_lafricamobile',
            'agency_id' => null,
            'credentials' => ['accountid' => 'a', 'password' => 'p', 'sender_id' => 'TAKUSSAN'],
            'is_active' => true,
        ]);
        config()->set('sms.quiet_hours.enabled', false);
        config()->set('sms.webhook_url_token', 'tck-2871-test');
        Http::fake(['lampush*' => Http::response(['push_id' => 'lam-2871'], 200)]);

        $this->agence = $this->agence();
        $this->agent = $this->personnel($this->agence);
        $this->bien = $this->bienDe($this->agence);
    }

    /** @return list<string> le texte de chaque SMS remis au prestataire */
    private function smsPartis(): array
    {
        return Http::recorded(fn ($req) => str_contains($req->url(), 'lampush'))
            ->map(fn (array $paire) => (string) $paire[0]['text'])
            ->values()
            ->all();
    }

    private function visitePassee(array $attributs = []): PropertyVisit
    {
        return PropertyVisit::factory()->create($attributs + [
            'property_id' => $this->bien->id,
            'agent_id' => $this->agent->id,
            'status' => VisitStatus::Confirmed,
            'scheduled_at' => now()->subHours(2),
        ]);
    }

    private function marquerAbsent(PropertyVisit $visite): array
    {
        Sanctum::actingAs($this->agent);

        return $this->postJson("/api/property-visits/{$visite->id}/no-show")
            ->assertOk()
            ->assertJsonPath('data.status', VisitStatus::NoShow->value)
            ->json();
    }

    public function test_ac1_le_visiteur_sans_compte_recoit_un_sms_avec_l_url_publique_du_bien(): void
    {
        $visite = $this->visitePassee([
            'visitor_id' => null,
            'visitor_name' => 'Abdoulaye Sow',
            'visitor_phone' => '+221771234567',
            'visitor_email' => null,
        ]);

        $reponse = $this->marquerAbsent($visite);

        $sms = $this->smsPartis();
        $this->assertCount(1, $sms, 'un SMS part au visiteur sans compte');
        $this->assertStringContainsString(LienFront::vers('/fr/properties/'.$this->bien->slug), $sms[0]);
        $this->assertStringContainsString('12 novembre', $sms[0]);
        $this->assertTrue($reponse['sms_sent']);
    }

    public function test_ac1_le_visiteur_avec_compte_est_prevenu_dans_sa_langue_cloche_comprise(): void
    {
        $visiteur = $this->client([
            'phone' => '+221771112233',
            'phone_verified_at' => now(),
            'phone_whatsapp' => false,
            'preferred_language' => 'en',
        ]);
        $visite = $this->visitePassee(['visitor_id' => $visiteur->id, 'visitor_phone' => '+221771112233']);

        $this->marquerAbsent($visite);

        $sms = $this->smsPartis();
        $this->assertCount(1, $sms);
        $this->assertStringContainsString(LienFront::vers('/en/properties/'.$this->bien->slug), $sms[0]);
        $this->assertStringStartsWith('Takussan: visit of', $sms[0]);

        $cloche = AppNotification::query()->where('user_id', $visiteur->id)->sole();
        $this->assertSame(NotificationCode::VisitNoShow->value, $cloche->code);
        $this->assertSame('visit', $cloche->target['kind'] ?? null);
        $this->assertSame($visite->id, $cloche->target['id'] ?? null);
    }

    public function test_un_bien_qui_n_est_plus_public_ne_donne_pas_de_lien(): void
    {
        $this->bien->update(['visibility' => 'private']);
        $visite = $this->visitePassee([
            'visitor_id' => null,
            'visitor_phone' => '+221771234567',
            'visitor_email' => null,
        ]);

        $this->marquerAbsent($visite);

        $sms = $this->smsPartis();
        $this->assertCount(1, $sms);
        $this->assertStringNotContainsString('/properties/', $sms[0]);
        $this->assertStringContainsString("Contactez l'agence", $sms[0]);
    }

    public function test_une_visite_a_venir_ne_se_marque_pas_absente_et_ne_previent_personne(): void
    {
        $visite = $this->visitePassee([
            'visitor_id' => null,
            'visitor_phone' => '+221771234567',
            'scheduled_at' => now()->addDay(),
        ]);

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/property-visits/{$visite->id}/no-show")->assertStatus(422);

        $this->assertSame([], $this->smsPartis());
    }
}
