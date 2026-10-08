<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\CollaboratorRole;
use App\Models\Lease;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use App\Services\Property\PrimaryAgentDesignator;
use App\Services\Property\PrimaryPropertyContact;
use App\Services\Property\ResponsibleAgentAssigner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-603 (ADR-0036, ADR-0059) — **changer l'agent responsable ne dépossède jamais le bailleur.**
 *
 * Le bien de référence P appartient au bailleur B (`user_id`) ; l'agent X en est le collaborateur
 * `agent` principal. L'ancien `assignAgent` écrivait `properties.user_id` : B perdait son bien, son
 * tableau de bord ne le comptait plus, et tout bail créé ensuite désignait l'agent comme bailleur
 * (`LeaseService::create`, `landlord_id = $property->user_id`).
 */
class PropertyReassignmentKeepsOwnerTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $b;

    private User $x;

    private User $y;

    private Property $p;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Http::preventStrayRequests();

        $this->agency = $this->agence();
        $this->admin = $this->personnel($this->agency, 'agency_admin');
        $this->b = $this->bailleur($this->agency);
        $this->x = $this->personnel($this->agency);
        $this->y = $this->personnel($this->agency);
        $this->p = $this->bienDe($this->agency, $this->b);
        $ligneX = $this->collaborateur($this->p, $this->x);
        app(PrimaryAgentDesignator::class)->designate($this->p, $ligneX, $this->admin);
    }

    private function contactDe(Property $property): ?int
    {
        return PrimaryPropertyContact::for($property->fresh()->load(PrimaryPropertyContact::eagerLoads()))?->id;
    }

    private function reattribuer(Property $property, User $cible, ?User $acteur = null)
    {
        return $this->actingAsApi($acteur ?? $this->admin)
            ->putJson("/api/properties/{$property->id}/assigned-agent", ['user_id' => $cible->id]);
    }

    /** AC3 — l'unitaire : Y répond, B reste propriétaire, son tableau de bord et ses baux le suivent. */
    public function test_changer_l_agent_responsable_garde_le_bailleur_proprietaire(): void
    {
        $this->assertSame($this->x->id, $this->contactDe($this->p));

        $this->reattribuer($this->p, $this->y)->assertOk()
            ->assertJsonPath('data.owner.id', $this->b->id)
            ->assertJsonPath('data.primary_contact.id', $this->y->id);

        $this->assertSame($this->b->id, (int) $this->p->fresh()->user_id);
        $this->assertSame($this->y->id, $this->contactDe($this->p));
        // L'ancien principal reste collaborateur, sans la marque.
        $this->assertDatabaseHas('property_collaborators', [
            'property_id' => $this->p->id, 'user_id' => $this->x->id, 'role' => 'agent', 'is_primary' => false,
        ]);

        $this->actingAsApi($this->b)->getJson('/api/dashboard/owner')->assertOk()
            ->assertJsonPath('data.portfolio.total', 1);

        $locataire = Customer::factory()->create(['agency_id' => $this->agency->id, 'added_by_id' => $this->y->id]);
        $leaseId = $this->actingAsApi($this->y)->postJson('/api/leases', [
            'property_id' => $this->p->id,
            'tenant_id' => $locataire->id,
            'type' => 'residential_rent',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addYear()->toDateString(),
            'monthly_rent' => 400000,
            'deposit_amount' => 800000,
            'currency' => 'XOF',
            'payment_day' => 5,
        ])->assertCreated()->json('data.id');
        $this->assertSame($this->b->id, (int) Lease::query()->findOrFail($leaseId)->landlord_id);
    }

    /**
     * La liste du tableau de bord nomme le propriétaire ET l'agent responsable — à condition que
     * `agency_id` et `user_id` soient demandés (`DASHBOARD_PROPERTY_FIELDS`, côté front) : sans eux,
     * la règle jugerait un bien d'agence comme celui d'un particulier, et la clé ne sort pas.
     */
    public function test_la_liste_sert_le_responsable_si_l_agence_est_demandee(): void
    {
        $this->actingAsApi($this->admin)
            ->getJson('/api/properties?fields[properties]=id,user_id,agency_id,title&include=owner,collaborators')
            ->assertOk()
            ->assertJsonPath('data.0.id', $this->p->id)
            ->assertJsonPath('data.0.owner.id', $this->b->id)
            ->assertJsonPath('data.0.primary_contact.id', $this->x->id);

        $sansAgence = $this->actingAsApi($this->admin)
            ->getJson('/api/properties?fields[properties]=id,user_id,title&include=owner')
            ->assertOk()->json('data.0');
        $this->assertArrayNotHasKey('primary_contact', $sansAgence);

        // La fiche les sert toujours, sous les `fields[]` de `DASHBOARD_PROPERTY_DETAIL_FIELDS`.
        $this->actingAsApi($this->admin)
            ->getJson("/api/properties/{$this->p->id}?fields[properties]=id,user_id,agency_id,title")
            ->assertOk()
            ->assertJsonPath('data.owner.id', $this->b->id)
            ->assertJsonPath('data.primary_contact.id', $this->x->id);
    }

    /** AC3 — le journal du geste, qui manquait : ancien et nouveau responsable, sous `responsible_agent_changed`. */
    public function test_le_geste_est_journalise_et_n_ecrit_pas_la_signature_d_une_reattribution(): void
    {
        $this->reattribuer($this->p, $this->y)->assertOk();

        $entree = Activity::query()->where('log_name', 'Property')
            ->where('event', ResponsibleAgentAssigner::EVENT)->sole();
        $this->assertSame($this->p->id, (int) $entree->subject_id);
        $this->assertSame($this->admin->id, (int) $entree->causer_id);
        $this->assertSame($this->x->id, $entree->properties['previous_user_id']);
        $this->assertSame($this->y->id, $entree->properties['user_id']);
        $this->assertSame($this->agency->id, $entree->properties['agency_id']);

        $this->assertSame(0, Activity::query()->where('log_name', 'Property')->where('event', 'updated')
            ->whereRaw("attribute_changes->'attributes'->>'user_id' IS NOT NULL")->count());
    }

    /** AC3 — une cible déjà responsable : rien n'est écrit, rien n'est journalisé. */
    public function test_une_cible_deja_responsable_ne_change_rien(): void
    {
        $this->reattribuer($this->p, $this->x)->assertOk()
            ->assertJsonPath('data.primary_contact.id', $this->x->id);

        $this->assertSame(0, Activity::query()->where('event', ResponsibleAgentAssigner::EVENT)->count());
    }

    /** ADR-0036 §2 — une ligne `viewer` passe en `agent` (ancien rôle journalisé) ; une ligne `co_owner` est refusée. */
    public function test_une_ligne_d_un_autre_role_passe_en_agent_sauf_la_co_propriete(): void
    {
        PropertyCollaborator::query()->create([
            'property_id' => $this->p->id, 'user_id' => $this->y->id, 'role' => CollaboratorRole::Viewer, 'invited_at' => now(),
        ]);
        $this->reattribuer($this->p, $this->y)->assertOk();
        $this->assertDatabaseHas('property_collaborators', [
            'property_id' => $this->p->id, 'user_id' => $this->y->id, 'role' => 'agent', 'is_primary' => true,
        ]);
        $this->assertSame('viewer', Activity::query()->where('event', ResponsibleAgentAssigner::EVENT)->sole()->properties['previous_role']);

        $coProprietaire = $this->personnel($this->agency);
        PropertyCollaborator::query()->create([
            'property_id' => $this->p->id, 'user_id' => $coProprietaire->id, 'role' => CollaboratorRole::CoOwner, 'invited_at' => now(),
        ]);
        $this->reattribuer($this->p, $coProprietaire)->assertStatus(422)
            ->assertJsonPath('code', 'property.responsible_agent_co_owner');
        $this->assertDatabaseHas('property_collaborators', [
            'property_id' => $this->p->id, 'user_id' => $coProprietaire->id, 'role' => 'co_owner', 'is_primary' => false,
        ]);
        $this->assertSame($this->y->id, $this->contactDe($this->p));
    }

    /** AC2 — vers un bailleur de A, un agent suspendu de A, un agent d'une autre agence : 422, rien ne bouge. */
    public function test_la_cible_doit_etre_du_personnel_actif_de_l_agence_du_bien(): void
    {
        $autreBailleur = $this->bailleur($this->agency);
        $suspendu = User::factory()->create();
        AgentProfile::factory()->create([
            'user_id' => $suspendu->id, 'agency_id' => $this->agency->id, 'status' => AgentProfileStatus::Suspended,
        ]);
        $ailleurs = $this->personnel($this->agence());

        foreach ([$autreBailleur, $suspendu, $ailleurs] as $cible) {
            $this->reattribuer($this->p, $cible)->assertStatus(422)
                ->assertJsonPath('code', 'user.not_in_active_agency');
            $this->assertSame($this->b->id, (int) $this->p->fresh()->user_id);
            $this->assertSame($this->x->id, $this->contactDe($this->p));
            $this->assertDatabaseMissing('property_collaborators', ['property_id' => $this->p->id, 'user_id' => $cible->id]);
        }
    }

    /** ADR-0059 §1 — sans agence déterminée (bien de particulier, acteur sans agence), aucune cible n'est admise. */
    public function test_sans_agence_aucune_cible_n_est_admise(): void
    {
        $particulier = User::factory()->create();
        $bien = $this->bienDe(null, $particulier);
        $inconnu = User::factory()->create();

        $this->reattribuer($bien, $inconnu, $particulier)->assertStatus(422)
            ->assertJsonPath('code', 'user.not_in_active_agency');
        $this->assertDatabaseMissing('property_collaborators', ['property_id' => $bien->id]);
    }
}
