<?php

namespace Tests\Feature\Console;

use App\Models\Address;
use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyType;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-339 — `search:wolof-review-sheet`.
 *
 * La commande ne décide rien : elle rassemble ce qui est mesurable sans être
 * wolophone. Ces tests gardent donc les deux propriétés qui font qu'on peut
 * s'y fier en séance de validation :
 *
 *   1. elle CITE le dépôt et ne l'invente pas — les libellés affichés viennent
 *      bien de `lang/wo/properties.php` et de `takussan-web/src/messages/wo.json` ;
 *   2. la colonne « hits » est une VRAIE mesure. C'est le point coûteux : une
 *      implémentation qui imprimerait `0` partout — moteur injoignable avalé,
 *      requête jamais émise — produirait une feuille d'aspect identique et
 *      donnerait le feu vert à un mot déjà pris. Le second test l'attrape en
 *      indexant un bien dont on sait ce qu'il doit rendre.
 */
class SearchWolofReviewSheetTest extends TestCase
{
    use InteractsWithMeilisearch, RefreshDatabase;

    public function test_la_feuille_cite_les_deux_sources_de_libelles_du_depot(): void
    {
        Artisan::call('search:wolof-review-sheet', ['--no-hits' => true]);
        $sortie = Artisan::output();

        // Une ligne par valeur d'enum — la feuille ne se réduit pas à un extrait.
        foreach (PropertyType::cases() as $case) {
            $this->assertStringContainsString($case->value, $sortie);
        }
        foreach (ContractType::cases() as $case) {
            $this->assertStringContainsString($case->value, $sortie);
        }

        // L'alias français EN VIGUEUR, cité depuis le modèle : c'est ce à quoi
        // le locuteur compare sa proposition.
        $this->assertStringContainsString(Property::TYPE_SEARCH_ALIASES['land'], $sortie);
        $this->assertStringContainsString(Property::CONTRACT_SEARCH_ALIASES['sale'], $sortie);

        // Les DEUX libellés wolof, chacun depuis sa source. Ils divergent, et la
        // feuille doit montrer la divergence plutôt que d'en choisir un.
        $this->assertStringContainsString(trans('properties.type.land', [], 'wo'), $sortie);
        $this->assertStringContainsString($this->libelleFront('land'), $sortie);
        $this->assertStringContainsString('≠', $sortie);

        // La colonne du locuteur reste vide : la commande ne propose aucun mot.
        $this->assertStringContainsString('ALIAS WO À VALIDER', $sortie);
    }

    /**
     * Le test qui empêche de livrer une colonne décorative.
     *
     * Deux biens sont indexés : une boutique dont le titre porte « Magasin » et
     * un entrepôt qui ne le porte pas. La commande doit rendre, pour ce mot, un
     * compte NON NUL et une répartition qui dit `shop`, pas `warehouse` — c'est
     * exactement la collision que la feuille existe pour montrer, en miniature.
     */
    public function test_la_colonne_hits_est_une_vraie_mesure_sur_lindex(): void
    {
        $this->bien('Magasin Sandaga', PropertyType::Shop);
        $this->bien('Entrepot Diamniadio', PropertyType::Warehouse);
        $this->indexProperties();

        Artisan::call('search:wolof-review-sheet', ['--probe' => ['Magasin']]);
        $sortie = Artisan::output();

        // Le COMPTE et la RÉPARTITION sont asserés ensemble, sur la même ligne.
        // Asserer la seule répartition laisserait passer un compte figé à 0
        // (ablation faite : la feuille reste d'aspect crédible), et asserer le
        // seul compte laisserait passer une facette perdue.
        $this->assertMatchesRegularExpression(
            '/Magasin\s*\|[^|]*\|\s*1\s*\|\s*shop:1/u',
            $sortie,
        );
        // Sur la LIGNE de « Magasin » seulement : depuis TCK-506, « depot »
        // est un alias de `warehouse`, donc le libellé front « Dépôt » atteint
        // légitimement l'entrepôt ailleurs dans la feuille (« warehouse:1 »).
        $this->assertDoesNotMatchRegularExpression(
            '/Magasin\s*\|[^|]*\|\s*\d+\s*\|[^|\n]*warehouse/u',
            $sortie,
        );

        // Et un mot absent du corpus doit rendre 0 — sans quoi le test ci-dessus
        // passerait aussi sur une commande qui compte le catalogue entier.
        Artisan::call('search:wolof-review-sheet', ['--probe' => ['zzzabsentducorpus']]);
        $this->assertMatchesRegularExpression(
            '/zzzabsentducorpus\s*\|\s*--probe\s*\|\s*0\s*\|/u',
            Artisan::output(),
        );
    }

    private function bien(string $titre, PropertyType $type): Property
    {
        $bien = Property::factory()->published()->create([
            'title' => $titre,
            'type' => $type,
            'contract_type' => ContractType::Sale,
        ]);

        Address::create([
            'addressable_type' => Property::class,
            'addressable_id' => $bien->id,
            'city' => 'Dakar',
            'neighborhood' => 'Plateau',
        ]);

        return $bien->fresh();
    }

    private function libelleFront(string $cle): string
    {
        $chemin = base_path('/../takussan-web/src/messages/wo.json');
        $this->assertFileExists($chemin);

        /** @var array<string,mixed> $messages */
        $messages = json_decode((string) file_get_contents($chemin), true);

        return data_get($messages, "property.types.{$cle}");
    }
}
