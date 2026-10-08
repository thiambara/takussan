<?php

namespace Tests\Feature\Notifications;

use App\Models\Enums\VisitStatus;
use App\Models\Integration;
use App\Models\PropertyVisit;
use App\Services\Visit\VisitNotifier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;
use Laravel\Sanctum\Sanctum;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\TestCase;

/**
 * TCK-590 × TCK-588 — UNE seule source de vérité pour le plafond d'un SMS de visite :
 * {@see VisitNotifier} au point d'envoi (par numéro et émetteur, par numéro, par acteur).
 *
 * Les canaux SMS et WhatsApp de 588 ont leur propre limite par numéro (5 par heure,
 * `sms-channel:phone:<e164>`) pour un destinataire sans compte. Comptée EN PLUS, elle reviendrait
 * à un plafond global par numéro, que n'importe quel émetteur épuise pour tous les autres — le
 * défaut R1 de la passe 3. Un SMS de visite déjà borné la saute donc ; un SMS retenu par la borne
 * ne part par aucun canal.
 *
 * Bout en bout, à travers les vrais canaux : seule l'API du prestataire SMS est simulée.
 */
class PlafondSmsDeVisiteTest extends TestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private string $numero = '+221771234567';

    protected function setUp(): void
    {
        parent::setUp();
        Integration::create([
            'provider' => 'sms_lafricamobile',
            'agency_id' => null,
            'credentials' => ['accountid' => 'a', 'password' => 'p', 'sender_id' => 'TAKUSSAN'],
            'is_active' => true,
        ]);
        config()->set('sms.quiet_hours.enabled', false);
        config()->set('sms.webhook_url_token', 'tck-590-test');
        RateLimiter::clear("sms-channel:phone:{$this->numero}");
        Http::fake(['lampush*' => Http::response(['push_id' => 'lam-590'], 200)]);
    }

    private function smsPartis(): int
    {
        return Http::recorded(fn ($req) => str_contains($req->url(), 'lampush'))->count();
    }

    /** Une visite anonyme au numéro, confirmée par l'agent de l'agence du bien. */
    private function confirmer(): array
    {
        $x = $this->agence();
        $agent = $this->personnel($x);
        $visite = PropertyVisit::factory()->create([
            'property_id' => $this->bienDe($x)->id,
            'visitor_id' => null,
            'visitor_name' => 'Awa Diop',
            'visitor_email' => null,
            'visitor_phone' => $this->numero,
            'scheduled_at' => $this->creneau(),
            'status' => VisitStatus::Scheduled,
        ]);

        Sanctum::actingAs($agent);

        return $this->postJson("/api/property-visits/{$visite->id}/confirm")->assertOk()->json();
    }

    public function test_un_sms_de_visite_borne_en_amont_n_est_pas_recompte_par_le_canal(): void
    {
        // La limite générique du canal pour ce numéro est épuisée — par d'autres envois.
        for ($i = 0; $i < 5; $i++) {
            RateLimiter::hit("sms-channel:phone:{$this->numero}", 3600);
        }

        $reponse = $this->confirmer();

        $this->assertTrue($reponse['sms_sent']);
        $this->assertSame(1, $this->smsPartis());
    }

    public function test_un_sms_retenu_par_la_borne_ne_part_par_aucun_canal(): void
    {
        $empreinte = hash_hmac('sha256', $this->numero, (string) config('app.key'));
        for ($i = 0; $i < VisitNotifier::SMS_PAR_JOUR_PAR_NUMERO; $i++) {
            RateLimiter::hit('visit-sms:n:'.$empreinte, 86400);
        }

        $reponse = $this->confirmer();

        $this->assertFalse($reponse['sms_sent']);
        $this->assertSame(VisitNotifier::CODE_SMS_RETENU, $reponse['sms_code']);
        $this->assertSame(0, $this->smsPartis());
    }
}
