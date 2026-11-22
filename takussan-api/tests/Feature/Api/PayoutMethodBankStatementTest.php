<?php

namespace Tests\Feature\Api;

use App\Http\Resources\PayoutMethodResource;
use App\Models\Enums\PayoutMethodKind;
use App\Models\PayoutMethod;
use App\Models\User;
use App\Support\ImpersonationContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-2863 (AC3) — le bailleur envoie le RIB de son compte bancaire « à confirmer » : sous step-up
 * 2FA, à lui seul, pour un compte bancaire seulement ; le compte passe « en revue » sans être
 * vérifié pour autant (seule une agence vérifie, ADR-0039 §6).
 */
class PayoutMethodBankStatementTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Storage::fake((string) config('media-library.disk_name'));
    }

    private function bank(int $userId): PayoutMethod
    {
        return PayoutMethod::factory()->create([
            'user_id' => $userId,
            'kind' => PayoutMethodKind::BankTransfer,
            'account_identifier' => 'SN08 0000 0000 0000 4417',
            'masked_identifier' => PayoutMethod::mask('SN08 0000 0000 0000 4417'),
        ]);
    }

    private function envoyer(PayoutMethod $method, ?UploadedFile $file = null)
    {
        return $this->post("/api/me/payout-methods/{$method->id}/bank-statement", [
            'file' => $file ?? UploadedFile::fake()->create('rib.pdf', 120, 'application/pdf'),
        ], ['Accept' => 'application/json']);
    }

    public function test_ac3_le_rib_envoye_sous_2fa_met_le_compte_en_revue_sans_le_verifier(): void
    {
        $landlord = $this->landlordOf($this->moneyAgency());
        $method = $this->bank($landlord->id);
        $this->actingWithStepUp($landlord);

        $this->getJson('/api/me/payout-methods')->assertOk()
            ->assertJsonPath('data.0.verification_status', 'to_confirm');

        $this->envoyer($method)->assertCreated()
            ->assertJsonPath('data.verification_status', 'in_review')
            ->assertJsonPath('data.verified', false)
            ->assertJsonPath('data.bank_statement_media_id', fn ($id) => is_int($id));

        $method->refresh();
        $this->assertNotNull($method->bank_statement_submitted_at);
        $media = $method->getFirstMedia(PayoutMethod::BANK_STATEMENT_COLLECTION);
        $this->assertNotNull($media);
        $this->assertSame(config('media-library.disk_name'), $media->disk);
        $this->assertFalse($method->verifications()->exists());
    }

    public function test_ac3_sans_le_step_up_l_envoi_est_refuse(): void
    {
        $landlord = $this->landlordOf($this->moneyAgency());
        $method = $this->bank($landlord->id);
        $landlord->forceFill(['two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET])->save();
        Sanctum::actingAs($landlord);

        $this->envoyer($method)->assertForbidden()->assertJsonPath('code', 'two_factor_step_up_required');
        $this->assertNull($method->fresh()->bank_statement_submitted_at);
    }

    public function test_le_compte_d_un_autre_titulaire_est_refuse(): void
    {
        $agency = $this->moneyAgency();
        $method = $this->bank($this->landlordOf($agency)->id);
        $this->actingWithStepUp($this->landlordOf($agency));

        $this->envoyer($method)->assertForbidden();
        $this->assertNull($method->fresh()->bank_statement_submitted_at);
    }

    public function test_un_compte_mobile_money_n_a_pas_de_rib(): void
    {
        $landlord = $this->landlordOf($this->moneyAgency());
        $wave = PayoutMethod::factory()->create(['user_id' => $landlord->id, 'kind' => PayoutMethodKind::Wave]);
        $this->actingWithStepUp($landlord);

        $this->envoyer($wave)->assertStatus(422)->assertJsonPath('code', 'payout.bank_statement_bank_only');
    }

    public function test_un_fichier_qui_n_est_ni_pdf_ni_image_est_refuse(): void
    {
        $landlord = $this->landlordOf($this->moneyAgency());
        $method = $this->bank($landlord->id);
        $this->actingWithStepUp($landlord);

        $this->envoyer($method, UploadedFile::fake()->create('rib.exe', 10, 'application/x-msdownload'))
            ->assertStatus(422)->assertJsonValidationErrors('file');
    }

    public function test_changer_de_numero_retire_le_rib_de_l_ancien_compte(): void
    {
        $landlord = $this->landlordOf($this->moneyAgency());
        $method = $this->bank($landlord->id);
        $this->actingWithStepUp($landlord);
        $this->envoyer($method)->assertCreated();

        $this->patchJson("/api/me/payout-methods/{$method->id}", ['account_identifier' => 'SN08 1111 1111 1111 9999'])
            ->assertOk()
            ->assertJsonPath('data.verification_status', 'to_confirm')
            ->assertJsonPath('data.bank_statement_media_id', null);
        $this->assertNull($method->fresh()->bank_statement_submitted_at);
    }

    public function test_le_personnel_qui_verifie_lit_le_rib_un_tiers_non(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $method = $this->bank($landlord->id);
        $this->actingWithStepUp($landlord);
        $mediaId = $this->envoyer($method)->assertCreated()->json('data.bank_statement_media_id');

        // TCK-2463 — le RIB se lit par l'URL d'API signée que la ressource émet (`media.private.show`),
        // plus par `GET /api/media/{id}/sign`, qui signait pour un CDN jamais provisionné.
        $verifier = $this->agencyAgent($agency);
        $this->actingWithStepUp($verifier);
        $url = $this->getJson("/api/payout-methods?filter[user_id]={$landlord->id}")->assertOk()
            ->assertJsonPath('data.0.verification_status', 'in_review')
            ->assertJsonPath('data.0.bank_statement_media_id', $mediaId)
            ->json('data.0.bank_statement_url');
        $this->assertIsString($url);
        $this->assertStringContainsString("/api/media/{$mediaId}/file?", $url);
        $this->assertStringContainsString('signature=', $url);
        // Vers l'URL présignée du disque privé (`PrivateMediaAccess::redirect`), qui porte le fichier du RIB.
        $this->assertMatchesRegularExpression('~/rib[^/?]*\.pdf\?~', (string) $this->get($url)->assertRedirect()->headers->get('Location'));

        $this->assertNull($this->rendu($method, $this->agencyAgent($this->moneyAgency()))['bank_statement_url']);
    }

    public function test_le_titulaire_lit_son_rib_mais_jamais_sous_impersonation(): void
    {
        $landlord = $this->landlordOf($this->moneyAgency());
        $method = $this->bank($landlord->id);
        $this->actingWithStepUp($landlord);
        $this->envoyer($method)->assertCreated();

        $url = $this->getJson('/api/me/payout-methods')->assertOk()->json('data.0.bank_statement_url');
        $this->assertIsString($url);
        // Vers l'URL présignée du disque privé (`PrivateMediaAccess::redirect`), qui porte le fichier du RIB.
        $this->assertMatchesRegularExpression('~/rib[^/?]*\.pdf\?~', (string) $this->get($url)->assertRedirect()->headers->get('Location'));

        app(ImpersonationContext::class)->bind(1, User::factory()->create()->id);
        $this->assertNull($this->rendu($method, $landlord)['bank_statement_url']);
    }

    public function test_un_compte_sans_rib_n_a_pas_d_url(): void
    {
        $landlord = $this->landlordOf($this->moneyAgency());

        $this->assertNull($this->rendu($this->bank($landlord->id), $landlord)['bank_statement_url']);
    }

    /** TCK-2463 (AC2) — la route de signature CDN de TCK-105 n'existe plus. */
    public function test_la_route_de_signature_cdn_est_retiree(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $method = $this->bank($landlord->id);
        $this->actingWithStepUp($landlord);
        $mediaId = $this->envoyer($method)->assertCreated()->json('data.bank_statement_media_id');

        // Le titulaire, autorisé par `MediaPolicy::sign` : rendait 200 tant que la route existait.
        $this->getJson("/api/media/{$mediaId}/sign")->assertNotFound();
        $this->assertFalse(Route::has('media.sign'));
    }

    /** @return array<string,mixed> */
    private function rendu(PayoutMethod $method, User $lecteur): array
    {
        $request = Request::create('/api/payout-methods');
        $request->setUserResolver(fn () => $lecteur);

        return (new PayoutMethodResource($method->fresh()))->toArray($request);
    }
}
