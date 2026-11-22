<?php

namespace Tests\Feature\Visits;

use App\Models\Agency;
use App\Models\Integration;
use App\Models\NotificationTemplate;
use App\Models\Property;
use App\Models\User;
use App\Services\Visit\VisitNotifier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2871 (AC2) — l'agent qui planifie une visite pour un client lit ce qui a été remis au visiteur :
 * `notification.channels`, et `notification.sms = {queued_at, body}` où `body` est le texte REMIS AU
 * CANAL SMS — comparé ici au texte que le prestataire a reçu, dans la langue et le fuseau du
 * VISITEUR, jamais ceux de l'agent qui fait la requête. `null` sans mobile, ou SMS retenu par la borne.
 *
 * Bout en bout, à travers les vrais canaux : seule l'API du prestataire SMS est simulée.
 */
class VisitStoreReturnsSmsTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    private Property $bien;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-11-12 09:21:00', 'UTC'));
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
        // L'agent lit l'anglais, à New York : le SMS du visiteur ne doit rien lui prendre.
        $this->agent = $this->personnel($this->agence, attributes: ['preferred_language' => 'en', 'timezone' => 'America/New_York']);
        $this->bien = $this->bienDe($this->agence);
    }

    /** @return list<string> */
    private function smsPartis(): array
    {
        return Http::recorded(fn ($req) => str_contains($req->url(), 'lampush'))
            ->map(fn (array $paire) => (string) $paire[0]['text'])
            ->values()
            ->all();
    }

    private function planifier(array $donnees): array
    {
        Sanctum::actingAs($this->agent);

        return $this->postJson('/api/property-visits', $donnees + [
            'property_id' => $this->bien->id,
            'scheduled_at' => $this->creneau(2, 10),
        ], ['Accept-Language' => 'en'])->assertCreated()->json();
    }

    public function test_ac2_contact_sans_compte_le_texte_rendu_est_celui_remis_au_canal(): void
    {
        $reponse = $this->planifier(['visitor_name' => 'Abdoulaye Sow', 'visitor_phone' => '+221771234567']);

        $partis = $this->smsPartis();
        $this->assertCount(1, $partis);
        $this->assertSame($partis[0], $reponse['notification']['sms']['body']);
        // Le français du contact sans compte, l'heure de Dakar : rien de l'agent.
        $this->assertStringStartsWith('Takussan : votre visite', $reponse['notification']['sms']['body']);
        $this->assertStringContainsString('10:00', $reponse['notification']['sms']['body']);
        $this->assertSame('2026-11-12T09:21', substr($reponse['notification']['sms']['queued_at'], 0, 16));
        $this->assertContains('sms', $reponse['notification']['channels']);
    }

    public function test_ac2_client_avec_compte_dans_sa_langue_et_son_fuseau(): void
    {
        $visiteur = $this->client([
            'phone' => '+221771112233',
            'phone_verified_at' => now(),
            'phone_whatsapp' => false,
            'preferred_language' => 'fr',
            'timezone' => 'Europe/Paris',
        ]);
        $fiche = $this->ficheClient($this->agence, $visiteur, ['phone' => '+221771112233']);

        $reponse = $this->planifier(['customer_id' => $fiche->id]);

        $partis = $this->smsPartis();
        $this->assertCount(1, $partis);
        $body = $reponse['notification']['sms']['body'];
        $this->assertSame($partis[0], $body);
        $this->assertStringStartsWith('Takussan : votre visite', $body);
        // 10:00 à Dakar = 11:00 à Paris (heure d'hiver).
        $this->assertStringContainsString('11:00', $body);
        $this->assertSame(['app', 'email', 'sms'], array_values(array_intersect(['app', 'email', 'sms'], $reponse['notification']['channels'])));
    }

    /**
     * Un compte à téléphone vérifié a WhatsApp par défaut pour les visites (`MOBILE_DEFAULT_EVENTS`).
     * Sans gabarit approuvé, le canal WhatsApp se replie sur le SMS, avec le texte de `toSms()` :
     * c'est un SMS qui part, et la réponse le rend.
     */
    public function test_ac2_compte_whatsapp_par_defaut_sans_gabarit_le_repli_sms_est_rendu(): void
    {
        $visiteur = $this->client(['phone' => '+221771112233', 'phone_verified_at' => now(), 'timezone' => 'Africa/Dakar']);
        $fiche = $this->ficheClient($this->agence, $visiteur, ['phone' => '+221771112233']);

        $reponse = $this->planifier(['customer_id' => $fiche->id]);

        $partis = $this->smsPartis();
        $this->assertCount(1, $partis, 'le repli SMS du canal WhatsApp part');
        $this->assertSame($partis[0], $reponse['notification']['sms']['body']);
        $this->assertContains('sms', $reponse['notification']['channels']);
        $this->assertNotContains('whatsapp', $reponse['notification']['channels']);
    }

    /** Avec un gabarit WhatsApp approuvé, c'est WhatsApp qui part : aucun SMS n'est annoncé. */
    public function test_compte_whatsapp_avec_gabarit_approuve_sms_nul(): void
    {
        NotificationTemplate::query()->updateOrCreate(
            ['event' => 'visit.confirmed', 'channel' => 'whatsapp', 'locale' => 'fr'],
            ['body' => 'x', 'is_active' => true, 'meta_template_name' => 'takussan_visit_confirmed', 'meta_status' => NotificationTemplate::META_STATUS_APPROVED],
        );
        $visiteur = $this->client(['phone' => '+221771112233', 'phone_verified_at' => now(), 'preferred_language' => 'fr']);
        $fiche = $this->ficheClient($this->agence, $visiteur, ['phone' => '+221771112233']);

        $reponse = $this->planifier(['customer_id' => $fiche->id]);

        $this->assertNull($reponse['notification']['sms']);
        $this->assertContains('whatsapp', $reponse['notification']['channels']);
    }

    public function test_ac2_client_sans_mobile_sms_nul(): void
    {
        $reponse = $this->planifier(['visitor_name' => 'Awa Diop', 'visitor_phone' => '+221338201234', 'visitor_email' => 'awa@example.test']);

        $this->assertSame([], $this->smsPartis());
        $this->assertNull($reponse['notification']['sms']);
        $this->assertSame(['email'], $reponse['notification']['channels']);
    }

    public function test_ac2_sms_retenu_par_la_borne_sms_nul(): void
    {
        $empreinte = hash_hmac('sha256', '+221771234567', (string) config('app.key'));
        for ($i = 0; $i < VisitNotifier::SMS_PAR_JOUR_PAR_NUMERO; $i++) {
            RateLimiter::hit('visit-sms:n:'.$empreinte, 86400);
        }

        $reponse = $this->planifier(['visitor_name' => 'Abdoulaye Sow', 'visitor_phone' => '+221771234567']);

        $this->assertSame([], $this->smsPartis());
        $this->assertNull($reponse['notification']['sms']);
        $this->assertFalse($reponse['sms_sent']);
        $this->assertSame(VisitNotifier::CODE_SMS_RETENU, $reponse['sms_code']);
    }
}
