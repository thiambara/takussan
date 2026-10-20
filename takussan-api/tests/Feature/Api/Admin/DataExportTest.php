<?php

namespace Tests\Feature\Api\Admin;

use App\Jobs\Privacy\PurgeExpiredDataExports;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\DataExport;
use App\Models\Enums\DataExportStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\User;
use App\Services\Privacy\DataExportBuilder;
use App\Support\Audit\PropertyRedactor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;
use ZipArchive;

class DataExportTest extends TestCase
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

    /**
     * TCK-586, AC9 — l'export taisait le profil qui donne le plus de droits. La ligne voisine,
     * celle du courtier, a quitté le code (ADR-0030).
     */
    public function test_l_export_d_un_admin_d_agence_contient_son_profil_d_admin(): void
    {
        $agency = Agency::factory()->create();
        $admin = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);

        $profiles = app(DataExportBuilder::class)->payloads($admin)['profile.json']['profiles'];

        $this->assertSame([$agency->id], array_column($profiles['agency_admins'], 'agency_id'));
        $this->assertArrayNotHasKey('broker', $profiles);
    }

    /**
     * TCK-1017 (P56.02) — l'export d'accès d'un membre ne rend pas les données des tiers qu'il a
     * saisis : pour une ligne dont il n'est que le causeur, l'acte seul ; pour une ligne dont il
     * est le sujet, le diff passé par `PropertyRedactor`.
     */
    public function test_l_export_d_un_agent_ne_contient_ni_l_e_mail_ni_le_telephone_des_clients_qu_il_a_saisis(): void
    {
        $agent = User::factory()->create(['last_name' => 'Avant']);
        $this->actingAs($agent);

        $customer = Customer::factory()->create([
            'email' => 'client.temoin@example.test',
            'phone' => '+221770001122',
        ]);
        $customer->update(['email' => 'client.nouveau@example.test']);
        $agent->update(['last_name' => 'Apres', 'email' => 'agent.nouveau@example.test']);

        $log = app(DataExportBuilder::class)->payloads($agent->refresh())['audit-log.json'];
        $json = json_encode($log, JSON_UNESCAPED_UNICODE);

        $this->assertStringNotContainsString('client.temoin@example.test', $json);
        $this->assertStringNotContainsString('client.nouveau@example.test', $json);
        $this->assertStringNotContainsString('+221770001122', $json);

        $actes = array_values(array_filter($log, fn (array $row) => $row['subject_type'] === Customer::class));
        $this->assertNotEmpty($actes);
        foreach ($actes as $acte) {
            $this->assertSame(['event', 'subject_type', 'subject_id', 'created_at', 'description'], array_keys($acte));
        }

        $propres = array_values(array_filter($log, fn (array $row) => $row['subject_type'] === User::class && $row['event'] === 'updated'));
        $this->assertCount(1, $propres);
        $this->assertSame('Apres', $propres[0]['attribute_changes']['attributes']['last_name']);
        $this->assertSame(PropertyRedactor::REDACTED, $propres[0]['attribute_changes']['attributes']['email']);
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
