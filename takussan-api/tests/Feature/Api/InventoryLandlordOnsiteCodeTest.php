<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Notifications\LeaseSignatureCodeNotification;
use App\Services\Signature\SignatureOtpService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-2913 (ADR-0098, amendement A) — le bailleur signe l'état des lieux sur l'appareil d'un membre du
 * personnel, avec le code reçu par SMS au numéro VÉRIFIÉ de son compte : `POST …/sign/onsite-code`
 * avec `party=landlord`, puis `POST …/sign` avec `role=landlord` et le code. La signature est celle
 * DU bailleur, jamais « pour le compte de ». Mêmes bornes que le code du locataire.
 */
class InventoryLandlordOnsiteCodeTest extends TestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private const SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAvMBAOeufn4AAAAASUVORK5CYII=';

    private const OWNER_PHONE = '+221771112233';

    private const TENANT_PHONE = '+221774445566';

    private Agency $agency;

    private User $owner;

    private User $tenantUser;

    private Inventory $inventory;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agency = Agency::factory()->create();
        $this->owner = User::factory()->withOwnerProfile($this->agency)->create(['phone' => self::OWNER_PHONE, 'phone_verified_at' => now()]);
        $property = Property::factory()->create(['user_id' => $this->owner->id, 'agency_id' => $this->agency->id]);
        $this->tenantUser = User::factory()->create(['phone' => self::TENANT_PHONE, 'phone_verified_at' => now()]);
        $tenant = Customer::factory()->create(['user_id' => $this->tenantUser->id]);
        $lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $this->owner->id,
            'tenant_id' => $tenant->id,
            'agency_id' => $this->agency->id,
        ]);
        $this->agent = $this->agencyAgent($this->agency);
        $this->inventory = Inventory::factory()->create([
            'lease_id' => $lease->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'conducted_by' => $this->agent->id,
        ]);
    }

    private function sendCode(User $as, ?string $party = 'landlord'): TestResponse
    {
        Sanctum::actingAs($as);

        return $this->postJson("/api/inventories/{$this->inventory->id}/sign/onsite-code", array_filter(['party' => $party]));
    }

    private function sign(User $as, ?string $code): TestResponse
    {
        Sanctum::actingAs($as);

        return $this->postJson("/api/inventories/{$this->inventory->id}/sign", array_filter([
            'role' => 'landlord',
            'signature' => self::SIGNATURE,
            'code' => $code,
        ], fn ($v) => $v !== null));
    }

    private function lastCodeTo(User $user): string
    {
        $code = null;
        Notification::assertSentTo($user, LeaseSignatureCodeNotification::class, function (LeaseSignatureCodeNotification $n) use (&$code) {
            $code = $n->code;

            return true;
        });

        return (string) $code;
    }

    private function wrongCode(string $right): string
    {
        return $right === '000000' ? '111111' : '000000';
    }

    // ─── AC3 ─────────────────────────────────────────────────────────────────────────────────

    public function test_ac3_le_code_part_au_numero_du_compte_du_bailleur_et_la_signature_est_la_sienne(): void
    {
        $this->sendCode($this->agent)->assertStatus(202)
            ->assertJsonPath('data.channel', 'sms')
            ->assertJsonPath('data.destination', '••••••••••33');

        Notification::assertSentTo($this->owner, LeaseSignatureCodeNotification::class,
            fn (LeaseSignatureCodeNotification $n) => $n->channel === LeaseSignatureCodeNotification::CHANNEL_SMS
                && $n->texts === LeaseSignatureCodeNotification::TEXTS_INVENTORY);
        Notification::assertNotSentTo($this->tenantUser, LeaseSignatureCodeNotification::class);

        $this->sign($this->agent, $this->lastCodeTo($this->owner))->assertOk()
            ->assertJsonPath('data.owner_signed', true)
            ->assertJsonPath('data.owner_signed_by_user_id', $this->owner->id)
            ->assertJsonPath('data.owner_signed_on_behalf_of_user_id', null)
            ->assertJsonPath('data.owner_signature_method', 'onsite_otp')
            ->assertJsonPath('data.owner_signed_via_user_id', $this->agent->id)
            ->assertJsonPath('data.owner_otp_channel', 'sms')
            ->assertJsonPath('data.owner_otp_destination', '••••••••••33')
            ->assertJsonMissingPath('data.owner_signed_ip');

        $row = $this->inventory->refresh();
        $this->assertSame('127.0.0.1', $row->owner_signed_ip);
        $this->assertFalse((bool) $row->tenant_signed, 'la signature du bailleur ne touche pas au locataire');
    }

    public function test_sans_party_le_code_part_toujours_au_locataire(): void
    {
        $this->sendCode($this->agent, null)->assertStatus(202);

        Notification::assertSentTo($this->tenantUser, LeaseSignatureCodeNotification::class);
        Notification::assertNotSentTo($this->owner, LeaseSignatureCodeNotification::class);
    }

    public function test_un_bailleur_sans_numero_verifie_recoit_422(): void
    {
        $this->owner->forceFill(['phone_verified_at' => null])->save();

        $this->sendCode($this->agent)->assertStatus(422)
            ->assertJsonPath('code', 'inventory_signature.landlord_without_phone');
        Notification::assertNothingSent();
    }

    public function test_le_bailleur_lui_meme_ne_lance_pas_la_voie_sur_place(): void
    {
        $this->sendCode($this->owner)->assertForbidden();
        Notification::assertNothingSent();
    }

    public function test_le_personnel_qui_peut_signer_pour_le_compte_sans_code_le_fait_toujours(): void
    {
        $admin = $this->agencyAdmin($this->agency);

        $this->sign($admin, null)->assertOk()
            ->assertJsonPath('data.owner_signed_by_user_id', $admin->id)
            ->assertJsonPath('data.owner_signed_on_behalf_of_user_id', $this->owner->id)
            ->assertJsonPath('data.owner_signature_method', 'drawn');
    }

    public function test_can_sign_as_rend_landlord_onsite_au_personnel_habilite(): void
    {
        Sanctum::actingAs($this->agent);
        $roles = $this->getJson("/api/inventories/{$this->inventory->id}")->assertOk()->json('data.can_sign_as');

        $this->assertContains('landlord_onsite', $roles);

        Sanctum::actingAs($this->owner);
        $roles = $this->getJson("/api/inventories/{$this->inventory->id}")->assertOk()->json('data.can_sign_as');
        $this->assertNotContains('landlord_onsite', $roles);
    }

    // ─── AC4 ─────────────────────────────────────────────────────────────────────────────────

    public function test_ac4_un_code_faux_est_refuse_et_ne_signe_rien(): void
    {
        $this->sendCode($this->agent)->assertStatus(202);
        $right = $this->lastCodeTo($this->owner);

        $this->sign($this->agent, $this->wrongCode($right))->assertStatus(422)->assertJsonValidationErrors('code');

        $this->assertFalse((bool) $this->inventory->refresh()->owner_signed);
    }

    public function test_ac4_au_dela_des_essais_le_code_est_invalide_et_verrouille_comme_pour_le_locataire(): void
    {
        $this->sendCode($this->agent)->assertStatus(202);
        $right = $this->lastCodeTo($this->owner);

        for ($i = 1; $i < SignatureOtpService::MAX_ATTEMPTS; $i++) {
            $this->sign($this->agent, $this->wrongCode($right))->assertStatus(422);
        }
        // Le dernier faux pose le verrou, et le dit.
        $this->sign($this->agent, $this->wrongCode($right))->assertStatus(423)
            ->assertJsonPath('code', 'inventory_signature.code_locked');
        // Le bon code ne vaut plus rien, et aucun nouveau code ne part sous le verrou.
        $this->sign($this->agent, $right)->assertStatus(423);
        $this->travel(61)->seconds();
        $this->sendCode($this->agent)->assertStatus(423);

        $this->assertFalse((bool) $this->inventory->refresh()->owner_signed);
    }

    public function test_le_code_du_bailleur_ne_vaut_pas_pour_le_locataire(): void
    {
        $this->sendCode($this->agent)->assertStatus(202);
        $code = $this->lastCodeTo($this->owner);

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/inventories/{$this->inventory->id}/sign", [
            'role' => 'tenant',
            'signature' => self::SIGNATURE,
            'code' => $code,
        ])->assertStatus(422)->assertJsonValidationErrors('code');

        $this->assertFalse((bool) $this->inventory->refresh()->tenant_signed);
    }
}
