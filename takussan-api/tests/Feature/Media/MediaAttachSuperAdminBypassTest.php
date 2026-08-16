<?php

namespace Tests\Feature\Media;

use App\Models\Inventory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;

/**
 * `MediaController::authorizeAttach` — le bypass super-admin doit valoir pour
 * TOUTES ses branches, pas seulement pour celle qui interroge la Gate.
 *
 * ## Ce que ce fichier garde, et pourquoi il n'est pas dans `AgencyLogoUploadTest`
 *
 * TCK-290 a trouvé le défaut sur `Agency` : `authorizeAttach` ne trouvait aucune
 * policy, retombait sur sa branche « propriétaire seulement », et une `Agency`
 * n'étant ni le `User` appelant ni porteuse d'une colonne `user_id`, elle
 * rendait `403` — **y compris pour un super-admin**, parce que cette branche ne
 * consulte jamais la Gate et n'atteint donc jamais le `Gate::before` global.
 *
 * Le correctif d'alors fut d'écrire `AgencyPolicy`. Il a réparé `Agency` et
 * laissé le mécanisme intact : **l'écrasante majorité des modèles n'a aucune
 * policy** — de l'ordre d'un sur cinq en a une, et le compte exact ne s'écrit
 * pas ici parce qu'il bouge à chaque modèle ajouté (`ls app/Policies` contre
 * les classes de `app/Models`). Tous ces modèles-là restaient cassés de la même
 * façon, chacun attendant la prochaine personne qui trébucherait dessus.
 * Corriger un symptôme modèle par modèle laisse la cause en place — et un
 * défaut réparé à un endroit se lit comme un défaut réparé partout.
 *
 * D'où ce fichier, distinct : `AgencyLogoUploadTest` pinne « qui administre une
 * agence », ce test-ci pinne « le bypass super-admin couvre les cibles SANS
 * policy ». Les deux régresseraient séparément.
 *
 * ## Pourquoi `Inventory`
 *
 * La cible doit réunir les trois conditions du trou, et `Inventory` est le cas
 * le plus pur du dépôt : elle implémente `HasMedia` (collection `photos`), elle
 * n'a **pas** de policy, et sa table n'a **pas** de colonne `user_id` — elle
 * porte `conducted_by` et `tenant_id`. Ce choix est dérivé, pas décoré :
 *
 *     comm -23 <(grep -rl 'implements HasMedia' app/Models | …) <(ls app/Policies | …)
 *     → Document · Inventory · KycDossier · MaintenanceRequest · Message
 *
 * ⚠ Le jour où quelqu'un écrit une `InventoryPolicy`, ce test cesse d'exercer la
 * branche de repli — il passerait par la Gate et resterait vert **sans rien
 * prouver**. {@see test_the_fallback_branch_is_the_one_under_test} le constate à
 * l'exécution et échoue avec le nom du modèle à remplacer, plutôt que de laisser
 * la garde se vider en silence. *Un test qui cesse de tester ce qu'il dit tester
 * est plus dangereux qu'un test absent : il occupe la case « couvert ».*
 */
class MediaAttachSuperAdminBypassTest extends ApiTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    /**
     * LE test d'ablation. Il échoue en `403` sans le court-circuit super-admin
     * de `authorizeAttach`, et lui seul : aucune policy, aucune Gate, aucun
     * `user_id` ne peut le faire passer autrement.
     */
    public function test_super_admin_can_attach_media_to_a_target_without_policy(): void
    {
        $this->apiActingAsRole('super_admin');
        $inventaire = Inventory::factory()->create();

        $this->postPhoto($inventaire)
            ->assertCreated()
            ->assertJsonPath('data.model_type', Inventory::class)
            ->assertJsonPath('data.model_id', $inventaire->id);

        $this->assertDatabaseCount('media', 1);
    }

    /**
     * Le versant refus, sans quoi le test ci-dessus serait satisfait par un
     * `authorizeAttach` qui autoriserait tout le monde. Le bypass est un
     * bypass : il ouvre au super-admin, à personne d'autre.
     */
    public function test_an_unrelated_user_is_still_forbidden(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $inventaire = Inventory::factory()->create();

        $this->postPhoto($inventaire)->assertForbidden();

        $this->assertDatabaseCount('media', 0);
    }

    /**
     * La sonde de pertinence : elle vérifie que la cible choisie exerce bien la
     * branche de REPLI, celle qui ne consulte pas la Gate. Sans elle, l'ajout
     * d'une `InventoryPolicy` viderait les deux tests ci-dessus de leur objet
     * sans qu'aucun ne rougisse.
     */
    public function test_the_fallback_branch_is_the_one_under_test(): void
    {
        $inventaire = Inventory::factory()->create();

        $policy = Gate::getPolicyFor($inventaire);

        $this->assertTrue(
            $policy === null || ! method_exists($policy, 'update'),
            'Inventory a désormais une policy avec une méthode `update` : '
            .'`MediaController::authorizeAttach` passe donc par la Gate pour elle, et ce fichier '
            ."n'exerce plus la branche de repli qu'il existe pour garder. Choisir une autre cible "
            .'`HasMedia` sans policy et sans colonne `user_id` — la liste se dérive avec '
            ."`comm -23` entre les modèles `implements HasMedia` et le contenu d'`app/Policies`."
        );

        $this->assertFalse(
            Schema::hasColumn($inventaire->getTable(), 'user_id'),
            '`inventories` porte désormais une colonne `user_id` : la branche de repli '
            .'autoriserait par propriété et ce test ne prouverait plus rien du bypass super-admin.'
        );
    }

    private function postPhoto(Inventory $inventaire): TestResponse
    {
        return $this->postJson('/api/media', [
            'file' => UploadedFile::fake()->image('etat-des-lieux.png', 400, 400),
            'collection' => 'photos',
            'model_type' => Inventory::class,
            'model_id' => $inventaire->id,
        ]);
    }
}
