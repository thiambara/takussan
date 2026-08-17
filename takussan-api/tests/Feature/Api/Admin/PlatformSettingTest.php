<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Enums\SettingScope;
use App\Models\Setting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

class PlatformSettingTest extends TestCase
{
    use RefreshDatabase;

    public function test_super_admin_can_update_whitelisted_settings_and_cache_is_refreshed(): void
    {
        $actor = $this->actingAsRole('super_admin');
        Cache::put('platform_settings.editable', [
            'currency.default' => ['value' => 'USD', 'updated_at' => null, 'updated_by' => null],
        ], now()->addMinutes(10));

        $this->patchJson('/api/admin/settings', [
            'currency.default' => 'EUR',
            'currency.supported' => ['XOF', 'EUR'],
            'transaction.platform_fee_booking' => 12.5,
        ])->assertOk()
            ->assertJsonPath('data.currency.0.key', 'currency.default')
            ->assertJsonPath('data.currency.0.value', 'EUR');

        $this->assertSame('EUR', Setting::query()->where('key', 'currency.default')->first()->value);
        $this->assertSame('EUR', Cache::get('platform_settings.editable')['currency.default']['value']);

        $activity = Activity::query()->where('event', 'super_admin_setting_updated')->latest('id')->first();
        $this->assertNotNull($activity);
        $this->assertSame($actor->id, $activity->causer_id);
        $this->assertSame('transaction.platform_fee_booking', $activity->properties['key']);
        $this->assertSame(0, $activity->properties['old_value']);
        $this->assertSame(12.5, $activity->properties['new_value']);
    }

    public function test_unknown_setting_key_is_rejected(): void
    {
        $this->actingAsRole('super_admin');

        $this->patchJson('/api/admin/settings', [
            'platform.secret_quota' => 99,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('platform.secret_quota');
    }

    public function test_xof_cannot_be_removed_from_supported_currencies(): void
    {
        $this->actingAsRole('super_admin');

        $this->patchJson('/api/admin/settings', [
            'currency.supported' => ['EUR', 'USD'],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('currency.supported');
    }

    public function test_platform_fee_is_bounded_to_two_decimal_places(): void
    {
        $this->actingAsRole('super_admin');

        $this->patchJson('/api/admin/settings', [
            'transaction.platform_fee_booking' => 100.01,
        ])->assertUnprocessable();

        $this->patchJson('/api/admin/settings', [
            'transaction.platform_fee_booking' => 12.345,
        ])->assertUnprocessable();

        $this->patchJson('/api/admin/settings', [
            'transaction.platform_fee_booking' => 100.00,
        ])->assertOk();
    }

    public function test_public_settings_exclude_internal_keys(): void
    {
        Setting::create([
            'key' => 'currency.default',
            'value' => 'EUR',
            'scope' => SettingScope::Global,
        ]);
        Setting::create([
            'key' => 'transaction.platform_fee_booking',
            'value' => 8,
            'scope' => SettingScope::Global,
        ]);

        $this->getJson('/api/settings/public')
            ->assertOk()
            ->assertJsonPath('data.currency.default', 'EUR')
            ->assertJsonMissingPath('data.transaction.platform_fee_booking')
            ->assertHeader('Cache-Control', 'max-age=300, public');
    }

    public function test_agency_admin_is_forbidden(): void
    {
        $this->actingAsRole('agency_admin');

        $this->getJson('/api/admin/settings')->assertForbidden();
        $this->patchJson('/api/admin/settings', ['currency.default' => 'EUR'])->assertForbidden();
    }
}
