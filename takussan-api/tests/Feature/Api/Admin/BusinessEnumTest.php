<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Enums\PropertyType;
use App\Models\Property;
use App\Models\Setting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

class BusinessEnumTest extends TestCase
{
    use RefreshDatabase;

    public function test_super_admin_can_add_value_and_public_endpoint_returns_it(): void
    {
        $this->actingAsRole('super_admin');

        $this->postJson('/api/admin/enums/property_type/values', [
            'value' => 'lodge',
            'labels' => ['fr' => 'Lodge', 'en' => 'Lodge'],
            'is_active' => true,
        ])->assertCreated()
            ->assertJsonPath('data.key', 'property_type');

        $this->getJson('/api/enums/property_type')
            ->assertOk()
            ->assertJsonPath('data.values', fn (array $values) => collect($values)->contains(
                fn (array $value) => $value['value'] === 'lodge' && $value['labels']['fr'] === 'Lodge'
            ));

        $this->assertDatabaseHas('settings', ['key' => 'enum.property_type.values']);
        $this->assertTrue(Activity::query()->where('event', 'super_admin_enum_value_added')->exists());
    }

    public function test_unknown_enum_is_rejected_as_not_editable(): void
    {
        $this->actingAsRole('super_admin');

        $this->postJson('/api/admin/enums/payment_status/values', [
            'value' => 'custom',
            'labels' => ['fr' => 'Custom'],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('key')
            ->assertJsonPath('errors.key.0', 'enum_not_editable');
    }

    public function test_french_label_is_required(): void
    {
        $this->actingAsRole('super_admin');

        $this->postJson('/api/admin/enums/property_type/values', [
            'value' => 'lodge',
            'labels' => ['en' => 'Lodge'],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('labels.fr');
    }

    public function test_agency_admin_is_forbidden_on_admin_endpoints(): void
    {
        $this->actingAsRole('agency_admin');

        $this->getJson('/api/admin/enums')->assertForbidden();
        $this->postJson('/api/admin/enums/property_type/values', [
            'value' => 'lodge',
            'labels' => ['fr' => 'Lodge'],
        ])->assertForbidden();
    }

    public function test_deactivation_returns_409_when_value_is_used(): void
    {
        Property::factory()->create(['type' => PropertyType::Villa]);

        $this->actingAsRole('super_admin');

        $this->deleteJson('/api/admin/enums/property_type/values/villa')
            ->assertStatus(409)
            ->assertJsonPath('message', 'enum_value_in_use');
    }

    public function test_update_writes_translations_and_audit(): void
    {
        $this->actingAsRole('super_admin');

        $this->patchJson('/api/admin/enums/property_type/values/villa', [
            'labels' => ['fr' => 'Villa premium', 'en' => 'Premium villa'],
        ])->assertOk()
            ->assertJsonPath('data.values.3.labels.fr', 'Villa premium');

        $setting = Setting::firstWhere('key', 'enum.property_type.values');
        $this->assertNotNull($setting);
        $this->assertTrue(Activity::query()->where('event', 'super_admin_enum_value_updated')->exists());
    }
}
