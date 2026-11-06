<?php

namespace Tests\Feature\Api\Me;

use App\Http\Requests\Api\Me\UpdateMeRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;

/**
 * TCK-2480 (ADR-0089 §6) — `preferences.navigation` : les épingles et replis du menu de `/app`, PAR
 * PERSONA, écrits par `PATCH /api/me`. L'API n'en valide que la FORME — le catalogue des destinations
 * appartient au front.
 *
 * La fixture `tests/fixtures/preferences-navigation.json` est lue ICI et par le test du schéma zod du
 * front (`takussan-web/src/lib/navigation/__tests__/preferences.parite.test.ts`) : élargir une règle
 * d'un seul côté fait rougir ce côté-là.
 *
 * Rouge avant TCK-2480 : `navigation` n'était pas une clé de préférence (200, rien d'enregistré).
 */
class NavigationPreferencesTest extends ApiTestCase
{
    use RefreshDatabase;

    private const NAVIGATION_AGENT = ['v' => 1, 'personas' => ['agent' => ['epingles' => ['commissions']]]];

    /** @return array<string, mixed> */
    private static function fixture(): array
    {
        return json_decode((string) file_get_contents(__DIR__.'/../../../fixtures/preferences-navigation.json'), true, flags: JSON_THROW_ON_ERROR);
    }

    /** @return iterable<string, array{mixed}> */
    public static function valides(): iterable
    {
        foreach (self::fixture()['valides'] as $cas) {
            yield $cas['nom'] => [$cas['navigation']];
        }
    }

    /** @return iterable<string, array{mixed}> */
    public static function invalides(): iterable
    {
        foreach (self::fixture()['invalides'] as $cas) {
            yield $cas['nom'] => [$cas['navigation']];
        }
    }

    private function compte(?array $preferences = null): User
    {
        $user = User::factory()->create(['preferences' => $preferences]);
        $this->actingAsApi($user);

        return $user;
    }

    public function test_une_forme_valide_est_enregistree_et_relue_par_auth_me(): void
    {
        $user = $this->compte();

        $this->apiPatch('/api/me', ['navigation' => self::NAVIGATION_AGENT])
            ->assertOk()
            ->assertJsonPath('data.preferences.navigation.personas.agent.epingles', ['commissions']);

        $this->assertSame(self::NAVIGATION_AGENT, $user->fresh()->preferences['navigation']);
        // `GET /api/auth/me` rend la ressource SANS enveloppe `data` (AuthController::me).
        $this->apiGet('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('preferences.navigation.personas.agent.epingles', ['commissions']);
    }

    public function test_un_persona_inconnu_est_refuse(): void
    {
        $user = $this->compte(['navigation' => self::NAVIGATION_AGENT]);

        $this->apiPatch('/api/me', ['navigation' => ['v' => 1, 'personas' => ['courtier' => ['epingles' => ['baux']]]]])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['navigation.personas']);

        $this->assertSame(self::NAVIGATION_AGENT, $user->fresh()->preferences['navigation']);
    }

    /** AC3 — ablation : retirer `max:5` de `navigation.personas.*.epingles` fait rougir ce test. */
    public function test_six_epingles_sont_refusees(): void
    {
        $this->compte();
        $six = ['baux', 'visites', 'demandes', 'clients', 'calendrier', 'commissions'];

        $this->apiPatch('/api/me', ['navigation' => ['v' => 1, 'personas' => ['agent' => ['epingles' => $six]]]])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['navigation.personas.agent.epingles']);
    }

    public function test_un_identifiant_hors_motif_est_refuse(): void
    {
        $this->compte();

        $this->apiPatch('/api/me', ['navigation' => ['v' => 1, 'personas' => ['agent' => ['epingles' => ['Commissions']]]]])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['navigation.personas.agent.epingles.0']);
    }

    public function test_null_efface_la_cle(): void
    {
        $user = $this->compte(['city' => 'Dakar', 'navigation' => self::NAVIGATION_AGENT]);

        $this->apiPatch('/api/me', ['navigation' => null])->assertOk();

        $this->assertSame(['city' => 'Dakar'], $user->fresh()->preferences);
    }

    public function test_les_autres_cles_de_preferences_sont_intactes(): void
    {
        $user = $this->compte(['city' => 'Dakar', 'entry_intent' => 'search']);

        $this->apiPatch('/api/me', ['navigation' => self::NAVIGATION_AGENT])->assertOk();
        // `preferences` est une colonne `jsonb` : PostgreSQL réordonne les clés à l'écriture (par
        // longueur, puis par octets). L'ordre n'est pas le contrat — on le neutralise, pas la valeur.
        $preferences = $user->fresh()->preferences;
        ksort($preferences);
        $this->assertSame(
            ['city' => 'Dakar', 'entry_intent' => 'search', 'navigation' => self::NAVIGATION_AGENT],
            $preferences,
        );

        // Et l'inverse : une autre clé écrite ne touche pas au menu.
        $this->apiPatch('/api/me', ['city' => 'Thiès'])->assertOk();
        $this->assertSame(self::NAVIGATION_AGENT, $user->fresh()->preferences['navigation']);
    }

    /** ADR-0089 §6 — la clé est remplacée EN BLOC : aucune fusion profonde entre personas. */
    public function test_la_cle_est_remplacee_en_bloc(): void
    {
        $user = $this->compte(['navigation' => ['v' => 1, 'personas' => [
            'agent' => ['epingles' => ['commissions']],
            'bailleur' => ['replies' => ['activite']],
        ]]]);

        $this->apiPatch('/api/me', ['navigation' => ['v' => 1, 'personas' => ['bailleur' => ['epingles' => ['baux']]]]])
            ->assertOk();

        $this->assertSame(['v' => 1, 'personas' => ['bailleur' => ['epingles' => ['baux']]]], $user->fresh()->preferences['navigation']);
    }

    public function test_la_fixture_porte_les_huit_personas_de_la_requete(): void
    {
        $this->assertSame(UpdateMeRequest::PERSONAS_DU_MENU, self::fixture()['personas']);
        $this->assertGreaterThanOrEqual(8, count(iterator_to_array(self::valides())));
        $this->assertGreaterThanOrEqual(20, count(iterator_to_array(self::invalides())));
    }

    #[DataProvider('valides')]
    public function test_un_cas_valide_de_la_fixture_est_accepte(mixed $navigation): void
    {
        $this->compte();

        $this->apiPatch('/api/me', ['navigation' => $navigation])->assertOk();
    }

    #[DataProvider('invalides')]
    public function test_un_cas_invalide_de_la_fixture_est_refuse(mixed $navigation): void
    {
        $user = $this->compte(['navigation' => self::NAVIGATION_AGENT]);

        $reponse = $this->apiPatch('/api/me', ['navigation' => $navigation])->assertStatus(422);

        $champs = array_keys($reponse->json('errors') ?? []);
        $this->assertNotEmpty(array_filter($champs, fn (string $c) => str_starts_with($c, 'navigation')), implode(', ', $champs));
        $this->assertSame(self::NAVIGATION_AGENT, $user->fresh()->preferences['navigation']);
    }
}
