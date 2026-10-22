<?php

namespace Tests\Feature\ServiceProvider;

use App\Models\Agency;
use App\Models\Document;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\DocumentType;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-1325 (P117.06) — le badge « Assuré » du carnet et de l'attribution se dérive du `Document`
 * d'assurance VIVANT du profil (non supprimé, non expiré, fichier présent), jamais d'un drapeau
 * recopié : `metadata.has_insurance` était posé au téléversement et jamais remis à faux.
 */
class ServiceProviderInsuredBadgeTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    private const FIELDS = 'fields[service_provider_profiles]=id,user_id,status,specialties,service_areas,metadata,created_at';

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake(config('media-library.disk_name'));
    }

    public function test_le_carnet_dit_assure_selon_la_piece_d_assurance_vivante(): void
    {
        [$agency, $admin] = $this->agencyWithAdmin();
        $provider = $this->providerFor($agency);
        $profile = ServiceProviderProfile::query()->where('user_id', $provider->id)->sole();

        $this->assertFalse($this->insured($agency, $admin), 'sans pièce');

        Sanctum::actingAs($provider);
        $this->postJson("/api/me/profiles/{$profile->id}/kyc/upload", [
            'file' => UploadedFile::fake()->create('assurance.pdf', 120, 'application/pdf'),
            'kind' => 'insurance',
        ])->assertCreated();

        $this->assertArrayNotHasKey('has_insurance', $profile->refresh()->metadata ?? [], 'plus de drapeau recopié');
        $this->assertTrue($this->insured($agency, $admin), 'pièce vivante');

        $document = Document::query()
            ->where('documentable_type', ServiceProviderProfile::class)
            ->where('documentable_id', $profile->id)
            ->where('type', DocumentType::Insurance)
            ->sole();

        $document->forceFill(['expiry_date' => now()->subDay()->toDateString()])->save();
        $this->assertFalse($this->insured($agency, $admin), 'pièce expirée');

        $document->forceFill(['expiry_date' => now()->addYear()->toDateString()])->save();
        $this->assertTrue($this->insured($agency, $admin), 'pièce valide jusqu’à l’an prochain');

        $document->delete();
        $this->assertFalse($this->insured($agency, $admin), 'pièce supprimée');
    }

    public function test_une_autre_piece_ou_une_piece_sans_fichier_ne_vaut_pas_assurance(): void
    {
        [$agency, $admin] = $this->agencyWithAdmin();
        $provider = $this->providerFor($agency);
        $profile = ServiceProviderProfile::query()->where('user_id', $provider->id)->sole();

        Sanctum::actingAs($provider);
        $this->postJson("/api/me/profiles/{$profile->id}/kyc/upload", [
            'file' => UploadedFile::fake()->create('cni.pdf', 120, 'application/pdf'),
            'kind' => 'cni',
        ])->assertCreated();

        Document::factory()->create([
            'documentable_type' => ServiceProviderProfile::class,
            'documentable_id' => $profile->id,
            'type' => DocumentType::Insurance,
        ]);

        $this->assertFalse($this->insured($agency, $admin));
    }

    private function insured(Agency $agency, User $admin): bool
    {
        Sanctum::actingAs($admin);

        return $this->getJson("/api/agencies/{$agency->id}/service-providers?".self::FIELDS)
            ->assertOk()
            ->json('data.0.insured');
    }

    /** @return array{0: Agency, 1: User} */
    private function agencyWithAdmin(): array
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);

        return [$agency, $admin];
    }
}
