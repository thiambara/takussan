<?php

namespace Tests\Feature\Property;

use App\Console\Commands\RepairReassignedOwners;
use App\Models\Agency;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Agency\AgentHandoverService;
use App\Services\Property\PrimaryAgentDesignator;
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

    /** verif-603 M1 — `--dry-run` nomme chaque bien : titulaires actuel et d'origine, responsable, baux. */
    public function test_le_dry_run_liste_les_identifiants_de_chaque_bien(): void
    {
        $sortie = $this->repair(dryRun: true);

        $this->assertStringContainsString(
            "[dry-run] restore property={$this->p->id} owner={$this->y->id}->{$this->b->id} responsible={$this->y->id} "
            ."leases_fixed={$this->brouillon->id} leases_to_review={$this->actif->id}",
            $sortie,
        );
    }

    /**
     * verif-603 M1 (v10) — l'ancien geste a rendu à son bailleur un bien SAISI par un agent : l'origine
     * n'est pas un bailleur, le bien n'est pas « rendu » à l'agent, et le brouillon du bailleur reste le sien.
     */
    public function test_une_origine_qui_n_est_pas_bailleur_est_listee_sans_ecriture(): void
    {
        $saisi = $this->bienDe($this->agency, $this->x);
        $saisi->update(['user_id' => $this->b->id]);
        $brouillon = Lease::factory()->create([
            'property_id' => $saisi->id, 'landlord_id' => $this->b->id, 'agency_id' => $this->agency->id,
        ]);

        $sortie = $this->repair();

        $this->assertStringContainsString(
            "review property={$saisi->id} reason=original_not_landlord owner={$this->b->id} original={$this->x->id}",
            $sortie,
        );
        $this->assertSame($this->b->id, (int) $saisi->fresh()->user_id);
        $this->assertSame($this->b->id, (int) $brouillon->fresh()->landlord_id);
        // Le bien de référence, lui, est rendu : le motif est jugé bien par bien.
        $this->assertSame($this->b->id, (int) $this->p->fresh()->user_id);
    }

    /** verif-603 M1 (v6) — un agent parti ne redevient pas titulaire, et ne récupère aucun droit. */
    public function test_un_agent_parti_ne_redevient_pas_titulaire(): void
    {
        $saisi = $this->bienDe($this->agency, $this->x);
        $saisi->update(['user_id' => $this->y->id]);
        $this->x->agentProfiles()->delete();

        $this->assertStringContainsString("review property={$saisi->id} reason=original_not_landlord", $this->repair());
        $this->assertSame($this->y->id, (int) $saisi->fresh()->user_id);
        $this->assertFalse($this->x->fresh()->can('update', $saisi->fresh()));
    }

    /** verif-603 m1 — un titulaire d'origine supprimé (suppression douce) n'existe plus : listé. */
    public function test_un_titulaire_d_origine_supprime_en_douceur_est_liste(): void
    {
        $this->b->delete();

        $this->assertStringContainsString(
            "review property={$this->p->id} reason=original_missing owner={$this->y->id} original={$this->b->id}",
            $this->repair(),
        );
        $this->assertSame($this->y->id, (int) $this->p->fresh()->user_id);
    }

    /** ADR-0059 §6 — un profil bailleur supprimé ne fait plus de l'origine un bailleur. */
    public function test_une_origine_dont_le_profil_bailleur_est_supprime_est_listee(): void
    {
        OwnerProfile::query()->where('user_id', $this->b->id)->delete();

        $this->assertStringContainsString("review property={$this->p->id} reason=original_not_landlord", $this->repair());
        $this->assertSame($this->y->id, (int) $this->p->fresh()->user_id);
    }

    /** ADR-0059 §6 — un passage d'un bailleur à un autre a pu être un transfert légitime : listé. */
    public function test_un_titulaire_actuel_bailleur_est_liste(): void
    {
        $autre = $this->bailleur($this->agency);
        $this->p->update(['user_id' => $autre->id]);

        $this->assertStringContainsString("review property={$this->p->id} reason=current_is_landlord", $this->repair());
        $this->assertSame($autre->id, (int) $this->p->fresh()->user_id);
    }

    /** ADR-0059 §6 — sans agence, rien ne dit que l'origine est un bailleur : listé. */
    public function test_un_bien_sans_agence_est_liste(): void
    {
        $particulier = User::factory()->create();
        $libre = $this->bienDe(null, $particulier);
        $libre->update(['user_id' => $this->x->id]);

        $this->assertStringContainsString("review property={$libre->id} reason=no_agency", $this->repair());
        $this->assertSame($this->x->id, (int) $libre->fresh()->user_id);
    }

    /** verif-603 m2 — un agent désigné APRÈS la réattribution fautive est un choix de l'agence : rien n'est écrit. */
    public function test_une_designation_posterieure_n_est_pas_ecrasee(): void
    {
        $z = $this->personnel($this->agency);
        app(PrimaryAgentDesignator::class)->designate($this->p, $this->collaborateur($this->p, $z), null);

        $sortie = $this->repair();

        $this->assertStringContainsString("review property={$this->p->id} reason=designated_after", $sortie);
        $this->assertSame($this->y->id, (int) $this->p->fresh()->user_id);
        $this->assertSame($z->id, $this->contactDe($this->p));
        $this->assertSame($this->y->id, (int) $this->brouillon->fresh()->landlord_id);
    }

    /** m2, le journal : la ligne désignée après coup a disparu depuis, sa désignation reste un choix de l'agence. */
    public function test_une_designation_posterieure_dont_la_ligne_a_disparu_compte_encore(): void
    {
        $z = $this->personnel($this->agency);
        $ligne = $this->collaborateur($this->p, $z);
        app(PrimaryAgentDesignator::class)->designate($this->p, $ligne, null);
        $ligne->delete();

        $this->assertStringContainsString("review property={$this->p->id} reason=designated_after", $this->repair());
        $this->assertSame($this->y->id, (int) $this->p->fresh()->user_id);
    }

    /** m2, la date de la ligne : une marque posée hors du service (sans journal) compte aussi. */
    public function test_une_marque_posee_apres_sans_journal_compte_aussi(): void
    {
        $z = $this->personnel($this->agency);
        $ligne = $this->collaborateur($this->p, $z);
        $ligne->forceFill(['is_primary' => true])->save();

        $this->assertStringContainsString("review property={$this->p->id} reason=designated_after", $this->repair());
        $this->assertSame($this->y->id, (int) $this->p->fresh()->user_id);
    }

    /** verif-603 m5 (V4) — un bail créé AVANT la première réattribution n'est jamais réécrit, même au nom d'une cible. */
    public function test_un_bail_anterieur_a_la_reattribution_n_est_pas_touche(): void
    {
        $ancien = Lease::factory()->create([
            'property_id' => $this->p->id, 'landlord_id' => $this->y->id, 'agency_id' => $this->agency->id,
        ]);
        $ancien->forceFill(['created_at' => now()->subYear()])->saveQuietly();

        $this->repair();

        $this->assertSame($this->y->id, (int) $ancien->fresh()->landlord_id);
        $this->assertSame($this->b->id, (int) $this->brouillon->fresh()->landlord_id);
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
