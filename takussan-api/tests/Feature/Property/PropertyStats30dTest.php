<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\Conversation;
use App\Models\Enums\ConversationType;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\PropertyDailyView;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2905 (ADR-0117 § 4) — `GET /api/properties?include=stats30d` : vues, contacts et visites des 30
 * derniers jours (aujourd'hui compris), en un nombre de requêtes indépendant du nombre de biens ; jamais
 * sur la liste publique.
 */
class PropertyStats30dTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-15 10:00:00');
        $this->agency = Agency::factory()->create();
        $this->agent = $this->agencyAgent($this->agency);
    }

    private function bien(): Property
    {
        return Property::factory()->published()->create(['agency_id' => $this->agency->id, 'user_id' => $this->agent->id]);
    }

    /** @return array<int, array<string, mixed>> */
    private function lignes(string $query = ''): array
    {
        return collect($this->actingAsApi($this->agent)
            ->getJson('/api/properties?include=stats30d&fields[properties]=id,title&per_page=50'.$query)
            ->assertOk()->json('data'))->keyBy('id')->all();
    }

    private function vues(Property $bien, string $jour, int $n): void
    {
        PropertyDailyView::query()->create(['property_id' => $bien->id, 'day' => $jour, 'views' => $n]);
    }

    public function test_ac2_les_vues_du_jour_31_sont_exclues(): void
    {
        $bien = $this->bien();
        $this->vues($bien, '2026-11-15', 5);
        $this->vues($bien, '2026-10-15', 7); // il y a 31 jours
        $this->vues($bien, '2026-10-17', 0); // J-29, borne incluse (vide : rien à ajouter)

        $this->assertSame(['views' => 5, 'contacts' => 0, 'visits' => 0], $this->lignes()[$bien->id]['stats_30d']);
    }

    public function test_la_borne_j_29_est_comprise(): void
    {
        $bien = $this->bien();
        $this->vues($bien, '2026-10-17', 3); // J-29 : dans la fenêtre de 30 jours
        $this->vues($bien, '2026-10-16', 4); // J-30 : dehors

        $this->assertSame(3, $this->lignes()[$bien->id]['stats_30d']['views']);
    }

    public function test_ac3_contacts_et_visites_dans_la_fenetre(): void
    {
        $bien = $this->bien();
        PropertyContactLead::factory()->create(['property_id' => $bien->id, 'created_at' => '2026-11-10 09:00:00']);
        // Un fil direct ouvert sur le bien par un prospect (`contact-message`, sans piste) : un contact.
        Conversation::factory()->create(['property_id' => $bien->id, 'type' => ConversationType::Direct, 'created_at' => '2026-11-12 09:00:00']);
        // Hors compte : un contact ancien, un fil ouvert par le titulaire, un fil de groupe.
        PropertyContactLead::factory()->create(['property_id' => $bien->id, 'created_at' => '2026-10-01 09:00:00']);
        Conversation::factory()->create(['property_id' => $bien->id, 'created_by' => $this->agent->id, 'created_at' => '2026-11-12 09:00:00']);
        Conversation::factory()->create(['property_id' => $bien->id, 'type' => ConversationType::Group, 'created_at' => '2026-11-12 09:00:00']);

        PropertyVisit::factory()->create(['property_id' => $bien->id, 'created_at' => '2026-11-11 09:00:00']);
        // Hors compte : une visite annulée, une visite demandée et faite avant la fenêtre.
        PropertyVisit::factory()->create(['property_id' => $bien->id, 'status' => VisitStatus::Cancelled, 'created_at' => '2026-11-11 09:00:00']);
        PropertyVisit::factory()->create(['property_id' => $bien->id, 'status' => VisitStatus::Completed, 'created_at' => '2026-09-01 09:00:00', 'completed_at' => '2026-09-05 09:00:00']);

        $this->assertSame(['views' => 0, 'contacts' => 2, 'visits' => 1], $this->lignes()[$bien->id]['stats_30d']);
    }

    public function test_une_visite_demandee_avant_et_faite_dans_la_fenetre_compte(): void
    {
        $bien = $this->bien();
        PropertyVisit::factory()->create(['property_id' => $bien->id, 'status' => VisitStatus::Completed, 'created_at' => '2026-10-01 09:00:00', 'completed_at' => '2026-11-02 09:00:00']);

        $this->assertSame(1, $this->lignes()[$bien->id]['stats_30d']['visits']);
    }

    public function test_sans_l_inclusion_la_cle_est_absente(): void
    {
        $bien = $this->bien();
        $ligne = $this->actingAsApi($this->agent)->getJson('/api/properties?fields[properties]=id,title')->assertOk()->json('data.0');

        $this->assertSame($bien->id, $ligne['id']);
        $this->assertArrayNotHasKey('stats_30d', $ligne);
    }

    private function requetes(int $attendus): int
    {
        $this->actingAsApi($this->agent);
        DB::flushQueryLog();
        DB::enableQueryLog();
        $data = $this->getJson('/api/properties?include=stats30d&fields[properties]=id,title,agency_id,user_id&per_page=50')->assertOk()->json('data');
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();
        $this->assertCount($attendus, $data);
        $this->assertSame(['views' => 1, 'contacts' => 1, 'visits' => 1], $data[0]['stats_30d']);

        return $count;
    }

    private function lot(int $n): void
    {
        foreach (range(1, $n) as $_) {
            $bien = $this->bien();
            $this->vues($bien, '2026-11-14', 1);
            PropertyContactLead::factory()->create(['property_id' => $bien->id, 'created_at' => '2026-11-14 09:00:00']);
            PropertyVisit::factory()->create(['property_id' => $bien->id, 'created_at' => '2026-11-14 09:00:00']);
        }
    }

    public function test_ac4_le_nombre_de_requetes_ne_depend_pas_du_nombre_de_biens(): void
    {
        $this->lot(2);
        $this->requetes(2);
        $deux = $this->requetes(2);
        $this->lot(18);

        $this->assertSame($deux, $this->requetes(20));
    }

    public function test_ac5_la_liste_publique_ne_rend_pas_stats_30d(): void
    {
        $bien = $this->bien();
        $this->vues($bien, '2026-11-15', 5);

        // La liste publique n'a pas d'inclusions : le paramètre est ignoré, et aucune ligne ne porte la clé.
        $data = $this->getJson('/api/public/properties?include=stats30d')->assertOk()->json('data');
        $this->assertContains($bien->id, array_column($data, 'id'));
        foreach ($data as $ligne) {
            $this->assertArrayNotHasKey('stats_30d', $ligne);
        }
        $this->assertStringNotContainsString('stats_30d', $this->getJson('/api/public/properties')->getContent());
    }
}
