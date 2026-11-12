<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2587 (lot C) — « Mes visites » : le client joint l'agent de sa prochaine visite (Appeler,
 * WhatsApp). Décision a) du team-lead, confirmée par le porteur : `agent.phone`, `agent.phone_whatsapp`
 * et `agent.agency_name` au SEUL demandeur, sur une visite CONFIRMÉE et À VENIR ; clés absentes
 * partout ailleurs. Les tests négatifs cherchent le numéro dans la réponse ENTIÈRE, pas seulement
 * sous `agent` : une fuite par une autre clé se verrait aussi.
 */
class PropertyVisitContactDeLAgentTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private const NUMERO = '+221776543210';

    /** La lecture du front (`useVisitesDuClient`) : colonnes choisies, `include=property,agent`. */
    private const COMME_LE_FRONT = '?include=property,agent&fields[property_visits]=id,property_id,visitor_id,agent_id,status,scheduled_at'
        .'&fields[properties]=id,title,slug&fields[users]=id,first_name,last_name';

    private Agency $agence;

    private Property $bien;

    private User $agent;

    private User $visiteur;

    private PropertyVisit $visite;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agence = $this->agence();
        $this->agence->forceFill(['name' => 'Agence Teranga'])->save();
        $this->bien = $this->bienDe($this->agence);
        $this->agent = $this->personnel($this->agence, attributes: [
            'first_name' => 'Moussa',
            'phone' => self::NUMERO,
            'phone_verified_at' => now()->subMonth(),
            'phone_whatsapp' => true,
        ]);
        $this->visiteur = $this->client();
        $this->visite = $this->visiteDe($this->visiteur, VisitStatus::Confirmed, $this->creneau(2));
    }

    private function visiteDe(User $visiteur, VisitStatus $statut, string $quand): PropertyVisit
    {
        return PropertyVisit::factory()->create([
            'property_id' => $this->bien->id,
            'visitor_id' => $visiteur->id,
            'agent_id' => $this->agent->id,
            'status' => $statut,
            'scheduled_at' => $quand,
        ]);
    }

    /**
     * Le détail et la liste, sous la forme du front et sans `fields` : la même réponse partout.
     *
     * @return list<array{0: string, 1: ?array<string, mixed>}> [corps brut, bloc `agent` de la visite]
     */
    private function lectures(User $lecteur): array
    {
        Sanctum::actingAs($lecteur);
        $out = [];
        foreach (['?include=property,agent', self::COMME_LE_FRONT] as $suffixe) {
            $show = $this->getJson("/api/property-visits/{$this->visite->id}{$suffixe}");
            if ($show->status() === 200) {
                $out[] = [$show->getContent(), $show->json('data.agent')];
            } else {
                $out[] = [$show->getContent(), null];
            }
            $liste = $this->getJson('/api/property-visits'.$suffixe)->assertOk();
            $ligne = collect($liste->json('data'))->firstWhere('id', $this->visite->id);
            $out[] = [$liste->getContent(), $ligne['agent'] ?? null];
        }

        return $out;
    }

    private function assertAucunContact(User $lecteur, string $pourquoi): void
    {
        foreach ($this->lectures($lecteur) as [$corps, $agent]) {
            $this->assertStringNotContainsString(self::NUMERO, $corps, "{$pourquoi} : le numéro de l'agent ne sort pas");
            $this->assertStringNotContainsString('Agence Teranga', $corps, "{$pourquoi} : le nom de l'agence ne sort pas");
            if ($agent !== null) {
                $this->assertArrayNotHasKey('phone', $agent, $pourquoi);
                $this->assertArrayNotHasKey('phone_whatsapp', $agent, $pourquoi);
                $this->assertArrayNotHasKey('agency_name', $agent, $pourquoi);
            }
        }
    }

    public function test_le_visiteur_d_une_visite_confirmee_a_venir_joint_son_agent(): void
    {
        foreach ($this->lectures($this->visiteur) as [, $agent]) {
            $this->assertNotNull($agent, 'la visite et son agent sortent pour le visiteur');
            $this->assertSame(self::NUMERO, $agent['phone']);
            $this->assertTrue($agent['phone_whatsapp']);
            $this->assertSame('Agence Teranga', $agent['agency_name']);
        }
    }

    public function test_le_compte_de_la_fiche_est_le_demandeur_lui_aussi(): void
    {
        $titulaire = $this->client();
        $fiche = $this->ficheClient($this->agence, $titulaire);
        $this->visite->forceFill(['visitor_id' => null, 'customer_id' => $fiche->id])->save();

        Sanctum::actingAs($titulaire);
        $agent = $this->getJson("/api/property-visits/{$this->visite->id}?include=agent")->assertOk()->json('data.agent');
        $this->assertSame(self::NUMERO, $agent['phone']);
    }

    public function test_un_autre_client_ne_lit_ni_le_numero_ni_l_agence(): void
    {
        $autre = $this->client();
        // Il a sa propre visite confirmée à venir sur le même bien, avec le même agent : la liste
        // qu'il lit porte un contact — celui de SA visite, jamais celui d'une autre.
        $this->visiteDe($autre, VisitStatus::Scheduled, $this->creneau(3));

        $this->assertAucunContact($autre, 'un autre client');
    }

    public function test_le_bailleur_hors_console_ne_lit_ni_le_numero_ni_l_agence(): void
    {
        $this->assertAucunContact(User::findOrFail($this->bien->user_id), 'le bailleur du bien');
    }

    public function test_le_personnel_garde_ce_qu_il_voyait(): void
    {
        $this->assertAucunContact($this->personnel($this->agence), 'un collègue de l’agence');
    }

    public function test_une_visite_en_attente_n_expose_rien(): void
    {
        $this->visite->forceFill(['status' => VisitStatus::Scheduled])->save();
        $this->assertAucunContact($this->visiteur, 'une visite en attente');
    }

    public function test_une_visite_annulee_n_expose_rien(): void
    {
        $this->visite->forceFill(['status' => VisitStatus::Cancelled, 'cancelled_at' => now()])->save();
        $this->assertAucunContact($this->visiteur, 'une visite annulée');
    }

    public function test_une_visite_passee_n_expose_rien_meme_confirmee(): void
    {
        $this->visite->forceFill(['scheduled_at' => Carbon::now()->subHour()])->save();
        $this->assertAucunContact($this->visiteur, 'une visite confirmée passée');
    }

    public function test_une_visite_close_n_expose_rien(): void
    {
        $this->visite->forceFill(['status' => VisitStatus::Completed, 'completed_at' => now()])->save();
        $this->assertAucunContact($this->visiteur, 'une visite terminée');
    }

    public function test_un_numero_non_verifie_n_est_pas_servi(): void
    {
        $this->agent->forceFill(['phone_verified_at' => null])->save();

        Sanctum::actingAs($this->visiteur);
        $agent = $this->getJson("/api/property-visits/{$this->visite->id}?include=agent")->assertOk()->json('data.agent');
        $this->assertNull($agent['phone'], 'sans numéro servi, le front ne montre pas le geste');
        $this->assertFalse($agent['phone_whatsapp']);
        $this->assertSame('Agence Teranga', $agent['agency_name']);
    }

    public function test_un_agent_parti_de_l_agence_n_est_pas_joint_par_la(): void
    {
        $this->agent->agentProfiles()->delete();

        $this->assertAucunContact($this->visiteur, 'un agent qui a quitté l’agence');
    }

    /** Reprise (B6) — le principal non vérifié, le second vérifié : c'est le second qui est servi, avec SON WhatsApp. */
    public function test_le_second_numero_verifie_prend_le_relais_du_principal_non_verifie(): void
    {
        $this->agent->forceFill([
            'phone_verified_at' => null,
            'secondary_phone' => '+221781112233',
            'secondary_phone_verified_at' => now()->subWeek(),
            'secondary_phone_whatsapp' => false,
        ])->save();

        foreach ($this->lectures($this->visiteur) as [$corps, $agent]) {
            $this->assertNotNull($agent);
            $this->assertSame('+221781112233', $agent['phone']);
            $this->assertFalse($agent['phone_whatsapp'], 'le WhatsApp est celui du numéro servi, pas celui du principal');
            $this->assertStringNotContainsString(self::NUMERO, $corps, 'le principal non vérifié ne sort pas');
        }
    }

    /** Reprise (B7) — `phone_whatsapp` se lit sur le numéro servi : un principal sans WhatsApp le dit. */
    public function test_le_whatsapp_suit_le_numero_principal_servi(): void
    {
        $this->agent->forceFill([
            'phone_whatsapp' => false,
            'secondary_phone' => '+221781112233',
            'secondary_phone_verified_at' => now()->subWeek(),
            'secondary_phone_whatsapp' => true,
        ])->save();

        foreach ($this->lectures($this->visiteur) as [, $agent]) {
            $this->assertNotNull($agent);
            $this->assertSame(self::NUMERO, $agent['phone'], 'le principal vérifié passe avant le second');
            $this->assertFalse($agent['phone_whatsapp']);
        }
    }
}
