<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\Support\FabriqueOccupation;

/**
 * TCK-2637, AC4 — le locataire, le bail, le loyer et l'état du mois ne sortent que vers qui peut
 * lire le bail, avec la projection de `GET /api/leases?include=tenant` pour ce même appelant. Sans
 * ce droit : 200, `state` et `vacant_since` seuls. Les filtres `tenant` et `rent_late` et le tri
 * `retard` portent les mêmes données : ils suivent la même règle, sans quoi ils seraient un oracle.
 */
class PropertyOccupancyVisibilityTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use FabriqueDemandesEtVisites;
    use FabriqueOccupation;
    use RefreshDatabase;

    private const PRIVES = ['tenant', 'lease', 'rent', 'current_month'];

    private Agency $agency;

    private User $owner;

    private Property $property;

    private Lease $lease;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-11 10:00:00');
        $this->agency = $this->agence();
        $this->owner = $this->bailleur($this->agency);
        $this->property = $this->bienLoue($this->agency, $this->owner, 'Villa en ligne', ['visibility' => 'public', 'published_at' => '2026-10-01 10:00:00']);
        $this->lease = $this->bail($this->property, 'Yacine DIOUF', [], '+221771234567');
        $this->loyer($this->lease, '2026-11-05', PaymentStatus::Late);
    }

    /** @return array<string, mixed> */
    private function fiche(User $user): array
    {
        $this->actingAsApi($user);

        return $this->getJson("/api/properties/{$this->property->id}?include=occupancy")->assertOk()->json('data.occupancy');
    }

    private function assertSansDonneesDuBail(array $occupancy): void
    {
        $this->assertSame('occupied', $occupancy['state']);
        $this->assertArrayHasKey('vacant_since', $occupancy);
        foreach (self::PRIVES as $key) {
            $this->assertArrayNotHasKey($key, $occupancy);
        }
        $this->assertStringNotContainsString('DIOUF', json_encode($occupancy));
        $this->assertStringNotContainsString('771234567', json_encode($occupancy));
    }

    /**
     * Un agent d'une autre agence n'atteint pas le bien : la fiche lui est refusée
     * (`PropertyPolicy::view`, 403, sans corps), la liste ne le porte pas, et le filtre `tenant`
     * ne le lui fait pas trouver.
     */
    public function test_ac4_un_agent_d_une_autre_agence_ne_lit_pas_le_locataire(): void
    {
        $this->actingAsApi($this->personnel($this->agence()));

        $this->getJson("/api/properties/{$this->property->id}?include=occupancy")->assertForbidden();
        foreach (['', '&filter[tenant]=diouf', '&filter[rent_late]=1'] as $query) {
            $response = $this->getJson('/api/properties?include=occupancy&per_page=100'.$query)->assertOk();
            $this->assertSame([], $response->json('data'));
            $this->assertStringNotContainsString('DIOUF', $response->getContent());
        }
    }

    /**
     * Le bien a changé de bailleur (`PUT /api/properties/{id}/owner`, TCK-999) : le bail en cours
     * reste celui de l'ancien. Le nouveau voit son bien dans sa liste — 200, `state` servi — mais ni
     * le locataire, ni le bail, ni le loyer : `GET /api/leases` ne lui rend pas ce bail non plus.
     */
    public function test_ac4_un_autre_bailleur_ne_lit_pas_le_locataire(): void
    {
        $nouveau = $this->bailleur($this->agency);
        $this->property->forceFill(['user_id' => $nouveau->id])->save();

        $this->actingAsApi($nouveau);
        $this->assertSame([], $this->getJson('/api/leases?include=tenant')->assertOk()->json('data'));
        $rows = $this->getJson('/api/properties?include=occupancy&per_page=100')->assertOk()->json('data');
        $this->assertCount(1, $rows);
        $this->assertSansDonneesDuBail($rows[0]['occupancy']);
        $this->assertSansDonneesDuBail($this->fiche($nouveau));
        $this->assertSame([], array_column($this->getJson('/api/properties?per_page=100&filter[tenant]=diouf')->assertOk()->json('data'), 'id'));
        $this->assertSame([], array_column($this->getJson('/api/properties?per_page=100&filter[rent_late]=1')->assertOk()->json('data'), 'id'));
    }

    public function test_le_bailleur_du_bail_et_le_personnel_le_lisent(): void
    {
        foreach ([$this->owner, $this->personnel($this->agency), $this->agencyAdmin($this->agency)] as $user) {
            $occupancy = $this->fiche($user);
            $this->assertSame(['Yacine', 'DIOUF', '+221771234567'], [$occupancy['tenant']['first_name'], $occupancy['tenant']['last_name'], $occupancy['tenant']['phone']]);
            $this->assertSame('late', $occupancy['current_month']['status']);
        }
    }

    /**
     * La même projection que la liste des baux, appelant par appelant : le bloc `tenant` est servi
     * exactement quand `GET /api/leases?include=tenant` rend ce bail, avec le même nom. Un bail dont
     * `landlord_id` désigne l'agent qui l'a saisi n'est pas au bailleur du bien (TCK-1926) : ni la
     * liste des baux ni l'occupation ne le lui rendent, et ses filtres ne le trouvent pas.
     */
    public function test_la_projection_est_celle_de_la_liste_des_baux(): void
    {
        $agent = $this->personnel($this->agency);
        $saisi = $this->bienLoue($this->agency, $this->owner, 'Saisi par l\'agent');
        $leaseOfAgent = $this->bail($saisi, 'Awa NDIAYE', ['landlord_id' => $agent->id]);
        $this->loyer($leaseOfAgent, '2026-11-04', PaymentStatus::Late);

        foreach ([$this->owner, $agent, $this->personnel($this->agence())] as $user) {
            $this->actingAsApi($user);
            $leases = collect($this->getJson('/api/leases?include=tenant&per_page=100')->assertOk()->json('data'))->keyBy('id');
            foreach ([$this->property, $saisi] as $property) {
                $occupancy = $this->getJson("/api/properties/{$property->id}?include=occupancy")->json('data.occupancy');
                if ($occupancy === null) {
                    continue; // fiche refusée : rien à comparer
                }
                $lease = $leases->first(fn (array $l) => $l['property_id'] === $property->id);
                $this->assertSame($lease !== null, array_key_exists('tenant', $occupancy), "{$property->title} — appelant {$user->id}");
                if ($lease !== null) {
                    $this->assertSame($lease['tenant']['last_name'], $occupancy['tenant']['last_name']);
                    $this->assertSame($lease['tenant']['phone'], $occupancy['tenant']['phone']);
                }
            }
        }

        $this->actingAsApi($this->owner);
        $titles = fn (string $q) => array_column($this->getJson('/api/properties?per_page=100&fields[properties]=id,title'.$q)->assertOk()->json('data'), 'title');
        $this->assertEqualsCanonicalizing(['Villa en ligne', 'Saisi par l\'agent'], $titles(''));
        $this->assertSame([], $titles('&filter[tenant]=ndiaye'));
        $this->assertSame(['Villa en ligne'], $titles('&filter[rent_late]=1'));
        $this->assertSame('Villa en ligne', $titles('&sort=retard')[0]);
        $this->assertArrayNotHasKey('tenant', $this->getJson('/api/properties?per_page=100&include=occupancy&filter[id]='.$saisi->id)->json('data.0.occupancy'));

        $this->actingAsApi($agent);
        $this->assertSame(['Saisi par l\'agent'], $titles('&filter[tenant]=ndiaye'));
    }
}
