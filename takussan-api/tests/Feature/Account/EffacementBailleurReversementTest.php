<?php

namespace Tests\Feature\Account;

use App\Models\AccountDeletionRequest;
use App\Models\Agency;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PayoutStatus;
use App\Models\Lease;
use App\Models\Payout;
use App\Models\User;
use App\Services\Account\AccountDeletionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-2015 (P175.03) — un bailleur n'efface pas son compte tant qu'une pièce lui reste à reverser
 * ou qu'un reversement lui est en cours ; une fois effacé, son relevé de gérance reste lisible par
 * le personnel de l'agence. La préparation d'un reversement, elle, reste fermée.
 */
class EffacementBailleurReversementTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agence;

    private User $bailleur;

    private Lease $bail;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agence = $this->moneyAgency();
        $this->bailleur = $this->landlordOf($this->agence);
        $this->bail = $this->leaseOf($this->agence, $this->bailleur);
        $this->septemberOf($this->bail);
        // Un bail clos : seule la somme due au bailleur peut encore retenir l'effacement.
        $this->bail->forceFill(['status' => LeaseStatus::Terminated])->save();
    }

    /** @return list<string> */
    private function obligations(): array
    {
        return array_column(app(AccountDeletionService::class)->collectOpenObligations($this->bailleur->fresh()), 'type');
    }

    private function reverser(): Payout
    {
        Sanctum::actingAs($this->agencyAgent($this->agence));
        $preparation = $this->getJson("/api/payouts/preparation?landlord_id={$this->bailleur->id}&period_start=2026-09-01&period_end=2026-09-30")
            ->assertOk()->json('data');
        $id = $this->postJson('/api/payouts', [
            'landlord_id' => $this->bailleur->id,
            'lease_payment_ids' => array_column($preparation['lines']['lease_payments'], 'id'),
        ])->assertCreated()->json('data.id');

        return Payout::query()->findOrFail($id);
    }

    public function test_une_piece_reversable_retient_l_effacement(): void
    {
        $this->assertSame(['payout_due'], $this->obligations());
    }

    public function test_un_reversement_en_cours_retient_l_effacement(): void
    {
        $payout = $this->reverser();
        $this->assertContains($payout->status, PayoutStatus::upcoming());

        $this->assertSame(['payout'], $this->obligations());
    }

    public function test_un_reversement_verse_ne_retient_plus_l_effacement(): void
    {
        $this->reverser()->forceFill(['status' => PayoutStatus::Completed])->save();

        $this->assertSame([], $this->obligations());
    }

    public function test_un_reversement_annule_rend_ses_pieces_reversables(): void
    {
        $payout = $this->reverser();
        Sanctum::actingAs($this->agencyAgent($this->agence));
        $this->postJson("/api/payouts/{$payout->id}/cancel", ['reason' => 'erreur'])->assertOk();
        $this->assertSame(PayoutStatus::Cancelled, $payout->fresh()->status);

        $this->assertSame(['payout_due'], $this->obligations());
    }

    public function test_le_releve_d_un_bailleur_efface_reste_lisible_et_la_preparation_fermee(): void
    {
        $this->reverser()->forceFill(['status' => PayoutStatus::Completed])->save();
        $agent = $this->agencyAgent($this->agence);
        $releve = "/api/owner-statements?period=2026-09&landlord_id={$this->bailleur->id}&agency_id={$this->agence->id}";

        Sanctum::actingAs($agent);
        $avant = $this->getJson($releve)->assertOk()->json('data.totals');

        $request = AccountDeletionRequest::factory()->for($this->bailleur)->due()->create();
        app(AccountDeletionService::class)->executeDeletion($request);
        $this->assertTrue(User::withTrashed()->findOrFail($this->bailleur->id)->trashed());

        Sanctum::actingAs($agent);
        $this->assertSame($avant, $this->getJson($releve)->assertOk()->json('data.totals'));

        // Hors de l'agence, ou sans `payouts.create`, toujours refusé.
        Sanctum::actingAs($this->agencyAgent($this->moneyAgency()));
        $this->getJson($releve)->assertForbidden();

        // La préparation reste fermée (décision du porteur).
        Sanctum::actingAs($agent);
        $this->getJson("/api/payouts/preparation?landlord_id={$this->bailleur->id}&period_start=2026-09-01&period_end=2026-09-30")
            ->assertNotFound();
    }
}
