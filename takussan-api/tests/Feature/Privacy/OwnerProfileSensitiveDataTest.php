<?php

namespace Tests\Feature\Privacy;

use App\Models\Agency;
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

    private function ownerOf(Agency $agency, array $overrides = []): OwnerProfile
    {
        return OwnerProfile::factory()->create(array_merge([
            'agency_id' => $agency->id,
            'rib' => self::RIB,
            'tax_id' => self::TAX_ID,
            'id_document_number' => self::ID_NUMBER,
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

        $this->apiActingAsRole('agent', ['agency' => $agency]);
        $this->apiGet("/api/owners/{$profile->id}/sensitive")->assertForbidden();

        $this->apiActingAsRole('agency_admin', ['agency' => Agency::factory()->create()]);
        $this->apiGet("/api/owners/{$profile->id}/sensitive")->assertForbidden();
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
}
