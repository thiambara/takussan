<?php

namespace Tests\Unit\Policies;

use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use App\Policies\MediaPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MediaPolicyTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    private function createSetup(): array
    {
        $admin = User::factory()->create();
        $agency = Agency::factory()->create(['primary_admin_id' => $admin->id]);
        $admin->update(['agency_id' => $agency->id]);

        $property = Property::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => $admin->id,
        ]);

        $media = $property->addMedia(UploadedFile::fake()->image('photo.jpg'))
            ->usingFileName('photo.jpg')
            ->toMediaCollection('photos');

        return [$admin, $agency, $property, $media];
    }

    public function test_super_admin_can_view_raw(): void
    {
        [, , , $media] = $this->createSetup();

        $superAdmin = User::factory()->create();
        $this->materializeRoleProfile($superAdmin, 'super_admin');

        $policy = new MediaPolicy;
        $this->assertTrue($policy->viewRaw($superAdmin, $media));
    }

    public function test_primary_admin_can_view_raw(): void
    {
        [$admin, , , $media] = $this->createSetup();

        $policy = new MediaPolicy;
        $this->assertTrue($policy->viewRaw($admin, $media));
    }

    /**
     * TCK-278 — le trou que la suite laissait ouvert.
     *
     * Les trois autres cas couvrent le super_admin, le `primary_admin_id` et
     * un admin d'une AUTRE agence. Aucun ne couvre l'`agency_admin` de
     * l'agence propriétaire qui n'est PAS le `primary_admin_id` — c'est-à-dire
     * précisément la branche qui dépend de la capacité.
     *
     * Avant le cutover, le rôle spatie `agency_admin` portait
     * `properties.update` (RolesAndPermissionsSeeder, 33ce4f69^) et cet admin
     * accédait à l'original non-filigrané. Après le cutover, la policy testait
     * encore `can('properties.update')` — une chaîne qui n'est **aucun** cas de
     * `Capability` : la Gate n'était jamais définie, et une ability non définie
     * ne lève pas, elle refuse. Retrait d'accès silencieux, invisible sur 2056
     * tests verts.
     */
    public function test_non_primary_agency_admin_of_owning_agency_can_view_raw(): void
    {
        [, $agency, , $media] = $this->createSetup();

        $secondAdmin = User::factory()->create();
        $this->materializeRoleProfile($secondAdmin, 'agency_admin', $agency);

        $this->assertNotSame(
            $agency->primary_admin_id,
            $secondAdmin->id,
            'le cas testé exige un agency_admin qui N’est PAS le primary_admin',
        );

        $policy = new MediaPolicy;
        $this->assertTrue($policy->viewRaw($secondAdmin, $media));
    }

    public function test_agent_other_agency_cannot_view_raw(): void
    {
        [, , , $media] = $this->createSetup();

        $otherAdmin = User::factory()->create();
        $otherAgency = Agency::factory()->create(['primary_admin_id' => $otherAdmin->id]);
        $otherAdmin->update(['agency_id' => $otherAgency->id]);

        $policy = new MediaPolicy;
        $this->assertFalse($policy->viewRaw($otherAdmin, $media));
    }
}
