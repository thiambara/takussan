<?php

namespace Tests\Unit;

use App\Models\Address;
use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyType;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PropertySearchableArrayTest extends TestCase
{
    use RefreshDatabase;

    public function test_searchable_array_flattens_address_and_geo(): void
    {
        $property = Property::withoutSyncingToSearch(
            fn () => Property::factory()->published()->create([
                'type' => PropertyType::Apartment,
                'price' => 250000,
            ])
        );
        Address::create([
            'addressable_type' => Property::class,
            'addressable_id' => $property->id,
            'city' => 'Dakar',
            'neighborhood' => 'Almadies',
            'latitude' => 14.7,
            'longitude' => -17.5,
        ]);

        $arr = $property->fresh('address')->toSearchableArray();

        $this->assertSame('Dakar', $arr['city']);
        $this->assertSame('Almadies', $arr['neighborhood']);
        $this->assertSame(['lat' => 14.7, 'lng' => -17.5], $arr['_geo']);
        $this->assertSame(250000.0, $arr['price']);
        $this->assertStringContainsString('appartement', $arr['type_label']);
        $this->assertIsInt($arr['published_at']);
        $this->assertSame([], $arr['tags']);
    }

    public function test_searchable_array_omits_geo_when_no_coordinates(): void
    {
        $property = Property::withoutSyncingToSearch(
            fn () => Property::factory()->published()->create()
        );

        $this->assertArrayNotHasKey('_geo', $property->toSearchableArray());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TCK-339 — les INVARIANTS des tables d'alias de recherche.
    //
    // Ces tests ne valident aucun mot wolof : personne ici n'est wolophone, et
    // la table `*_WO` est livrée VIDE exprès. Ils gardent la MÉCANIQUE, c'est-
    // à-dire les quatre façons dont un alias peut être perdu ou mal placé sans
    // que rien ne rougisse — une clé d'enum oubliée, un alias qui n'atteint
    // jamais le document, un alias qui atterrit dans le mauvais champ, un
    // champ de vocabulaire absent de `searchableAttributes`.
    // ─────────────────────────────────────────────────────────────────────────

    public function test_les_tables_dalias_couvrent_exactement_les_valeurs_denum(): void
    {
        $types = array_map(fn (PropertyType $c) => $c->value, PropertyType::cases());
        $contrats = array_map(fn (ContractType $c) => $c->value, ContractType::cases());

        // Les quatre tables, française et wolof, sur les deux enums. Une clé en
        // trop est aussi grave qu'une clé manquante : elle est morte, et elle
        // reste morte en silence (le `?? ''` de la jointure l'avale).
        foreach ([
            'TYPE_SEARCH_ALIASES' => [Property::TYPE_SEARCH_ALIASES, $types],
            'TYPE_SEARCH_ALIASES_WO' => [Property::TYPE_SEARCH_ALIASES_WO, $types],
            'CONTRACT_SEARCH_ALIASES' => [Property::CONTRACT_SEARCH_ALIASES, $contrats],
            'CONTRACT_SEARCH_ALIASES_WO' => [Property::CONTRACT_SEARCH_ALIASES_WO, $contrats],
        ] as $nom => [$table, $attendu]) {
            $cles = array_keys($table);
            sort($cles);
            sort($attendu);
            $this->assertSame($attendu, $cles, "{$nom} ne couvre pas exactement les valeurs d'enum");
        }
    }

    /**
     * La table wolof est vide : le document indexé doit être IDENTIQUE À LA
     * CHAÎNE PRÈS à ce qu'il était avant TCK-339. C'est la preuve de no-op —
     * elle vaut réimport épargné sur les 795 documents de l'index.
     *
     * `assertSame` et pas `assertStringContainsString` : une espace de fin
     * suffirait à faire diverger tous les documents.
     */
    public function test_les_alias_wolof_vides_laissent_le_document_inchange(): void
    {
        foreach (PropertyType::cases() as $type) {
            $arr = Property::factory()->make(['type' => $type])->toSearchableArray();
            $this->assertSame(
                Property::TYPE_SEARCH_ALIASES[$type->value],
                $arr['type_label'],
                "type_label a changé pour {$type->value}",
            );
        }

        foreach (ContractType::cases() as $contrat) {
            $arr = Property::factory()->make(['contract_type' => $contrat])->toSearchableArray();
            $this->assertSame(
                Property::CONTRACT_SEARCH_ALIASES[$contrat->value],
                $arr['contract_label'],
                "contract_label a changé pour {$contrat->value}",
            );
        }
    }

    /**
     * Le test qui empêche de livrer une table décorative.
     *
     * Une implémentation qui ignore PUREMENT la table wolof cocherait le test
     * de no-op ci-dessus — c'est même la façon la plus simple de le faire
     * passer. Il faut donc prouver que le chemin de concaténation existe, et
     * la seule façon honnête est de le parcourir avec une valeur non vide.
     * D'où le double : il redéclare les constantes, la liaison tardive
     * (`static::`) le respecte, et l'alias DOIT apparaître dans le document.
     */
    public function test_un_alias_wolof_renseigne_atteint_le_document_indexe(): void
    {
        $arr = (new PropertyDoubleAliasWolof([
            'type' => PropertyType::Land,
            'contract_type' => ContractType::Sale,
        ]))->toSearchableArray();

        $this->assertSame('terrain zzz-alias-type-wo', $arr['type_label']);
        $this->assertSame('vendre vente achat acheter zzz-alias-contrat-wo', $arr['contract_label']);

        // Une clé wolof restée vide ne doit produire NI espace double NI espace
        // de fin : sinon toute la table devient un diff de document.
        $arrVide = (new PropertyDoubleAliasWolof([
            'type' => PropertyType::Villa,
            'contract_type' => ContractType::Rent,
        ]))->toSearchableArray();

        $this->assertSame('villa', $arrVide['type_label']);
        $this->assertSame('louer location bail loyer', $arrVide['contract_label']);
    }

    /**
     * Un alias ne se glisse pas dans le mauvais champ. `type_label` et
     * `contract_label` ne partagent pas un vocabulaire, et les intervertir ne
     * casserait AUCUN des tests ci-dessus.
     */
    public function test_un_alias_ne_se_glisse_pas_dans_le_mauvais_champ(): void
    {
        $arr = (new PropertyDoubleAliasWolof([
            'type' => PropertyType::Land,
            'contract_type' => ContractType::Sale,
        ]))->toSearchableArray();

        $this->assertStringNotContainsString('contrat', $arr['type_label']);
        $this->assertStringNotContainsString('terrain', $arr['contract_label']);
        $this->assertStringNotContainsString('alias-type-wo', $arr['contract_label']);
        $this->assertStringNotContainsString('alias-contrat-wo', $arr['type_label']);
    }

    /**
     * Un champ de vocabulaire absent de `searchableAttributes` est indexé et
     * INTERROGEABLE PAR PERSONNE — il grossit le document et ne rend rien.
     *
     * C'est aussi la garde qui refuse le réflexe « j'ajoute `type_label_wo` » :
     * un champ neuf force une édition de `searchableAttributes`, donc un
     * réimport de tous les modèles, et rouvre la question de l'ORDRE que
     * TCK-335 a mesurée (`searchableAttributes` EST une règle de classement).
     * TCK-339 concatène dans les champs existants précisément pour ne rien
     * rouvrir de tout cela.
     */
    public function test_tout_champ_de_vocabulaire_est_declare_searchable(): void
    {
        $declares = config('scout.meilisearch.index-settings.'.Property::class.'.searchableAttributes');
        $this->assertIsArray($declares);

        $champs = array_keys(Property::factory()->make()->toSearchableArray());
        // `str_contains` et pas `str_ends_with` : l'ablation a montré qu'un
        // champ nommé `type_label_wo` — exactement le réflexe que cette garde
        // existe pour refuser — passait à travers un suffixe strict.
        $vocabulaire = array_values(array_filter($champs, fn (string $c) => str_contains($c, 'label')));

        $this->assertNotEmpty($vocabulaire);
        foreach ($vocabulaire as $champ) {
            $this->assertContains($champ, $declares, "{$champ} est indexé mais n'est pas interrogeable");
        }
    }
}

/**
 * Double de test de {@see Property} : mêmes tables françaises, tables wolof
 * PARTIELLEMENT renseignées avec des jetons volontairement absurdes
 * (`zzz-…`) — aucun mot wolof n'est inventé ici, et ces jetons n'atteignent
 * jamais un index réel.
 */
class PropertyDoubleAliasWolof extends Property
{
    protected $table = 'properties';

    public const TYPE_SEARCH_ALIASES_WO = [
        'land' => 'zzz-alias-type-wo',
        'house' => '',
        'apartment' => '',
        'villa' => '',
        'studio' => '',
        'room' => '',
        'office' => '',
        'shop' => '',
        'warehouse' => '',
        'factory' => '',
        'farm' => '',
        'hotel' => '',
        'resort' => '',
        'garage' => '',
        'parking' => '',
        'other' => '',
    ];

    public const CONTRACT_SEARCH_ALIASES_WO = [
        'sale' => 'zzz-alias-contrat-wo',
        'rent' => '',
    ];
}
