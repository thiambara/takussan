<?php

namespace Tests\Feature\Api;

use App\Models\Enums\UserStatus;
use App\Models\Enums\VisitStatus;
use App\Models\PropertyVisit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * P217.05 (TCK-2237) — la liste des visites juge le propriétaire d'un bien SANS agence comme
 * `PropertyVisitPolicy::view` (`PrimaryPropertyContact::estProprietaire`) : il doit être
 * joignable. La clause ne jugeait que `properties.user_id` : un compte bloqué ou supprimé encore
 * authentifié listait les visites de son bien, que `show` lui refuse.
 */
class VisitesDuProprietaireInjoignableTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    /** @return array<string, array{UserStatus}> */
    public static function injoignables(): array
    {
        return [
            'bloqué' => [UserStatus::Blocked],
            'supprimé' => [UserStatus::Deleted],
        ];
    }

    #[DataProvider('injoignables')]
    public function test_le_proprietaire_injoignable_ne_liste_plus_les_visites_de_son_bien(UserStatus $statut): void
    {
        $particulier = $this->client();
        $bien = $this->bienDe(null, $particulier);
        $visite = PropertyVisit::factory()->create([
            'property_id' => $bien->id, 'visitor_id' => $this->client()->id,
            'status' => VisitStatus::Confirmed, 'scheduled_at' => $this->creneau(jours: 3),
        ]);

        $particulier->forceFill(['status' => $statut])->save();
        Sanctum::actingAs($particulier->fresh());

        $this->getJson("/api/property-visits/{$visite->id}")->assertForbidden();
        $this->getJson('/api/property-visits')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_le_proprietaire_joignable_liste_toujours_les_visites_de_son_bien(): void
    {
        $particulier = $this->client();
        $bien = $this->bienDe(null, $particulier);
        $visite = PropertyVisit::factory()->create([
            'property_id' => $bien->id, 'visitor_id' => $this->client()->id,
            'status' => VisitStatus::Confirmed, 'scheduled_at' => $this->creneau(jours: 3),
        ]);

        Sanctum::actingAs($particulier);

        $this->getJson("/api/property-visits/{$visite->id}")->assertOk();
        $this->getJson('/api/property-visits')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $visite->id);
    }
}
