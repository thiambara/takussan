<?php

namespace Tests\Feature\Maintenance;

use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-2652 (AC7) — le locataire signale sans décrire : `description` devient facultative pour le
 * demandeur, le titre reste exigé. Le donneur d'ordre, dont le formulaire ne change pas, la doit.
 */
class MaintenanceStoreWithoutDescriptionTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    /** AC7. */
    public function test_ac7_a_tenant_reports_without_description(): void
    {
        ['property' => $property, 'tenant' => $tenant] = $this->maintenanceScenario();
        Sanctum::actingAs($tenant);

        $id = $this->postJson('/api/maintenance-requests', [
            'property_id' => $property->id, 'title' => 'Plomberie', 'category' => 'plumbing',
        ])->assertCreated()->assertJsonPath('data.description', null)->json('data.id');

        $this->assertNull(MaintenanceRequest::query()->findOrFail($id)->description);
        $this->assertSame(MaintenanceStatus::Open, MaintenanceRequest::query()->findOrFail($id)->status);
    }

    public function test_the_title_stays_required(): void
    {
        ['property' => $property, 'tenant' => $tenant] = $this->maintenanceScenario();
        Sanctum::actingAs($tenant);

        $this->postJson('/api/maintenance-requests', ['property_id' => $property->id, 'category' => 'plumbing'])
            ->assertUnprocessable()->assertJsonValidationErrors(['title']);
    }

    public function test_the_principal_still_owes_a_description(): void
    {
        ['property' => $property, 'landlord' => $landlord] = $this->maintenanceScenario();
        Sanctum::actingAs($landlord);

        $this->postJson('/api/maintenance-requests', ['property_id' => $property->id, 'title' => 'Plomberie', 'category' => 'plumbing'])
            ->assertUnprocessable()->assertJsonValidationErrors(['description']);
    }
}
