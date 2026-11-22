<?php

namespace Tests\Feature\Owners;

use App\Models\Agency;
use App\Models\Document;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2753 (r2 de la contre-vérification, ADR-0108 § 5) — le dossier d'un bailleur parti ou
 * suspendu est figé : ni pièce d'identité (`kyc/upload`), ni soumission (`kyc/submit`), ni NINEA
 * (`tax-id`). Avant la garde, les trois rendaient 201/200 après le départ : le bailleur parti
 * écrivait encore sur son profil d'agence.
 *
 * Fixture : une agence A, son administrateur Ad, le bailleur L (profil P dans A), sans bien.
 */
class OwnerDepartedDossierTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private const NINEA = '0 123 456 7G2';

    private Agency $agency;

    private User $admin;

    private User $landlord;

    private OwnerProfile $profile;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-20 10:00:00');
        $this->agency = Agency::factory()->create(['kind' => AgencyKind::Standard, 'commission_rate' => 8, 'is_verified' => true]);
        $this->admin = $this->agencyAdmin($this->agency);
        $this->landlord = User::factory()->withOwnerProfile($this->agency)->create(['phone_verified_at' => now()]);
        $this->profile = OwnerProfile::query()->where('user_id', $this->landlord->id)->firstOrFail();
    }

    private function asUser(User $u): void
    {
        $this->app['auth']->forgetGuards();
        $this->actingAs($u->fresh(), 'sanctum');
    }

    private function partir(): void
    {
        $this->asUser($this->admin);
        $this->deleteJson("/api/owners/{$this->profile->id}")->assertOk();
        $this->assertSame(OwnerProfileStatus::Inactive, $this->profile->fresh()->status);
    }

    private function televerser(): TestResponse
    {
        return $this->postJson("/api/me/owner-profiles/{$this->profile->id}/kyc/upload", [
            'kind' => 'cni', 'file' => UploadedFile::fake()->create('piece.pdf', 300, 'application/pdf'),
        ]);
    }

    private function assertFige(): void
    {
        $ninea = $this->profile->fresh()->tax_id;
        $this->asUser($this->landlord);

        $this->televerser()->assertForbidden()->assertJsonPath('code', 'owner.profile_read_only');
        $this->postJson("/api/me/owner-profiles/{$this->profile->id}/kyc/submit")
            ->assertForbidden()->assertJsonPath('code', 'owner.profile_read_only');
        $this->patchJson("/api/me/owner-profiles/{$this->profile->id}/tax-id", ['tax_id' => self::NINEA])
            ->assertForbidden()->assertJsonPath('code', 'owner.profile_read_only');
        // L'autorisation précède la validation : un corps invalide ne renseigne pas sur les règles.
        $this->patchJson("/api/me/owner-profiles/{$this->profile->id}/tax-id", ['tax_id' => ''])
            ->assertForbidden()->assertJsonPath('code', 'owner.profile_read_only');

        $profil = $this->profile->fresh();
        $this->assertSame($ninea, $profil->tax_id);
        $this->assertEmpty($profil->metadata['kyc']['submitted_at'] ?? null);
        $this->assertSame(0, Document::query()
            ->where('documentable_type', OwnerProfile::class)->where('documentable_id', $profil->id)->count());
    }

    public function test_temoin_le_bailleur_actif_tient_son_dossier(): void
    {
        $this->asUser($this->landlord);

        $this->televerser()->assertCreated();
        $this->postJson("/api/me/owner-profiles/{$this->profile->id}/kyc/submit")->assertOk();
        $this->patchJson("/api/me/owner-profiles/{$this->profile->id}/tax-id", ['tax_id' => self::NINEA])->assertOk();
        $this->assertSame('01234567G2', $this->profile->fresh()->tax_id);
    }

    public function test_le_dossier_d_un_bailleur_parti_est_fige(): void
    {
        $this->partir();

        $this->assertFige();
    }

    public function test_le_dossier_d_un_bailleur_suspendu_est_fige(): void
    {
        $this->profile->forceFill(['status' => OwnerProfileStatus::Blocked])->save();

        $this->assertFige();
    }

    public function test_les_libelles_existent_dans_les_trois_langues(): void
    {
        foreach (['fr', 'en', 'wo'] as $langue) {
            $this->assertNotSame('errors.owner.profile_read_only', __('errors.owner.profile_read_only', [], $langue), $langue);
        }
    }
}
