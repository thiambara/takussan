<?php

namespace Tests\Feature\Audit;

use App\Http\Controllers\Api\Admin\CrossTenantAuditController;
use App\Models\Activity;
use App\Models\Agency;
use App\Services\Privacy\PersonalDataAccessLogger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\ApiTestCase;

/**
 * TCK-601 (AC17) — l'audit de la console s'exporte en CSV par lien signé, avec les filtres de
 * l'index et le préréglage « Gestes sensibles » ; les valeurs expurgées n'y figurent pas, l'export
 * est journalisé, et il est refusé à un admin d'agence.
 */
class CrossTenantAuditExportTest extends ApiTestCase
{
    use RefreshDatabase;

    private function seedLogs(): void
    {
        $agency = Agency::factory()->create();
        activity(PersonalDataAccessLogger::LOG_NAME)->performedOn($agency)->event('personal_data_viewed')->log('temoin-sensible');
        activity('Property')->performedOn($agency)->event('updated')
            ->withProperties(['attributes' => ['rib' => 'RIBTEMOIN', 'title' => 'Titre']])
            ->log('temoin-ordinaire');
    }

    private function download(string $url): string
    {
        $response = $this->get($url)->assertOk();

        return $response->streamedContent();
    }

    public function test_l_export_rend_un_lien_signe_qui_respecte_les_filtres(): void
    {
        Storage::fake();
        $this->seedLogs();
        $admin = $this->apiActingAsRole('super_admin');

        $all = $this->apiGet('/api/admin/audit/export')->assertOk()->assertJsonStructure(['data' => ['url', 'expires_at', 'count']]);
        $content = $this->download($all->json('data.url'));
        $this->assertStringContainsString('temoin-sensible', $content);
        $this->assertStringContainsString('temoin-ordinaire', $content);
        $this->assertStringNotContainsString('RIBTEMOIN', $content);
        $this->assertStringContainsString('[REDACTED]', $content);

        $sensitive = $this->apiGet('/api/admin/audit/export?filter[sensitive]=1')->assertOk();
        // La consultation témoin, et le premier export : un export est lui-même un geste sensible.
        $this->assertSame(2, $sensitive->json('data.count'));
        $content = $this->download($sensitive->json('data.url'));
        $this->assertStringContainsString('temoin-sensible', $content);
        $this->assertStringNotContainsString('temoin-ordinaire', $content);

        $byLog = $this->download($this->apiGet('/api/admin/audit/export?filter[log_name]=Property')->json('data.url'));
        $this->assertStringContainsString('temoin-ordinaire', $byLog);
        $this->assertStringNotContainsString('temoin-sensible', $byLog);

        // L'export est lui-même un geste sensible, journalisé.
        $this->assertSame(3, Activity::query()->where('log_name', 'export')->where('event', 'audit_exported')->where('causer_id', $admin->id)->count());
        $this->assertContains('export', CrossTenantAuditController::SENSITIVE_LOG_NAMES);
    }

    public function test_le_lien_falsifie_est_refuse(): void
    {
        Storage::fake();
        $this->seedLogs();
        $this->apiActingAsRole('super_admin');

        $url = $this->apiGet('/api/admin/audit/export')->json('data.url');

        $this->get(str_replace('exports%2Faudit%2F', 'exports%2Faudit%2Fx', $url))->assertForbidden();
    }

    public function test_le_prereglage_filtre_aussi_l_index(): void
    {
        $this->seedLogs();
        $this->apiActingAsRole('super_admin');

        $descriptions = collect($this->apiGet('/api/admin/audit?filter[sensitive]=1')->assertOk()->json('data'))->pluck('description');

        $this->assertContains('temoin-sensible', $descriptions);
        $this->assertNotContains('temoin-ordinaire', $descriptions);
    }

    public function test_un_admin_d_agence_est_refuse(): void
    {
        $this->apiActingAsRole('agency_admin');

        $this->apiGet('/api/admin/audit/export')->assertForbidden();
    }
}
