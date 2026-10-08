<?php

namespace Tests\Feature\Admin\Platform;

use App\Domain\Settings\EditablePlatformSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-600 — AC15 : la console n'édite que des clés qu'un code lit, et l'API ne sert plus de
 * libellé (le front traduit par clé).
 */
class PlatformSettingsCatalogueTest extends TestCase
{
    use RefreshDatabase;

    public function test_le_catalogue_se_reduit_aux_trois_cles_lues(): void
    {
        $this->assertSame(
            ['currency.default', 'currency.supported', 'platform.session_max_minutes'],
            array_keys(EditablePlatformSettings::all()),
        );
    }

    public function test_la_console_sert_les_cles_sans_libelle_ni_description(): void
    {
        $this->actingAsRole('super_admin');

        $groupes = $this->getJson('/api/admin/settings')->assertOk()->json('data');
        $entrees = collect($groupes)->flatten(1);

        $this->assertEqualsCanonicalizing(
            ['currency.default', 'currency.supported', 'platform.session_max_minutes'],
            $entrees->pluck('key')->all(),
        );
        foreach ($entrees as $entree) {
            $this->assertArrayNotHasKey('label', $entree);
            $this->assertArrayNotHasKey('description', $entree);
        }
    }
}
