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
 * TCK-1997 (P193.03) — un causeur présent sans e-mail (compte créé par téléphone) sortait de
 * l'export en `system`, le repli d'une ligne sans causeur. Il sort par son identifiant et son nom
 * (`user#<id>` s'il n'en a pas), jamais par son numéro ; depuis TCK-613, aucun causeur n'y sort par
 * son adresse.
 */
class CauseurSansEmailDansLExportTest extends TestCase
{
    use RefreshDatabase;

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
}
