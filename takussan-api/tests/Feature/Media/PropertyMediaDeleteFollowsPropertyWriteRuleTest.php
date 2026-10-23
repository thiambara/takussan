<?php

namespace Tests\Feature\Media;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-1496 (P116.06) — supprimer (et signer) le média d'un bien par `/api/media/{m}` se juge par la
 * règle d'écriture du bien, `PropertyPolicy::update`, et non plus par « être admin de l'agence ».
 *
 * Avant : un admin dont le rôle retire `properties.update_any` supprimait la photo d'un bien qu'il
 * ne peut pas modifier (204), un agent qui porte la capacité recevait 403.
 */
class PropertyMediaDeleteFollowsPropertyWriteRuleTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private Property $property;

    private int $mediaId;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake(config('media-library.disk_name'));
        Storage::fake(config('media-library.public_disk_name'));

        $this->agency = Agency::factory()->create();
        $landlord = User::factory()->withOwnerProfile($this->agency)->create();
        $this->property = Property::factory()->create(['user_id' => $landlord->id, 'agency_id' => $this->agency->id]);
        $this->mediaId = $this->property
            ->addMedia(UploadedFile::fake()->image('photo.jpg', 300, 300))
            ->toMediaCollection('photos')
            ->id;
    }

    public function test_un_admin_sans_properties_update_any_ne_supprime_pas_la_photo(): void
    {
        $admin = $this->adminWithout($this->agency, Capability::PropertiesUpdateAny);
        $this->assertFalse($admin->can('update', $this->property));

        $this->actingAsApi($admin)->deleteJson("/api/media/{$this->mediaId}")->assertForbidden();

        $this->assertDatabaseHas('media', ['id' => $this->mediaId]);
    }

    public function test_un_agent_qui_porte_properties_update_any_supprime_la_photo(): void
    {
        $agent = $this->agentWith($this->agency, Capability::PropertiesUpdateAny);
        $this->assertTrue($agent->can('update', $this->property));

        $this->actingAsApi($agent)->deleteJson("/api/media/{$this->mediaId}")->assertNoContent();

        $this->assertDatabaseMissing('media', ['id' => $this->mediaId]);
    }

    public function test_l_admin_du_role_systeme_garde_le_geste(): void
    {
        $this->actingAsApi($this->agencyAdmin($this->agency))
            ->deleteJson("/api/media/{$this->mediaId}")
            ->assertNoContent();
    }

    public function test_le_personnel_d_une_autre_agence_est_refuse(): void
    {
        $this->actingAsApi($this->agencyAdmin(Agency::factory()->create()))
            ->deleteJson("/api/media/{$this->mediaId}")
            ->assertForbidden();
    }
}
