<?php

namespace Tests\Feature\Crm;

use App\Http\Resources\CustomerResource;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * Suivi de TCK-2757 — « l'auteur d'une fiche n'en est jamais le sujet » (`CustomerPolicy::isAuthorStillMember`)
 * tient aussi par la RESSOURCE quand la fiche a été lue sans `user_id`. `CustomerResource` relit la fiche
 * pour juger la policy (`ficheJugeable()`) : elle ne relisait que `agency_id` et `added_by_id`, et la règle
 * voyait un sujet `null` — le bailleur candidat lisait les champs réservés de sa propre fiche (notes,
 * pièce, contact d'urgence). Et le verdict, mis en cache par (agence, auteur ou non), était partagé entre
 * la fiche d'un tiers et la sienne.
 *
 * Par la ressource et non par la liste : la liste ne lui rend plus sa fiche (scope de TCK-2757).
 */
class CustomerResourceSujetTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private const COLONNES_SANS_SUJET = ['id', 'first_name', 'notes', 'id_type', 'emergency_contact_name', 'metadata'];

    private Agency $agency;

    private User $bailleur;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->bailleur = User::factory()->create();
        $this->materializeRoleProfile($this->bailleur, 'owner', $this->agency);
    }

    private function fiche(?int $sujet): Customer
    {
        $id = Customer::factory()->create([
            'agency_id' => $this->agency->id,
            'added_by_id' => $this->bailleur->id,
            'user_id' => $sujet,
            'notes' => 'Note interne du personnel',
            'emergency_contact_name' => 'Awa',
        ])->id;

        return Customer::query()->select(self::COLONNES_SANS_SUJET)->findOrFail($id);
    }

    private function requete(): Request
    {
        $request = Request::create('/api/customers');
        $request->setUserResolver(fn () => $this->bailleur);

        return $request;
    }

    public function test_sa_propre_fiche_lue_sans_user_id_ne_lui_rend_rien_de_reserve(): void
    {
        $rendu = (new CustomerResource($this->fiche($this->bailleur->id)))->resolve($this->requete());

        foreach (['notes', 'id_type', 'emergency_contact_name', 'metadata'] as $cle) {
            $this->assertArrayNotHasKey($cle, $rendu, $cle);
        }
    }

    public function test_la_fiche_d_un_tiers_puis_la_sienne_dans_la_meme_requete(): void
    {
        $request = $this->requete();
        $tiers = (new CustomerResource($this->fiche(User::factory()->create()->id)))->resolve($request);
        $sienne = (new CustomerResource($this->fiche($this->bailleur->id)))->resolve($request);

        // L'auteur d'une fiche dont il n'est pas le sujet la lit (TCK-591, AC3 de TCK-2757).
        $this->assertSame('Note interne du personnel', $tiers['notes'] ?? null);
        $this->assertArrayHasKey('emergency_contact_name', $tiers);
        // Le verdict du tiers ne vaut pas pour la sienne.
        $this->assertArrayNotHasKey('emergency_contact_name', $sienne);
        $this->assertArrayNotHasKey('metadata', $sienne);
    }
}
