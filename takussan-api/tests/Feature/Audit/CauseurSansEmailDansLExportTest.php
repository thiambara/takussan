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
 * l'export en `system`, le repli d'une ligne sans causeur. Il sort en `user#<id>`, jamais par son
 * numéro ; un causeur à e-mail garde son e-mail.
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

        foreach ([
            app(ActivityLogExporter::class)->buildPayload($admin, [], $agency->id)['rows'],
            app(ActivityLogExporter::class)->payloadForQuery(Activity::query(), 'console')['rows'],
        ] as $rows) {
            $sansEmail = collect($rows)->firstWhere('description', 'temoin-sans-email');
            $this->assertNotNull($sansEmail);
            $this->assertSame("user#{$agent->id}", $sansEmail['causer_email']);
            $this->assertStringNotContainsString('770001234', (string) json_encode($sansEmail));

            $avecEmail = collect($rows)->firstWhere('description', 'temoin-avec-email');
            $this->assertSame($admin->email, $avecEmail['causer_email']);
        }
    }
}
