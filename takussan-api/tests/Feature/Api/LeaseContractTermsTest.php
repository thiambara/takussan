<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-596 (VERIF-596 M2, ADR-0042 §1) — le contrat signé imprime ce que le bail exécute.
 *
 * Avant : `pdf.leases.contract` n'imprimait ni la pénalité de retard (taux, délai de grâce), ni
 * `special_conditions`, ni le préavis — que `ApplyLateFeesJob` et `EarlyTerminationService`
 * appliquent après activation. Le locataire consentait par code à un document muet, et le faux
 * rendu des tests de signature imprimait `late_fee_percent` à la place du vrai gabarit. Ici, la
 * VRAIE vue est rendue (sans le pied de page horodaté), colonne par colonne.
 */
class LeaseContractTermsTest extends TestCase
{
    use RefreshDatabase;

    /** Deux valeurs par terme imprimé : le rendu doit différer de l'une à l'autre. */
    private const VARIANTS = [
        'type' => ['residential_rent', 'commercial_rent'],
        'start_date' => ['2026-01-01', '2026-02-01'],
        'end_date' => ['2027-01-01', '2027-06-30'],
        'renewal_date' => [null, '2026-12-01'],
        'monthly_rent' => [400_000, 450_000],
        'sale_price' => [null, 50_000_000],
        'currency' => ['XOF', 'EUR'],
        'deposit_amount' => [800_000, 900_000],
        'payment_frequency' => ['monthly', 'quarterly'],
        'payment_day' => [5, 10],
        'late_fee_percent' => [5, 7.5],
        'late_fee_grace_days' => [3, 0],
        'notice_period_days' => [30, 60],
        'terms' => ['Clauses générales A.', 'Clauses générales B.'],
        'special_conditions' => ['AUCUN ANIMAL', 'TOUT AUTRE CHOSE'],
    ];

    private function lease(array $attributes = []): Lease
    {
        $landlord = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $landlord->id]);

        return Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $landlord->id,
            'tenant_id' => Customer::factory()->create()->id,
        ] + $attributes);
    }

    private function render(Lease $lease): string
    {
        $lease->load(['property.address', 'tenant', 'landlord', 'agency', 'guarantors']);

        $html = view('pdf.leases.contract', [
            'title' => 'Contrat de bail',
            'document_label' => 'Bail',
            'lease' => $lease,
            'tenant' => $lease->tenant,
            'landlord' => $lease->landlord,
            'property' => $lease->property,
            'agency' => $lease->agency,
            'guarantors' => $lease->guarantors,
        ])->render();

        return (string) preg_replace('/Document généré le [^<]*/u', '', $html);
    }

    /** Chaque colonne remplissable choisit son camp : imprimée, ou non imprimée pour une raison écrite. */
    public function test_every_fillable_column_is_either_printed_or_excluded_with_a_reason(): void
    {
        $fillable = (new Lease)->getFillable();
        $printed = Lease::CONTRACT_PRINTED_TERMS;
        $unprinted = array_keys(Lease::CONTRACT_UNPRINTED_COLUMNS);

        $this->assertSame([], array_values(array_intersect($printed, $unprinted)), 'une colonne ne peut être des deux camps');
        $this->assertEqualsCanonicalizing($fillable, [...$printed, ...$unprinted]);
        $this->assertEqualsCanonicalizing($printed, array_keys(self::VARIANTS), 'chaque terme imprimé a ses deux valeurs ici');
    }

    /** Le rendu change quand UN terme imprimé change : il est donc bien dans le document signé. */
    public function test_each_printed_term_changes_the_rendered_contract(): void
    {
        $lease = $this->lease();
        $missing = [];

        foreach (self::VARIANTS as $column => [$a, $b]) {
            $lease->forceFill([$column => $a])->saveQuietly();
            $first = $this->render($lease->fresh());
            $lease->forceFill([$column => $b])->saveQuietly();
            $second = $this->render($lease->fresh());
            if ($first === $second) {
                $missing[] = $column;
            }
            $lease->forceFill([$column => $a])->saveQuietly();
        }

        $this->assertSame([], $missing, 'termes exécutés absents du contrat imprimé');
    }

    public function test_the_contract_prints_the_late_fee_and_the_special_conditions(): void
    {
        $html = $this->render($this->lease([
            'late_fee_percent' => 5, 'late_fee_grace_days' => 3, 'special_conditions' => 'AUCUN ANIMAL',
        ]));

        $this->assertStringContainsString('5 % de l\'échéance impayée', html_entity_decode($html, ENT_QUOTES));
        $this->assertStringContainsString('3 jour(s)', $html);
        $this->assertStringContainsString('AUCUN ANIMAL', $html);
    }

    /**
     * Second chemin (hors diff, fermé ici) : `PATCH` changeait la pénalité d'un bail ACTIF — la
     * pénalité exécutée n'était plus celle consentie.
     */
    public function test_a_signed_lease_terms_cannot_be_patched(): void
    {
        $lease = $this->lease(['status' => LeaseStatus::Active, 'late_fee_percent' => 5, 'late_fee_grace_days' => 3]);
        Sanctum::actingAs($lease->landlord);

        $this->patchJson("/api/leases/{$lease->id}", ['late_fee_percent' => 50])
            ->assertStatus(422)->assertJsonPath('code', 'lease.terms_locked');
        $this->patchJson("/api/leases/{$lease->id}", ['late_fee_grace_days' => 0])
            ->assertStatus(422)->assertJsonPath('code', 'lease.terms_locked');

        $fresh = $lease->fresh();
        $this->assertEquals(5, (float) $fresh->late_fee_percent);
        $this->assertSame(3, (int) $fresh->late_fee_grace_days);
    }

    public function test_a_draft_lease_terms_can_still_be_patched(): void
    {
        $lease = $this->lease(['late_fee_percent' => 5]);
        Sanctum::actingAs($lease->landlord);

        $this->patchJson("/api/leases/{$lease->id}", ['late_fee_percent' => 7])->assertOk();
        $this->assertEquals(7, (float) $lease->fresh()->late_fee_percent);
    }
}
