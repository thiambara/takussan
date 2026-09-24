<?php

namespace Tests\Feature\WizardDraft;

use App\Models\User;
use App\Models\WizardDraft;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Tests\ApiTestCase;

/**
 * TCK-574 — un brouillon rend EXACTEMENT ce que l'assistant a écrit.
 *
 * `data` est un sac opaque dont la forme appartient à l'assistant (TCK-250). Trois mécanismes
 * le réécrivaient pourtant avant qu'il n'atteigne la base, chacun à lui seul suffisant :
 * `TrimStrings` et `ConvertEmptyStringsToNull` (middleware global de Laravel), puis
 * `BaseFormRequest::prepareForValidation()`. Conséquence mesurée (TCK-564, TCK-566) : un champ
 * pré-rempli que l'utilisateur avait VIDÉ revenait `null`, et la reprise, qui ignore les `null`,
 * le rendait pré-rempli — la saisie effacée ressuscitait.
 *
 * La normalisation reste le contrat de TOUTES les autres routes (cf.
 * `Tests\Feature\Validation\BaseFormRequestNormalizationTest`) : le dernier test le vérifie dans
 * la même requête de test, pour qu'une exemption trop large ne puisse pas passer inaperçue.
 */
class WizardDraftFideliteTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_an_empty_string_in_the_draft_comes_back_as_an_empty_string(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->putJson('/api/me/wizard-drafts/owner-onboarding-12', [
                'step' => 1,
                'data' => [
                    'display_name' => '',
                    'phone' => '',
                    'address' => ['street' => '', 'city' => 'Dakar'],
                    'tags' => ['', 'piscine'],
                ],
            ])
            ->assertCreated()
            ->assertJsonPath('data.data.display_name', '')
            ->assertJsonPath('data.data.address.street', '');

        $this->actingAs($user)
            ->getJson('/api/me/wizard-drafts/owner-onboarding-12')
            ->assertOk()
            ->assertJsonPath('data.data.display_name', '')
            ->assertJsonPath('data.data.phone', '')
            ->assertJsonPath('data.data.address.street', '')
            ->assertJsonPath('data.data.address.city', 'Dakar')
            ->assertJsonPath('data.data.tags', ['', 'piscine']);

        $stocke = WizardDraft::query()->where('user_id', $user->id)->sole()->data;
        $this->assertSame('', $stocke['display_name'], 'la base doit porter "", pas null');
        $this->assertSame('', $stocke['address']['street']);
    }

    /**
     * Un brouillon est une saisie EN COURS : « Rue de la » suivi d'une espace est ce que la
     * personne a tapé. Le trim se fait à la soumission, par la route qui valide la donnée.
     */
    public function test_surrounding_whitespace_in_the_draft_is_kept(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->putJson('/api/me/wizard-drafts/host-individual-wizard', [
                'step' => 0,
                'data' => ['street' => 'Rue de la ', 'note' => '  '],
            ])
            ->assertCreated();

        $stocke = WizardDraft::query()->where('user_id', $user->id)->sole()->data;
        $this->assertSame('Rue de la ', $stocke['street']);
        $this->assertSame('  ', $stocke['note']);
    }

    public function test_the_step_is_still_validated(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->putJson('/api/me/wizard-drafts/host-individual-wizard', ['step' => '', 'data' => []])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['step']);
    }

    /**
     * L'exemption ne vaut que pour l'ÉCRITURE d'un brouillon : la même chaîne vide envoyée
     * juste après à une autre route est toujours normalisée par le middleware global.
     *
     * ⚠ repair-1 — la version précédente de ce test envoyait un `POST /api/tags` : elle restait
     * VERTE quand l'exemption était élargie à tout `PUT api/*` (mutation du vérificateur, puis
     * rejouée ici). Deux raisons s'additionnaient : la route était un POST, et `StoreTagRequest`
     * normalise de toute façon par `BaseFormRequest::prepareForValidation()` — redondant avec le
     * middleware (cf. `BaseFormRequestNormalizationTest`), donc aveugle à lui. Les sondes
     * ci-dessous lisent la requête BRUTE, sans FormRequest : seul le middleware global peut y
     * avoir normalisé quoi que ce soit, et elles couvrent les voisins de la route exemptée —
     * un autre `PUT`, un autre `PUT` sous `api/me/`, et un `POST` ou un `PATCH` sur le chemin même
     * des brouillons.
     */
    public function test_other_routes_keep_normalizing_empty_strings(): void
    {
        $echo = fn (Request $request) => response()->json(['data' => $request->all()]);
        Route::middleware('api')->put('/api/_test/tck-574/{x}', $echo);
        Route::middleware('api')->put('/api/me/_test-tck-574', $echo);
        Route::middleware('api')->post('/api/me/wizard-drafts/{key}', $echo);
        Route::middleware('api')->patch('/api/me/wizard-drafts/{key}', $echo);

        $user = User::factory()->create();
        $charge = ['vide' => '', 'espaces' => '  x  ', 'imbrique' => ['vide' => '']];

        $this->actingAs($user)
            ->putJson('/api/me/wizard-drafts/host-individual-wizard', ['step' => 0, 'data' => $charge])
            ->assertCreated()
            ->assertJsonPath('data.data.vide', '')
            ->assertJsonPath('data.data.espaces', '  x  ');

        foreach ([
            ['PUT', '/api/_test/tck-574/1'],
            ['PUT', '/api/me/_test-tck-574'],
            ['POST', '/api/me/wizard-drafts/host-individual-wizard'],
            ['PATCH', '/api/me/wizard-drafts/host-individual-wizard'],
        ] as [$methode, $chemin]) {
            $this->actingAs($user)
                ->json($methode, $chemin, $charge)
                ->assertOk()
                ->assertExactJson(['data' => ['vide' => null, 'espaces' => 'x', 'imbrique' => ['vide' => null]]]);
        }
    }
}
