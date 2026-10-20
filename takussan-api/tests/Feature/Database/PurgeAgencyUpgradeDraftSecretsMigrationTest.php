<?php

namespace Tests\Feature\Database;

use App\Models\User;
use App\Models\WizardDraft;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-989 (P49.01) — les brouillons du formulaire de passage qui portent un RIB professionnel ou
 * un NINEA sont supprimés : `wizard_drafts.data` est en clair, la demande envoyée les chiffre
 * (ADR-0044 § 1). Le front ne les y écrit plus ; cette migration retire ceux déjà écrits.
 *
 * Témoins de ce qu'elle ne touche pas : un brouillon de passage sans ces champs (ou vides, `null`
 * tels que le serveur les a stockés), et un brouillon d'un autre parcours qui porterait `ninea`.
 */
class PurgeAgencyUpgradeDraftSecretsMigrationTest extends TestCase
{
    use RefreshDatabase;

    private const MIGRATION = 'migrations/2026_10_19_163500_purge_agency_upgrade_drafts_with_rib_or_ninea.php';

    public function test_upgrade_drafts_carrying_rib_or_ninea_are_deleted_and_nothing_else(): void
    {
        $user = User::factory()->create();
        $draft = fn (string $key, array $data) => WizardDraft::factory()->create([
            'user_id' => $user->id, 'key' => $key, 'step' => 0, 'data' => $data,
        ]);

        $rib = $draft('agency-upgrade-1', ['rc' => 'RC-1', 'rib_pro' => 'SN012 01001 000123456789 12', 'ninea' => null]);
        $ninea = $draft('agency-upgrade-2', ['rc' => null, 'ninea' => '005012345']);
        $sain = $draft('agency-upgrade-3', ['rc' => 'RC-3', 'rib_pro' => null, 'ninea' => null]);
        $vide = $draft('agency-upgrade-4', ['rc' => 'RC-4', 'rib_pro' => '', 'ninea' => '']);
        $autre = $draft('property-wizard', ['ninea' => '005012345']);

        (require database_path(self::MIGRATION))->up();

        $this->assertDatabaseMissing('wizard_drafts', ['id' => $rib->id]);
        $this->assertDatabaseMissing('wizard_drafts', ['id' => $ninea->id]);
        $this->assertDatabaseHas('wizard_drafts', ['id' => $sain->id]);
        $this->assertDatabaseHas('wizard_drafts', ['id' => $vide->id]);
        $this->assertDatabaseHas('wizard_drafts', ['id' => $autre->id]);
    }
}
