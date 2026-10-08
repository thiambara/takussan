<?php

namespace Tests\Feature\Public;

use App\Models\Address;
use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-598 (V10, contrainte 10) — `GET /api/public/properties/{slug}/status`.
 *
 * Deux moitiés, et la seconde est la plus coûteuse à rater : l'état d'un bien loué, vendu ou retiré
 * sort ; l'EXISTENCE d'un bien qui n'a jamais été une annonce publique ne sort pas — six cas, un
 * corps identique octet pour octet à celui d'un slug inconnu.
 */
class PublicPropertyStatusTest extends TestCase
{
    use RefreshDatabase;

    private function bien(array $attributs = [], string $ville = 'Dakar', ?string $quartier = 'Mermoz'): Property
    {
        $property = Property::factory()->published()->create($attributs + [
            'contract_type' => ContractType::Rent,
        ]);
        Address::factory()->create([
            'addressable_id' => $property->id,
            'addressable_type' => Property::class,
            'city' => $ville,
            'neighborhood' => $quartier,
        ]);

        return $property;
    }

    /** AC10 — publié puis loué : `state=rented`, la ville, le quartier, et des similaires publics. */
    public function test_un_bien_publie_puis_loue_rend_son_etat_et_des_similaires(): void
    {
        $loue = $this->bien();
        $voisin = $this->bien();
        $loue->update(['status' => PropertyStatus::Rented]);

        $this->getJson("/api/public/properties/{$loue->slug}")->assertNotFound();

        $reponse = $this->getJson("/api/public/properties/{$loue->slug}/status")
            ->assertOk()
            ->assertJsonPath('data.state', 'rented')
            ->assertJsonPath('data.contract_type', 'rent')
            ->assertJsonPath('data.location.city', 'Dakar')
            ->assertJsonPath('data.location.quarter', 'Mermoz');

        $this->assertSame([$voisin->id], array_column($reponse->json('data.similar'), 'id'));
        $this->assertStringNotContainsString('collaborators', $reponse->getContent());
    }

    /** Vendu → `sold` ; archivé, en maintenance, indisponible → `withdrawn` ; servi → `available`. */
    public function test_chaque_statut_retire_a_son_code(): void
    {
        foreach ([
            PropertyStatus::Sold->value => 'sold',
            PropertyStatus::Archived->value => 'withdrawn',
            PropertyStatus::UnderMaintenance->value => 'withdrawn',
            PropertyStatus::Unavailable->value => 'withdrawn',
            PropertyStatus::Available->value => 'available',
        ] as $statut => $etat) {
            $bien = $this->bien(['status' => $statut]);
            $this->getJson("/api/public/properties/{$bien->slug}/status")
                ->assertOk()
                ->assertJsonPath('data.state', $etat);
        }
    }

    /**
     * AC10 — six cas, et un 404 INDISCERNABLE d'un slug inconnu : même code, même corps. Chaque bien
     * est d'abord loué (un statut que l'état admet) : c'est l'AUTRE critère qui doit le refuser.
     */
    public function test_un_bien_qui_n_a_jamais_ete_une_annonce_publique_rend_le_404_d_un_slug_inconnu(): void
    {
        $inconnu = $this->getJson('/api/public/properties/slug-qui-n-existe-pas/status')->assertNotFound();

        $supprime = $this->bien(['status' => PropertyStatus::Rented]);
        $supprime->delete();

        $cas = [
            'brouillon' => $this->bien(['status' => PropertyStatus::Draft]),
            'en attente de modération' => $this->bien(['status' => PropertyStatus::PendingReview]),
            'refusé' => $this->bien(['status' => PropertyStatus::Rejected]),
            'privé' => $this->bien(['status' => PropertyStatus::Rented, 'visibility' => PropertyVisibility::Private]),
            'de test' => $this->bien(['status' => PropertyStatus::Rented, 'is_test' => true]),
            'jamais publié' => $this->bien(['status' => PropertyStatus::Rented, 'published_at' => null]),
            'supprimé' => $supprime,
        ];

        foreach ($cas as $nom => $bien) {
            $reponse = $this->getJson("/api/public/properties/{$bien->slug}/status");
            $this->assertSame(404, $reponse->status(), "« {$nom} » ne rend pas 404.");
            $this->assertSame($inconnu->getContent(), $reponse->getContent(), "Le 404 de « {$nom} » se distingue d'un slug inconnu.");
        }
    }

    /** Un similaire retiré APRÈS la mise en cache des similaires ne ressort pas. */
    public function test_un_similaire_devenu_non_public_ne_ressort_pas(): void
    {
        $loue = $this->bien(['status' => PropertyStatus::Rented]);
        $voisin = $this->bien();

        $this->getJson("/api/public/properties/{$loue->slug}/status")->assertOk()->assertJsonCount(1, 'data.similar');

        Property::query()->whereKey($voisin->id)->toBase()->update(['visibility' => PropertyVisibility::Private->value]);

        $this->getJson("/api/public/properties/{$loue->slug}/status")->assertOk()->assertJsonCount(0, 'data.similar');
    }
}
