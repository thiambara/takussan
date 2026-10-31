<?php

namespace Tests\Feature\Radar;

use App\Ai\Usages\RadarEmbeddingUsage;
use App\Jobs\Radar\EmbedRadarListings;
use App\Models\AiCall;
use App\Models\AiUsageSetting;
use App\Models\Embedding;
use App\Models\Enums\AiCallOutcome;
use App\Models\Enums\AiDataClass;
use App\Models\Enums\AiRefusalReason;
use App\Models\Enums\RadarListingStage;
use App\Models\RadarListing;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Radar\Embeddings\RadarEmbeddingSweep;
use App\Services\Radar\Embeddings\RadarEmbeddingTarget;
use App\Services\Radar\RadarAutoMerge;
use App\Services\Radar\RadarMatcher;
use App\Services\Radar\RadarPurger;
use App\Services\Radar\Similarity\EmbeddingTextSimilarity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use ReflectionMethod;
use Tests\TestCase;

/**
 * TCK-2423 — le pilote d'embeddings du Radar et son repli sur `trigram`. Aucun vrai modèle : `Http::fake` joue Voyage AI, et le
 * faux modèle rend, pour chaque texte, le cosinus voulu avec un vecteur de référence.
 */
class RadarEmbeddingsTest extends TestCase
{
    use RefreshDatabase;

    private const COPIE = 'Bel appartement fictif au troisième étage, salon double très lumineux, cuisine équipée, '
        .'deux chambres avec placards, terrasse donnant sur la mer, gardien et parking en sous-sol.';

    /** La même chose, d'autres mots : `pg_trgm` ne les rapproche pas. */
    private const REFORMULATION = 'À louer logement sur plateau élevé, séjour baigné de soleil, coin repas aménagé, '
        .'paire de pièces à coucher, vue océan depuis le balcon, surveillance permanente, garage couvert.';

    private const SANS_RAPPORT = 'Terrain fictif viabilisé en zone résidentielle calme, titre foncier disponible, accès '
        .'goudronné, proche de la route nationale et des écoles du quartier.';

    /** @var array<string, float> le cosinus de chaque texte replié avec la référence */
    private array $cosinus = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeTime();
        Cache::flush();
        config([
            'ai.providers.voyageai.key' => 'cle-de-test',
            'ai.budgets.daily_global_usd' => null,
            'radar.similarity.driver' => 'embeddings',
        ]);
    }

    /** @return list<float> */
    private function vecteur(float $cosinus): array
    {
        $vecteur = array_fill(0, 1024, 0.0);
        $vecteur[0] = $cosinus;
        $vecteur[1] = sqrt(max(0, 1 - $cosinus ** 2));

        return $vecteur;
    }

    private function fauxModele(): void
    {
        Http::fake(['api.voyageai.com/*' => function (Request $requete) {
            return Http::response([
                'object' => 'list',
                'data' => array_map(
                    fn (string $texte, int $i) => ['object' => 'embedding', 'index' => $i, 'embedding' => $this->vecteur($this->cosinus[$texte] ?? 0.1)],
                    $requete['input'],
                    array_keys($requete['input']),
                ),
                'model' => $requete['model'],
                'usage' => ['total_tokens' => 1000],
            ]);
        }]);
    }

    private function annonce(string $description, array $attributs = [], ?float $cosinus = null): RadarListing
    {
        $annonce = RadarListing::factory()->extracted(['phones' => [], 'description' => ['value' => $description]])->create($attributs);
        if ($cosinus !== null) {
            $this->cosinus[$annonce->fresh()->similarity_text] = $cosinus;
        }

        return $annonce;
    }

    private function balayer(): void
    {
        app(RadarEmbeddingSweep::class)->run();
    }

    /** @return array<int, array<string, mixed>> le signal de texte de chaque annonce rapprochée, par identifiant */
    private function signaux(RadarListing $annonce): array
    {
        $signaux = [];
        foreach ($this->app->make(RadarMatcher::class)->matchesFor($annonce->fresh()) as $rapprochement) {
            foreach ($rapprochement['signals'] as $signal) {
                if ($rapprochement['kind'] === 'listing' && $signal['signal'] === RadarMatcher::SIGNAL_TEXT) {
                    $signaux[$rapprochement['id']] = $signal;
                }
            }
        }

        return $signaux;
    }

    // ─── AC1, AC2 ────────────────────────────────────────────────────────────────────────

    public function test_ac1_deux_annonces_reformulees_se_rapprochent_par_le_signal_text(): void
    {
        $this->fauxModele();
        $autre = $this->annonce(self::COPIE, cosinus: 0.95);
        $source = $this->annonce(self::REFORMULATION, cosinus: 0.95);

        // Sans vecteur, ces deux textes ne se rapprochent pas : c'est tout l'apport du pilote.
        $this->assertSame([], $this->signaux($source));

        $this->balayer();

        $signal = $this->signaux($source)[$autre->id];
        $this->assertSame('embeddings', $signal['method']);
        $this->assertSame('medium', $signal['strength']);
        $this->assertSame(1.0, $signal['similarity']);
    }

    public function test_ac2_sans_vecteur_calcule_le_signal_retombe_sur_trigram(): void
    {
        Http::fake();
        $autre = $this->annonce(self::COPIE);
        $source = $this->annonce(self::COPIE);

        $signal = $this->signaux($source)[$autre->id];

        $this->assertSame('trigram', $signal['method']);
        Http::assertNothingSent();
    }

    public function test_les_seuils_vectoriels_sont_les_leurs_et_pas_ceux_des_trigrammes(): void
    {
        $this->fauxModele();
        $source = $this->annonce(self::SANS_RAPPORT, cosinus: 1.0);
        $proche = $this->annonce(self::COPIE, cosinus: 0.95);
        $ressemblante = $this->annonce(self::REFORMULATION, cosinus: 0.85);
        // Au-dessus de `radar.similarity.close` (0,8 pour des trigrammes) et sous le seuil vectoriel propre.
        $sous = $this->annonce(self::REFORMULATION.' Un mot de plus pour un autre texte replié, fictif.', cosinus: 0.5);
        $this->balayer();

        $signaux = $this->signaux($source);

        $this->assertSame('medium', $signaux[$proche->id]['strength']);
        $this->assertSame('low', $signaux[$ressemblante->id]['strength']);
        $this->assertArrayNotHasKey($sous->id, $signaux);

        config(['radar.similarity.embeddings.close' => 0.99]);
        $this->assertSame('low', $this->signaux($source)[$proche->id]['strength']);
    }

    // ─── Les cas de repli ────────────────────────────────────────────────────────────────

    public function test_repli_pilote_non_configure_meme_avec_une_cle_et_des_vecteurs(): void
    {
        $this->fauxModele();
        $this->annonce(self::REFORMULATION, cosinus: 0.95);
        $source = $this->annonce(self::COPIE, cosinus: 0.95);
        $this->balayer();
        $copie = $this->annonce(self::COPIE);

        config(['radar.similarity.driver' => 'trigram']);
        $this->app->forgetInstance(RadarMatcher::class);

        $signaux = $this->signaux($source);
        $this->assertSame([$copie->id], array_keys($signaux));
        $this->assertSame('trigram', $signaux[$copie->id]['method']);

        // Revenir à `trigram` sans retirer la clé arrête aussi les envois.
        $this->balayer();
        Http::assertSentCount(1);
    }

    public function test_repli_cle_absente_rien_ne_part_ni_ne_se_compare(): void
    {
        $this->fauxModele();
        $this->annonce(self::REFORMULATION, cosinus: 0.95);
        $source = $this->annonce(self::COPIE, cosinus: 0.95);
        $this->balayer();
        Http::assertSentCount(1);

        config(['ai.providers.voyageai.key' => null]);
        $this->annonce(self::SANS_RAPPORT);
        $this->balayer();

        Http::assertSentCount(1);
        $this->assertSame([], $this->signaux($source), 'un vecteur déjà calculé ne sert plus sans clé');
    }

    public function test_sans_cle_lappariement_ne_fait_aucune_requete_de_plus(): void
    {
        config(['ai.providers.voyageai.key' => null]);
        $source = $this->annonce(self::COPIE);
        $this->annonce(self::COPIE);
        DB::enableQueryLog();

        $this->signaux($source);

        $this->assertSame([], array_values(array_filter(
            array_column(DB::getQueryLog(), 'query'),
            fn (string $sql) => str_contains($sql, 'ai_usage_settings') || str_contains($sql, 'ai_role_assignments') || str_contains($sql, 'embeddings') || str_contains($sql, 'pg_'),
        )));
    }

    public function test_repli_vecteur_manquant_de_lannonce_comparee(): void
    {
        $this->fauxModele();
        $autre = $this->annonce(self::COPIE, cosinus: 0.95);
        $this->balayer();
        $source = $this->annonce(self::COPIE.' Fictif.');

        $signal = $this->signaux($source)[$autre->id];

        $this->assertSame('trigram', $signal['method']);
    }

    public function test_repli_vecteur_manquant_de_lannonce_candidate(): void
    {
        $this->fauxModele();
        $source = $this->annonce(self::COPIE, cosinus: 0.95);
        $avecVecteur = $this->annonce(self::REFORMULATION, cosinus: 0.95);
        $this->balayer();
        $sansVecteur = $this->annonce(self::COPIE.' Fictif.');

        $signaux = $this->signaux($source);

        $this->assertSame('embeddings', $signaux[$avecVecteur->id]['method']);
        $this->assertSame('trigram', $signaux[$sansVecteur->id]['method']);

        // Les vecteurs d'abord, sans tri commun aux deux échelles.
        $lignes = app(EmbeddingTextSimilarity::class)->similar(RadarListing::query()->whereKeyNot($source->id), (string) $source->fresh()->similarity_text, 10);
        $this->assertSame(['embeddings', 'trigram'], array_column($lignes, 'method'));
    }

    public function test_un_vecteur_dun_autre_texte_ne_compte_plus(): void
    {
        $this->fauxModele();
        $source = $this->annonce(self::COPIE, cosinus: 0.95);
        $autre = $this->annonce(self::REFORMULATION, cosinus: 0.95);
        $this->balayer();

        // Le texte change hors du modèle (une écriture de masse) : le vecteur ne décrit plus l'annonce.
        RadarListing::query()->whereKey($autre->id)->toBase()->update(['similarity_text' => mb_strtolower(self::SANS_RAPPORT)]);

        $this->assertArrayNotHasKey($autre->id, $this->signaux($source));
    }

    public function test_repli_table_absente(): void
    {
        $this->fauxModele();
        $autre = $this->annonce(self::COPIE);
        $source = $this->annonce(self::COPIE);
        Schema::drop('embeddings');

        $this->balayer();

        Http::assertNothingSent();
        $this->assertSame('trigram', $this->signaux($source)[$autre->id]['method']);
    }

    public function test_repli_api_en_panne_lappariement_tient_et_ne_boucle_pas(): void
    {
        Http::fake(['api.voyageai.com/*' => Http::response(['detail' => 'panne'], 503)]);
        $autre = $this->annonce(self::COPIE);
        $source = $this->annonce(self::COPIE);

        $this->balayer();
        // Le balayage suivant ne repart pas : la panne a suspendu les balayages.
        $this->balayer();

        Http::assertSentCount(1);
        $this->assertSame(0, Embedding::query()->count());
        $appel = AiCall::query()->where('usage_key', RadarEmbeddingUsage::KEY)->sole();
        $this->assertSame(AiCallOutcome::FailedOver, $appel->outcome);
        $this->assertSame('voyageai', $appel->provider);
        $this->assertSame('trigram', $this->signaux($source)[$autre->id]['method']);

        // Passé le délai, un seul appel de plus.
        $this->travel((int) config('radar.similarity.embeddings.cooldown_minutes') + 1)->minutes();
        $this->balayer();
        Http::assertSentCount(2);
    }

    public function test_un_identifiant_refuse_par_le_fournisseur_ne_fait_pas_tomber_le_job(): void
    {
        Http::fake(['api.voyageai.com/*' => Http::response(['detail' => 'clé refusée'], 401)]);
        $this->annonce(self::COPIE);

        $this->balayer();
        $this->balayer();

        Http::assertSentCount(1);
        $this->assertSame('ai.provider_auth', AiCall::query()->sole()->error_code);
    }

    public function test_une_sortie_inexploitable_est_payee_et_nentre_pas(): void
    {
        foreach ([array_fill(0, 12, 0.5), array_fill(0, 1024, 0.0)] as $vecteur) {
            AiCall::query()->delete();
            Cache::flush();
            Http::fake(['api.voyageai.com/*' => Http::response(['data' => [['embedding' => $vecteur, 'index' => 0]], 'usage' => ['total_tokens' => 1000]])]);
            RadarListing::query()->delete();
            $this->annonce(self::COPIE);

            $this->balayer();

            $this->assertSame(0, Embedding::query()->count());
            $appel = AiCall::query()->sole();
            $this->assertSame('ai.response_invalid', $appel->error_code);
            $this->assertSame(0, bccomp('0.00006', (string) $appel->cost_estimate_usd, 8));
        }
    }

    // ─── AC3 : ce qui part ───────────────────────────────────────────────────────────────

    public function test_ac3_le_corps_envoye_a_voyage_est_masque_et_suit_le_contrat(): void
    {
        $this->fauxModele();
        $annonce = $this->annonce(self::COPIE);
        // `similarity_text` n'a jamais de chiffres : on force ce qu'une évolution du repli pourrait laisser passer.
        RadarListing::query()->whereKey($annonce->id)->toBase()->update(['similarity_text' => self::COPIE.' appelez le 77 012 34 56']);

        $this->balayer();

        Http::assertSent(function (Request $requete) {
            $corps = $requete->body();
            $this->assertSame('https://api.voyageai.com/v1/embeddings', $requete->url());
            $this->assertSame('Bearer cle-de-test', $requete->header('Authorization')[0]);
            $this->assertStringNotContainsString('77 012 34 56', $corps);
            $this->assertStringContainsString('appelez le', $corps);
            $this->assertSame('voyage-4', $requete['model']);
            $this->assertSame('document', $requete['input_type']);
            $this->assertSame(1024, $requete['output_dimension']);

            return true;
        });
    }

    public function test_une_annonce_non_jugee_ou_refusee_ne_part_pas(): void
    {
        $this->fauxModele();
        foreach ([RadarListingStage::Captured, RadarListingStage::DoNotContact, RadarListingStage::Refused, RadarListingStage::Purged] as $etape) {
            $this->annonce(self::COPIE, ['stage' => $etape]);
        }

        $this->balayer();

        Http::assertNothingSent();
    }

    public function test_une_adresse_hors_des_hotes_acceptes_ne_recoit_ni_texte_ni_cle(): void
    {
        $this->fauxModele();
        config(['ai.providers.voyageai.url' => 'https://ailleurs.example/v1']);
        $autre = $this->annonce(self::COPIE);
        $source = $this->annonce(self::COPIE);

        $this->balayer();

        Http::assertNothingSent();
        $this->assertSame('trigram', $this->signaux($source)[$autre->id]['method']);
    }

    // ─── AC4 : le socle ──────────────────────────────────────────────────────────────────

    public function test_ac4_lappel_se_journalise_et_coute_en_dollars(): void
    {
        $this->fauxModele();
        $this->annonce(self::COPIE);

        $this->balayer();

        $appel = AiCall::query()->sole();
        $this->assertSame(RadarEmbeddingUsage::KEY, $appel->usage_key);
        $this->assertSame('embedding', $appel->role->value);
        $this->assertSame(['voyageai', 'voyage-4'], [$appel->provider, $appel->model]);
        $this->assertSame(AiCallOutcome::Success, $appel->outcome);
        $this->assertSame(1000, $appel->input_tokens);
        // 1 000 tokens à 0,06 $ le million.
        $this->assertSame(0, bccomp('0.00006', (string) $appel->cost_estimate_usd, 8));
    }

    public function test_ac4_le_plafond_refuse_lappel_et_le_journal_le_dit(): void
    {
        $this->fauxModele();
        AiCall::query()->create(['usage_key' => RadarEmbeddingUsage::KEY, 'outcome' => 'success', 'cost_estimate_usd' => '5']);
        AiUsageSetting::query()->create(['usage_key' => RadarEmbeddingUsage::KEY, 'enabled' => true, 'daily_budget_usd' => '1']);
        $this->annonce(self::COPIE);

        $this->balayer();

        Http::assertNothingSent();
        $refus = AiCall::query()->where('outcome', AiCallOutcome::Refused->value)->sole();
        $this->assertSame(AiRefusalReason::Budget, $refus->refusal_reason);
    }

    public function test_ac4_le_coupe_circuit_refuse_lappel(): void
    {
        $this->fauxModele();
        AiUsageSetting::query()->create(['usage_key' => RadarEmbeddingUsage::KEY, 'enabled' => false]);
        $this->annonce(self::COPIE);

        $this->balayer();

        Http::assertNothingSent();
        $this->assertSame(AiRefusalReason::KillSwitch, AiCall::query()->sole()->refusal_reason);
    }

    public function test_lusage_est_au_catalogue_en_classe_publique(): void
    {
        $this->assertContains(RadarEmbeddingUsage::class, AiUsageRegistry::USAGES);
        $this->assertSame(AiDataClass::Publique, (new RadarEmbeddingUsage)->maxDataClass());
    }

    // ─── AC5 : le calcul en file, jamais pendant l'appariement ───────────────────────────

    public function test_ac5_le_calcul_part_en_file_ai_et_lappariement_nappelle_rien(): void
    {
        Queue::fake();
        Http::fake();
        $source = $this->annonce(self::COPIE);
        $this->annonce(self::COPIE);

        $this->signaux($source);
        Queue::assertNothingPushed();
        Http::assertNothingSent();

        $this->balayer();
        Queue::assertPushedOn('ai', EmbedRadarListings::class);
        Http::assertNothingSent();
    }

    public function test_deux_dimensions_cohabitent_sans_erreur_sql(): void
    {
        $this->fauxModele();
        $autre = $this->annonce(self::REFORMULATION, cosinus: 0.95);
        $source = $this->annonce(self::COPIE, cosinus: 0.95);
        $this->balayer();

        // Le vecteur d'un ancien réglage, à 3 dimensions : `<=>` lèverait s'il entrait dans la comparaison.
        $ancienne = $this->annonce(self::SANS_RAPPORT);
        Embedding::query()->create([
            'embeddable_type' => $ancienne->getMorphClass(), 'embeddable_id' => $ancienne->id, 'provider' => 'voyageai', 'model' => 'voyage-4',
            'dimension' => 3, 'vector' => '[1,0,0]', 'content_hash' => Embedding::contentHash((string) $ancienne->fresh()->similarity_text),
        ]);

        $this->assertArrayHasKey($autre->id, $this->signaux($source));
    }

    // ─── AC7 : le coût ───────────────────────────────────────────────────────────────────

    public function test_ac7_une_annonce_inchangee_ne_se_recalcule_pas_et_une_modifiee_si(): void
    {
        $this->fauxModele();
        $annonce = $this->annonce(self::COPIE);

        $this->balayer();
        $this->balayer();
        Http::assertSentCount(1);

        $annonce->fresh()->forceFill(['extracted' => [...$annonce->fresh()->extracted, 'description' => ['value' => self::REFORMULATION]]])->save();
        $this->balayer();

        Http::assertSentCount(2);
        $ligne = Embedding::query()->sole();
        $this->assertSame(Embedding::contentHash((string) $annonce->fresh()->similarity_text), $ligne->content_hash);
    }

    public function test_changer_de_modele_recalcule_et_ne_compare_pas_les_modeles(): void
    {
        $this->fauxModele();
        $autre = $this->annonce(self::REFORMULATION, cosinus: 0.95);
        $source = $this->annonce(self::COPIE, cosinus: 0.95);
        $this->balayer();
        $this->assertSame('embeddings', $this->signaux($source)[$autre->id]['method']);

        config(['ai.roles.embedding' => [['provider' => 'voyageai', 'model' => 'voyage-4-lite']]]);
        $this->assertSame([], $this->signaux($source), 'un vecteur d\'un autre modèle ne se compare pas');

        $this->balayer();
        $this->assertSame('embeddings', $this->signaux($source)[$autre->id]['method']);
        $this->assertSame(4, Embedding::query()->count());
    }

    public function test_le_job_relit_lannonce_au_lieu_de_faire_confiance_a_la_file(): void
    {
        $this->fauxModele();
        $annonce = $this->annonce(self::COPIE);
        Queue::fake();
        $this->balayer();
        RadarListing::query()->whereKey($annonce->id)->toBase()->update(['stage' => RadarListingStage::DoNotContact->value]);

        (new EmbedRadarListings([$annonce->id]))->handle(app(AiGateway::class), app(RadarEmbeddingTarget::class), app(RadarEmbeddingSweep::class));

        Http::assertNothingSent();
    }

    // ─── La purge, la fusion ─────────────────────────────────────────────────────────────

    public function test_la_purge_efface_le_vecteur_avec_le_texte(): void
    {
        $this->fauxModele();
        $annonce = $this->annonce(self::COPIE, ['purge_at' => now()->subDay()]);
        $this->balayer();
        $this->assertSame(1, Embedding::query()->count());

        $comptes = app(RadarPurger::class)->run();

        $this->assertSame(1, $comptes['embeddings_deleted']);
        $this->assertSame(0, Embedding::query()->where('embeddable_id', $annonce->id)->count());
    }

    public function test_la_purge_tient_sans_la_table(): void
    {
        $this->annonce(self::COPIE, ['purge_at' => now()->subDay()]);
        Schema::drop('embeddings');

        $this->assertSame(1, app(RadarPurger::class)->run()['listings']);
    }

    public function test_un_rapprochement_par_vecteurs_ne_corrobore_pas_une_fusion_automatique(): void
    {
        $lieu = ['signal' => RadarMatcher::SIGNAL_PLACE, 'strength' => 'medium'];
        $juge = new ReflectionMethod(RadarAutoMerge::class, 'designatesTheProperty');

        $this->assertTrue($juge->invoke(null, [$lieu, ['signal' => 'text', 'strength' => 'medium', 'method' => 'trigram']]));
        $this->assertFalse($juge->invoke(null, [$lieu, ['signal' => 'text', 'strength' => 'medium', 'method' => 'embeddings']]));

        config(['radar.similarity.embeddings.corroborates_merge' => true]);
        $this->assertTrue($juge->invoke(null, [$lieu, ['signal' => 'text', 'strength' => 'medium', 'method' => 'embeddings']]));
    }
}
