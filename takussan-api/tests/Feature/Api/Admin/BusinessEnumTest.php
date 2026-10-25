<?php

namespace Tests\Feature\Api\Admin;

use App\Domain\Settings\EditableBusinessEnums;
use App\Models\Enums\PropertyType;
use App\Models\Property;
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

    /**
     * P66.02 (TCK-1056) : la console ne désactive plus de valeur. Aucune écriture de bien ne lisait
     * le drapeau : une valeur « désactivée » restait acceptée par `POST /api/properties` et
     * proposée par tous les formulaires, qui lisent la liste du code.
     */
    public function test_console_refuses_deactivating_a_value(): void
    {
        $this->actingAsRole('super_admin');

        $status = $this->deleteJson('/api/admin/enums/property_type/values/farm')->status();
        $this->assertContains($status, [404, 405], "la désactivation a répondu {$status}");

        $this->patchJson('/api/admin/enums/property_type/values/farm', ['is_active' => false]);

        $this->assertFalse(Activity::query()->where('event', 'super_admin_enum_value_deactivated')->exists());
        $this->getJson('/api/enums/property_type')
            ->assertOk()
            ->assertJsonPath('data.values', fn (array $values) => collect($values)->contains(
                fn (array $value) => $value['value'] === 'farm' && $value['is_active'] === true
            ));
    }

    /**
     * P66.03 (TCK-1057) : la console n'édite plus les libellés FR / EN / WO. Aucun rendu ne les
     * lisait : `type_label` vient de `lang/`, et le front possède le texte affiché (principe n° 5).
     */
    public function test_console_refuses_editing_labels(): void
    {
        $this->actingAsRole('super_admin');

        $status = $this->patchJson('/api/admin/enums/property_type/values/villa', [
            'labels' => ['fr' => 'Villa premium', 'en' => 'Premium villa'],
        ])->status();
        $this->assertContains($status, [404, 405], "l'édition des libellés a répondu {$status}");

        $this->assertDatabaseMissing('settings', ['key' => 'enum.property_type.values']);
        $this->assertFalse(Activity::query()->where('event', 'super_admin_enum_value_updated')->exists());
    }

    /**
     * P28.02 (TCK-844) : la lecture publique `/api/enums/{key}` ne porte pas `usage_count`, compté
     * sur toute la table `properties`, brouillons et biens d'autres agences compris. La console
     * super-admin le garde, en lecture seule (TCK-1057).
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

    /**
     * P06.12 (TCK-2336) : la console rend le libellé de chaque entrée par
     * `admin.businessEnums.<key>.name/description`, côté front (principe n° 5). L'identifiant stable
     * `key` est donc le contrat ; `name` et `description` restent dans la réponse, en repli pour une
     * entrée que le front ne connaît pas encore.
     */
    public function test_console_catalogue_emits_the_stable_key_of_each_entry_with_its_name(): void
    {
        $this->actingAsRole('super_admin');

        $entries = collect($this->getJson('/api/admin/enums')->assertOk()->json('data'));

        $this->assertSame(array_keys(EditableBusinessEnums::all()), $entries->pluck('key')->all());
        foreach ($entries as $entry) {
            $definition = EditableBusinessEnums::get($entry['key']);
            $this->assertSame($definition['name'], $entry['name'], "name de {$entry['key']}");
            $this->assertSame($definition['description'], $entry['description'], "description de {$entry['key']}");
        }
    }
}
