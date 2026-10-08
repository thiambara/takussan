<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\UserStatus;
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
 * TCK-603 (ADR-0059 §2) — `POST /api/properties/bulk-assign` : changer l'agent responsable d'un lot,
 * par la même autorisation et le même service que l'unitaire, sans jamais écrire `user_id`.
 */
class PropertyBulkAssignTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $b;

    private User $x;

    private User $y;

    private Property $p;

    private Property $q;

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
        // P : proposé par le bailleur B, X en est l'agent principal.
        $this->p = $this->bienDe($this->agency, $this->b);
        app(PrimaryAgentDesignator::class)->designate($this->p, $this->collaborateur($this->p, $this->x), $this->admin);
        // Q : saisi par l'agent X (`user_id` = X), sans collaborateur.
        $this->q = $this->bienDe($this->agency, $this->x);
    }

    /** @param  list<int>  $ids */
    private function lot(array $ids, User $cible, ?User $acteur = null)
    {
        return $this->actingAsApi($acteur ?? $this->admin)
            ->postJson('/api/properties/bulk-assign', ['property_ids' => $ids, 'user_id' => $cible->id]);
    }

    private function contactDe(Property $property): ?int
    {
        return PrimaryPropertyContact::for($property->fresh()->load(PrimaryPropertyContact::eagerLoads()))?->id;
    }

    /** AC3 (lot) — P et Q passent à Y ; `user_id` de P reste B, celui de Q reste X. */
    public function test_le_lot_change_le_responsable_sans_toucher_aux_proprietaires(): void
    {
        $this->lot([$this->q->id, $this->p->id], $this->y)->assertOk()
            ->assertJsonPath('updated', 2)
            ->assertJsonPath('updated_ids', [$this->p->id, $this->q->id])
            ->assertJsonPath('unchanged', 0)
            ->assertJsonPath('failed', []);

        $this->assertSame($this->b->id, (int) $this->p->fresh()->user_id);
        $this->assertSame($this->x->id, (int) $this->q->fresh()->user_id);
        $this->assertSame($this->y->id, $this->contactDe($this->p));
        $this->assertSame($this->y->id, $this->contactDe($this->q));
        $this->assertSame(2, Activity::query()->where('event', ResponsibleAgentAssigner::EVENT)->count());
    }

    /** AC1 — vers un bailleur de l'agence, puis un agent suspendu : `invalid_target`, ni `user_id` ni responsable ne bougent. */
    public function test_une_cible_hors_du_personnel_actif_est_refusee_ligne_a_ligne(): void
    {
        $autreBailleur = $this->bailleur($this->agency);
        $suspendu = User::factory()->create();
        AgentProfile::factory()->create([
            'user_id' => $suspendu->id, 'agency_id' => $this->agency->id, 'status' => AgentProfileStatus::Suspended,
        ]);

        foreach ([$autreBailleur, $suspendu] as $cible) {
            $this->lot([$this->p->id], $cible)->assertOk()
                ->assertJsonPath('updated', 0)
                ->assertJsonPath('failed', [['id' => $this->p->id, 'reason' => 'invalid_target']]);

            $this->assertSame($this->b->id, (int) $this->p->fresh()->user_id);
            $this->assertSame($this->x->id, $this->contactDe($this->p));
            $this->assertDatabaseMissing('property_collaborators', ['property_id' => $this->p->id, 'user_id' => $cible->id]);
        }
    }

    /** Un refus APRÈS une écriture (ligne créée, puis désignation refusée) n'en laisse aucune trace : point de sauvegarde. */
    public function test_un_refus_apres_ecriture_n_annule_que_son_bien(): void
    {
        $bloque = $this->personnel($this->agency, attributes: ['status' => UserStatus::Blocked]);

        $this->lot([$this->p->id, $this->q->id], $bloque)->assertOk()
            ->assertJsonPath('updated', 0)
            ->assertJsonPath('failed', [
                ['id' => $this->p->id, 'reason' => 'invalid_target'],
                ['id' => $this->q->id, 'reason' => 'invalid_target'],
            ]);
        $this->assertDatabaseMissing('property_collaborators', ['user_id' => $bloque->id]);

        // Un refus au milieu d'un lot n'empêche pas les autres biens.
        $coProprietaire = $this->personnel($this->agency);
        PropertyCollaborator::query()->create([
            'property_id' => $this->p->id, 'user_id' => $coProprietaire->id, 'role' => CollaboratorRole::CoOwner, 'invited_at' => now(),
        ]);
        $this->lot([$this->p->id, $this->q->id], $coProprietaire)->assertOk()
            ->assertJsonPath('updated_ids', [$this->q->id])
            ->assertJsonPath('failed', [['id' => $this->p->id, 'reason' => 'invalid_target']]);
        $this->assertSame($this->x->id, $this->contactDe($this->p));
        $this->assertSame($coProprietaire->id, $this->contactDe($this->q));
    }

    /** Cloisonnement — un bien d'une autre agence dans le lot : `forbidden`, aucun effet ; le reste passe. */
    public function test_un_bien_d_une_autre_agence_est_refuse_sans_effet(): void
    {
        $ailleurs = $this->agence();
        $leurAgent = $this->personnel($ailleurs);
        $leurBien = $this->bienDe($ailleurs);
        app(PrimaryAgentDesignator::class)->designate($leurBien, $this->collaborateur($leurBien, $leurAgent), null);

        $this->lot([$leurBien->id, $this->p->id, 999999], $this->y)->assertOk()
            ->assertJsonPath('updated_ids', [$this->p->id])
            ->assertJsonPath('failed', [
                ['id' => $leurBien->id, 'reason' => 'forbidden'],
                ['id' => 999999, 'reason' => 'not_found'],
            ]);

        $this->assertSame($leurAgent->id, $this->contactDe($leurBien));
        $this->assertDatabaseMissing('property_collaborators', ['property_id' => $leurBien->id, 'user_id' => $this->y->id]);

        // Un agent de l'autre agence ne réattribue pas nos biens.
        $this->lot([$this->p->id], $leurAgent, $leurAgent)->assertOk()
            ->assertJsonPath('failed', [['id' => $this->p->id, 'reason' => 'forbidden']]);
    }

    /** Une cible déjà responsable : `unchanged`, pas un refus, aucune écriture. */
    public function test_une_cible_deja_responsable_est_unchanged(): void
    {
        $this->lot([$this->p->id], $this->x)->assertOk()
            ->assertJsonPath('updated', 0)
            ->assertJsonPath('unchanged', 1)
            ->assertJsonPath('unchanged_ids', [$this->p->id])
            ->assertJsonPath('failed', []);
        $this->assertSame(0, Activity::query()->where('event', ResponsibleAgentAssigner::EVENT)->count());
    }

    /** Le lot est borné (1 à 100) et la cible doit exister. */
    public function test_le_lot_est_borne_et_valide(): void
    {
        $this->lot([], $this->y)->assertStatus(422)->assertJsonValidationErrors(['property_ids']);
        $this->lot(range(1, 101), $this->y)->assertStatus(422)->assertJsonValidationErrors(['property_ids']);
        $this->actingAsApi($this->admin)
            ->postJson('/api/properties/bulk-assign', ['property_ids' => [$this->p->id], 'user_id' => 999999])
            ->assertStatus(422)->assertJsonValidationErrors(['user_id']);
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/properties/bulk-assign', ['property_ids' => [$this->p->id], 'user_id' => $this->y->id])
            ->assertUnauthorized();
    }
}
