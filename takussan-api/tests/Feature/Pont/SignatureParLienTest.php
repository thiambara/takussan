<?php

namespace Tests\Feature\Pont;

use App\Models\Customer;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Notifications\LeaseSignatureCodeNotification;
use App\Services\Lease\LeaseSignatureService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Notifications\ChannelManager;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Support\FakeSmsRouter;
use Tests\Support\SceneDuLienDAction;

/**
 * TCK-2982 (ADR-0132 § 5, ADR-0098) — signer un état des lieux par lien exige un code à 6 chiffres envoyé au
 * NUMÉRO DU LIEN : sans code, refus ; code faux, refus ; code juste, signé et le lien consommé. Un refus ne
 * consomme pas le lien.
 */
class SignatureParLienTest extends ApiTestCase
{
    use RefreshDatabase;
    use SceneDuLienDAction;

    private const SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAvMBAOeufn4AAAAASUVORK5CYII=';

    private const NUMERO_DU_LIEN = '+221770007788';

    private User $locataire;

    private Inventory $inventaire;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $bailleur = User::factory()->create();
        $bien = Property::factory()->create(['user_id' => $bailleur->id]);
        $this->locataire = User::factory()->create(['phone' => '+221770001234', 'phone_verified_at' => now()]);
        $fiche = Customer::factory()->create(['user_id' => $this->locataire->id]);
        $bail = Lease::factory()->create(['property_id' => $bien->id, 'landlord_id' => $bailleur->id, 'tenant_id' => $fiche->id]);
        $this->inventaire = Inventory::factory()->pendingSignature()->create([
            'lease_id' => $bail->id, 'property_id' => $bien->id, 'tenant_id' => $fiche->id, 'conducted_by' => $bailleur->id,
        ]);
    }

    public function test_sans_code_refus_et_le_lien_n_est_pas_consomme(): void
    {
        [$jeton, $lien] = $this->lien($this->locataire, 'inventory.sign', $this->inventaire, self::NUMERO_DU_LIEN);

        $this->postJson("/api/a/{$jeton}", ['signature' => self::SIGNATURE])
            ->assertUnprocessable()->assertJsonPath('code', 'action_link.code_required');

        $this->assertFalse((bool) $this->inventaire->fresh()->tenant_signed);
        $this->assertNull($lien->fresh()->used_at);
    }

    public function test_code_faux_refus_et_le_lien_n_est_pas_consomme(): void
    {
        [$jeton, $lien] = $this->lien($this->locataire, 'inventory.sign', $this->inventaire, self::NUMERO_DU_LIEN);
        $code = $this->demanderLeCode($jeton);

        $this->postJson("/api/a/{$jeton}", ['signature' => self::SIGNATURE, 'code' => $code === '000000' ? '111111' : '000000'])
            ->assertUnprocessable()->assertJsonPath('code', 'action_link.code_invalid');

        $this->assertFalse((bool) $this->inventaire->fresh()->tenant_signed);
        $this->assertNull($lien->fresh()->used_at);
    }

    public function test_code_juste_signe_et_consomme_le_lien(): void
    {
        [$jeton, $lien] = $this->lien($this->locataire, 'inventory.sign', $this->inventaire, self::NUMERO_DU_LIEN);
        $code = $this->demanderLeCode($jeton);

        $this->postJson("/api/a/{$jeton}", ['signature' => self::SIGNATURE, 'code' => $code])
            ->assertOk()->assertJsonPath('data.state', 'done')->assertJsonPath('data.object.tenant_signed', true);

        $this->assertTrue((bool) $this->inventaire->fresh()->tenant_signed);
        $this->assertSame(hash('sha256', self::SIGNATURE), $this->inventaire->fresh()->tenant_signature_hash);
        $this->assertNotNull($lien->fresh()->used_at);
        $this->postJson("/api/a/{$jeton}", ['signature' => self::SIGNATURE, 'code' => $code])->assertStatus(410);
    }

    /** La preuve du code est gardée comme sur place (ADR-0098 § 5) : méthode `link_otp`, canal, numéro masqué ; jamais le code. */
    public function test_la_signature_par_lien_garde_la_preuve_du_code(): void
    {
        [$jeton] = $this->lien($this->locataire, 'inventory.sign', $this->inventaire, self::NUMERO_DU_LIEN);
        $code = $this->demanderLeCode($jeton);

        $this->postJson("/api/a/{$jeton}", ['signature' => self::SIGNATURE, 'code' => $code])->assertOk();

        $signe = $this->inventaire->fresh();
        $this->assertSame(Inventory::TENANT_METHOD_LINK_OTP, $signe->tenant_signature_method);
        $this->assertSame('sms', $signe->tenant_otp_channel);
        $this->assertSame(LeaseSignatureService::maskPhone(self::NUMERO_DU_LIEN), $signe->tenant_otp_destination);
        $this->assertNotNull($signe->tenant_signed_ip);
        $this->assertNull($signe->tenant_signed_via_user_id);
        $this->assertStringNotContainsString($code, $signe->tenant_otp_channel.'|'.$signe->tenant_otp_destination);
        $this->assertNotSame(self::NUMERO_DU_LIEN, $signe->tenant_otp_destination);
    }

    public function test_un_code_juste_sans_signature_est_refuse_et_ne_consomme_ni_le_lien_ni_le_code(): void
    {
        [$jeton, $lien] = $this->lien($this->locataire, 'inventory.sign', $this->inventaire, self::NUMERO_DU_LIEN);
        $code = $this->demanderLeCode($jeton);

        $this->postJson("/api/a/{$jeton}", ['code' => $code])->assertUnprocessable()->assertJsonValidationErrors(['signature']);
        $this->postJson("/api/a/{$jeton}", ['code' => $code, 'signature' => ''])->assertUnprocessable();

        $this->assertFalse((bool) $this->inventaire->fresh()->tenant_signed);
        $this->assertNull($lien->fresh()->used_at);
        // Le code n'a pas été essayé : il sert encore.
        $this->postJson("/api/a/{$jeton}", ['signature' => self::SIGNATURE, 'code' => $code])->assertOk();
    }

    public function test_le_code_part_au_numero_du_lien_et_pas_au_compte(): void
    {
        [$jeton] = $this->lien($this->locataire, 'inventory.sign', $this->inventaire, self::NUMERO_DU_LIEN);

        $this->postJson("/api/a/{$jeton}/code")->assertOk()->assertJsonPath('data.channel', 'sms');

        Notification::assertSentOnDemand(
            LeaseSignatureCodeNotification::class,
            fn ($n, array $canaux, AnonymousNotifiable $a) => ($a->routes['sms'] ?? null) === self::NUMERO_DU_LIEN,
        );
        Notification::assertNotSentTo($this->locataire, LeaseSignatureCodeNotification::class);
    }

    /** Sans `Notification::fake()` : le code passe par le VRAI `SmsChannel` et le pilote SMS de test, au numéro du lien. */
    public function test_le_code_part_par_le_vrai_canal_sms_au_numero_du_lien(): void
    {
        Notification::swap(new ChannelManager($this->app));
        // Le seul faux est le routeur des fournisseurs : `SmsChannel` est le vrai.
        $sms = FakeSmsRouter::install();
        [$jeton, $lien] = $this->lien($this->locataire, 'inventory.sign', $this->inventaire, self::NUMERO_DU_LIEN);

        $this->postJson("/api/a/{$jeton}/code")->assertOk()->assertJsonPath('data.channel', 'sms');

        $this->assertCount(1, $sms->sent);
        $this->assertCount(1, $sms->sentTo(self::NUMERO_DU_LIEN));
        $this->assertSame([], $sms->sentTo((string) $this->locataire->phone));
        $this->assertSame(1, preg_match('/\b(\d{6})\b/', $sms->sent[0]['message'], $m));
        $this->postJson("/api/a/{$jeton}", ['signature' => self::SIGNATURE, 'code' => $m[1]])->assertOk();
        $this->assertNotNull($lien->fresh()->used_at);
    }

    public function test_le_code_n_est_envoye_que_pour_un_lien_de_signature(): void
    {
        $this->monterLaSceneDuLien();
        [$jeton] = $this->lien($this->bailleur, 'property_visit.confirm', $this->visiteAConfirmer(), self::NUMERO_DU_LIEN);

        $this->postJson("/api/a/{$jeton}/code")->assertNotFound();
        Notification::assertNothingSent();
    }

    private function demanderLeCode(string $jeton): string
    {
        $this->postJson("/api/a/{$jeton}/code")->assertOk();
        $code = null;
        Notification::assertSentOnDemand(LeaseSignatureCodeNotification::class, function (LeaseSignatureCodeNotification $n) use (&$code): bool {
            $code = $n->code;

            return true;
        });

        return (string) $code;
    }
}
