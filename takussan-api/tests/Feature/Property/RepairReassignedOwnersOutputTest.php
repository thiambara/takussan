<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Services\Property\PrimaryAgentDesignator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\TestCase;

/**
 * TCK-616 (ADR-0059, amendement du 2026-11-16) — la sortie de `properties:repair-reassigned-owners`
 * se lit sans `activity_log` : faux négatifs de verif-603 passe 2 (FN1, FN2, FN3), et `leases_fixed`
 * qui portait deux sens.
 *
 * L'ordre dans le temps est POSÉ (`travelTo`) : dans un même instant, `updated_at >= since` tient
 * toujours, et un test vert ou rouge le serait pour une mauvaise raison.
 */
class RepairReassignedOwnersOutputTest extends TestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agency;

    private User $b;

    private User $x;

    private User $y;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Http::preventStrayRequests();

        $this->agency = $this->agence();
        $this->b = $this->bailleur($this->agency);
        $this->x = $this->personnel($this->agency);
        $this->y = $this->personnel($this->agency);
    }

    private function repair(): string
    {
        Artisan::call('properties:repair-reassigned-owners', ['--dry-run' => true]);

        return Artisan::output();
    }

    /** L'ancien geste, B → X → Y, à l'heure `$quand`. */
    private function reattribueA(Property $bien, string $quand): void
    {
        $this->travelTo($quand);
        $bien->update(['user_id' => $this->x->id]);
        $bien->update(['user_id' => $this->y->id]);
    }

    /** AC1, FN1 — un agent ajouté APRÈS, marqué par le remplissage d'ADR-0053 sans désignation : rendu, pas listé. */
    public function test_fn1_une_marque_de_remplissage_posterieure_n_est_pas_une_designation(): void
    {
        $bien = $this->bienDe($this->agency, $this->b);
        $this->reattribueA($bien, '2026-03-01 10:00:00');

        $this->travelTo('2026-03-02 10:00:00');
        $z = $this->personnel($this->agency);
        $this->collaborateur($bien, $z)->forceFill(['is_primary' => true])->save();

        $sortie = $this->repair();

        $this->assertStringNotContainsString('designated_after', $sortie);
        $this->assertStringContainsString("[dry-run] restore property={$bien->id} owner={$this->y->id}->{$this->b->id}", $sortie);
    }

    /** AC1, FN3 — marque ANTÉRIEURE, part de commission modifiée après : la ligne bouge, la désignation non. */
    public function test_fn3_une_marque_anterieure_retouchee_apres_n_est_pas_une_designation(): void
    {
        $bien = $this->bienDe($this->agency, $this->b);
        $z = $this->personnel($this->agency);

        $this->travelTo('2026-03-01 09:00:00');
        $ligne = $this->collaborateur($bien, $z);
        $ligne->forceFill(['is_primary' => true])->save();

        $this->reattribueA($bien, '2026-03-01 10:00:00');

        $this->travelTo('2026-03-01 11:00:00');
        $ligne->forceFill(['commission_share' => 40])->save();
        $this->assertTrue($ligne->fresh()->updated_at->isAfter('2026-03-01 10:00:00'));

        $sortie = $this->repair();

        $this->assertStringNotContainsString('designated_after', $sortie);
        $this->assertStringContainsString("[dry-run] restore property={$bien->id}", $sortie);
    }

    /** AC1 — une désignation RÉELLE après la réattribution : `designated_after`, la chaîne lisible. */
    public function test_une_designation_reelle_posterieure_reste_designated_after(): void
    {
        $bien = $this->bienDe($this->agency, $this->b);
        $this->reattribueA($bien, '2026-03-01 10:00:00');

        $this->travelTo('2026-03-02 10:00:00');
        $z = $this->personnel($this->agency);
        app(PrimaryAgentDesignator::class)->designate($bien, $this->collaborateur($bien, $z), null);

        $this->assertStringContainsString(
            "[dry-run] review property={$bien->id} reason=designated_after owner={$this->y->id} original={$this->b->id} "
            ."chain={$this->b->id}>{$this->x->id}>{$this->y->id}",
            $this->repair(),
        );
    }

    /** AC2, FN2 — saisi par X, rendu au bailleur B5, puis réattribué à Y : la ligne nomme B5. */
    public function test_fn2_la_chaine_nomme_le_bailleur_intermediaire(): void
    {
        $b5 = $this->bailleur($this->agency);
        $bien = $this->bienDe($this->agency, $this->x);
        $this->travelTo('2026-03-01 10:00:00');
        $bien->update(['user_id' => $b5->id]);
        $bien->update(['user_id' => $this->y->id]);

        $this->assertStringContainsString(
            "[dry-run] review property={$bien->id} reason=original_not_landlord owner={$this->y->id} original={$this->x->id} "
            ."chain={$this->x->id}>{$b5->id}>{$this->y->id}",
            $this->repair(),
        );
    }

    /** AC3 — la ligne `restore` liste les baux par `leases_fixed_ids=` ; le bilan les COMPTE par `leases_fixed=`. */
    public function test_les_baux_rectifies_sont_listes_sur_la_ligne_et_comptes_au_bilan(): void
    {
        $bien = $this->bienDe($this->agency, $this->b);
        $this->reattribueA($bien, '2026-03-01 10:00:00');
        $this->travelTo('2026-03-01 11:00:00');
        $brouillons = collect(range(1, 3))->map(fn () => Lease::factory()->create([
            'property_id' => $bien->id, 'landlord_id' => $this->y->id, 'agency_id' => $this->agency->id,
        ])->id)->sort()->values();
        $actif = Lease::factory()->active()->create([
            'property_id' => $bien->id, 'landlord_id' => $this->y->id, 'agency_id' => $this->agency->id,
        ]);

        $sortie = $this->repair();

        $this->assertStringContainsString(
            "restore property={$bien->id} owner={$this->y->id}->{$this->b->id} responsible={$this->y->id} "
            .'leases_fixed_ids='.$brouillons->implode(',')." leases_to_review_ids={$actif->id} "
            ."chain={$this->b->id}>{$this->x->id}>{$this->y->id}",
            $sortie,
        );
        $this->assertStringContainsString('[dry-run] restored=1 responsible_set=1 leases_fixed=3 leases_to_review=1 owners_to_review=0', $sortie);
        $this->assertStringNotContainsString(' leases_fixed='.$brouillons->first(), $sortie);
    }
}
