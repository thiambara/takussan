<?php

namespace Tests\Unit\Geo;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * TCK-633 (ADR-0062 §3) — le jeu de données du référentiel est extrait d'OpenStreetMap par
 * `database/data/geo/extract.mjs`, puis RELU par une personne avant la fusion.
 *
 * Ce test ne juge pas la justesse d'un nom — c'est la relecture. Il garde deux choses :
 *  1. la relecture a eu lieu, fichier par fichier, et elle porte sur CE contenu :
 *     `source.relu_par` (une personne : prénom et nom), `relu_le` (une date ISO), et
 *     `relu_empreinte` — le sha256 du contenu relu, NOM ET DATE DU RELECTEUR COMPRIS, que
 *     `database/data/geo/signer.mjs` écrit et que ce test RECALCULE. Une signature triviale
 *     (« x »), une adresse e-mail, un nom d'outil ou d'agent (« Claude Code »), une date à
 *     venir, ou un fichier modifié après la signature — un nom, une coordonnée, une ville
 *     retirée, le nom du relecteur — rougissent.
 *     `extract.mjs` remet les trois champs à `null` : une ré-extraction annule la relecture ;
 *  2. ce qu'une relecture à l'œil laisse passer : un slug en double, une coordonnée hors du pays,
 *     une espace en trop, une parenthèse collée (« Golf Sud(Cité Aliou SOW) », relevé le
 *     2026-10-12) ;
 *  3. ce qu'une extraction APPAUVRIE laisse passer, signée ou non : des planchers de villes et de
 *     quartiers (national, et la ville de Dakar).
 *
 * Test unitaire pur : il lit des fichiers, ni base ni conteneur.
 */
class GeoDatasetReviewedTest extends TestCase
{
    /** Les 14 régions du Sénégal, codes ISO 3166-2:SN. */
    private const REGIONS = ['dk', 'db', 'fk', 'ka', 'kl', 'ke', 'kd', 'lg', 'mt', 'sl', 'se', 'tc', 'th', 'zg'];

    /** Le cadre du pays — celui de `CADRE_SENEGAL` (front, tâche 16) et du contrôle de la tâche 2. */
    private const LAT_MIN = 12.2;

    private const LAT_MAX = 16.8;

    private const LNG_MIN = -17.6;

    private const LNG_MAX = -11.3;

    private const SLUG = '/^[a-z0-9]+(?:-[a-z0-9]+)*$/';

    /** Un mot d'un nom : deux lettres au moins, apostrophe et trait d'union seulement ENTRE deux lettres. */
    private const MOT = "(?=[^ ]*\\p{L}[^ ]*\\p{L})\\p{L}+(?:['’-]\\p{L}+)*";

    /**
     * Un prénom et un nom : deux mots au moins, séparés d'une espace, le premier et le dernier
     * commençant par une capitale. Même expression que `NOM_DE_PERSONNE` de `signer.mjs`. Le
     * modificateur `D` : sans lui, le `$` de PCRE admet un saut de ligne final.
     */
    private const NOM_DE_PERSONNE = '/^(?=\\p{Lu})'.self::MOT.'(?: '.self::MOT.')* (?=\\p{Lu})'.self::MOT.'$/uD';

    /**
     * Les mots qui désignent un outil ou un agent, refusés en MOT ENTIER (un mot = ce que séparent une
     * espace ou un trait d'union), sans égard à la casse, plus la suite « claude code ». Même liste que `MOTS_REFUSES` de `signer.mjs` — épinglé par
     * `test_les_mots_refuses_sont_ceux_du_script_de_signature`. On ne prouve pas l'humain : on
     * refuse les noms qu'un agent écrirait à sa place.
     */
    private const MOTS_REFUSES = ['agent', 'bot', 'ia', 'ai', 'assistant', 'codex', 'gpt', 'chatgpt', 'copilot', 'anthropic', 'openai', 'gemini'];

    private static function designeUnOutil(string $nom): bool
    {
        // Un mot = ce que séparent une espace OU un trait d'union ; « Claude » seul reste un prénom.
        $mots = preg_split('/[ -]+/u', mb_strtolower($nom)) ?: [];
        foreach ($mots as $i => $mot) {
            if (in_array($mot, self::MOTS_REFUSES, true) || ($mot === 'claude' && ($mots[$i + 1] ?? null) === 'code')) {
                return true;
            }
        }

        return false;
    }

    /**
     * Des PLANCHERS, pas des comptes : une extraction appauvrie (Overpass partiel, une région vidée
     * par erreur) ne se signe pas sans qu'on le voie. Calés sous les valeurs du 2026-10-12 (504
     * villes, 365 quartiers dont 151 pour la ville de Dakar) avec une marge, pour qu'une relecture
     * qui retire des doublons ne bute pas dessus. Aucun plancher de quartiers PAR RÉGION : Kédougou
     * et Sédhiou n'en ont aucun dans OpenStreetMap, et c'est légitime.
     */
    private const VILLES_MIN_PAR_REGION = 10;

    private const VILLES_MIN = 450;

    private const QUARTIERS_MIN = 300;

    private const QUARTIERS_MIN_VILLE_DE_DAKAR = 120;

    /**
     * Le seul champ HORS du contenu signé : l'empreinte elle-même. `relu_par` et `relu_le` sont
     * signés — remplacer le nom du relecteur après coup rend la signature caduque.
     */
    private const CHAMPS_HORS_EMPREINTE = ['relu_empreinte'];

    private static function dossier(): string
    {
        return dirname(__DIR__, 3).'/database/data/geo/regions';
    }

    /** @return array<string, mixed> */
    private static function lire(string $code): array
    {
        $chemin = self::dossier()."/sn-{$code}.json";
        self::assertFileExists($chemin);

        return json_decode((string) file_get_contents($chemin), true, 512, JSON_THROW_ON_ERROR);
    }

    /** @return array<string, array{string}> */
    public static function regions(): array
    {
        return array_combine(self::REGIONS, array_map(fn (string $c) => [$c], self::REGIONS));
    }

    public function test_le_jeu_compte_les_quatorze_regions_et_rien_d_autre(): void
    {
        $fichiers = array_map('basename', glob(self::dossier().'/*.json') ?: []);
        sort($fichiers);
        $attendus = array_map(fn (string $c) => "sn-{$c}.json", self::REGIONS);
        sort($attendus);

        $this->assertSame($attendus, $fichiers);
    }

    #[DataProvider('regions')]
    public function test_chaque_region_est_relue_par_une_personne_nommee_et_datee(string $code): void
    {
        $jeu = self::lire($code);

        $this->assertIsString($jeu['source']['relu_par'] ?? null, "sn-{$code}.json : relecture humaine absente (tâche 27)");
        $this->assertSame([], self::defautsDeSignature($jeu), "sn-{$code}.json : signature de relecture invalide");
    }

    /**
     * Le contenu relu, signataire et date compris : le fichier entier privé de `relu_empreinte`,
     * sérialisé comme `JSON.stringify` le fait dans `signer.mjs` (aucune indentation, ni Unicode ni `/`
     * échappés, flottants au plus court).
     *
     * @param  array<string, mixed>  $jeu
     */
    public static function empreinte(array $jeu): string
    {
        foreach (self::CHAMPS_HORS_EMPREINTE as $champ) {
            unset($jeu['source'][$champ]);
        }
        $precision = ini_get('serialize_precision');
        ini_set('serialize_precision', '-1');
        try {
            $canonique = json_encode($jeu, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        } finally {
            ini_set('serialize_precision', (string) $precision);
        }

        return hash('sha256', $canonique);
    }

    /**
     * @param  array<string, mixed>  $jeu
     * @return list<string>
     */
    private static function defautsDeSignature(array $jeu): array
    {
        $source = $jeu['source'];
        $par = $source['relu_par'] ?? null;
        $le = $source['relu_le'] ?? null;
        $empreinte = $source['relu_empreinte'] ?? null;
        $defauts = [];

        if (! is_string($par) || preg_match(self::NOM_DE_PERSONNE, $par) !== 1 || self::designeUnOutil($par)) {
            $defauts[] = 'relu_par n\'est pas le prénom et le nom d\'une personne : '.json_encode($par, JSON_UNESCAPED_UNICODE);
        }
        if (! is_string($le) || preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $le, $m) !== 1 || ! checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
            $defauts[] = 'relu_le n\'est pas une date AAAA-MM-JJ : '.json_encode($le);
        } else {
            if ($le < (string) $source['extraite_le']) {
                $defauts[] = "relu le {$le}, AVANT l'extraction qu'il porte ({$source['extraite_le']})";
            }
            if ($le > date('Y-m-d')) {
                $defauts[] = "relu le {$le}, une date à venir";
            }
        }
        if (! is_string($empreinte) || preg_match('/^[0-9a-f]{64}$/', $empreinte) !== 1) {
            $defauts[] = 'relu_empreinte absente : la signature ne désigne aucun contenu (signer.mjs)';
        } elseif (! hash_equals(self::empreinte($jeu), $empreinte)) {
            $defauts[] = 'le contenu a changé depuis la relecture : relu_empreinte ne correspond plus';
        }

        return $defauts;
    }

    /** Un petit jeu signé, au format des fichiers de région — ni base ni fichier. */
    private const JEU_D_ESSAI = <<<'JSON'
        {"region":{"code":"SN-ZZ","slug":"essai","name":"Région d’essai","latitude":14.7,"longitude":-17.4467},"source":{"osm_base":"2026-10-12T01:32:19Z","extraite_le":"2026-10-12","licence":"ODbL 1.0 — © les contributeurs d’OpenStreetMap","relu_par":"Awa Ndiaye","relu_le":"2026-10-12","relu_empreinte":"90ef574db8aa4fab31b9dd74eff933761cb6749a0b78c8badd030f34f2ae2c92"},"cities":[{"slug":"ville","name":"Ville/Est","latitude":14.8342125,"longitude":-17.1881483,"neighborhoods":[{"slug":"golf-sud","name":"Golf Sud (Cité Aliou Sow)","latitude":14,"longitude":-17.5,"osm":"n123"}]}]}
        JSON;

    /** @return array<string, mixed> */
    private static function jeuDEssai(): array
    {
        return json_decode(self::JEU_D_ESSAI, true, 512, JSON_THROW_ON_ERROR);
    }

    /**
     * L'empreinte recalculée sur le jeu tel qu'il est — ce que ferait `signer.mjs` — pour éprouver
     * un contrôle AUTRE que l'empreinte.
     *
     * @param  array<string, mixed>  $jeu
     * @return array<string, mixed>
     */
    private static function resigner(array $jeu): array
    {
        $jeu['source']['relu_empreinte'] = self::empreinte($jeu);

        return $jeu;
    }

    /**
     * L'empreinte de `JEU_D_ESSAI` est celle que calcule `empreinte()` de `signer.mjs` (relevée par
     * `node --input-type=module -e "import { empreinte } from './database/data/geo/signer.mjs'; …"`) :
     * le script qui signe et le test qui vérifie sérialisent le même contenu de la même façon.
     */
    public function test_l_empreinte_est_celle_du_script_de_signature(): void
    {
        $this->assertSame([], self::defautsDeSignature(self::jeuDEssai()));
    }

    public function test_un_fichier_modifie_apres_la_signature_n_est_plus_relu(): void
    {
        $renomme = self::jeuDEssai();
        $renomme['cities'][0]['neighborhoods'][0]['name'] = 'Golf Nord';
        $deplace = self::jeuDEssai();
        $deplace['cities'][0]['latitude'] = 14.9;
        $vide = self::jeuDEssai();
        $vide['cities'][0]['neighborhoods'] = [];

        foreach ([$renomme, $deplace, $vide] as $jeu) {
            $this->assertContains('le contenu a changé depuis la relecture : relu_empreinte ne correspond plus', self::defautsDeSignature($jeu));
        }
    }

    /** @return iterable<string, array{mixed}> */
    public static function signatairesInvalides(): iterable
    {
        yield 'une lettre' => ['x'];
        yield 'un seul mot' => ['Amine'];
        yield 'une adresse e-mail' => ['relecteur@takussan.com'];
        yield 'une formule' => ['fixture de test'];
        yield 'des initiales' => ['A B'];
        yield 'des initiales à trait d\'union' => ['A- B-'];
        yield 'des initiales à apostrophe' => ["A' B'"];
        yield 'une espace double' => ['Jean  Dupont'];
        yield 'un saut de ligne final' => ["Jean Dupont\n"];
        yield 'vide' => [''];
        yield 'absent' => [null];
        // TCK-633 (reverif-2 du lot D) — un nom qui désigne un outil ou un agent, en MOT ENTIER,
        // quelle que soit la casse : ce sont les noms qu'un agent écrirait à la place d'une personne.
        yield 'un outil : Claude Code' => ['Claude Code'];
        yield 'un agent : Agent Ia' => ['Agent Ia'];
        yield 'casse haute : CLAUDE CODE Dupont' => ['CLAUDE CODE Dupont'];
        yield 'collé par un trait d\'union : Claude-Code Anthropic' => ['Claude-Code Anthropic'];
        yield 'un éditeur : Awa Anthropic' => ['Awa Anthropic'];
        yield 'en dernier mot : Awa Bot' => ['Awa Bot'];
        yield 'au milieu : Jean Ai Dupont' => ['Jean Ai Dupont'];
        yield 'assistant' => ['Assistant Ndiaye'];
        yield 'codex' => ['Codex Diop'];
        yield 'gpt' => ['Gpt Fall'];
        yield 'copilot' => ['Moussa Copilot'];
        yield 'ia en capitales' => ['Relecteur IA'];
    }

    /**
     * Le refus porte sur des MOTS ENTIERS — séparés par une espace ou un trait d'union — : un nom qui
     * CONTIENT l'une de ces suites de lettres reste un nom (« Aïda », « Gaïa », « Botha », « Iain »),
     * et « Claude » est un prénom (« Claude Diop », « Jean-Claude Diop ») : seule la suite
     * « claude code » est refusée.
     *
     * @return iterable<string, array{string}>
     */
    public static function signatairesValides(): iterable
    {
        yield 'prénom et nom' => ['Awa Ndiaye'];
        yield 'ai dans un mot' => ['Aida Gaye'];
        yield 'ia dans un mot' => ['Gaia Diallo'];
        yield 'bot dans un mot' => ['Abdou Botha'];
        yield 'agent dans un mot' => ['Agentina Sarr'];
        yield 'prénom composé' => ['Jean-Claude Diop'];
        yield 'Claude est un prénom' => ['Claude Diop'];
        yield 'apostrophe' => ["Fatou N'Diaye"];
    }

    #[DataProvider('signatairesValides')]
    public function test_un_nom_de_personne_est_une_signature(string $par): void
    {
        $jeu = self::jeuDEssai();
        $jeu['source']['relu_par'] = $par;

        $this->assertSame([], self::defautsDeSignature(self::resigner($jeu)));
    }

    /**
     * La liste des mots refusés est LA MÊME des deux côtés : `signer.mjs` refuse de signer, ce test
     * refuse un fichier signé autrement (à la main, par un script modifié). Lue dans le script.
     */
    public function test_les_mots_refuses_sont_ceux_du_script_de_signature(): void
    {
        $script = (string) file_get_contents(dirname(__DIR__, 3).'/database/data/geo/signer.mjs');
        $this->assertSame(1, preg_match('/export const MOTS_REFUSES = (\[[^\]]*\]);/', $script, $m), 'signer.mjs : MOTS_REFUSES introuvable');

        $this->assertSame(self::MOTS_REFUSES, json_decode(str_replace("'", '"', $m[1]), true, 512, JSON_THROW_ON_ERROR));
    }

    /**
     * Re-signé sur le nom fautif (`resigner`) : le nom étant DANS l'empreinte, un nom changé sans
     * re-signer rougirait déjà par l'empreinte — c'est le contrôle du NOM qu'on éprouve ici.
     */
    #[DataProvider('signatairesInvalides')]
    public function test_une_signature_triviale_n_est_pas_une_relecture(mixed $par): void
    {
        $jeu = self::jeuDEssai();
        $jeu['source']['relu_par'] = $par;

        $defauts = self::defautsDeSignature(self::resigner($jeu));
        $this->assertCount(1, $defauts);
        $this->assertStringStartsWith('relu_par n\'est pas le prénom et le nom d\'une personne', $defauts[0]);
    }

    /** Le nom du relecteur et la date sont SIGNÉS : les remplacer après coup rend la signature caduque. */
    public function test_le_signataire_et_la_date_sont_dans_l_empreinte(): void
    {
        // Re-signé d'abord par `empreinte()` elle-même : le cas ne dépend pas de l'empreinte épinglée.
        $jeu = self::jeuDEssai();
        $jeu['source']['extraite_le'] = '2026-10-11';
        $jeu['source']['relu_le'] = '2026-10-11';
        $signe = self::resigner($jeu);
        $this->assertSame([], self::defautsDeSignature($signe));
        $autreNom = $signe;
        $autreNom['source']['relu_par'] = 'Claude Opus';
        $autreDate = $signe;
        $autreDate['source']['relu_le'] = '2026-10-12';

        foreach ([$autreNom, $autreDate] as $jeu) {
            $this->assertContains('le contenu a changé depuis la relecture : relu_empreinte ne correspond plus', self::defautsDeSignature($jeu));
        }
    }

    /**
     * Une date de relecture À VENIR est refusée — même quand l'empreinte a été recalculée sur elle
     * (`resigner`) : c'est le contrôle de la date qui doit parler, pas celui de l'empreinte.
     */
    public function test_une_relecture_datee_dans_le_futur_est_refusee(): void
    {
        $demain = self::jeuDEssai();
        $demain['source']['relu_le'] = date('Y-m-d', strtotime('+1 day'));

        $this->assertSame(["relu le {$demain['source']['relu_le']}, une date à venir"], self::defautsDeSignature(self::resigner($demain)));
        $this->assertSame([], self::defautsDeSignature(self::resigner(self::jeuDEssai())));
    }

    public function test_une_signature_sans_empreinte_ou_mal_datee_n_est_pas_une_relecture(): void
    {
        $sansEmpreinte = self::jeuDEssai();
        unset($sansEmpreinte['source']['relu_empreinte']);
        $avant = self::jeuDEssai();
        $avant['source']['relu_le'] = '2026-10-11';
        $impossible = self::jeuDEssai();
        $impossible['source']['relu_le'] = '2026-02-30';

        $this->assertSame(['relu_empreinte absente : la signature ne désigne aucun contenu (signer.mjs)'], self::defautsDeSignature($sansEmpreinte));
        $this->assertSame(["relu le 2026-10-11, AVANT l'extraction qu'il porte (2026-10-12)"], self::defautsDeSignature(self::resigner($avant)));
        $this->assertSame(['relu_le n\'est pas une date AAAA-MM-JJ : "2026-02-30"'], self::defautsDeSignature(self::resigner($impossible)));
    }

    /**
     * Les planchers du jeu entier, indépendants de la signature : un jeu appauvri puis re-signé
     * reste rouge. Ils lisent les fichiers et ne s'éprouvent que sur une COPIE (aucune donnée de
     * test ici : un plancher se règle sur le vrai jeu).
     */
    public function test_le_jeu_garde_ses_planchers_de_villes_et_de_quartiers(): void
    {
        $villes = 0;
        $quartiers = 0;
        $villeDeDakar = null;
        foreach (self::REGIONS as $code) {
            $jeu = self::lire($code);
            $villes += count($jeu['cities']);
            foreach ($jeu['cities'] as $ville) {
                $quartiers += count($ville['neighborhoods']);
                if ($code === 'dk' && $ville['slug'] === 'dakar') {
                    $villeDeDakar = count($ville['neighborhoods']);
                }
            }
        }

        $this->assertGreaterThanOrEqual(self::VILLES_MIN, $villes, "{$villes} villes au total — extraction appauvrie ?");
        $this->assertGreaterThanOrEqual(self::QUARTIERS_MIN, $quartiers, "{$quartiers} quartiers au total — extraction appauvrie ?");
        $this->assertNotNull($villeDeDakar, 'sn-dk.json : la ville de Dakar (slug « dakar ») a disparu');
        $this->assertGreaterThanOrEqual(self::QUARTIERS_MIN_VILLE_DE_DAKAR, $villeDeDakar, "ville de Dakar : {$villeDeDakar} quartiers — vidée ?");
    }

    #[DataProvider('regions')]
    public function test_chaque_region_tient_le_format(string $code): void
    {
        $jeu = self::lire($code);

        $this->assertSame('SN-'.strtoupper($code), $jeu['region']['code']);
        $this->assertStringContainsString('OpenStreetMap', $jeu['source']['licence']);
        $this->assertGreaterThanOrEqual(self::VILLES_MIN_PAR_REGION, count($jeu['cities']), "sn-{$code}.json : moins de ".self::VILLES_MIN_PAR_REGION.' villes — région vidée ?');

        $defauts = [];
        $this->lieu($jeu['region'], "sn-{$code}", $defauts);
        $villes = [];
        foreach ($jeu['cities'] as $ville) {
            $chemin = "sn-{$code}/{$ville['slug']}";
            $this->lieu($ville, $chemin, $defauts);
            if (isset($villes[$ville['slug']])) {
                $defauts[] = "{$chemin} : ville en double";
            }
            $villes[$ville['slug']] = true;

            $quartiers = [];
            foreach ($ville['neighborhoods'] as $quartier) {
                $this->lieu($quartier, "{$chemin}/{$quartier['slug']}", $defauts);
                if (isset($quartiers[$quartier['slug']])) {
                    $defauts[] = "{$chemin}/{$quartier['slug']} : quartier en double";
                }
                $quartiers[$quartier['slug']] = true;
                if ($quartier['osm'] !== null && preg_match('/^[nwr]\d+$/', (string) $quartier['osm']) !== 1) {
                    $defauts[] = "{$chemin}/{$quartier['slug']} : référence OSM illisible « {$quartier['osm']} »";
                }
            }
        }

        $this->assertSame([], $defauts);
    }

    /**
     * @param  array<string, mixed>  $lieu
     * @param  list<string>  $defauts
     */
    private function lieu(array $lieu, string $chemin, array &$defauts): void
    {
        $nom = (string) $lieu['name'];
        if (preg_match(self::SLUG, (string) $lieu['slug']) !== 1) {
            $defauts[] = "{$chemin} : slug illisible";
        }
        if ($nom === '' || $nom !== trim($nom) || str_contains($nom, '  ')) {
            $defauts[] = "{$chemin} : espaces en trop dans « {$nom} »";
        }
        if (preg_match('/\S\(|\(\s|\s\)/u', $nom) === 1) {
            $defauts[] = "{$chemin} : parenthèse mal espacée dans « {$nom} »";
        }
        $lat = $lieu['latitude'];
        $lng = $lieu['longitude'];
        if (! is_float($lat) && ! is_int($lat) || ! is_float($lng) && ! is_int($lng)
            || $lat < self::LAT_MIN || $lat > self::LAT_MAX || $lng < self::LNG_MIN || $lng > self::LNG_MAX) {
            $defauts[] = "{$chemin} : coordonnées hors du Sénégal";
        }
    }
}
