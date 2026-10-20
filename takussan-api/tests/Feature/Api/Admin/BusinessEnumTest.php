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

    /**
     * P66.01 (TCK-1055) : la console n'ajoute plus de valeur. La liste vit dans l'enum PHP
     * (ADR-0007) : une valeur ajoutée par la console était acceptée ici puis refusée en 422 à la
     * création d'un bien, parce que la validation et le cast ne connaissent que l'enum.
     */
    public function test_console_refuses_adding_a_value(): void
    {
        $this->actingAsRole('super_admin');

        $status = $this->postJson('/api/admin/enums/property_type/values', [
            'value' => 'lodge',
            'labels' => ['fr' => 'Lodge', 'en' => 'Lodge'],
            'is_active' => true,
        ])->status();
        $this->assertContains($status, [404, 405], "l'ajout de valeur a répondu {$status}");

        $this->assertDatabaseMissing('settings', ['key' => 'enum.property_type.values']);
        $this->assertFalse(Activity::query()->where('event', 'super_admin_enum_value_added')->exists());
        $this->getJson('/api/enums/property_type')
            ->assertOk()
            ->assertJsonPath('data.values', fn (array $values) => collect($values)->pluck('value')->all()
                === array_map(fn (PropertyType $case) => $case->value, PropertyType::cases()));
    }

    public function test_unknown_enum_is_rejected_as_not_editable(): void
    {
        $this->actingAsRole('super_admin');

        $this->getJson('/api/admin/enums/payment_status')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('key')
            ->assertJsonPath('errors.key.0', 'enum_not_editable');
    }

    public function test_agency_admin_is_forbidden_on_admin_endpoints(): void
    {
        $this->actingAsRole('agency_admin');

        $this->getJson('/api/admin/enums')->assertForbidden();
        $this->getJson('/api/admin/enums/property_type')->assertForbidden();
    }

    public function test_deactivation_returns_409_when_value_is_used(): void
    {
        Property::factory()->create(['type' => PropertyType::Villa]);

        $this->actingAsRole('super_admin');

        $this->deleteJson('/api/admin/enums/property_type/values/villa')
            ->assertStatus(409)
            ->assertJsonPath('code', 'business_enum.value_in_use');
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

    /**
     * P28.02 (TCK-844) : la lecture publique `/api/enums/{key}` ne porte pas `usage_count`, compté
     * sur toute la table `properties`, brouillons et biens d'autres agences compris. La console
     * super-admin le garde : elle s'en sert avant de désactiver une valeur.
     */
    public function test_public_read_does_not_expose_usage_count_and_admin_keeps_it(): void
    {
        Property::factory()->published()->create(['type' => PropertyType::Villa]);
        Property::factory()->draft()->count(2)->create(['type' => PropertyType::Villa]);

        $public = $this->getJson('/api/enums/property_type')->assertOk()->json('data.values');
        $this->assertNotEmpty($public);
        foreach ($public as $value) {
            $this->assertArrayNotHasKey('usage_count', $value, "valeur {$value['value']}");
        }

        $this->actingAsRole('super_admin');
        $admin = collect($this->getJson('/api/admin/enums/property_type')->assertOk()->json('data.values'));
        $this->assertSame(3, $admin->firstWhere('value', 'villa')['usage_count']);
    }
}
