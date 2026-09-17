<?php

namespace Tests\Feature\Validation;

use App\Models\Enums\ContractType;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-536 — un 422 de la demande de réservation publique est rédigé ENTIÈREMENT dans la langue
 * demandée : la règle ET le nom du champ.
 *
 * Relevé avant correctif, en `fr` : « Le champ end date est obligatoire. » (nom de champ brut) et
 * « The guests field must be at least 1. » (règle absente de `lang/fr`, repli anglais).
 * `ValidationTranslationParityTest` garde les CLÉS ; ce test-ci garde la PROSE rendue, par le vrai
 * chemin HTTP.
 */
class ValidationMessagesLocaleTest extends TestCase
{
    use RefreshDatabase;

    /** @return iterable<string, array{string, string, string}> */
    public static function langues(): iterable
    {
        yield 'fr' => ['fr', 'Le champ date de fin est obligatoire.', 'Le champ nombre de voyageurs doit être un nombre entier.'];
        yield 'wo' => ['wo', 'Barabu bisu mujj bi dafa war.', 'Barabu limu gan yi bi war na doon nimero bu mat.'];
    }

    #[DataProvider('langues')]
    public function test_la_regle_et_le_nom_du_champ_sont_traduits(string $locale, string $finAttendue, string $voyageursAttendu): void
    {
        $property = Property::factory()->published()->create([
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Daily,
        ]);
        Sanctum::actingAs(User::factory()->create());

        $this->postJson(
            "/api/public/properties/{$property->slug}/booking-request",
            ['start_date' => now()->addDay()->toDateString(), 'guests' => 'deux'],
            ['Accept-Language' => $locale],
        )
            ->assertStatus(422)
            ->assertJsonPath('errors.end_date.0', $finAttendue)
            ->assertJsonPath('errors.guests.0', $voyageursAttendu);
    }

    public function test_une_date_relative_est_traduite_elle_aussi(): void
    {
        $property = Property::factory()->published()->create(['contract_type' => ContractType::Sale]);
        Sanctum::actingAs(User::factory()->create());

        // `offer_expires_at` → `after:today` : sans `validation.values`, « postérieure à today ».
        $response = $this->postJson(
            "/api/public/properties/{$property->slug}/booking-request",
            ['offer_amount' => 1000, 'offer_expires_at' => '2000-01-01', 'terms_accepted' => true],
            ['Accept-Language' => 'fr'],
        );

        $response->assertStatus(422);
        $this->assertSame(
            'Le champ date d’expiration de l’offre doit être une date postérieure à aujourd’hui.',
            $response->json('errors.offer_expires_at.0'),
        );
    }
}
