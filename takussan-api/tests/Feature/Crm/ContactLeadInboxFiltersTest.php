<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\PropertyContactLead;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2583 — les filtres de la boîte « Demandes » : `unassigned`, `search`, `created_at_min/max`,
 * `responded`, et le tri par date dans les deux sens.
 */
class ContactLeadInboxFiltersTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agence = $this->agence();
        // L'agent système détient `crm.view_all` : il lit toute la boîte de l'agence.
        $this->admin = $this->personnel($this->agence);
    }

    private function demande(array $attributs = []): PropertyContactLead
    {
        return PropertyContactLead::factory()->create($attributs + [
            'property_id' => $this->bienDe($this->agence)->id,
            'agency_id' => $this->agence->id,
            'recipient_user_id' => $this->admin->id,
        ]);
    }

    /** @return list<int> */
    private function ids(string $query): array
    {
        Sanctum::actingAs($this->admin);

        return collect($this->getJson('/api/contact-leads?'.$query)->assertOk()->json('data'))
            ->pluck('id')->sort()->values()->all();
    }

    /** AC3 — sans destinataire, ou adressée à un agent désactivé : orpheline ; celle d'un agent actif ne l'est pas. */
    public function test_ac3_unassigned_rend_les_demandes_sans_porteur_actif(): void
    {
        $actif = $this->personnel($this->agence);
        $desactive = $this->personnel($this->agence);
        AgentProfile::query()->where('user_id', $desactive->id)->update(['status' => AgentProfileStatus::Inactive->value]);

        $sansDestinataire = $this->demande(['recipient_user_id' => null]);
        $chezLeDesactive = $this->demande(['recipient_user_id' => $desactive->id]);
        $chezLActif = $this->demande(['recipient_user_id' => $actif->id]);

        $this->assertSame(
            collect([$sansDestinataire->id, $chezLeDesactive->id])->sort()->values()->all(),
            $this->ids('filter[unassigned]=1'),
        );
        $this->assertNotContains($chezLActif->id, $this->ids('filter[unassigned]=1'));
        // `unassigned=0` n'est pas un filtre : tout revient.
        $this->assertContains($chezLActif->id, $this->ids('filter[unassigned]=0'));
    }

    /** AC3 — `search` trouve par le message, et aussi par nom, téléphone, e-mail ; la casse ne compte pas. */
    public function test_ac3_search_trouve_par_message_nom_telephone_et_email(): void
    {
        $garant = $this->demande(['message' => 'Bonjour, faut-il un GARANT pour ce bien ?', 'name' => 'Awa Diop']);
        $this->demande(['message' => 'Disponible en décembre ?', 'name' => 'Moussa Fall', 'phone' => '+221770000001', 'email' => 'moussa@example.com']);

        $this->assertSame([$garant->id], $this->ids('filter[search]=garant'));
        $this->assertCount(1, $this->ids('filter[search]=moussa'));
        $this->assertCount(1, $this->ids('filter[search]=0000001'));
        $this->assertCount(1, $this->ids('filter[search]=moussa@example'));
    }

    public function test_plage_de_dates_et_tri(): void
    {
        $this->travelTo(Carbon::parse('2026-11-01 09:00:00'));
        $ancienne = $this->demande();
        $this->travelTo(Carbon::parse('2026-11-05 09:00:00'));
        $milieu = $this->demande();
        $this->travelTo(Carbon::parse('2026-11-09 09:00:00'));
        $recente = $this->demande();

        $this->assertSame([$milieu->id], $this->ids('filter[created_at_min]=2026-11-03&filter[created_at_max]=2026-11-06'));
        // Une borne haute en date seule couvre tout le jour.
        $this->assertSame([$ancienne->id, $milieu->id], $this->ids('filter[created_at_max]=2026-11-05'));

        Sanctum::actingAs($this->admin);
        $this->assertSame([$ancienne->id, $milieu->id, $recente->id],
            collect($this->getJson('/api/contact-leads?sort=created_at')->assertOk()->json('data'))->pluck('id')->all());
        $this->assertSame([$recente->id, $milieu->id, $ancienne->id],
            collect($this->getJson('/api/contact-leads?sort=-created_at')->assertOk()->json('data'))->pluck('id')->all());

        $this->getJson('/api/contact-leads?filter[created_at_min]=pas-une-date')->assertStatus(422);
    }

    public function test_responded_separe_les_demandes_repondues(): void
    {
        $repondue = $this->demande();
        $attente = $this->demande();

        Sanctum::actingAs($this->admin);
        $this->postJson("/api/contact-leads/{$repondue->id}/contacts", ['channel' => 'call'])->assertNoContent();

        $this->assertSame([$repondue->id], $this->ids('filter[responded]=1'));
        $this->assertSame([$attente->id], $this->ids('filter[responded]=0'));
        // Répondre ne vaut pas traiter : la demande répondue reste dans « à traiter ».
        $this->assertContains($repondue->id, $this->ids('filter[handled]=0'));

        // `first_responded_at` se demande en sparse fieldset.
        $this->getJson('/api/contact-leads?fields[property_contact_leads]=id,first_responded_at')->assertOk();
    }
}
