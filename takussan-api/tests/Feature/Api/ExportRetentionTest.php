<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\ExportFile;
use App\Models\Lease;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2866 (ADR-0115) — AC4 : le fichier d'un export est gardé `exports.retention_days` jours (7) et
 * se retélécharge par `GET /api/me/exports/{id}/download` — mêmes octets à 2 jours, 410 à 8 jours
 * (avant comme après la purge) ; l'export d'un autre → 403 ; un auteur qui ne pourrait plus le
 * refaire → 403.
 *
 * Le disque privé est simulé (`Storage::fake`, posé par `TestCase`).
 */
class ExportRetentionTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-15 10:00:00');
        $this->agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agency);
        Lease::factory()->count(3)->active()->create(['agency_id' => $this->agency->id]);
        Customer::factory()->count(2)->create(['agency_id' => $this->agency->id, 'first_name' => 'Awa']);
    }

    /** @return array{0: int, 1: string} l'identifiant de « Mes derniers exports » et les octets servis */
    private function exporter(string $entity, string $format = 'csv'): array
    {
        $response = $this->actingAsApi($this->admin)->get("/api/export/{$entity}?format={$format}")->assertOk();
        $bytes = $format === 'csv' ? $response->streamedContent() : (string) $response->getContent();
        $id = $this->actingAsApi($this->admin)->getJson('/api/me/exports')->assertOk()->json('data.0.id');

        return [(int) $id, $bytes];
    }

    private function telecharger(int $id, ?User $as = null): TestResponse
    {
        return $this->actingAsApi($as ?? $this->admin)->get("/api/me/exports/{$id}/download");
    }

    public function test_ac4_a_deux_jours_le_fichier_se_retelecharge_tel_quel(): void
    {
        [$id, $servi] = $this->exporter('leases');

        Carbon::setTestNow(now()->addDays(2));
        $ligne = $this->actingAsApi($this->admin)->getJson('/api/me/exports')->assertOk()->json('data.0');
        $this->assertSame($id, $ligne['id']);
        $this->assertTrue($ligne['file']['available']);
        $this->assertSame('2026-11-22T10:00:00+00:00', $ligne['file']['expires_at']);

        $response = $this->telecharger($id)->assertOk();
        $response->assertHeader('Content-Type', 'text/csv; charset=UTF-8');
        $this->assertSame($servi, $response->streamedContent());
        $this->assertStringContainsString('reference', $servi);
    }

    public function test_un_pdf_se_retelecharge_aux_memes_octets(): void
    {
        [$id, $servi] = $this->exporter('leases', 'pdf');
        $this->assertStringStartsWith('%PDF-', $servi);

        $response = $this->telecharger($id)->assertOk();
        $this->assertStringContainsString('application/pdf', (string) $response->headers->get('Content-Type'));
        $this->assertSame($servi, $response->getContent());
    }

    public function test_ac4_a_huit_jours_410_avant_et_apres_la_purge(): void
    {
        [$id] = $this->exporter('leases');
        $file = ExportFile::query()->sole();
        Storage::disk($file->disk)->assertExists($file->path);

        Carbon::setTestNow(now()->addDays(8));
        $this->telecharger($id)->assertStatus(410)->assertJsonPath('code', 'export.file_expired');
        $this->assertFalse($this->actingAsApi($this->admin)->getJson('/api/me/exports')->json('data.0.file.available'));

        $this->artisan('exports:purge-files')->assertExitCode(0);
        Storage::disk($file->disk)->assertMissing($file->path);
        $this->assertSame(0, ExportFile::query()->count());
        $this->telecharger($id)->assertStatus(410)->assertJsonPath('code', 'export.file_expired');
        $this->assertNull($this->actingAsApi($this->admin)->getJson('/api/me/exports')->json('data.0.file.expires_at'));
    }

    public function test_la_purge_garde_les_fichiers_non_echus(): void
    {
        $this->exporter('leases');
        Carbon::setTestNow(now()->addDays(6));
        $this->artisan('exports:purge-files')->assertExitCode(0);
        $this->assertSame(1, ExportFile::query()->count());
    }

    public function test_ac4_l_export_d_un_autre_est_refuse(): void
    {
        [$id] = $this->exporter('customers');

        $collegue = $this->agencyAdmin($this->agency);
        $this->telecharger($id, $collegue)->assertForbidden();
        $super = User::factory()->create();
        $this->materializeRoleProfile($super, 'super_admin');
        $this->telecharger($id, $super)->assertForbidden();
        $this->assertSame([], $this->actingAsApi($collegue)->getJson('/api/me/exports')->json('data'));
    }

    public function test_un_auteur_qui_a_quitte_l_agence_ne_retelecharge_plus(): void
    {
        [$id] = $this->exporter('customers');

        $this->admin->agencyAdminProfiles()->update(['status' => AgencyAdminProfileStatus::Archived->value]);
        $this->admin->refresh();
        $this->telecharger($id)->assertForbidden()->assertJsonPath('code', 'export.forbidden');
    }

    public function test_un_numero_inconnu_rend_404(): void
    {
        $this->telecharger(999_999)->assertNotFound();
    }
}
