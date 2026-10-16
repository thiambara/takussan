<?php

namespace Tests\Feature\Admin\Platform;

use App\Domain\Settings\EditablePlatformSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-600 — AC15 : la console n'édite que des clés qu'un code lit, et l'API ne sert plus de
 * libellé (le front traduit par clé). TCK-651 (ADR-0065) y ajoute les cinq réglages métier.
 */
class PlatformSettingsCatalogueTest extends TestCase
{
    use RefreshDatabase;

    public function test_le_catalogue_se_reduit_aux_quatorze_cles_lues(): void
    {
        $this->assertSame(
            [
                'currency.default', 'currency.supported', 'platform.session_max_minutes',
                'credits.welcome_amount', 'credits.welcome_validity_days', 'credits.expiry_notice_days',
                'boost.bump_cooldown_hours', 'boost.sponsored_slots_per_page', 'boost.reserved_top_results',
                // TCK-651 (ADR-0065) — les réglages métier à repli par agence.
                'invoice.reminder_offsets_days', 'lease.rent_review_max_pct',
                'lease.early_termination_penalty_months', 'lease.require_signature', 'late_fees.cap_percent',
            ],
            array_keys(EditablePlatformSettings::all()),
        );
    }

    public function test_la_console_sert_les_cles_sans_libelle_ni_description(): void
    {
        $this->actingAsRole('super_admin');

        $groupes = $this->getJson('/api/admin/settings')->assertOk()->json('data');
        $entrees = collect($groupes)->flatten(1);

        $this->assertEqualsCanonicalizing(
            [
                'currency.default', 'currency.supported', 'platform.session_max_minutes',
                'credits.welcome_amount', 'credits.welcome_validity_days', 'credits.expiry_notice_days',
                'boost.bump_cooldown_hours', 'boost.sponsored_slots_per_page', 'boost.reserved_top_results',
                // TCK-651 (ADR-0065) — les réglages métier à repli par agence.
                'invoice.reminder_offsets_days', 'lease.rent_review_max_pct',
                'lease.early_termination_penalty_months', 'lease.require_signature', 'late_fees.cap_percent',
            ],
            $entrees->pluck('key')->all(),
        );
        foreach ($entrees as $entree) {
            $this->assertArrayNotHasKey('label', $entree);
            $this->assertArrayNotHasKey('description', $entree);
        }
    }
}
