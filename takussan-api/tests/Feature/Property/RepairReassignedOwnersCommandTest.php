<?php

namespace Tests\Feature\Property;

use App\Console\Commands\RepairReassignedOwners;
use App\Models\Agency;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Services\Agency\AgentHandoverService;
use App\Services\Property\PrimaryPropertyContact;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\TestCase;

/**
 * TCK-603 AC4 (ADR-0059 §5) — `properties:repair-reassigned-owners` rend au bien réattribué son
 * titulaire d'origine, désigne la dernière cible comme agent responsable, rétablit le bailleur des
 * baux brouillons et LISTE les autres, sans jamais les réécrire.
 *
 * Le jeu rejoue l'ancien `assignAgent` tel qu'il écrivait : `$property->update(['user_id' => …])`,
 * qui laisse la signature `Property` / `updated` / `old.user_id ≠ attributes.user_id`.
 */
class RepairReassignedOwnersCommandTest extends TestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agency;

    private User $b;

    private User $x;

    private User $y;

    private Property $p;

    private Property $intact;

    private Lease $brouillon;

    private Lease $actif;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Http::preventStrayRequests();

        $this->agency = $this->agence();
        $this->b = $this->bailleur($this->agency);
        $this->x = $this->personnel($this->agency);
        $this->y = $this->personnel($this->agency);
        $this->p = $this->bienDe($this->agency, $this->b);
        $this->intact = $this->bienDe($this->agency, $this->bailleur($this->agency));
        $this->intact->update(['title' => 'Retouché, jamais réattribué']);

        // L'ancien geste, deux fois : B → X → Y.
        $this->p->update(['user_id' => $this->x->id]);
        $this->p->update(['user_id' => $this->y->id]);

        $this->brouillon = Lease::factory()->create([
            'property_id' => $this->p->id, 'landlord_id' => $this->y->id, 'agency_id' => $this->agency->id,
        ]);
        $this->actif = Lease::factory()->active()->create([
            'property_id' => $this->p->id, 'landlord_id' => $this->y->id, 'agency_id' => $this->agency->id,
        ]);
    }

    private function repair(bool $dryRun = false): string
    {
        Artisan::call('properties:repair-reassigned-owners', $dryRun ? ['--dry-run' => true] : []);

        return Artisan::output();
    }

    private function contactDe(Property $property): ?int
    {
        return PrimaryPropertyContact::for($property->fresh()->load(PrimaryPropertyContact::eagerLoads()))?->id;
    }

    public function test_dry_run_annonce_sans_rien_ecrire(): void
    {
        $avant = Activity::query()->count();

        $sortie = $this->repair(dryRun: true);

        $this->assertStringContainsString('[dry-run] restored=1 responsible_set=1 leases_fixed=1 leases_to_review=1 owners_to_review=0', $sortie);
        $this->assertStringContainsString("leases_to_review: {$this->actif->id}", $sortie);
        $this->assertSame($this->y->id, (int) $this->p->fresh()->user_id);
        $this->assertSame($this->y->id, (int) $this->brouillon->fresh()->landlord_id);
        $this->assertDatabaseMissing('property_collaborators', ['property_id' => $this->p->id]);
        $this->assertSame($avant, Activity::query()->count());
    }

    public function test_la_reparation_rend_le_bien_au_bailleur_et_ne_reecrit_que_le_brouillon(): void
    {
        $intactAvant = $this->intact->fresh()->user_id;

        $sortie = $this->repair();

        $this->assertStringContainsString('restored=1 responsible_set=1 leases_fixed=1 leases_to_review=1 owners_to_review=0', $sortie);
        $this->assertStringContainsString("leases_to_review: {$this->actif->id}", $sortie);
        $this->assertSame($this->b->id, (int) $this->p->fresh()->user_id);
        $this->assertSame($this->y->id, $this->contactDe($this->p));
        $this->assertSame($this->b->id, (int) $this->brouillon->fresh()->landlord_id);
        $this->assertSame($this->y->id, (int) $this->actif->fresh()->landlord_id);
        $this->assertSame(LeaseStatus::Active, $this->actif->fresh()->status);
        $this->assertSame($intactAvant, $this->intact->fresh()->user_id);

        $trace = Activity::query()->where('event', RepairReassignedOwners::EVENT)->sole();
        $this->assertSame($this->p->id, (int) $trace->subject_id);
        $this->assertSame([$this->brouillon->id], $trace->properties['leases_fixed']);
        $this->assertSame([$this->actif->id], $trace->properties['leases_to_review']);

        // Idempotente : le second passage ne trouve plus rien à rendre.
        $this->assertStringContainsString('restored=0 responsible_set=0 leases_fixed=0 leases_to_review=0', $this->repair());
        $this->assertSame(1, Activity::query()->where('event', RepairReassignedOwners::EVENT)->count());
    }

    /** La dernière cible qui n'est plus personnel actif de l'agence ne devient pas responsable ; le bien est rendu quand même. */
    public function test_une_derniere_cible_partie_n_est_pas_designee(): void
    {
        $this->y->agentProfiles()->delete();

        $this->assertStringContainsString('restored=1 responsible_set=0', $this->repair());
        $this->assertSame($this->b->id, (int) $this->p->fresh()->user_id);
        $this->assertDatabaseMissing('property_collaborators', ['property_id' => $this->p->id, 'user_id' => $this->y->id]);
    }

    /** Un titulaire d'origine disparu n'est jamais deviné : le bien est listé, rien n'est écrit. */
    public function test_un_titulaire_d_origine_disparu_est_liste(): void
    {
        Activity::query()->where('subject_id', $this->p->id)->where('event', 'updated')
            ->orderBy('id')->limit(1)->get()->each(function (Activity $a) {
                $changes = $a->attribute_changes->toArray();
                $changes['old']['user_id'] = 987654321;
                $a->forceFill(['attribute_changes' => $changes])->save();
            });

        $sortie = $this->repair();

        $this->assertStringContainsString('restored=0 responsible_set=0 leases_fixed=0 leases_to_review=0 owners_to_review=1', $sortie);
        $this->assertStringContainsString("owners_to_review (properties): {$this->p->id}", $sortie);
        $this->assertSame($this->y->id, (int) $this->p->fresh()->user_id);
    }

    /** ADR-0059 §4 — la passation écrit `user_id` sans la signature : la réparation ne la défait pas. */
    public function test_la_reparation_ne_defait_pas_une_passation(): void
    {
        $this->repair();
        $saisi = $this->bienDe($this->agency, $this->x);
        $repreneur = $this->personnel($this->agency);
        app(AgentHandoverService::class)->transfer($this->agency, $this->x, ['held_properties' => $repreneur], $this->personnel($this->agency, 'agency_admin'));
        $this->assertSame($repreneur->id, (int) $saisi->fresh()->user_id);

        $this->assertStringContainsString('restored=0', $this->repair());
        $this->assertSame($repreneur->id, (int) $saisi->fresh()->user_id);
        $this->assertSame($this->b->id, (int) $this->p->fresh()->user_id);
    }
}
