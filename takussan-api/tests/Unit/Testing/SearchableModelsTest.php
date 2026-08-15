<?php

namespace Tests\Unit\Testing;

use App\Models\Document;
use App\Models\Message;
use App\Models\Property;
use Laravel\Scout\Searchable;
use Tests\Support\SearchableModels;
use Tests\TestCase;

/**
 * La liste des modèles indexés était MAINTENUE À LA MAIN dans
 * `InteractsWithMeilisearch` — et elle avait divergé : `Message` portait
 * `Searchable` et n'y figurait pas, si bien que ses documents n'étaient
 * JAMAIS purgés entre deux tests (316 tâches mesurées sur une exécution).
 * C'est le motif récurrent du dépôt : une liste tenue à la main diverge.
 * Elle est désormais DÉRIVÉE du code, et ces tests gardent la dérivation.
 */
class SearchableModelsTest extends TestCase
{
    public function test_derives_every_searchable_model_under_app_models(): void
    {
        $models = SearchableModels::all();

        $this->assertContains(Property::class, $models);
        $this->assertContains(Document::class, $models);
        // La régression exacte : Message manquait à la liste manuelle.
        $this->assertContains(Message::class, $models);
    }

    public function test_every_derived_class_actually_uses_the_searchable_trait(): void
    {
        foreach (SearchableModels::all() as $model) {
            $this->assertContains(
                Searchable::class,
                class_uses_recursive($model),
                "{$model} est listé comme indexable sans porter le trait Searchable.",
            );
        }
    }

    /**
     * Recoupement avec une source INDÉPENDANTE : `config/scout.php` clé ses
     * `index-settings` par classe de modèle. Les deux ensembles doivent
     * coïncider — un modèle indexable sans réglages d'index échouerait en
     * recherche sur « Attribute `x` is not filterable », et des réglages sans
     * modèle sont du code mort.
     */
    public function test_matches_the_models_configured_in_scout_index_settings(): void
    {
        $configured = array_keys(config('scout.meilisearch.index-settings'));
        $derived = SearchableModels::all();

        sort($configured);
        sort($derived);

        $this->assertSame($configured, $derived);
    }
}
