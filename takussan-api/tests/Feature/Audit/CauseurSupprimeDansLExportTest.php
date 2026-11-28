<?php

namespace Tests\Feature\Audit;

use App\Models\Activity;
use App\Models\Agency;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Audit\ActivityLogExporter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-1395 (P139.01) — l'export du journal ne dit pas « système » d'un compte supprimé : une ligne
 * qui garde son `causer_id` mais dont le causeur ne se charge plus (suppression douce) sort en
 * `deleted#<id>` / `deleted`, comme l'écran du journal (`AuditTrail.tsx`). `system` reste réservé
 * aux lignes sans `causer_id`. Les deux exports passent par le même `mapRow()`.
 *
 * Le fichier porte aussi les autres colonnes `causer_*` des deux exports : le causeur sans e-mail (TCK-1997) et le
 * rôle tenu dans l'agence de la ligne (TCK-1717), versés par TCK-3017.
 */
class CauseurSupprimeDansLExportTest extends TestCase
{
    use RefreshDatabase;

    private function logOn(object $subject, ?User $causer, string $description): Activity
    {
        $logger = activity()->performedOn($subject)->event('updated');
        if ($causer !== null) {
            $logger->causedBy($causer);
        }

        /** @var Activity */
        return $logger->log($description);
    }

    /** @return array{0: User, 1: Agency, 2: User} l'admin, l'agence, l'agent supprimé */
    private function scenario(): array
    {
        $agency = Agency::factory()->create();
        $admin = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);
        $agent = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agency->id]);

        $property = Property::factory()->create(['agency_id' => $agency->id]);
        $this->logOn($property, $agent, 'temoin-supprime');
        $this->logOn($property, null, 'temoin-systeme');
        $agent->delete();

        return [$admin, $agency, $agent];
    }

    /** @param list<array<string,mixed>> $rows */
    private function row(array $rows, string $description): array
    {
        $row = collect($rows)->firstWhere('description', $description);
        $this->assertNotNull($row, "ligne {$description} absente de l'export");

        return $row;
    }

    public function test_les_deux_exports_nomment_le_compte_supprime_et_gardent_system_aux_lignes_sans_causeur(): void
    {
        [$admin, $agency, $agent] = $this->scenario();

        foreach ([
            'agence' => app(ActivityLogExporter::class)->buildPayload($admin, [], $agency->id)['rows'],
            'console' => app(ActivityLogExporter::class)->payloadForQuery(Activity::query(), 'console')['rows'],
        ] as $export => $rows) {
            $supprime = $this->row($rows, 'temoin-supprime');
            $this->assertSame("deleted#{$agent->id}", $supprime['causer_name'], $export);
            $this->assertSame('deleted', $supprime['causer_role'], $export);

            $systeme = $this->row($rows, 'temoin-systeme');
            $this->assertSame('system', $systeme['causer_name'], $export);
            $this->assertSame('system', $systeme['causer_role'], $export);
        }
    }

    // --- TCK-1997 (P193.03, ex-`CauseurSansEmailDansLExportTest`, versé par TCK-3017) : un causeur présent sans e-mail
    // (compte créé par téléphone) sortait en `system`. Il sort par son identifiant et son nom (`user#<id>` s'il n'en a
    // pas), jamais par son numéro ; depuis TCK-613, aucun causeur n'y sort par son adresse. -------------------------

    public function test_un_causeur_sans_e_mail_sort_en_user_id_et_jamais_par_son_numero(): void
    {
        $agency = Agency::factory()->create();
        $admin = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);
        $agent = User::factory()->create(['email' => null, 'phone' => '+221770001234']);
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agency->id]);
        $property = Property::factory()->create(['agency_id' => $agency->id]);

        activity()->performedOn($property)->event('updated')->causedBy($agent)->log('temoin-sans-email');
        activity()->performedOn($property)->event('updated')->causedBy($admin)->log('temoin-avec-email');
        // Un causeur sans nom ni e-mail : `user#<id>`, jamais le repli `system`.
        $anonyme = User::factory()->create(['first_name' => '', 'last_name' => '', 'email' => null, 'phone' => '+221770009999']);
        AgentProfile::factory()->create(['user_id' => $anonyme->id, 'agency_id' => $agency->id]);
        activity()->performedOn($property)->event('updated')->causedBy($anonyme)->log('temoin-sans-nom');

        foreach ([
            app(ActivityLogExporter::class)->buildPayload($admin, [], $agency->id)['rows'],
            app(ActivityLogExporter::class)->payloadForQuery(Activity::query(), 'console')['rows'],
        ] as $rows) {
            $sansEmail = collect($rows)->firstWhere('description', 'temoin-sans-email');
            $this->assertNotNull($sansEmail);
            $this->assertSame($agent->id, $sansEmail['causer_id']);
            $this->assertSame($agent->full_name, $sansEmail['causer_name']);
            $this->assertStringNotContainsString('770001234', (string) json_encode($sansEmail));

            // TCK-613 (ADR-0044 §2) — l'auteur se dit par son identifiant et son nom, plus par son adresse.
            $avecEmail = collect($rows)->firstWhere('description', 'temoin-avec-email');
            $this->assertSame($admin->id, $avecEmail['causer_id']);
            $this->assertSame($admin->full_name, $avecEmail['causer_name']);
            $this->assertArrayNotHasKey('causer_email', $avecEmail);
            $this->assertStringNotContainsString((string) $admin->email, (string) json_encode($avecEmail));

            $sansNom = collect($rows)->firstWhere('description', 'temoin-sans-nom');
            $this->assertSame("user#{$anonyme->id}", $sansNom['causer_name']);
        }
    }

    // --- TCK-1717 (P139.02, ex-`RoleDuCauseurDansLExportTest`, versé par TCK-3017) : `causer_role` se juge dans
    // l'agence de la ligne : un agent de A, admin de B, qui agit chez A sort « agent » dans l'export de A, et l'admin
    // de A n'apprend pas le rôle tenu chez B. La console suit la même règle, ligne par ligne. ---------------------

    /** @return array{0: User, 1: Agency, 2: Agency} l'admin de A, l'agence A, l'agence B */
    private function scenarioDeDeuxAgences(): array
    {
        $agenceA = Agency::factory()->create();
        $agenceB = Agency::factory()->create();
        $adminA = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $adminA->id, 'agency_id' => $agenceA->id]);

        $double = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $double->id, 'agency_id' => $agenceA->id]);
        AgencyAdminProfile::factory()->create(['user_id' => $double->id, 'agency_id' => $agenceB->id]);

        foreach (['chez-a' => $agenceA, 'chez-b' => $agenceB] as $description => $agence) {
            activity()
                ->performedOn(Property::factory()->create(['agency_id' => $agence->id]))
                ->causedBy($double)
                ->event('updated')
                ->log($description);
        }

        return [$adminA, $agenceA, $agenceB];
    }

    /** @param list<array<string,mixed>> $rows */
    private function role(array $rows, string $description): mixed
    {
        $row = collect($rows)->firstWhere('description', $description);
        $this->assertNotNull($row, "ligne {$description} absente de l'export");

        return $row['causer_role'];
    }

    public function test_l_export_d_agence_donne_le_role_tenu_dans_cette_agence(): void
    {
        [$adminA, $agenceA] = $this->scenarioDeDeuxAgences();

        $rows = app(ActivityLogExporter::class)->buildPayload($adminA, [], $agenceA->id)['rows'];

        $this->assertSame('agent', $this->role($rows, 'chez-a'));
        $this->assertNull(collect($rows)->firstWhere('description', 'chez-b'), 'la ligne de B sort de l\'export de A');
    }

    public function test_l_export_de_la_console_donne_le_role_tenu_dans_l_agence_de_chaque_ligne(): void
    {
        $this->scenarioDeDeuxAgences();

        $rows = app(ActivityLogExporter::class)->payloadForQuery(Activity::query(), 'console')['rows'];

        $this->assertSame('agent', $this->role($rows, 'chez-a'));
        $this->assertSame('agency_admin', $this->role($rows, 'chez-b'));
    }
}
