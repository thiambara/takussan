<?php

namespace Tests\Feature\Boost;

use App\Domain\Settings\EditablePlatformSettings;
use App\Models\User;
use App\Services\Admin\PlatformSettingService;
use App\Services\Boost\BoostSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/** TCK-633 lot F (ADR-0061 §6, AC16) — six réglages, leurs défauts, leurs bornes, et un seul lecteur. */
class BoostSettingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_les_defauts_sont_ceux_de_l_adr(): void
    {
        $s = app(BoostSettings::class);

        $this->assertSame(500, $s->welcomeAmount());
        $this->assertSame(180, $s->welcomeValidityDays());
        $this->assertSame(7, $s->expiryNoticeDays());
        $this->assertSame(24, $s->bumpCooldownHours());
        $this->assertSame(3, $s->sponsoredSlotsPerPage());
        $this->assertSame(2, $s->reservedTopResults());
    }

    public function test_une_valeur_reglee_par_la_console_est_lue(): void
    {
        app(PlatformSettingService::class)->bulkUpdate(['boost.reserved_top_results' => 0, 'credits.welcome_amount' => 250], User::factory()->create());

        $this->assertSame(0, app(BoostSettings::class)->reservedTopResults());
        $this->assertSame(250, app(BoostSettings::class)->welcomeAmount());
    }

    public function test_les_bornes_sont_appliquees(): void
    {
        $this->expectException(ValidationException::class);
        app(PlatformSettingService::class)->bulkUpdate(['boost.sponsored_slots_per_page' => 50], User::factory()->create());
    }

    public function test_les_six_cles_sont_au_catalogue(): void
    {
        foreach (['credits.welcome_amount', 'credits.welcome_validity_days', 'credits.expiry_notice_days', 'boost.bump_cooldown_hours', 'boost.sponsored_slots_per_page', 'boost.reserved_top_results'] as $cle) {
            $this->assertTrue(EditablePlatformSettings::has($cle), $cle);
            $this->assertSame('boost', EditablePlatformSettings::get($cle)['category']);
        }
    }
}
