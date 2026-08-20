<?php

namespace Tests\Feature\Media;

use App\Models\KycDossier;
use App\Models\Property;
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
 * ## Pourquoi `KycDossier` — et pourquoi ce n'est plus `Inventory`
 *
 * La cible doit réunir les trois conditions du trou : implémenter `HasMedia`,
 * n'avoir **aucune** policy, et n'avoir **pas** de colonne `user_id`.
 *
 * ⚠ **TCK-306 a fait exactement ce que l'avertissement ci-dessous annonçait.**
 * La cible était `Inventory` ; le ticket a écrit une `InventoryPolicy` (avec une
 * méthode `update`), donc `MediaController::authorizeAttach` a cessé de retomber
 * sur sa branche sans Gate pour ce modèle. Les deux tests d'ablation seraient
 * restés **verts sans rien prouver** — et c'est
 * {@see test_the_fallback_branch_is_the_one_under_test} qui l'a dit, en rouge, en
 * nommant le modèle et la commande pour lui trouver un remplaçant. *Une sonde de
 * pertinence n'est pas une politesse : c'est la seule chose qui distingue un test
 * qui garde d'un test qui occupe la case « couvert ».*
 *
 * La liste se dérive, elle ne se recopie pas :
 *
 *     comm -23 <(grep -rl 'implements HasMedia' app/Models | …) <(ls app/Policies | …)
 *     → KycDossier · Message      (au 2026-08-17, après TCK-306)
 *
 * `KycDossier` est le cas le plus pur des deux : sa table porte `subject_type` /
 * `subject_id` et `reviewed_by`, jamais `user_id`, et sa collection média est
 * `documents`. `Message` dépend d'une conversation, donc d'un contexte que ce
 * test n'a pas besoin de monter.
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
        $dossier = $this->dossierSansPolicy();

        $this->postDocument($dossier)
            ->assertCreated()
            ->assertJsonPath('data.model_type', KycDossier::class)
            ->assertJsonPath('data.model_id', $dossier->id);

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
        $dossier = $this->dossierSansPolicy();

        $this->postDocument($dossier)->assertForbidden();

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
        $dossier = $this->dossierSansPolicy();

        $policy = Gate::getPolicyFor($dossier);

        $this->assertTrue(
            $policy === null || ! method_exists($policy, 'update'),
            'KycDossier a désormais une policy avec une méthode `update` : '
            .'`MediaController::authorizeAttach` passe donc par la Gate pour elle, et ce fichier '
            ."n'exerce plus la branche de repli qu'il existe pour garder. Choisir une autre cible "
            .'`HasMedia` sans policy et sans colonne `user_id` — la liste se dérive avec '
            ."`comm -23` entre les modèles `implements HasMedia` et le contenu d'`app/Policies`."
        );

        $this->assertFalse(
            Schema::hasColumn($dossier->getTable(), 'user_id'),
            '`kyc_dossiers` porte désormais une colonne `user_id` : la branche de repli '
            .'autoriserait par propriété et ce test ne prouverait plus rien du bypass super-admin.'
        );
    }

    /** `KycDossier` n'a pas de factory : le sujet polymorphe suffit à le créer. */
    private function dossierSansPolicy(): KycDossier
    {
        $property = Property::factory()->create();

        return KycDossier::create([
            'subject_type' => Property::class,
            'subject_id' => $property->id,
        ]);
    }

    private function postDocument(KycDossier $dossier): TestResponse
    {
        return $this->postJson('/api/media', [
            // La collection `documents` exige un PDF/DOCX, pas une image (MediaUploadRequest).
            'file' => UploadedFile::fake()->create('piece-identite.pdf', 120, 'application/pdf'),
            'collection' => 'documents',
            'model_type' => KycDossier::class,
            'model_id' => $dossier->id,
        ]);
    }
}
