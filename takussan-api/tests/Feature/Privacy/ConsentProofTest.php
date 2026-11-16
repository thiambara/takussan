<?php

namespace Tests\Feature\Privacy;

use App\Models\Agency;
use App\Models\ConsentProof;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Property;
use App\Models\User;
use App\Services\Privacy\ConsentLedger;
use App\Services\Property\PublishReadiness;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-537 (AC1) — la politique de confidentialité (§ 6) garde « la preuve du consentement » : quel
 * document, quelle version, quand, d'où. Chaque case qui fait accepter un document en écrit une ligne
 * `consent_proofs` ; une inscription sans la case est refusée et ne crée rien.
 */
class ConsentProofTest extends TestCase
{
    use RefreshDatabase;

    private function inscrire(array $corps): TestResponse
    {
        return $this->postJson('/api/auth/register', $corps + [
            'email' => 'awa@example.com',
            'password' => 'Motdepasse-Solide-2026',
        ], ['REMOTE_ADDR' => '196.207.1.20']);
    }

    public function test_une_inscription_sans_la_case_est_refusee_et_ne_cree_rien(): void
    {
        $this->inscrire([])->assertUnprocessable()->assertJsonValidationErrors(['terms_accepted']);
        $this->inscrire(['terms_accepted' => false])->assertUnprocessable()->assertJsonValidationErrors(['terms_accepted']);

        $this->assertSame(0, User::query()->count());
        $this->assertSame(0, ConsentProof::query()->count());
    }

    public function test_une_inscription_acceptee_prouve_les_deux_documents_a_la_version_en_vigueur(): void
    {
        $this->freezeSecond();
        $this->inscrire(['terms_accepted' => true])->assertCreated();

        $user = User::query()->sole();
        $preuves = ConsentProof::query()->where('user_id', $user->id)->orderBy('document')->get();

        $this->assertSame(['privacy', 'terms'], $preuves->pluck('document')->all());
        foreach ($preuves as $preuve) {
            $this->assertSame(PublishReadiness::TERMS_VERSION, $preuve->version);
            $this->assertSame(ConsentLedger::CONTEXT_REGISTER, $preuve->context);
            $this->assertSame('196.207.1.20', $preuve->ip_address);
            $this->assertTrue($preuve->accepted_at->equalTo(now()));
        }
    }

    public function test_l_offre_d_achat_prouve_les_conditions_cochees(): void
    {
        Notification::fake();
        $client = User::factory()->create();
        Sanctum::actingAs($client);
        $bien = Property::factory()->published()->create([
            'agency_id' => Agency::factory()->create()->id,
            'contract_type' => ContractType::Sale,
            'price' => '95000000',
            'currency' => Currency::XOF,
        ]);

        $this->postJson("/api/public/properties/{$bien->slug}/booking-request", [
            'offer_amount' => 85000000,
            'offer_expires_at' => now()->addDays(10)->toDateString(),
            'terms_accepted' => true,
        ])->assertCreated();

        $preuve = ConsentProof::query()->where('user_id', $client->id)->sole();
        $this->assertSame([ConsentProof::DOCUMENT_TERMS, ConsentLedger::CONTEXT_OFFER, PublishReadiness::TERMS_VERSION], [$preuve->document, $preuve->context, $preuve->version]);
    }

    public function test_l_assistant_hote_prouve_les_conditions_cochees(): void
    {
        $user = User::factory()->create(['phone' => '+221770000123', 'phone_verified_at' => now()]);
        Sanctum::actingAs($user);

        $this->postJson('/api/host/individual/onboard', [
            'agency' => ['name' => 'Espace de Fatou', 'primary_city' => 'Dakar', 'currency' => 'XOF'],
            'phone_otp' => ['phone' => '+221770000123'],
            'preferences' => ['primary_property_type' => 'apartment'],
            'cgu_accepted' => true,
        ])->assertSuccessful();

        $preuve = ConsentProof::query()->where('user_id', $user->id)->sole();
        $this->assertSame([ConsentProof::DOCUMENT_TERMS, ConsentLedger::CONTEXT_HOST_ONBOARDING], [$preuve->document, $preuve->context]);
    }

    public function test_la_premiere_publication_prouve_les_conditions_et_pas_les_suivantes(): void
    {
        $user = User::factory()->create(['phone_verified_at' => now()]);
        Sanctum::actingAs($user);
        $brouillon = fn () => Property::factory()->draft()->create(['user_id' => $user->id, 'agency_id' => null]);

        $this->postJson("/api/properties/{$brouillon()->id}/publish", ['accept_terms' => true])->assertOk();
        $this->postJson("/api/properties/{$brouillon()->id}/publish", ['accept_terms' => true])->assertOk();

        $preuve = ConsentProof::query()->where('user_id', $user->id)->sole();
        $this->assertSame([ConsentProof::DOCUMENT_TERMS, ConsentLedger::CONTEXT_PUBLISH], [$preuve->document, $preuve->context]);
    }
}
