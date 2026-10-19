<?php

namespace Tests\Feature\Validation;

use App\Http\Requests\Accounting\StoreBankStatementRequest;
use App\Http\Requests\Api\Admin\StorePlanRequest;
use App\Http\Requests\Api\StoreCustomerNoteRequest;
use App\Http\Requests\Api\StorePropertyRequest;
use App\Http\Requests\InventoryStoreRequest;
use App\Http\Requests\InventoryUpdateRequest;
use App\Http\Requests\UpdatePropertyRequest;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-982 (P54.07) — une clé de requête qui vise une colonne `NOT NULL` ne porte pas `nullable`.
 *
 * Le défaut d'entrée de P17.01 (TCK-703) avait sept autres formes (angle 54 du fichier de pistes,
 * TCK-976 à TCK-981) : une règle `nullable` laissait passer un `null` explicite jusqu'à
 * l'`INSERT`/`UPDATE`, que PostgreSQL refusait (`SQLSTATE[23502]`). `bootstrap/app.php`
 * n'intercepte pas la `QueryException` : l'appelant recevait un 500 générique, jamais un 422
 * nommant le champ.
 *
 * La garde est la forme simple de la piste : la liste des couples (requête, clé) connus pour
 * viser une colonne `NOT NULL`. Pour chacun, elle vérifie trois choses :
 *  1. la colonne est toujours `NOT NULL` (`information_schema`) — une liste périmée rougit au
 *     lieu de garder un couple qui ne garde plus rien ;
 *  2. la règle de la clé ne porte pas `nullable` ;
 *  3. la règle, jouée seule sur un `null` explicite, échoue sur cette clé — ce qui tient aussi
 *     pour une règle qui le refuserait autrement que par l'absence de `nullable`.
 *
 * ⚠ Ce qu'elle ne voit pas : un couple qu'elle ne liste pas. Un nouveau FormRequest qui écrit
 * `validated()` dans un modèle n'y entre que si on l'y ajoute.
 */
class ReglesNullableFaceAuSchemaTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array<string, array{class-string<FormRequest>, string, string, string}>
     */
    public static function couples(): array
    {
        return [
            // TCK-703 (P17.01), TCK-976 (P54.01)
            'bien, création, ville' => [StorePropertyRequest::class, 'address.city', 'addresses', 'city'],
            'bien, modification, ville' => [UpdatePropertyRequest::class, 'address.city', 'addresses', 'city'],
            'bien, création, pays' => [StorePropertyRequest::class, 'address.country', 'addresses', 'country'],
            'bien, modification, pays' => [UpdatePropertyRequest::class, 'address.country', 'addresses', 'country'],
            // TCK-981 (P54.06)
            'bien, création, meublé' => [StorePropertyRequest::class, 'furnished', 'properties', 'furnished'],
            'bien, modification, meublé' => [UpdatePropertyRequest::class, 'furnished', 'properties', 'furnished'],
            // TCK-977 (P54.02)
            'forfait, essai' => [StorePlanRequest::class, 'trial_days', 'plans', 'trial_days'],
            'forfait, actif' => [StorePlanRequest::class, 'is_active', 'plans', 'is_active'],
            'forfait, ordre' => [StorePlanRequest::class, 'sort_order', 'plans', 'sort_order'],
            // TCK-978 (P54.03)
            'note client, épinglée' => [StoreCustomerNoteRequest::class, 'pinned', 'customer_notes', 'pinned'],
            // TCK-979 (P54.04)
            'relevé bancaire, format' => [StoreBankStatementRequest::class, 'source_format', 'bank_statements', 'source_format'],
            // TCK-980 (P54.05)
            'état des lieux, création, état général' => [InventoryStoreRequest::class, 'general_condition', 'inventories', 'general_condition'],
            'état des lieux, création, pièces' => [InventoryStoreRequest::class, 'rooms', 'inventories', 'rooms'],
            'état des lieux, modification, état général' => [InventoryUpdateRequest::class, 'general_condition', 'inventories', 'general_condition'],
            'état des lieux, modification, pièces' => [InventoryUpdateRequest::class, 'rooms', 'inventories', 'rooms'],
        ];
    }

    /** @param  class-string<FormRequest>  $requete */
    #[DataProvider('couples')]
    public function test_une_cle_qui_vise_une_colonne_not_null_refuse_le_null(
        string $requete,
        string $cle,
        string $table,
        string $colonne,
    ): void {
        $nullable = DB::table('information_schema.columns')
            ->where('table_schema', DB::raw('current_schema()'))
            ->where('table_name', $table)
            ->where('column_name', $colonne)
            ->value('is_nullable');

        $this->assertSame('NO', $nullable, "{$table}.{$colonne} n'est plus NOT NULL (ou n'existe plus) : retirer le couple de la liste.");

        $regles = (new $requete)->rules();
        $this->assertArrayHasKey($cle, $regles, "{$requete} ne valide plus « {$cle} ».");

        $regle = is_string($regles[$cle]) ? explode('|', $regles[$cle]) : $regles[$cle];
        $this->assertNotContains(
            'nullable',
            array_filter($regle, 'is_string'),
            "{$requete} : « {$cle} » vise {$table}.{$colonne}, NOT NULL ; un null y rendrait 500 et non 422.",
        );

        $validateur = Validator::make(Arr::undot([$cle => null]), [$cle => $regles[$cle]]);
        $this->assertTrue($validateur->fails(), "{$requete} : « {$cle} » à null passe la validation.");
        $this->assertArrayHasKey($cle, $validateur->errors()->toArray());
    }
}
