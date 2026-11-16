<?php

namespace Tests\Feature\Agency;

use App\Models\Lease;
use App\Services\Agency\AgentHandoverService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\TestCase;

/**
 * TCK-616 AC6, moitié lecture — NON-RÉGRESSION de TCK-1926 : la passation de `held_properties`
 * (TCK-603) ne touche pas les baux, et un bail actif garde `landlord_id` = l'agent parti. Celui-ci,
 * retiré de l'agence, ne le lit plus : `LeasePolicy::view` ne rend le bail à `landlord_id` qu'avec un
 * profil propriétaire (`BailleurDuBien`).
 *
 * La moitié « passation » (brouillons du partant transmis, autres listés au bilan) attend la décision
 * du porteur (ticket, « Décision attendue ») : ce test n'en dit rien.
 */
class AgentHandoverLeaseTest extends TestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    public function test_l_agent_parti_ne_lit_plus_le_bail_du_bien_transmis(): void
    {
        Notification::fake();
        Http::preventStrayRequests();

        $agency = $this->agence();
        $partant = $this->personnel($agency);
        $repreneur = $this->personnel($agency);
        $admin = $this->personnel($agency, 'agency_admin');
        $bien = $this->bienDe($agency, $partant);
        $bail = Lease::factory()->active()->create([
            'property_id' => $bien->id, 'landlord_id' => $partant->id, 'agency_id' => $agency->id,
        ]);

        // Avant le départ, il le lit au titre du personnel.
        Sanctum::actingAs($partant);
        $this->getJson("/api/leases/{$bail->id}")->assertOk();

        $bilan = app(AgentHandoverService::class)
            ->transfer($agency, $partant, ['held_properties' => $repreneur], $admin, removeAfter: true);

        $this->assertContains($bien->id, $bilan['moved']['held_properties']);
        $this->assertNotEmpty($bilan['removed_profiles']);
        $this->assertSame($repreneur->id, (int) $bien->fresh()->user_id);
        $this->assertSame($partant->id, (int) $bail->fresh()->landlord_id);

        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($partant->fresh());
        $this->getJson("/api/leases/{$bail->id}")->assertForbidden();
        $this->assertFalse($partant->fresh()->can('view', $bail->fresh()));
    }
}
