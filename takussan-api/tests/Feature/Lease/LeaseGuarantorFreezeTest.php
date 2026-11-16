<?php

namespace Tests\Feature\Lease;

use App\Models\Enums\LeaseStatus;
use App\Models\Guarantor;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-607 (n3, AC5) — les garants d'un bail signé sont figés : ils sont imprimés au contrat.
 *
 * Décision du porteur du 2026-11-16, option (b), ADR-0042 amendé : rattacher ou retirer un garant
 * se fait sur un bail `draft` ou `pending_signature` ; sur un bail `active`, seul l'enfant d'un
 * renouvellement qui n'a encore AUCUN garant en reçoit un (il naît sans, amendement TCK-2316) ;
 * partout ailleurs, 409 `lease.guarantors_frozen`, et rien n'est écrit (ni pivot, ni fiche neuve).
 */
class LeaseGuarantorFreezeTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: Lease} */
    private function bail(LeaseStatus $status, ?int $renewedFrom = null, ?string $sha = null): array
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $owner->id,
            'status' => $status,
            'renewed_from_lease_id' => $renewedFrom,
            'contract_sha256' => $sha,
        ]);

        return [$owner, $lease];
    }

    private function enfantDeRenouvellement(?string $sha = null): array
    {
        [$owner, $parent] = $this->bail(LeaseStatus::Renewed);
        $child = Lease::factory()->create([
            'property_id' => $parent->property_id,
            'landlord_id' => $owner->id,
            'status' => LeaseStatus::Active,
            'renewed_from_lease_id' => $parent->id,
            'contract_sha256' => $sha,
        ]);

        return [$owner, $child];
    }

    private function garantRattache(User $owner, Lease $lease): Guarantor
    {
        $g = Guarantor::factory()->create(['added_by_id' => $owner->id]);
        $lease->guarantors()->attach($g->id, ['role' => null]);

        return $g;
    }

    public function test_un_bail_actif_refuse_le_rattachement_sans_rien_ecrire(): void
    {
        [$owner, $lease] = $this->bail(LeaseStatus::Active);
        $avant = Guarantor::query()->count();
        Sanctum::actingAs($owner);

        $this->postJson("/api/leases/{$lease->id}/guarantors", ['first_name' => 'Awa', 'last_name' => 'Diop'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'lease.guarantors_frozen');

        $this->assertSame(0, $lease->guarantors()->count());
        $this->assertSame($avant, Guarantor::query()->count(), 'aucune fiche orpheline');
    }

    public function test_un_bail_actif_refuse_un_garant_existant(): void
    {
        [$owner, $lease] = $this->bail(LeaseStatus::Active);
        $g = Guarantor::factory()->create(['added_by_id' => $owner->id]);
        Sanctum::actingAs($owner);

        $this->postJson("/api/leases/{$lease->id}/guarantors", ['guarantor_id' => $g->id])
            ->assertStatus(409)
            ->assertJsonPath('code', 'lease.guarantors_frozen');

        $this->assertSame(0, $lease->guarantors()->count());
    }

    public function test_un_bail_actif_refuse_le_retrait(): void
    {
        [$owner, $lease] = $this->bail(LeaseStatus::Active);
        $g = $this->garantRattache($owner, $lease);
        Sanctum::actingAs($owner);

        $this->deleteJson("/api/leases/{$lease->id}/guarantors/{$g->id}")
            ->assertStatus(409)
            ->assertJsonPath('code', 'lease.guarantors_frozen');

        $this->assertSame(1, $lease->guarantors()->count());
    }

    /** @return array<string, array{LeaseStatus}> */
    public static function statutsFiges(): array
    {
        return [
            'active' => [LeaseStatus::Active],
            'terminating' => [LeaseStatus::Terminating],
            'terminated' => [LeaseStatus::Terminated],
            'expired' => [LeaseStatus::Expired],
            'renewed' => [LeaseStatus::Renewed],
        ];
    }

    #[DataProvider('statutsFiges')]
    public function test_hors_brouillon_et_attente_les_garants_sont_figes(LeaseStatus $status): void
    {
        [$owner, $lease] = $this->bail($status);
        $g = $this->garantRattache($owner, $lease);
        Sanctum::actingAs($owner);

        $this->postJson("/api/leases/{$lease->id}/guarantors", ['first_name' => 'Awa', 'last_name' => 'Diop'])
            ->assertStatus(409)->assertJsonPath('code', 'lease.guarantors_frozen');
        $this->deleteJson("/api/leases/{$lease->id}/guarantors/{$g->id}")
            ->assertStatus(409)->assertJsonPath('code', 'lease.guarantors_frozen');

        $this->assertSame([$g->id], $lease->guarantors()->pluck('guarantors.id')->all());
    }

    /** @return array<string, array{LeaseStatus}> */
    public static function statutsOuverts(): array
    {
        return [
            'draft' => [LeaseStatus::Draft],
            'pending_signature' => [LeaseStatus::PendingSignature],
        ];
    }

    #[DataProvider('statutsOuverts')]
    public function test_brouillon_et_attente_rattachent_et_retirent(LeaseStatus $status): void
    {
        [$owner, $lease] = $this->bail($status);
        Sanctum::actingAs($owner);

        $id = $this->postJson("/api/leases/{$lease->id}/guarantors", ['first_name' => 'Awa', 'last_name' => 'Diop'])
            ->assertCreated()
            ->json('data.guarantor_id');

        $this->deleteJson("/api/leases/{$lease->id}/guarantors/{$id}")->assertOk();
        $this->assertSame(0, $lease->guarantors()->count());
    }

    public function test_l_enfant_d_un_renouvellement_sans_garant_en_recoit_un(): void
    {
        [$owner, $child] = $this->enfantDeRenouvellement();
        Sanctum::actingAs($owner);

        $this->postJson("/api/leases/{$child->id}/guarantors", ['first_name' => 'Awa', 'last_name' => 'Diop'])
            ->assertCreated()
            ->assertJsonPath('data.guarantors_count', 1);
    }

    public function test_l_enfant_qui_a_deja_un_garant_est_fige(): void
    {
        [$owner, $child] = $this->enfantDeRenouvellement();
        Sanctum::actingAs($owner);

        $id = $this->postJson("/api/leases/{$child->id}/guarantors", ['first_name' => 'Awa', 'last_name' => 'Diop'])
            ->assertCreated()
            ->json('data.guarantor_id');

        // Un second garant, ou le retrait du premier : le contrat est de nouveau figé.
        $this->postJson("/api/leases/{$child->id}/guarantors", ['first_name' => 'Modou', 'last_name' => 'Fall'])
            ->assertStatus(409)->assertJsonPath('code', 'lease.guarantors_frozen');
        $this->deleteJson("/api/leases/{$child->id}/guarantors/{$id}")
            ->assertStatus(409)->assertJsonPath('code', 'lease.guarantors_frozen');

        $this->assertSame(1, $child->guarantors()->count());
    }

    /**
     * Mesure (ADR-0042, amendement du 2026-11-16) : `unfreezeContract()` n'agit que sur un bail en
     * attente de signature — l'empreinte du contrat de l'enfant `active` reste celle qu'il a signée.
     */
    public function test_le_garant_de_l_enfant_ne_touche_pas_l_empreinte_de_son_contrat(): void
    {
        $sha = str_repeat('a', 64);
        [$owner, $child] = $this->enfantDeRenouvellement($sha);
        Sanctum::actingAs($owner);

        $this->postJson("/api/leases/{$child->id}/guarantors", ['first_name' => 'Awa', 'last_name' => 'Diop'])
            ->assertCreated();

        $this->assertSame($sha, $child->fresh()->contract_sha256);
        $this->assertSame(LeaseStatus::Active, $child->fresh()->status);
    }

    // ── TCK-607 (suite) — la fiche ne propose le geste que là où l'API l'accepte ─────────────────

    private function ability(User $viewer, Lease $lease): mixed
    {
        Sanctum::actingAs($viewer);

        return $this->getJson("/api/leases/{$lease->id}")->assertOk()->json('data.abilities.attach_guarantor');
    }

    #[DataProvider('statutsOuverts')]
    public function test_la_fiche_offre_l_ajout_sur_un_bail_non_signe(LeaseStatus $status): void
    {
        [$owner, $lease] = $this->bail($status);

        $this->assertTrue($this->ability($owner, $lease));
    }

    #[DataProvider('statutsFiges')]
    public function test_la_fiche_n_offre_pas_l_ajout_sur_un_bail_fige(LeaseStatus $status): void
    {
        [$owner, $lease] = $this->bail($status);

        $this->assertFalse($this->ability($owner, $lease));
    }

    public function test_la_fiche_offre_l_ajout_a_l_enfant_sans_garant_une_fois(): void
    {
        [$owner, $child] = $this->enfantDeRenouvellement();
        $this->assertTrue($this->ability($owner, $child));

        $this->garantRattache($owner, $child);
        $this->assertFalse($this->ability($owner, $child));
    }

    public function test_la_fiche_n_offre_pas_l_ajout_sans_le_droit_d_ecrire(): void
    {
        // Le locataire lit sa fiche, il n'écrit pas le bail.
        [, $lease] = $this->bail(LeaseStatus::PendingSignature);
        $locataire = User::factory()->create();
        $lease->tenant->update(['user_id' => $locataire->id]);

        $this->assertFalse($this->ability($locataire, $lease));
    }
}
