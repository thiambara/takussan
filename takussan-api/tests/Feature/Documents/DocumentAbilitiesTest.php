<?php

namespace Tests\Feature\Documents;

use App\Models\Agency;
use App\Models\Document;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-1867 (P189.01) — `DocumentResource` sert les verdicts de `DocumentPolicy` pour l'appelant
 * (`update`, `share`, `delete`), sur le détail et sur la liste : la fiche et la bibliothèque n'ouvrent
 * plus « Nouvelle version », « Restaurer », « Partager » et « Supprimer » par la seule identité du
 * téléverseur, que l'API refuse au bailleur suspendu dans l'agence du porteur (TCK-587).
 */
class DocumentAbilitiesTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{bool, bool}> */
    public static function cas(): array
    {
        return [
            'bailleur suspendu' => [true, false],
            'bailleur actif' => [false, true],
        ];
    }

    #[DataProvider('cas')]
    public function test_les_abilities_suivent_la_policy_sur_le_detail_et_la_liste(bool $suspendu, bool $attendu): void
    {
        $agency = Agency::factory()->create();
        $owner = User::factory()->withOwnerProfile($agency)->create();
        $property = Property::factory()->create(['user_id' => $owner->id, 'agency_id' => $agency->id]);
        $document = Document::factory()->create([
            'documentable_type' => Property::class,
            'documentable_id' => $property->id,
            'uploaded_by' => $owner->id,
        ]);

        if ($suspendu) {
            OwnerProfile::query()->where('user_id', $owner->id)->where('agency_id', $agency->id)
                ->update(['status' => OwnerProfileStatus::Blocked->value]);
        }

        Sanctum::actingAs($owner);
        $gestes = ['update' => $attendu, 'share' => $attendu, 'delete' => $attendu];

        $this->getJson("/api/documents/{$document->id}")->assertOk()
            ->assertJsonPath('data.abilities', $gestes);

        $this->getJson('/api/documents')->assertOk()
            ->assertJsonPath('data.0.id', $document->id)
            ->assertJsonPath('data.0.abilities', $gestes);

        // Le verdict servi est celui que l'API applique au geste.
        $this->postJson("/api/documents/{$document->id}/share", [])
            ->assertStatus($attendu ? 201 : 403);
    }

    /**
     * Les verdicts de la liste ne coûtent pas une batterie de requêtes par ligne : le porteur est
     * préchargé et les profils du bailleur jugés une fois pour la page, dans une agence, là où
     * `ProListQueryBudgetTest` ne crée que des biens sans agence.
     */
    public function test_les_abilities_de_la_liste_coutent_autant_pour_douze_lignes_que_pour_deux(): void
    {
        $agency = Agency::factory()->create();
        $owner = User::factory()->withOwnerProfile($agency)->create();
        $ajouter = function (int $n) use ($agency, $owner): void {
            for ($i = 0; $i < $n; $i++) {
                $property = Property::factory()->create(['user_id' => $owner->id, 'agency_id' => $agency->id]);
                Document::factory()->create([
                    'documentable_type' => Property::class,
                    'documentable_id' => $property->id,
                    'uploaded_by' => $owner->id,
                ]);
            }
        };
        $requetes = function (int $lignes): array {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->getJson('/api/documents?per_page=20')->assertOk()->assertJsonCount($lignes, 'data')
                ->assertJsonPath('data.0.abilities.delete', true);
            $sql = array_column(DB::getQueryLog(), 'query');
            DB::disableQueryLog();

            return $sql;
        };

        Sanctum::actingAs($owner);
        $ajouter(2);
        $requetes(2);
        $deux = $requetes(2);
        $ajouter(10);

        $douze = $requetes(12);
        $avant = array_count_values($deux);
        $enPlus = [];
        foreach (array_count_values($douze) as $requete => $n) {
            if ($n !== ($avant[$requete] ?? 0)) {
                $enPlus[] = sprintf('%+d × %s', $n - ($avant[$requete] ?? 0), $requete);
            }
        }

        $this->assertSame(count($deux), count($douze), "Requêtes en plus :\n".implode("\n", $enPlus));
    }
}
