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
