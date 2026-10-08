<?php

namespace Tests\Feature\Privacy;

use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\Enums\AgencyKind;
use App\Models\User;
use App\Services\Privacy\PersonalDataAccessLogger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;

/**
 * TCK-601 (ADR-0044 §1) — AC4b / AC4c : le NINEA et le RIB professionnel d'une demande de passage
 * en agence `standard` sont chiffrés, et le RIB n'est plus recopié dans les métadonnées de l'agence
 * que tout membre lit.
 */
class AgencyUpgradeRequestEncryptionTest extends ApiTestCase
{
    use RefreshDatabase;

    private const NINEA = 'NINEA-TEMOIN-0042';

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake(config('media-library.disk_name'));
        Storage::fake(config('media-library.public_disk_name'));
        Notification::fake();
    }

    private static function longRib(): string
    {
        return 'SNTEMOIN'.str_repeat('7', 52);
    }

    private function submit(Agency $agency, string $rib): AgencyUpgradeRequest
    {
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $this->post("/api/agencies/{$agency->id}/upgrade-requests", [
            'rc' => 'RC-DKR-2026-001',
            'ninea' => self::NINEA,
            'rib_pro' => $rib,
            'company_legal_name' => 'Témoin SARL',
            'address_fiscale' => 'Dakar',
            'statuts_doc' => UploadedFile::fake()->create('statuts.pdf', 200, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertCreated();

        return AgencyUpgradeRequest::query()->where('agency_id', $agency->id)->latest('id')->firstOrFail();
    }

    /** AC4b — en base, aucun témoin ; le modèle les relit ; un RIB de 60 caractères s'enregistre. */
    public function test_le_ninea_et_le_rib_pro_sont_chiffres_en_base(): void
    {
        $rib = self::longRib();
        $this->assertSame(60, strlen($rib));
        $agency = Agency::factory()->individual()->create();

        $request = $this->submit($agency, $rib);

        $raw = DB::table('agency_upgrade_requests')->where('id', $request->id)->first();
        $this->assertStringNotContainsString(self::NINEA, $raw->ninea);
        $this->assertStringNotContainsString('SNTEMOIN', $raw->rib_pro);
        $this->assertSame(self::NINEA, $request->fresh()->ninea);
        $this->assertSame($rib, $request->fresh()->rib_pro);

        // Ni le journal de la soumission.
        $this->assertSame(0, Activity::query()->where('properties', 'like', '%SNTEMOIN%')->count());
    }

    /** AC4c — après approbation, le RIB pro n'est ni dans les métadonnées, ni lisible d'un membre. */
    public function test_le_rib_pro_n_est_plus_recopie_dans_l_agence(): void
    {
        $agency = Agency::factory()->individual()->create(['metadata' => null]);
        $request = $this->submit($agency, self::longRib());

        $this->apiActingAsRole('super_admin');
        $this->apiPost("/api/admin/agency-upgrade-requests/{$request->id}/approve", [])->assertOk();

        $this->assertSame(AgencyKind::Standard, $agency->fresh()->kind);
        $rawMetadata = (string) DB::table('agencies')->where('id', $agency->id)->value('metadata');
        $this->assertStringNotContainsString('SNTEMOIN', $rawMetadata);
        $this->assertStringNotContainsString('rib_pro', $rawMetadata);
        // Les autres champs légaux sont toujours amorcés.
        $this->assertNotNull($agency->fresh()->metadata['legal_info']['company_legal_name'] ?? null);

        foreach (['owner', 'agent', 'agency_admin'] as $role) {
            $this->apiActingAsRole($role, ['agency' => $agency]);
            $body = $this->apiGet("/api/agencies/{$agency->id}")->assertOk()->getContent();
            $this->assertStringNotContainsString('SNTEMOIN', $body, "$role lit le RIB pro");
        }
    }

    /** AC4c — une copie antérieure à la migration est retirée, et la Resource ne la rendrait pas. */
    public function test_une_copie_anterieure_disparait(): void
    {
        $agency = Agency::factory()->create([
            'metadata' => ['legal_info' => ['rib_pro' => 'SNTEMOIN-ANCIEN', 'rc' => 'RC-1'], 'welcome' => ['x' => 1]],
        ]);

        // La Resource, défense contre une donnée antérieure.
        $this->apiActingAsRole('agent', ['agency' => $agency]);
        $this->assertStringNotContainsString('SNTEMOIN', $this->apiGet("/api/agencies/{$agency->id}")->assertOk()->getContent());

        // La migration retire la clé et ne touche rien d'autre.
        $migration = require database_path('migrations/2026_10_08_601200_encrypt_legal_identifiers_on_agency_upgrade_requests.php');
        $migration->up();

        $metadata = $agency->fresh()->metadata;
        $this->assertArrayNotHasKey('rib_pro', $metadata['legal_info']);
        $this->assertSame('RC-1', $metadata['legal_info']['rc']);
        $this->assertSame(['x' => 1], $metadata['welcome']);
    }

    /** Contrainte 7 — le `down()` déchiffre et restitue la copie ; `up()` revient sans perte. */
    public function test_la_migration_fait_l_aller_retour_sans_perte(): void
    {
        $agency = Agency::factory()->create(['metadata' => ['legal_info' => ['rc' => 'RC-1']]]);
        $request = AgencyUpgradeRequest::factory()->create([
            'agency_id' => $agency->id,
            'submitted_by' => User::factory()->create()->id,
            'ninea' => self::NINEA,
            'rib_pro' => 'SNTEMOIN-ALLER-RETOUR',
            'status' => 'approved',
            'reviewed_at' => now(),
        ]);
        $migration = require database_path('migrations/2026_10_08_601200_encrypt_legal_identifiers_on_agency_upgrade_requests.php');

        $migration->down();

        $raw = DB::table('agency_upgrade_requests')->where('id', $request->id)->first();
        $this->assertSame(self::NINEA, $raw->ninea);
        $this->assertSame('SNTEMOIN-ALLER-RETOUR', $raw->rib_pro);
        $legal = json_decode((string) DB::table('agencies')->where('id', $agency->id)->value('metadata'), true)['legal_info'];
        $this->assertSame('SNTEMOIN-ALLER-RETOUR', $legal['rib_pro']);
        $this->assertSame('RC-1', $legal['rc']);

        $migration->up();

        $this->assertSame(self::NINEA, $request->fresh()->ninea);
        $this->assertSame('SNTEMOIN-ALLER-RETOUR', $request->fresh()->rib_pro);
        $this->assertArrayNotHasKey('rib_pro', $agency->fresh()->metadata['legal_info']);
    }

    /** F (A2) — ouvrir le détail d'une demande depuis la console est une consultation tracée. */
    public function test_la_console_trace_la_consultation_du_detail(): void
    {
        $agency = Agency::factory()->individual()->create();
        $request = $this->submit($agency, self::longRib());

        $superAdmin = $this->apiActingAsRole('super_admin');
        $this->apiGet("/api/admin/agency-upgrade-requests/{$request->id}")
            ->assertOk()
            ->assertJsonPath('data.rib_pro', self::longRib());

        $this->assertSame(1, Activity::query()
            ->where('log_name', PersonalDataAccessLogger::LOG_NAME)
            ->where('causer_id', $superAdmin->id)
            ->where('subject_id', $request->id)
            ->where('properties->surface', PersonalDataAccessLogger::SURFACE_AGENCY_UPGRADE_REQUEST)
            ->count());
    }
}
