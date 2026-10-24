<?php

namespace Tests\Feature\Database\Seeders;

use App\Models\Agency;
use App\Models\Enums\CollaboratorRole;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use App\Rules\CollaboratorEligibleForProperty;
use Database\Seeders\Catalog\PropertyCollaboratorSeeder;
use Database\Seeders\Support\SeedingContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-1478 (P86.05) — le jeu de démonstration sème au moins un `co_owner` et un `viewer`, chacun
 * éligible par la règle de l'API. Avant, le seeder ne créait que des `agent` et des `manager` :
 * aucun écran ne montrait les deux autres rôles en local.
 */
class PropertyCollaboratorSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_seme_un_co_owner_et_un_viewer_eligibles(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->create();
        $this->materializeRoleProfile($agent, 'agent', $agency);
        $owners = collect([User::factory()->create(), User::factory()->create()]);
        $owners->each(fn (User $u) => $this->materializeRoleProfile($u, 'owner', $agency));
        $property = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $owners[0]->id]);

        $ctx = new SeedingContext;
        $ctx->agencies = collect([$agency]);
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $agency);
        // Un seul bailleur hors titulaire, et l'agent peut être pris par le tirage : le `viewer`
        // retombe sur l'agent ou sur l'admin, jamais sur rien.
        $ctx->usersByAgencyAndPersona[$agency->id] = ['agent' => collect([$agent]), 'owner' => $owners, 'admin' => collect([$admin])];
        $ctx->propertiesByAgency[$agency->id] = collect([$property]);

        (new PropertyCollaboratorSeeder($ctx))->run();

        foreach ([CollaboratorRole::CoOwner, CollaboratorRole::Viewer] as $role) {
            $lines = PropertyCollaborator::query()->where('property_id', $property->id)->where('role', $role->value)->get();
            $this->assertCount(1, $lines, "un {$role->value} semé");
            $line = $lines->first();
            $this->assertNotSame($property->user_id, $line->user_id, "le {$role->value} n'est pas le titulaire");
            $this->assertNull($line->commission_share, "aucune part pour un {$role->value}");

            $refus = [];
            (new CollaboratorEligibleForProperty($property, $role->value))
                ->validate('user_id', $line->user_id, function (string $m) use (&$refus): void {
                    $refus[] = $m;
                });
            $this->assertSame([], $refus, "le {$role->value} semé est éligible");
        }
    }
}
