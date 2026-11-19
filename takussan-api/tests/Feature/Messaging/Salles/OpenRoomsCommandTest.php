<?php

namespace Tests\Feature\Messaging\Salles;

use App\Models\Booking;
use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\ScenesDeSalles;
use Tests\TestCase;

/**
 * TCK-2960 (AC6) — `messaging:open-rooms` ouvre la salle des baux et réservations d'avant les salles :
 * chacun de ceux qui ont au moins un compte possible en a une après, une seconde exécution ne crée rien.
 */
class OpenRoomsCommandTest extends TestCase
{
    use RefreshDatabase, ScenesDeSalles;

    /** Les objets « d'avant » : leurs salles effacées, comme avant la migration. */
    private function effacerLesSalles(): void
    {
        $ids = Conversation::query()->whereIn('type', ['lease', 'booking'])->pluck('id');
        DB::table('conversation_participants')->whereIn('conversation_id', $ids)->delete();
        DB::table('conversations')->whereIn('id', $ids)->delete();
    }

    public function test_ouvre_chaque_salle_manquante_une_fois(): void
    {
        ['lease' => $bail] = $this->sceneDuBail();
        ['booking' => $resa] = $this->sceneDeLaReservation();
        // Candidat sans compte, aucun auteur, propriétaire effacé : personne ne peut tenir la salle.
        $proprietaireEfface = User::factory()->create();
        $sansPersonne = Booking::factory()->create([
            'customer_id' => Customer::factory()->create(['user_id' => null])->id,
            'created_by_id' => null,
            'property_id' => Property::factory()->create(['user_id' => $proprietaireEfface->id])->id,
        ]);
        $proprietaireEfface->delete();
        $supprime = Lease::factory()->create();
        $supprime->delete();
        $this->effacerLesSalles();

        $this->artisan('messaging:open-rooms', ['--chunk' => 1])
            ->expectsOutput('messaging:open-rooms lease=1 booking=1')
            ->assertSuccessful();

        $this->assertNotNull($this->salleDe($bail));
        $this->assertNotNull($this->salleDe($resa));
        $this->assertNull($this->salleDe($sansPersonne), 'aucun compte possible : pas de salle');
        $this->assertNull($this->salleDe($supprime), 'supprimé : pas de salle');
        $this->assertCount(3, $this->membresActifs($this->salleDe($bail)));

        $avant = Conversation::query()->count();
        $this->artisan('messaging:open-rooms')
            ->expectsOutput('messaging:open-rooms lease=0 booking=0')
            ->assertSuccessful();
        $this->assertSame($avant, Conversation::query()->count());
    }

    public function test_ne_touche_pas_une_salle_existante(): void
    {
        ['lease' => $bail] = $this->sceneDuBail();
        $salle = $this->salleDe($bail);
        $intrus = User::factory()->create();
        $salle->participants()->attach($intrus->id, ['role' => 'member', 'joined_at' => now()]);

        $this->artisan('messaging:open-rooms')->expectsOutput('messaging:open-rooms lease=0 booking=0')->assertSuccessful();

        $this->assertContains($intrus->id, $this->membresActifs($salle), 'une salle existante n\'est pas examinée');
    }
}
