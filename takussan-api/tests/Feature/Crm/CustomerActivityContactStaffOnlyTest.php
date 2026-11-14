<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\ContactGestureChannel;
use App\Models\PropertyContactLead;
use App\Models\User;
use App\Services\Crm\ContactGestureService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2754 — le journal de la fiche (`GET /api/customers/{id}/activity`) rendait au bailleur auteur
 * les gestes de contact de l'agence : qui a appelé (`causer`) et quand (`created_at`), alors que la
 * fiche lui cache `last_contacted_at` et que le fil (`/timeline`) ne les rend qu'au personnel.
 * `docs/features.md` § 1.6 les réserve au personnel de l'agence de la fiche.
 */
class CustomerActivityContactStaffOnlyTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $bailleurAuteur;

    private User $agent;

    private Customer $fiche;

    private PropertyContactLead $demande;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo(Carbon::parse('2026-11-10 08:00:00'));

        $this->agence = $this->agence();
        $this->bailleurAuteur = $this->bailleur($this->agence);
        $this->agent = $this->personnel($this->agence, 'agency_admin');

        $this->fiche = $this->ficheClient($this->agence, null, ['added_by_id' => $this->bailleurAuteur->id]);
        $this->demande = PropertyContactLead::factory()->create([
            'property_id' => $this->bienDe($this->agence, $this->bailleurAuteur)->id,
            'agency_id' => $this->agence->id,
            'recipient_user_id' => $this->agent->id,
            'customer_id' => $this->fiche->id,
        ]);
    }

    /** L'agence appelle la fiche à 09:30, puis écrit sur WhatsApp à sa demande rattachée à 10:15. */
    private function gestesDeLAgence(): void
    {
        $gestes = app(ContactGestureService::class);
        $this->travelTo(Carbon::parse('2026-11-10 09:30:00'));
        $gestes->onCustomer($this->fiche, $this->agent, ContactGestureChannel::Call);
        $this->travelTo(Carbon::parse('2026-11-10 10:15:00'));
        $gestes->onLead($this->demande, $this->agent, ContactGestureChannel::Whatsapp);
    }

    /** @return array{0: list<array<string, mixed>>, 1: int} */
    private function journal(User $lecteur): array
    {
        Sanctum::actingAs($lecteur);
        $reponse = $this->getJson("/api/customers/{$this->fiche->id}/activity?per_page=100")->assertOk();

        return [$reponse->json('data'), (int) $reponse->json('meta.total')];
    }

    public function test_ac1_le_bailleur_auteur_ne_lit_aucun_geste_de_contact_et_le_total_ne_les_compte_pas(): void
    {
        [, $totalAvant] = $this->journal($this->bailleurAuteur);

        $this->gestesDeLAgence();
        [$entrees, $totalApres] = $this->journal($this->bailleurAuteur);

        $this->assertSame([], collect($entrees)->where('event', ContactGestureService::EVENT)->values()->all());
        $this->assertSame([], collect($entrees)->where('subject', 'lead')->values()->all());
        $this->assertSame($totalAvant, $totalApres, 'le total du bailleur est celui d’un journal sans appel');
        $this->assertCount($totalApres, $entrees);

        // AC1, seconde moitié : aucune autre entrée ne porte l'heure d'un geste.
        $heures = collect($entrees)->pluck('created_at')->all();
        $this->assertNotContains('2026-11-10T09:30:00+00:00', $heures);
        $this->assertNotContains('2026-11-10T10:15:00+00:00', $heures);
    }

    public function test_ac2_le_personnel_lit_les_gestes_avec_leur_canal_et_leur_auteur(): void
    {
        [, $totalAvant] = $this->journal($this->agent);

        $this->gestesDeLAgence();
        [$entrees, $totalApres] = $this->journal($this->agent);

        $gestes = collect($entrees)->where('event', ContactGestureService::EVENT)->values();
        $this->assertSame(['lead:whatsapp', 'customer:call'], $gestes->map(fn (array $g) => $g['subject'].':'.$g['channel'])->all());
        $this->assertSame([$this->agent->id, $this->agent->id], $gestes->pluck('causer.id')->all());
        $this->assertSame($totalAvant + 2, $totalApres);
    }
}
