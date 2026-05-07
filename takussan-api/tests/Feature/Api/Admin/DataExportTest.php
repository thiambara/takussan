<?php

namespace Tests\Feature\Api\Admin;

use App\Jobs\Privacy\PurgeExpiredDataExports;
use App\Models\DataExport;
use App\Models\Enums\DataExportStatus;
use App\Models\User;
use App\Services\Privacy\DataExportBuilder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Spatie\Activitylog\Models\Activity;
use Tests\BaseTestCase;
use ZipArchive;

class DataExportTest extends BaseTestCase
{
    use RefreshDatabase;

    public function test_self_request_is_throttled_to_one_per_24h(): void
    {
        Storage::fake('local');
        $this->actingAsRole('customer');

        $this->postJson('/api/me/data-exports')
            ->assertAccepted()
            ->assertJsonPath('data.status', 'ready');

        $this->postJson('/api/me/data-exports')->assertStatus(429);

        $this->assertTrue(Activity::query()->where('event', 'user_data_export_requested')->exists());
    }

    public function test_super_admin_reason_is_required(): void
    {
        $target = User::factory()->create();
        $this->actingAsRole('super_admin');

        $this->postJson("/api/admin/users/{$target->id}/data-exports", [])
            ->assertUnprocessable();
    }

    public function test_download_is_forbidden_to_third_party_and_expired_returns_gone(): void
    {
        Storage::fake('local');
        $owner = User::factory()->create();
        $path = 'data-exports/user-1/export.zip';
        Storage::disk('local')->put($path, 'zip');
        $export = DataExport::query()->create([
            'user_id' => $owner->id,
            'requested_by' => $owner->id,
            'status' => DataExportStatus::Ready,
            'archive_path' => $path,
            'requested_at' => now(),
            'ready_at' => now(),
            'expires_at' => now()->addDay(),
        ]);

        $this->actingAsRole('customer');
        $this->getJson("/api/data-exports/{$export->id}/download")->assertForbidden();

        $this->actingAs($owner);
        $export->update(['expires_at' => now()->subMinute()]);
        $this->getJson("/api/data-exports/{$export->id}/download")->assertStatus(410);
    }

    public function test_builder_outputs_required_domains_and_isolates_other_users(): void
    {
        Storage::fake('local');
        $user = User::factory()->create(['email' => 'alpha@example.test']);
        User::factory()->create(['email' => 'bravo@example.test']);
        $export = DataExport::query()->create([
            'user_id' => $user->id,
            'requested_by' => $user->id,
            'status' => DataExportStatus::Queued,
            'requested_at' => now(),
        ]);

        $ready = app(DataExportBuilder::class)->build($export);

        $zip = new ZipArchive;
        $zip->open(Storage::disk('local')->path($ready->archive_path));
        foreach (DataExportBuilder::DOMAINS as $domain) {
            $this->assertNotFalse($zip->locateName($domain), "Missing {$domain}");
        }
        $profile = $zip->getFromName('profile.json');
        $zip->close();

        $this->assertStringContainsString('alpha@example.test', $profile);
        $this->assertStringNotContainsString('bravo@example.test', $profile);
    }

    public function test_purge_marks_expired_and_deletes_archive(): void
    {
        Storage::fake('local');
        $user = User::factory()->create();
        $path = 'data-exports/user-1/export.zip';
        Storage::disk('local')->put($path, 'zip');
        $export = DataExport::query()->create([
            'user_id' => $user->id,
            'requested_by' => $user->id,
            'status' => DataExportStatus::Ready,
            'archive_path' => $path,
            'requested_at' => now()->subDays(8),
            'ready_at' => now()->subDays(8),
            'expires_at' => now()->subMinute(),
        ]);

        (new PurgeExpiredDataExports)->handle();

        Storage::disk('local')->assertMissing($path);
        $this->assertSame(DataExportStatus::Expired, $export->refresh()->status);
    }
}
