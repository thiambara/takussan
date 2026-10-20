<?php

namespace Tests\Feature\Privacy;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\IdType;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Services\Privacy\DataExportBuilder;
use App\Services\Privacy\PersonalDataAccessLogger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;

/**
 * TCK-601 (ADR-0044 §1) — le RIB, le NINEA et le numéro de pièce d'un bailleur : chiffrés en
 * base, masqués dans le carnet, en clair pour l'admin seulement (et tracé), entiers dans l'export du
 * droit d'accès.
 */
class OwnerProfileSensitiveDataTest extends ApiTestCase
{
    use RefreshDatabase;

    private const RIB = 'SN0123456789';

    private const TAX_ID = 'NINEA-7654321';

    private const ID_NUMBER = 'AB12345678';

    /** TCK-956 (ADR-0070) — le revenu mensuel du bailleur suit la même règle. */
    private const REVENU = '350000.00';

    private function ownerOf(Agency $agency, array $overrides = []): OwnerProfile
    {
        return OwnerProfile::factory()->create(array_merge([
            'agency_id' => $agency->id,
            'rib' => self::RIB,
            'tax_id' => self::TAX_ID,
            'id_document_number' => self::ID_NUMBER,
            'monthly_income' => self::REVENU,
        ], $overrides));
    }

    /** AC1 — en base, la valeur saisie n'apparaît pas ; le modèle la relit ; 34 caractères passent. */
    public function test_les_colonnes_sensibles_sont_chiffrees_en_base(): void
    {
        $long = 'SN08SN0100152000048500003035123456';
        $this->assertSame(34, strlen($long));

        $profile = $this->ownerOf(Agency::factory()->create(), ['rib' => $long]);

        $raw = DB::table('owner_profiles')->where('id', $profile->id)->first();
        foreach (['rib' => $long, 'tax_id' => self::TAX_ID, 'id_document_number' => self::ID_NUMBER] as $column => $clear) {
            $this->assertNotSame($clear, $raw->{$column});
            $this->assertStringNotContainsString($clear, (string) $raw->{$column});
            $this->assertSame($clear, Crypt::decryptString($raw->{$column}));
        }

        $fresh = $profile->fresh();
        $this->assertSame($long, $fresh->rib);
        $this->assertSame(self::TAX_ID, $fresh->tax_id);
        $this->assertSame(self::ID_NUMBER, $fresh->id_document_number);
    }

    /** AC2 — le carnet ne rend aucune valeur en clair, à l'agent comme à l'admin ; les masques oui. */
    public function test_le_carnet_ne_rend_que_les_masques(): void
    {
        $agency = Agency::factory()->create();
        $profile = $this->ownerOf($agency);

        foreach (['agent', 'agency_admin'] as $role) {
            $this->apiActingAsRole($role, ['agency' => $agency]);

            $response = $this->apiGet('/api/owners')->assertOk();
            $body = $response->getContent();
            foreach ([self::RIB, self::TAX_ID, self::ID_NUMBER] as $clear) {
                $this->assertStringNotContainsString($clear, $body, "$role lit une valeur en clair");
            }

            $row = collect($response->json('data'))->firstWhere('id', $profile->id);
            $this->assertNotNull($row);
            $this->assertArrayNotHasKey('rib', $row);
            $this->assertArrayNotHasKey('tax_id', $row);
            $this->assertArrayNotHasKey('id_document_number', $row);
            $this->assertSame('SN•• •••• ••89', $row['rib_masked']);
            $this->assertSame('•••• 4321', $row['tax_id_masked']);
            $this->assertSame('•••• 5678', $row['id_document_number_masked']);

            // Second chemin : des sparse fieldsets qui ne demandent pas le RIB rendent quand même
            // son masque, jamais sa valeur.
            $sparse = $this->apiGet('/api/owners?fields[owner_profiles]=id,status')->assertOk();
            $this->assertStringNotContainsString(self::RIB, $sparse->getContent());
            $this->assertSame('SN•• •••• ••89', collect($sparse->json('data'))->firstWhere('id', $profile->id)['rib_masked']);
        }
    }

    /** AC2 — demander les colonnes par `fields[]` est refusé, plutôt que de les rendre. */
    public function test_les_colonnes_sensibles_ne_sont_pas_demandables(): void
    {
        $agency = Agency::factory()->create();
        $this->ownerOf($agency);
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $response = $this->apiGet('/api/owners?fields[owner_profiles]=rib,tax_id');

        $response->assertStatus(400);
        $this->assertStringNotContainsString(self::RIB, $response->getContent());
    }

    /** Second chemin : un profil sérialisé par une relation (`include=ownerProfiles`) ne porte rien. */
    public function test_un_profil_inclus_ailleurs_ne_porte_aucune_valeur(): void
    {
        $agency = Agency::factory()->create();
        $profile = $this->ownerOf($agency);

        $array = User::query()->with('ownerProfiles')->findOrFail($profile->user_id)->toArray();

        $encoded = json_encode($array);
        foreach ([self::RIB, self::TAX_ID, self::ID_NUMBER] as $clear) {
            $this->assertStringNotContainsString($clear, (string) $encoded);
        }
        $this->assertArrayNotHasKey('rib', $array['owner_profiles'][0]);
    }

    /** AC3 — l'admin de l'agence lit les valeurs, et c'est tracé ; l'agent et l'admin d'ailleurs, non. */
    public function test_la_valeur_complete_est_reservee_a_l_admin_et_tracee(): void
    {
        $agency = Agency::factory()->create();
        $profile = $this->ownerOf($agency);

        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        // TCK-589 × 601 — une lecture de secret : sans TOTP récent sur CE jeton, la garde refuse
        // avant le contrôleur, et rien n'est journalisé (un refus n'est pas une consultation).
        $this->apiGet("/api/owners/{$profile->id}/sensitive")
            ->assertForbidden()
            ->assertJsonPath('code', 'two_factor_step_up_required');
        $this->assertSame(0, Activity::query()->where('log_name', PersonalDataAccessLogger::LOG_NAME)->count());

        $this->actingAsWithStepUp($admin);
        $this->apiGet("/api/owners/{$profile->id}/sensitive")
            ->assertOk()
            ->assertJsonPath('data.rib', self::RIB)
            ->assertJsonPath('data.tax_id', self::TAX_ID)
            ->assertJsonPath('data.id_document_number', self::ID_NUMBER);

        $this->assertSame(1, Activity::query()
            ->where('log_name', PersonalDataAccessLogger::LOG_NAME)
            ->where('event', 'personal_data_viewed')
            ->where('causer_id', $admin->id)
            ->where('subject_type', $profile->getMorphClass())
            ->where('subject_id', $profile->id)
            ->count());

        // Les refus suivants sont ceux de la POLICY : chaque lecteur a la 2FA et un step-up frais,
        // pour que la garde de second facteur ne réponde pas à sa place.
        $agent = $this->apiActingAsRole('agent', ['agency' => $agency, 'two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET]);
        $this->actingAsWithStepUp($agent);
        $this->apiGet("/api/owners/{$profile->id}/sensitive")->assertForbidden()->assertJsonPath('code', 'http.forbidden');

        $this->actingAsWithStepUp($this->apiActingAsRole('agency_admin', ['agency' => Agency::factory()->create()]));
        $this->apiGet("/api/owners/{$profile->id}/sensitive")->assertForbidden()->assertJsonPath('code', 'http.forbidden');
    }

    /** AC4 — l'archive du droit d'accès contient le RIB complet du titulaire. */
    public function test_l_export_du_droit_d_acces_reste_entier(): void
    {
        $profile = $this->ownerOf(Agency::factory()->create());

        $payloads = app(DataExportBuilder::class)->payloads($profile->user);

        $owners = $payloads['profile.json']['profiles']['owners'];
        $mine = collect($owners)->firstWhere('id', $profile->id);
        $this->assertSame(self::RIB, $mine['rib']);
        $this->assertSame(self::TAX_ID, $mine['tax_id']);
        $this->assertSame(self::ID_NUMBER, $mine['id_document_number']);
    }

    /** Contrainte 7 — le `down()` DÉCHIFFRE : l'aller-retour ne perd rien, et `up()` est idempotent. */
    public function test_la_migration_fait_l_aller_retour_sans_perte(): void
    {
        $profile = $this->ownerOf(Agency::factory()->create());
        $migration = require database_path('migrations/2026_10_08_601100_encrypt_sensitive_columns_on_owner_profiles.php');

        $migration->down();

        $raw = DB::table('owner_profiles')->where('id', $profile->id)->first();
        $this->assertSame(self::RIB, $raw->rib);
        $this->assertSame(self::TAX_ID, $raw->tax_id);
        $this->assertSame(self::ID_NUMBER, $raw->id_document_number);
        $this->assertSame('varchar', Schema::getColumnType('owner_profiles', 'rib'));

        $migration->up();
        $first = DB::table('owner_profiles')->where('id', $profile->id)->value('rib');
        $migration->up();
        $second = DB::table('owner_profiles')->where('id', $profile->id)->value('rib');

        $this->assertSame('text', Schema::getColumnType('owner_profiles', 'rib'));
        $this->assertNotSame(self::RIB, $first);
        $this->assertSame($first, $second, 'un second up() ne rechiffre pas une valeur déjà chiffrée');
        $this->assertSame(self::RIB, $profile->fresh()->rib);
    }

    /** TCK-956 AC1 — le revenu fait l'aller-retour au centime, et `down()` rend `numeric(14,2)`. */
    public function test_la_migration_du_revenu_fait_l_aller_retour(): void
    {
        $profile = $this->ownerOf(Agency::factory()->create());
        $migration = require database_path('migrations/2026_10_19_120000_encrypt_monthly_income_on_owner_profiles.php');
        $brut = fn () => DB::table('owner_profiles')->where('id', $profile->id)->value('monthly_income');

        $migration->down();
        $this->assertSame(self::REVENU, $brut());

        $migration->up();
        $premier = $brut();
        $this->assertSame(self::REVENU, Crypt::decryptString($premier));
        $migration->up();
        $this->assertSame($premier, $brut(), 'un second up() ne rechiffre pas une valeur déjà chiffrée');

        $migration->down();
        $this->assertSame(self::REVENU, $brut());
        $colonne = DB::selectOne(
            "select data_type, numeric_precision, numeric_scale from information_schema.columns
             where table_schema = current_schema() and table_name = 'owner_profiles' and column_name = 'monthly_income'"
        );
        $this->assertSame(['numeric', 14, 2], [$colonne->data_type, (int) $colonne->numeric_precision, (int) $colonne->numeric_scale]);

        $migration->up();
        $this->assertSame(self::REVENU, $profile->fresh()->monthly_income);
    }

    /** TCK-956 AC2 et AC3 — le carnet ne rend que le masque du revenu ; la lecture dédiée le rend en nombre. */
    public function test_le_revenu_est_masque_au_carnet_et_clair_par_la_lecture_dediee(): void
    {
        $agency = Agency::factory()->create();
        $profile = $this->ownerOf($agency);
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $row = collect($this->apiGet('/api/owners')->assertOk()->json('data'))->firstWhere('id', $profile->id);
        $this->assertArrayNotHasKey('monthly_income', $row);
        $this->assertSame('••••', $row['monthly_income_masked']);
        $sparse = collect($this->apiGet('/api/owners?fields[owner_profiles]=id,status')->assertOk()->json('data'))->firstWhere('id', $profile->id);
        $this->assertSame('••••', $sparse['monthly_income_masked']);
        $this->apiGet('/api/owners?fields[owner_profiles]=id,monthly_income')->assertStatus(400);

        $this->actingAsWithStepUp($admin);
        $this->apiGet("/api/owners/{$profile->id}/sensitive")
            ->assertOk()
            ->assertJsonPath('data.monthly_income', 350000);
    }

    /** TCK-956 AC4 — l'export du droit d'accès porte la fiche client du titulaire, pièce en clair, sans notes ni métadonnées. */
    public function test_l_export_porte_la_fiche_client_du_titulaire(): void
    {
        $profile = $this->ownerOf(Agency::factory()->create());
        Customer::factory()->create([
            'user_id' => $profile->user_id,
            'id_type' => IdType::IdCard,
            'id_number' => 'SN-112233',
            'notes' => 'Note interne de l\'agence',
            'metadata' => ['source' => 'salon'],
        ]);
        Customer::factory()->create(['id_number' => 'SN-AUTRUI']);

        $payloads = app(DataExportBuilder::class)->payloads($profile->user);

        $this->assertSame(self::REVENU, collect($payloads['profile.json']['profiles']['owners'])->firstWhere('id', $profile->id)['monthly_income']);

        $fiches = $payloads['customers.json'];
        $this->assertCount(1, $fiches);
        $this->assertSame('SN-112233', $fiches[0]['id_number']);
        $this->assertSame('id_card', $fiches[0]['id_type']);
        $this->assertArrayNotHasKey('notes', $fiches[0]);
        $this->assertArrayNotHasKey('metadata', $fiches[0]);
        $this->assertStringContainsString('"id_number":"SN-112233"', json_encode($fiches));
        $this->assertStringNotContainsString('SN-AUTRUI', json_encode($payloads));
    }
}
