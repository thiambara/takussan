<?php

namespace Tests\Feature\Logging;

use App\Models\Agency;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\JournalCapture;
use Tests\TestCase;

/**
 * TCK-601 — AC6 : quand la création d'un bien échoue en base, AUCUNE entrée de journal émise pendant
 * la requête ne porte ce que l'utilisateur a saisi — ni le `catch` du contrôleur, ni le rapport du
 * framework, dont le message d'une `QueryException` recopie les valeurs liées et le `DETAIL`.
 */
class PropertyStoreFailureLogTest extends TestCase
{
    use JournalCapture, RefreshDatabase;

    private const TITRE = 'TEMOIN-TITRE-601';

    private const RUE = 'TEMOIN-RUE-601';

    public function test_un_echec_en_base_ne_journalise_aucune_saisie(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsRole('agent', ['agency' => $agency]);

        // Une contrainte qui ne laisse passer la validation que pour échouer en base, sur la ligne
        // même du bien — le `DETAIL` PostgreSQL cite alors toute la ligne refusée.
        DB::statement("ALTER TABLE properties ADD CONSTRAINT tck601_titre_refuse CHECK (title <> '".self::TITRE."')");
        $this->captureJournal();

        $this->postJson('/api/properties', [
            'title' => self::TITRE,
            'type' => 'apartment',
            'contract_type' => 'rent',
            'price' => 500_000,
            'address' => ['street' => self::RUE, 'city' => 'Dakar'],
        ])->assertStatus(500);

        $this->assertNotEmpty($this->journal, 'l\'échec doit être journalisé');
        $this->assertJournalSansTemoin(self::TITRE, self::RUE);

        $catch = $this->entreesJournal('[PropertyController::store] Failed to create property');
        $this->assertCount(1, $catch);
        $this->assertContains('title', $catch[0]['context']['payload_keys']);
        $this->assertContains('address', $catch[0]['context']['payload_keys']);
        $this->assertSame('23514', $catch[0]['context']['sqlstate']);

        $this->assertCount(1, $this->entreesJournal('query_exception'));
    }
}
