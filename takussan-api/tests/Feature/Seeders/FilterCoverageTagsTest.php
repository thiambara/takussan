<?php

namespace Tests\Feature\Seeders;

use App\Models\Enums\TagType;
use App\Models\Property;
use App\Models\Tag;
use Database\Seeders\Catalog\PropertySeeder;
use Database\Seeders\Core\AgencySeeder;
use Database\Seeders\Core\UserSeeder;
use Database\Seeders\Support\FilterCoverageSeeder;
use Database\Seeders\Support\SeedingConfig;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\System\TagSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-335, étape 7 — le jeu de démonstration cesse de se contredire.
 *
 * Deux propriétés du jeu semé, et deux seulement. Elles ne sont pas
 * cosmétiques : ce sont les PRÉALABLES de l'étape 8, et sans elles toute
 * mesure de recherche juge une donnée fausse ou une donnée absente.
 *
 * 1. **Aucun titre ne promet « meublé » sur un bien qui ne l'est pas.**
 *    Mesuré le 2026-08-21 sur la base locale : **12 des 21 biens publics dont
 *    le titre disait « meublé » portaient `furnished = false`** — 57 %. Le
 *    gabarit de titre était tiré indépendamment de la colonne.
 * 2. **La table pivot des taggables n'est plus vide.** Mesuré le même jour :
 *    **0 ligne** pour 836 biens et 22 tags. Rendre `tags` searchable côté
 *    moteur aurait alors été INVÉRIFIABLE — un index juste et un index vide
 *    y sont indistinguables — et le filtre `tags=` n'était jamais exercé.
 *
 * ── POURQUOI UN MINI-PIPELINE, ET PAS `YearOfActivitySeeder` ──────────────
 *
 * Le pipeline complet compte une quarantaine de seeders et plusieurs minutes.
 * Ce test rejoue les CINQ dont `FilterCoverageSeeder` dépend réellement, dans
 * leur ordre de `YearOfActivitySeeder::PIPELINE`, sur un catalogue réduit. Il
 * mesure donc le seeder lui-même, pas l'orchestrateur.
 */
class FilterCoverageTagsTest extends TestCase
{
    use RefreshDatabase;

    /** Assez de biens pour que « un sur trois » soit une mesure et non un arrondi. */
    private const BIENS_PAR_AGENCE = 60;

    protected function setUp(): void
    {
        parent::setUp();

        $this->semer();
    }

    private function semer(): void
    {
        $context = new SeedingContext(new SeedingConfig(
            agencies: 1,
            propertiesPerAgency: self::BIENS_PAR_AGENCE,
            includeEdgeCases: false,
            ensureReferentialIntegrity: false,
            includeFilterCoverage: true,
            includeDemoUsers: false,
            downloadMedia: false,
        ));

        app()->instance(SeedingContext::class, $context);

        foreach ([TagSeeder::class, AgencySeeder::class, UserSeeder::class, PropertySeeder::class, FilterCoverageSeeder::class] as $classe) {
            app($classe)->run();
        }
    }

    public function test_aucun_titre_public_ne_promet_meuble_sur_un_bien_qui_ne_lest_pas(): void
    {
        // NON-VACUITÉ D'ABORD : un corpus sans le moindre bien meublé, ou sans
        // le moindre bien non meublé, rendrait l'assertion suivante vraie sans
        // rien prouver.
        $this->assertGreaterThan(0, Property::query()->public()->where('furnished', true)->count());
        $this->assertGreaterThan(0, Property::query()->public()->where('furnished', false)->count());

        $contradictions = Property::query()
            ->public()
            ->where('title', 'like', '%meubl%')
            ->where('furnished', false)
            ->count();

        $this->assertSame(0, $contradictions);
    }

    public function test_au_moins_un_bien_public_sur_trois_porte_un_tag_et_pas_tous(): void
    {
        $publics = Property::query()->public()->count();
        $this->assertGreaterThan(0, $publics);

        $tagues = Property::query()->public()->has('tags')->count();

        // « Au moins un sur trois » : c'est le plancher qui rend la facette et
        // le filtre `tags=` exerçables en développement.
        $this->assertGreaterThanOrEqual(
            (int) ceil($publics / 3),
            $tagues,
            "seulement {$tagues} biens publics tagués sur {$publics}",
        );

        // « Et pas tous » : un catalogue entièrement tagué ne permettrait plus
        // de distinguer « le filtre marche » de « le filtre ne filtre rien ».
        $this->assertLessThan($publics, $tagues);
    }

    public function test_aucun_tag_crm_n_est_colle_sur_un_bien(): void
    {
        // Non-vacuité : les tags CRM existent bel et bien dans le jeu semé.
        // Sans cette ligne, un TagSeeder qui cesserait de les créer rendrait
        // l'assertion suivante vraie pour la mauvaise raison.
        $this->assertSame(5, Tag::query()->where('type', TagType::Crm)->count());

        $crmSurDesBiens = DB::table('taggables')
            ->join('tags', 'tags.id', '=', 'taggables.tag_id')
            ->where('taggables.taggable_type', Property::class)
            ->where('tags.type', TagType::Crm->value)
            ->count();

        // `VIP`, `Prospect chaud`, `Étranger`, `Famille`, `Étudiant` décrivent
        // des CLIENTS. Collés sur un bien, et `tags` étant désormais searchable,
        // un appartement remonterait sur `q=étudiant`.
        $this->assertSame(0, $crmSurDesBiens);
    }

    public function test_chaque_bien_cree_par_le_seeder_de_couverture_porte_des_tags(): void
    {
        $couverture = Property::query()->where('is_test', true);

        $total = (clone $couverture)->count();
        $this->assertGreaterThan(0, $total);

        // Ces biens-là ne sont PAS publics (`is_test = true`) : ils couvrent le
        // filtre `tags=` côté back-office, là où la passe sur le catalogue —
        // qui ne vise que le public — ne les atteint pas.
        $this->assertSame($total, (clone $couverture)->has('tags')->count());

        // Et les tags qui leur sont attachés sont bien des tags d'ÉQUIPEMENT.
        $types = Tag::query()
            ->whereIn('id', DB::table('taggables')->where('taggable_type', Property::class)->pluck('tag_id'))
            ->pluck('type')
            ->map(fn (TagType $type) => $type->value)
            ->unique()
            ->sort()
            ->values()
            ->all();

        $this->assertSame([TagType::Amenity->value, TagType::Feature->value], $types);
    }
}
