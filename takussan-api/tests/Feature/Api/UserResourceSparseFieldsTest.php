<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * `UserResource` sous SPARSE FIELDSET — un champ dérivé d'une colonne non
 * sélectionnée ne doit pas être inventé.
 *
 * ## Le défaut
 *
 * `has_usable_password` (TCK-272) se réduit à `password_set_at !== null`. La
 * colonne n'est ramenée que quand la requête sélectionne le modèle entier.
 * `AgencyController::listMembers` monte `UserResource::collection()` sur
 * `User::buildQuery()` et le front lui envoie
 * `fields[users]=id,first_name,last_name,email,status,last_login_at` : la
 * colonne est alors ABSENTE, Eloquent rend `null`, et un appel nu émettait
 * **`false` pour chaque membre** — c'est-à-dire « ce compte n'a pas de mot de
 * passe » affirmé sur des comptes dont rien n'a été lu.
 *
 * Deux des trois points d'émission de ce champ mentaient donc, en silence, sur
 * une donnée qui décide du parcours de suppression de compte. Personne ne le
 * lisait encore là-bas — c'est ce qui rendait le défaut invisible, pas ce qui le
 * rendait inoffensif : le jour où un écran s'y fie, il branche l'utilisateur sur
 * le mauvais step-up et le message d'erreur accusera son mot de passe.
 *
 * ## La forme du correctif, et ce que ce test pinne
 *
 * `whenHas('password_set_at', …)` **omet** la clé au lieu d'en fabriquer la
 * valeur. C'est le seul comportement qui distingue « je ne sais pas » de
 * « non » — la même règle que `PaymentGatewayService::amountDue()`, qui rend
 * `null` et jamais `0.0` (ardoise D-51). Le typage front la déclare déjà
 * optionnelle (`has_usable_password?: boolean`), donc l'absence est contractuelle.
 *
 * *Un champ absent se remarque ; un champ faux se croit.*
 */
class UserResourceSparseFieldsTest extends ApiTestCase
{
    use RefreshDatabase;

    /**
     * LE test d'ablation : sans `whenHas`, la clé est présente et vaut `false`.
     * Avec, elle est absente. C'est la seule assertion qui sépare les deux.
     */
    public function test_has_usable_password_is_omitted_when_its_column_is_not_selected(): void
    {
        [$agency, $membre] = $this->agencyWithMember();

        $reponse = $this->getJson(
            "/api/agencies/{$agency->id}/members"
            .'?fields[users]=id,first_name,last_name,email,status'
        )->assertOk();

        $ligne = collect($reponse->json('data'))->firstWhere('id', $membre->id);

        $this->assertNotNull($ligne, 'Le membre attendu ne figure pas dans la liste.');
        $this->assertArrayNotHasKey(
            'has_usable_password',
            $ligne,
            "`has_usable_password` est émis alors que `password_set_at` n'a pas été sélectionné : "
            .'sa valeur ne vient donc pas de la base mais du `null` par défaut d\'Eloquent. Elle vaut '
            .'`false` pour TOUS les membres, y compris ceux qui ont un mot de passe.'
        );
    }

    /**
     * Le versant positif : la même ressource, sans sparse fieldset, doit
     * toujours porter le champ ET dire vrai. Sans ce test, `whenHas` pourrait
     * omettre la clé partout et le premier test resterait vert.
     */
    public function test_has_usable_password_is_present_and_true_when_the_model_is_whole(): void
    {
        [$agency, $membre] = $this->agencyWithMember();

        $reponse = $this->getJson("/api/agencies/{$agency->id}/members")->assertOk();

        $ligne = collect($reponse->json('data'))->firstWhere('id', $membre->id);

        $this->assertArrayHasKey('has_usable_password', $ligne);
        $this->assertTrue(
            $ligne['has_usable_password'],
            'Le membre a été créé par la factory par défaut, donc avec `password_set_at` renseigné.'
        );
    }

    /**
     * TCK-1019 (P58.04) — les clés voisines, dérivées de colonnes hors `User::$queryFields`
     * (2FA, vérification, préférences), sortaient en `false`, `null` ou `{}` sous un sparse
     * fieldset, quelle que soit la base.
     */
    public function test_les_cles_derivees_de_colonnes_non_selectionnees_sont_omises(): void
    {
        [$agency, $membre] = $this->agencyWithMember();
        $this->armerLesDrapeaux($membre);

        $reponse = $this->getJson(
            "/api/agencies/{$agency->id}/members"
            .'?fields[users]=id,first_name,last_name,email,status'
        )->assertOk();

        $ligne = collect($reponse->json('data'))->firstWhere('id', $membre->id);

        $this->assertNotNull($ligne, 'Le membre attendu ne figure pas dans la liste.');
        foreach (self::CLES_DERIVEES as $cle) {
            $this->assertArrayNotHasKey($cle, $ligne, "`{$cle}` est émis alors que sa colonne n'a pas été sélectionnée.");
        }
    }

    /** Le versant positif : modèle entier, les mêmes clés sont là et disent vrai. */
    public function test_les_cles_derivees_sont_presentes_et_justes_quand_le_modele_est_entier(): void
    {
        [$agency, $membre] = $this->agencyWithMember();
        $this->armerLesDrapeaux($membre);

        $ligne = collect($this->getJson("/api/agencies/{$agency->id}/members")->assertOk()->json('data'))
            ->firstWhere('id', $membre->id);

        $this->assertTrue($ligne['two_factor_enabled']);
        $this->assertTrue($ligne['force_2fa_at_first_login']);
        $this->assertTrue($ligne['force_2fa_reconfigure']);
        $this->assertNotNull($ligne['email_verified_at']);
        $this->assertNotNull($ligne['phone_verified_at']);
        $this->assertSame(['x' => 1], $ligne['preferences']);
    }

    private const CLES_DERIVEES = [
        'two_factor_enabled', 'force_2fa_at_first_login', 'force_2fa_reconfigure',
        'email_verified_at', 'phone_verified_at', 'preferences',
    ];

    private function armerLesDrapeaux(User $membre): void
    {
        $membre->forceFill([
            'two_factor_enabled' => true,
            'force_2fa_at_first_login' => true,
            'metadata' => ['force_2fa_reconfigure' => true],
            'preferences' => ['x' => 1],
            'email_verified_at' => now(),
            'phone_verified_at' => now(),
        ])->save();
    }

    /**
     * Une agence, son admin authentifié, et un membre agent à lister.
     *
     * @return array{0: Agency, 1: User}
     */
    private function agencyWithMember(): array
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $membre = User::factory()->create();
        AgentProfile::factory()->create([
            'user_id' => $membre->id,
            'agency_id' => $agency->id,
        ]);

        return [$agency, $membre];
    }
}
