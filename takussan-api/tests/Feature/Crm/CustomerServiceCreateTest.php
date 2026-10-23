<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\User;
use App\Services\Model\CustomerService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * P158.03 (TCK-1712) — `CustomerService::create()` ne retombe plus sur l'agence active de
 * l'acteur : sans `agency_id`, la fiche ne naît nulle part.
 *
 * Le repli `?? $actor->agency_id` faisait naître la fiche dans une agence que l'appelant ne visait
 * pas ; la conversion d'une demande (son seul appelant) avait déjà dû le fermer à la main
 * (vérification adverse m2, `lead.without_agency`).
 */
class CustomerServiceCreateTest extends TestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    public function test_sans_agency_id_la_creation_leve(): void
    {
        $actor = $this->agencyAgent(Agency::factory()->create());

        try {
            app(CustomerService::class)->create(['first_name' => 'Awa', 'last_name' => 'Diop'], $actor);
            $this->fail('La création sans agence devait lever.');
        } catch (\LogicException $e) {
            $this->assertStringContainsString('agency_id', $e->getMessage());
        }

        $this->assertSame(0, Customer::query()->count());
    }

    public function test_avec_agency_id_la_fiche_nait_dans_l_agence_donnee(): void
    {
        $agency = Agency::factory()->create();
        $actor = User::factory()->create();

        $customer = app(CustomerService::class)->create([
            'agency_id' => $agency->id,
            'first_name' => 'Awa',
            'last_name' => 'Diop',
        ], $actor);

        $this->assertSame($agency->id, $customer->agency_id);
        $this->assertSame($actor->id, $customer->added_by_id);
    }
}
