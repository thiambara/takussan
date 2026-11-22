<?php

namespace Tests\Feature\Owners;

use App\Models\Agency;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-2640 (AC1) — le téléphone et l'e-mail d'un bailleur du carnet sont ceux de son COMPTE, et
 * ceux saisis à l'invitation (`metadata`) seulement à défaut. Avant, le front ne lisait que
 * `metadata.phone` : un bailleur lié à un compte (owner1 de la démo) s'affichait sans numéro.
 */
class OwnerPhoneFallbackTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_le_telephone_du_compte_passe_avant_celui_de_l_invitation(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create(['phone' => '+221771234567', 'email' => 'compte@example.test']);
        $linked = OwnerProfile::factory()->create([
            'agency_id' => $agency->id, 'user_id' => $user->id,
            'metadata' => ['phone' => '+221700000000', 'email' => 'invitation@example.test'],
        ]);
        $sansNumero = OwnerProfile::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => User::factory()->create(['phone' => '  '])->id,
            'metadata' => ['phone' => '+221781112233'],
        ]);
        $draft = OwnerProfile::factory()->draft()->create(['agency_id' => $agency->id]);

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $rows = collect($this->apiGet('/api/owners?per_page=100')->assertOk()->json('data'))->keyBy('id');
        $this->assertSame('+221771234567', $rows[$linked->id]['contact_phone']);
        $this->assertSame('compte@example.test', $rows[$linked->id]['contact_email']);
        $this->assertSame('+221781112233', $rows[$sansNumero->id]['contact_phone']);
        $this->assertSame($draft->metadata['phone'], $rows[$draft->id]['contact_phone']);
        $this->assertSame($draft->metadata['email'], $rows[$draft->id]['contact_email']);

        $this->apiGet("/api/owners/{$linked->id}")->assertOk()
            ->assertJsonPath('data.contact.phone', '+221771234567')
            ->assertJsonPath('data.contact.email', 'compte@example.test');
        $this->apiGet("/api/owners/{$sansNumero->id}")->assertOk()->assertJsonPath('data.contact.phone', '+221781112233');
        $this->apiGet("/api/owners/{$draft->id}")->assertOk()->assertJsonPath('data.contact.phone', $draft->metadata['phone']);
    }

    /** Les colonnes de contact suivent les sparse fieldsets : demandées ou non, la ligne reste juste. */
    public function test_les_colonnes_de_contact_tiennent_sous_un_sparse_fieldset(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create(['phone' => '+221771234567']);
        $profile = OwnerProfile::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id]);

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $row = collect($this->apiGet('/api/owners?fields[owner_profiles]=id,status&per_page=100')->assertOk()->json('data'))
            ->firstWhere('id', $profile->id);
        $this->assertSame('+221771234567', $row['contact_phone']);
        $this->assertSame(0, $row['properties_count']);
    }
}
