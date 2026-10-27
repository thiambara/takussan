<?php

namespace Tests\Feature\Radar;

use App\Ai\Agents\RadarExtraction;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Services\Radar\ExtractionNormalizer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-2386 (ADR-0077 §5) — ce que le modèle a rendu, relu par du code avant d'être enregistré :
 * confiance forcée sans passage cité (AC3), prix lu et borné (AC4), quartier rapproché du
 * référentiel (AC5).
 */
class ExtractionNormalizerTest extends TestCase
{
    use RefreshDatabase;

    private const SOURCE = "Appartement à louer à Liberté 6, Dakar.\n3 chambres, 2 salles de bain, 120 m².\n"
        .'Loyer : 450.000f/mois. Contact : 77 123 45 67';

    private ExtractionNormalizer $normalizer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->normalizer = app(ExtractionNormalizer::class);
    }

    /** @return array{value: mixed, confidence: string, evidence: ?string} */
    private static function field(mixed $value, ?string $evidence, string $confidence = 'high'): array
    {
        return ['value' => $value, 'confidence' => $confidence, 'evidence' => $evidence];
    }

    /** @return array<string, mixed> Une sortie complète et cohérente avec {@see self::SOURCE}. */
    private static function raw(array $overrides = []): array
    {
        return array_replace([
            'property_type' => self::field('apartment', 'Appartement'),
            'contract' => self::field('rent', 'à louer'),
            'rent_period' => self::field(null, null),
            'price' => self::field('450.000f/mois', 'Loyer : 450.000f/mois'),
            'neighborhood' => self::field('Liberté 6', 'Liberté 6'),
            'city' => self::field('Dakar', 'Dakar'),
            'bedrooms' => self::field(3, '3 chambres'),
            'bathrooms' => self::field(2, '2 salles de bain'),
            'surface_m2' => self::field(120, '120 m²'),
            'furnished' => self::field(null, null),
            'amenities' => self::field(null, null),
            'title' => self::field(null, null),
            'description' => self::field(null, null),
            'phones' => ['77 123 45 67'],
            'advertiser_name' => self::field(null, null),
            'advertiser_nature' => self::field('unknown', null),
            'nature_signals' => [],
        ], $overrides);
    }

    private function quartier(string $city, string $name): GeoNeighborhood
    {
        $ville = GeoCity::query()->where('name', $city)->first()
            ?? GeoCity::factory()->create(['name' => $city, 'slug' => Str::slug($city).'-'.Str::random(4)]);

        return GeoNeighborhood::factory()->create(['geo_city_id' => $ville->id, 'name' => $name, 'slug' => Str::slug($name).'-'.Str::random(4)]);
    }

    public function test_la_sortie_a_une_entree_par_champ_et_reste_serialisable(): void
    {
        $out = $this->normalizer->normalize([], null);

        foreach ([...RadarExtraction::PROPERTY_FIELDS, ...RadarExtraction::ADVERTISER_FIELDS] as $field) {
            $this->assertSame(['value', 'confidence', 'evidence', 'flags'], array_slice(array_keys($out[$field]), 0, 4), $field);
            $this->assertSame('low', $out[$field]['confidence'], $field);
        }
        $this->assertSame(['raw' => null, 'period' => null], array_intersect_key($out['price'], ['raw' => 1, 'period' => 1]));
        $this->assertSame(['neighborhood_id' => null, 'suggestions' => []], array_intersect_key($out['neighborhood'], ['neighborhood_id' => 1, 'suggestions' => 1]));
        $this->assertSame('unknown', $out['advertiser_nature']['value']);
        $this->assertSame([], $out['phones']);
        $this->assertSame([], $out['nature_signals']);
        $this->assertSame($out, json_decode((string) json_encode($out), true));
    }

    // ─── AC3 — sans passage cité, la confiance la plus basse ─────────────────────────────

    public function test_ac3_un_champ_sans_passage_cite_tombe_a_la_confiance_la_plus_basse(): void
    {
        $out = $this->normalizer->normalize(self::raw([
            'bedrooms' => self::field(3, null),
            'bathrooms' => self::field(2, '   '),
        ]), self::SOURCE);

        $this->assertSame(['value' => 3, 'confidence' => 'low', 'evidence' => null, 'flags' => ['evidence_missing']], $out['bedrooms']);
        $this->assertSame('low', $out['bathrooms']['confidence']);
        $this->assertSame(['evidence_missing'], $out['bathrooms']['flags']);
        // Le témoin : avec son passage, le même champ garde la confiance déclarée.
        $this->assertSame(['value' => 120, 'confidence' => 'high', 'evidence' => '120 m²', 'flags' => []], $out['surface_m2']);
    }

    public function test_un_passage_absent_du_texte_source_est_signale(): void
    {
        $out = $this->normalizer->normalize(self::raw([
            'bedrooms' => self::field(4, '4 chambres spacieuses'),
            // Casse et blancs repliés : c'est bien le passage de la source.
            'bathrooms' => self::field(2, "2  SALLES\nde bain", 'medium'),
        ]), self::SOURCE);

        $this->assertSame('low', $out['bedrooms']['confidence']);
        $this->assertSame(['evidence_not_in_source'], $out['bedrooms']['flags']);
        $this->assertSame('medium', $out['bathrooms']['confidence']);
        $this->assertSame([], $out['bathrooms']['flags']);
    }

    public function test_sans_texte_source_la_presence_du_passage_n_est_pas_controlee(): void
    {
        $out = $this->normalizer->normalize(self::raw(['bedrooms' => self::field(4, '4 chambres spacieuses')]), null);

        $this->assertSame('high', $out['bedrooms']['confidence']);
        $this->assertSame([], $out['bedrooms']['flags']);
    }

    /** @return array<string, array{string, string}> passage cité → texte source où il se trouve */
    public static function passagesRetrouves(): array
    {
        return [
            'troncature par points de suspension' => ['Loyer : 450.000f…', 'Loyer : 450.000f/mois, charges comprises'],
            'trois points entre deux segments' => ['Appartement ... Liberté 6', 'Appartement à louer à Liberté 6, Dakar'],
            'source décomposée (NFD)' => ['Liberté 6', "Appartement à Liberte\u{0301} 6"],
            'passage sans accents' => ['Liberte 6 Medina', 'Appartement à Liberté 6 Médina'],
            'tirets typographiques' => ['Grand-Yoff', "Villa à Grand\u{2011}Yoff"],
            'guillemets français contre droits' => ['"mon appartement"', 'Je loue « mon appartement » meublé'],
            'apostrophe typographique' => ["l'appartement", 'Je loue l’appartement du haut'],
            'espace avant les deux-points' => ['Prix: 1.500.000 F', 'Villa. Prix : 1.500.000 F'],
            'séparateur de milliers point contre espace' => ['Prix : 450.000', 'Prix : 450 000 F'],
            'séparateur de milliers insécable' => ['450 000 F', "Loyer 450\u{202F}000 F"],
        ];
    }

    #[DataProvider('passagesRetrouves')]
    public function test_un_passage_cite_se_retrouve_malgre_la_typographie(string $evidence, string $source): void
    {
        $out = $this->normalizer->normalize(self::raw(['title' => self::field('Titre', $evidence)]), $source);

        $this->assertSame([], $out['title']['flags']);
        $this->assertSame('high', $out['title']['confidence']);
    }

    public function test_des_segments_tronques_dans_le_desordre_ne_se_retrouvent_pas(): void
    {
        $out = $this->normalizer->normalize(self::raw(['title' => self::field('Titre', 'Liberté 6 … Appartement')]), self::SOURCE);

        $this->assertSame(['evidence_not_in_source'], $out['title']['flags']);
    }

    // ─── AC4 — le prix lu par du code, et borné ──────────────────────────────────────────

    public function test_ac4_1m5_devient_1_500_000_xof(): void
    {
        $out = $this->normalizer->normalize(self::raw([
            'contract' => self::field('sale', 'à vendre'),
            'price' => self::field('1M5', 'Prix 1M5'),
        ]), null);

        $this->assertSame(1_500_000, $out['price']['value']);
        $this->assertSame('1M5', $out['price']['raw']);
        $this->assertNull($out['price']['period']);
        $this->assertSame([], $out['price']['flags']);
        $this->assertNull($out['rent_period']['value']);
    }

    public function test_ac4_450_000f_par_mois_est_un_loyer_mensuel_et_la_periode_s_en_deduit(): void
    {
        $out = $this->normalizer->normalize(self::raw(), self::SOURCE);

        $this->assertSame(['value' => 450_000, 'confidence' => 'high', 'evidence' => 'Loyer : 450.000f/mois', 'flags' => [], 'raw' => '450.000f/mois', 'period' => 'monthly'], $out['price']);
        $this->assertSame('monthly', $out['rent_period']['value']);
        $this->assertSame('Loyer : 450.000f/mois', $out['rent_period']['evidence']);
    }

    public function test_ac4_un_loyer_de_5_000_xof_par_mois_est_hors_bornes_et_garde_sa_valeur(): void
    {
        $out = $this->normalizer->normalize(self::raw([
            'price' => self::field('5 000 F', '5 000 F'),
            'rent_period' => self::field('monthly', 'par mois'),
        ]), null);

        $this->assertSame(5_000, $out['price']['value']);
        $this->assertSame('low', $out['price']['confidence']);
        $this->assertSame(['out_of_bounds'], $out['price']['flags']);
    }

    public function test_un_loyer_journalier_de_5_000_xof_est_dans_les_bornes(): void
    {
        $out = $this->normalizer->normalize(self::raw(['price' => self::field('5 000 la nuitée', '5 000 la nuitée')]), null);

        $this->assertSame('daily', $out['rent_period']['value']);
        $this->assertSame([], $out['price']['flags']);
        $this->assertSame('high', $out['price']['confidence']);
    }

    public function test_un_loyer_hebdomadaire_est_borne_au_prorata_du_mensuel(): void
    {
        $bas = $this->normalizer->normalize(self::raw(['price' => self::field('3 000/semaine', '3 000/semaine')]), null);
        $juste = $this->normalizer->normalize(self::raw(['price' => self::field('3 500/semaine', '3 500/semaine')]), null);

        $this->assertSame(['out_of_bounds'], $bas['price']['flags']);
        $this->assertSame([], $juste['price']['flags']);
    }

    public function test_une_vente_hors_bornes_et_des_quantites_hors_bornes_sont_signalees(): void
    {
        $out = $this->normalizer->normalize(self::raw([
            'contract' => self::field('sale', 'à vendre'),
            'price' => self::field('500 000', '500 000'),
            'bedrooms' => self::field(45, '45 chambres'),
            'surface_m2' => self::field(2, '2 m²'),
        ]), null);

        foreach (['price', 'bedrooms', 'surface_m2'] as $field) {
            $this->assertSame(['out_of_bounds'], $out[$field]['flags'], $field);
            $this->assertSame('low', $out[$field]['confidence'], $field);
        }
        $this->assertSame(45, $out['bedrooms']['value']);
    }

    public function test_une_vente_ne_deduit_jamais_de_periode_de_loyer(): void
    {
        $out = $this->normalizer->normalize(self::raw([
            'contract' => self::field('sale', 'à vendre'),
            'price' => self::field('1 500 000 F/mois', '1 500 000 F/mois'),
        ]), null);

        $this->assertSame('monthly', $out['price']['period']);
        $this->assertNull($out['rent_period']['value']);
    }

    public function test_une_periode_deduite_garde_le_drapeau_de_la_valeur_invalide_du_modele(): void
    {
        $out = $this->normalizer->normalize(self::raw(['rent_period' => self::field('month', 'par mois')]), null);

        $this->assertSame('monthly', $out['rent_period']['value']);
        $this->assertSame(['invalid_value'], $out['rent_period']['flags']);
        $this->assertSame('low', $out['rent_period']['confidence']);
    }

    public function test_un_prix_rendu_en_nombre_est_deja_en_xof(): void
    {
        $entier = $this->normalizer->normalize(self::raw(['price' => self::field(450000, '450 000')]), null);
        $flottant = $this->normalizer->normalize(self::raw(['price' => self::field(450000.4, '450 000')]), null);
        $petit = $this->normalizer->normalize(self::raw(['price' => self::field(1.5, '1.5')]), null);
        $negatif = $this->normalizer->normalize(self::raw(['price' => self::field(-5, '-5')]), null);

        $this->assertSame([450_000, '450000', []], [$entier['price']['value'], $entier['price']['raw'], $entier['price']['flags']]);
        $this->assertSame(450_000, $flottant['price']['value']);
        // 1.5 n'est pas « 1,5 million » : un nombre rendu est un montant en XOF, ici hors bornes.
        $this->assertSame([2, ['out_of_bounds']], [$petit['price']['value'], $petit['price']['flags']]);
        $this->assertSame([null, ['invalid_value']], [$negatif['price']['value'], $negatif['price']['flags']]);
    }

    public function test_un_prix_illisible_est_null_et_signale(): void
    {
        $out = $this->normalizer->normalize(self::raw(['price' => self::field('à débattre', 'Prix à débattre')]), null);

        $this->assertNull($out['price']['value']);
        $this->assertSame('à débattre', $out['price']['raw']);
        $this->assertSame(['unparsed_amount'], $out['price']['flags']);
        $this->assertSame('low', $out['price']['confidence']);
    }

    // ─── Valeurs d'enum, téléphones, annonceur ───────────────────────────────────────────

    public function test_une_valeur_d_enum_inconnue_devient_null_et_signalee(): void
    {
        $out = $this->normalizer->normalize(self::raw([
            'property_type' => self::field('castle', 'Château'),
            'contract' => self::field('lease', 'bail'),
            'bedrooms' => self::field('trois', '3 chambres'),
            'furnished' => self::field('oui', 'meublé'),
            'advertiser_nature' => self::field('owner', 'propriétaire'),
        ]), null);

        foreach (['property_type', 'contract', 'bedrooms', 'furnished'] as $field) {
            $this->assertNull($out[$field]['value'], $field);
            $this->assertSame(['invalid_value'], $out[$field]['flags'], $field);
            $this->assertSame('low', $out[$field]['confidence'], $field);
        }
        $this->assertSame('unknown', $out['advertiser_nature']['value']);
        $this->assertSame(['invalid_value'], $out['advertiser_nature']['flags']);
    }

    public function test_les_telephones_deviennent_e164_et_les_invalides_tombent(): void
    {
        $out = $this->normalizer->normalize(self::raw([
            'phones' => ['77 123 45 67', '+221 77 123 45 67', 'appelez-moi', '12345', 42],
            'advertiser_nature' => self::field(null, null),
            'nature_signals' => [['signal' => 'Parle de « mon appartement »', 'evidence' => 'mon appartement'], ['signal' => ''], 'bruit'],
        ]), null);

        $this->assertSame(['+221771234567'], $out['phones']);
        $this->assertSame('unknown', $out['advertiser_nature']['value']);
        $this->assertSame([], $out['advertiser_nature']['flags']);
        $this->assertSame([['signal' => 'Parle de « mon appartement »', 'evidence' => 'mon appartement']], $out['nature_signals']);
    }

    public function test_f1_avec_un_texte_source_un_numero_qu_il_ne_porte_pas_tombe_et_se_signale(): void
    {
        $out = $this->normalizer->normalize(self::raw([
            'phones' => ['+221771234567', '78 999 88 77'],
        ]), self::SOURCE);

        // « 77 123 45 67 » dans la source, « +221771234567 » rendu : le même numéro, gardé.
        $this->assertSame(['+221771234567'], $out['phones']);
        $this->assertSame(['evidence_not_in_source'], $out['phones_flags']);
        // Écarté de `phones`, jamais perdu : l'opérateur le voit à part (TCK-2387, décision 1).
        $this->assertSame(['+221789998877'], $out['phones_dropped']);
    }

    public function test_ac6_un_numero_absent_de_la_source_est_garde_a_part(): void
    {
        $out = $this->normalizer->normalize(self::raw([
            'phones' => ['78 999 88 77', '+221771234567', '78 999 88 77', '+221 78 111 22 33'],
        ]), self::SOURCE);

        $this->assertSame(['+221771234567'], $out['phones']);
        // Dans l'ordre du modèle, dédoublonnés, au format E.164.
        $this->assertSame(['+221789998877', '+221781112233'], $out['phones_dropped']);
        $this->assertSame(['evidence_not_in_source'], $out['phones_flags']);
    }

    public function test_ac6_des_captures_ne_gardent_aucun_numero_a_part(): void
    {
        $out = $this->normalizer->normalize(self::raw(['phones' => ['78 999 88 77']]), null);

        $this->assertSame(['+221789998877'], $out['phones']);
        $this->assertSame([], $out['phones_dropped']);
    }

    public function test_ac6_sans_numero_ecarte_la_liste_est_vide(): void
    {
        $out = $this->normalizer->normalize(self::raw(), self::SOURCE);

        $this->assertSame([], $out['phones_dropped']);
    }

    public function test_f1_un_numero_present_dans_la_source_ne_pose_aucun_drapeau(): void
    {
        $out = $this->normalizer->normalize(self::raw(), self::SOURCE);

        $this->assertSame(['+221771234567'], $out['phones']);
        $this->assertSame([], $out['phones_flags']);
    }

    public function test_f1_sans_texte_source_les_numeros_ne_sont_pas_confrontes(): void
    {
        $out = $this->normalizer->normalize(self::raw(['phones' => ['78 999 88 77']]), null);

        $this->assertSame(['+221789998877'], $out['phones']);
        $this->assertSame([], $out['phones_flags']);
    }

    // ─── AC5 — le quartier rapproché du référentiel par du code ──────────────────────────

    public function test_ac5_liberte_6_est_rattache_au_quartier_du_referentiel(): void
    {
        $liberte6 = $this->quartier('Dakar', 'Liberté 6');
        $this->quartier('Dakar', 'Liberté 5');

        $out = $this->normalizer->normalize(self::raw(), self::SOURCE);

        $this->assertSame('Liberté 6', $out['neighborhood']['value']);
        $this->assertSame($liberte6->id, $out['neighborhood']['neighborhood_id']);
        $this->assertSame([], $out['neighborhood']['suggestions']);
    }

    public function test_ac5_liberte_seul_rend_des_suggestions_pas_un_choix(): void
    {
        foreach (range(1, 6) as $n) {
            $this->quartier('Dakar', "Liberté {$n}");
        }

        $out = $this->normalizer->normalize(self::raw(['neighborhood' => self::field('Liberté', 'Liberté')]), self::SOURCE);

        $this->assertNull($out['neighborhood']['neighborhood_id']);
        $this->assertCount(5, $out['neighborhood']['suggestions']);
        $this->assertSame('Liberté 1', $out['neighborhood']['suggestions'][0]['name']);
    }

    public function test_ac5_le_meme_nom_dans_deux_villes_rend_des_suggestions(): void
    {
        $a = $this->quartier('Thiès', 'Grand Standing');
        $b = $this->quartier('Mbour', 'Grand Standing');

        $out = $this->normalizer->normalize(self::raw([
            'neighborhood' => self::field('Grand Standing', 'Grand Standing'),
            'city' => self::field(null, null),
        ]), null);

        $this->assertNull($out['neighborhood']['neighborhood_id']);
        $this->assertEqualsCanonicalizing([$a->id, $b->id], array_column($out['neighborhood']['suggestions'], 'id'));
    }

    public function test_ac5_un_quartier_fusionne_rend_sa_cible_et_un_refuse_rien(): void
    {
        $cible = $this->quartier('Dakar', 'Sicap Liberté');
        $this->quartier('Dakar', 'Sicap-Liberte')->update(['merged_into_id' => $cible->id]);
        $this->quartier('Dakar', 'Zone Refusée')->update(['status' => 'rejected']);

        $fusionne = $this->normalizer->normalize(self::raw(['neighborhood' => self::field('Sicap-Liberte', 'Sicap-Liberte')]), null);
        $refuse = $this->normalizer->normalize(self::raw(['neighborhood' => self::field('Zone Refusée', 'Zone Refusée')]), null);

        $this->assertSame($cible->id, $fusionne['neighborhood']['neighborhood_id']);
        $this->assertNull($refuse['neighborhood']['neighborhood_id']);
        $this->assertSame([], $refuse['neighborhood']['suggestions']);
    }
}
