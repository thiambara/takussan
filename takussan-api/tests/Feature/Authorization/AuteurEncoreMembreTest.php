<?php

namespace Tests\Feature\Authorization;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Invoice;
use App\Models\Payout;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * P218.03 (TCK-2196) — ADR-0031, amendement du 2026-10-24 : la branche d'auteur d'une facture,
 * d'un reversement et d'une réservation ne vaut que si la ligne est sans agence ou si l'auteur est
 * encore membre de son agence (`isMemberAt`), comme `CustomerPolicy::isAuthorStillMember` ; les
 * listes suivent par `memberAgencyIds`. Le bailleur bloqué perd la lecture d'une facture qu'il a
 * émise (décision du porteur du 2026-10-24).
 *
 * Avant : l'agent suspendu ou retiré lisait et listait les factures, reversements et réservations
 * qu'il avait émis ou créés.
 */
class AuteurEncoreMembreTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->agent = $this->agencyAgent($this->agency);
    }

    /** @return array<string, array{0: string, 1: string}> */
    private function lignesDe(User $auteur): array
    {
        $invoice = Invoice::factory()->create(['issued_by_id' => $auteur->id, 'agency_id' => $this->agency->id]);
        $payout = Payout::factory()->create(['issued_by_id' => $auteur->id, 'agency_id' => $this->agency->id]);
        $booking = Booking::factory()->create([
            'created_by_id' => $auteur->id,
            'agency_id' => $this->agency->id,
            'property_id' => Property::factory()->create(['agency_id' => $this->agency->id])->id,
        ]);

        return [
            'facture' => ['/api/invoices', (string) $invoice->id],
            'reversement' => ['/api/payouts', (string) $payout->id],
            'réservation' => ['/api/bookings', (string) $booking->id],
        ];
    }

    private function assertNeLitNiNeListe(User $auteur, array $lignes): void
    {
        foreach ($lignes as $nom => [$chemin, $id]) {
            $this->actingAsApi($auteur)->getJson("{$chemin}/{$id}")->assertForbidden();
            $ids = collect($this->actingAsApi($auteur)->getJson($chemin)->assertOk()->json('data'))
                ->pluck('id')->map(fn ($v) => (string) $v)->all();
            $this->assertNotContains($id, $ids, "{$nom} encore listée");
        }
    }

    public function test_l_auteur_suspendu_ne_lit_ni_ne_liste_plus_ses_lignes(): void
    {
        $lignes = $this->lignesDe($this->agent);
        AgentProfile::query()->where('user_id', $this->agent->id)->update(['status' => AgentProfileStatus::Suspended->value]);

        $this->assertNeLitNiNeListe($this->agent->fresh(), $lignes);
    }

    public function test_l_auteur_retire_ne_lit_ni_ne_liste_plus_ses_lignes(): void
    {
        $lignes = $this->lignesDe($this->agent);
        AgentProfile::query()->where('user_id', $this->agent->id)->delete();

        $this->assertNeLitNiNeListe($this->agent->fresh(), $lignes);
    }

    public function test_temoin_l_auteur_actif_lit_et_liste_ses_lignes(): void
    {
        $lignes = $this->lignesDe($this->agent);

        foreach ($lignes as $nom => [$chemin, $id]) {
            $this->actingAsApi($this->agent)->getJson("{$chemin}/{$id}")->assertOk();
            $ids = collect($this->actingAsApi($this->agent)->getJson($chemin)->assertOk()->json('data'))
                ->pluck('id')->map(fn ($v) => (string) $v)->all();
            $this->assertContains($id, $ids, "{$nom} absente");
        }
    }

    public function test_le_bailleur_bloque_ne_lit_plus_la_facture_qu_il_a_emise(): void
    {
        $bailleur = User::factory()->create();
        OwnerProfile::factory()->create([
            'user_id' => $bailleur->id,
            'agency_id' => $this->agency->id,
            'status' => OwnerProfileStatus::Blocked->value,
        ]);
        $invoice = Invoice::factory()->create(['issued_by_id' => $bailleur->id, 'agency_id' => $this->agency->id]);

        $this->actingAsApi($bailleur)->getJson("/api/invoices/{$invoice->id}")->assertForbidden();
    }

    public function test_temoin_une_ligne_sans_agence_reste_a_son_auteur(): void
    {
        $auteur = User::factory()->create();
        $invoice = Invoice::factory()->create(['issued_by_id' => $auteur->id, 'agency_id' => null]);

        $this->actingAsApi($auteur)->getJson("/api/invoices/{$invoice->id}")->assertOk();
    }
}
