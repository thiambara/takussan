<?php

namespace Tests\Feature\Pont;

use App\Models\Customer;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Notifications\LeaseSignatureCodeNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
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
