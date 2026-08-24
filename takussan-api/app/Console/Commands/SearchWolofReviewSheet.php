<?php

namespace App\Console\Commands;

use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyType;
use App\Models\Property;
use Illuminate\Console\Command;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Lang;
use Throwable;

/**
 * TCK-339 — imprime la FEUILLE DE VALIDATION du vocabulaire wolof de recherche.
 *
 * La commande n'écrit rien et ne décide rien : elle rassemble, sur une page, tout
 * ce qui est MESURABLE sans être wolophone, pour qu'une séance avec un locuteur
 * dure quelques minutes au lieu d'un aller-retour par mot.
 *
 * ── POURQUOI UNE COMMANDE, ET PAS UNE LISTE DANS UN TICKET ────────────────────
 *
 * Une liste écrite à la main est juste le jour où on l'écrit. Trois des cinq
 * colonnes ci-dessous bougent sans prévenir : les libellés wolof du back et du
 * front vivent dans deux fichiers que personne ne compare, et la colonne
 * « hits » dépend du CATALOGUE, qui change à chaque import.
 *
 * ── LA COLONNE QUI JUSTIFIE L'OUTIL ──────────────────────────────────────────
 *
 * « hits » compte les biens que le mot atteint DÉJÀ dans l'index, aujourd'hui,
 * par une vraie requête. Elle attrape le risque qu'aucune revue lexicale ne peut
 * voir, parce qu'il n'est pas lexical mais de CORPUS : mesuré le 2026-08-21 sur
 * `takussan_localproperties` (795 documents), `keur` rend **40** résultats — le
 * quartier « Cité Keur Gorgui » existe. Un locuteur qui valide « keur » pour
 * `house` valide un mot déjà pris : la requête rendra des biens avant comme
 * après le déploiement, et pas les mêmes. Aucune liste de mots ne le montre.
 *
 * ── CE QUE LA COMMANDE NE FAIT PAS ───────────────────────────────────────────
 *
 * Elle ne propose AUCUN mot wolof. Tout ce qu'elle affiche en wolof est extrait
 * de fichiers du dépôt et cité tel quel, avec sa provenance. La dernière colonne
 * est vide : c'est celle du locuteur.
 */
class SearchWolofReviewSheet extends Command
{
    protected $signature = 'search:wolof-review-sheet '
        .'{--probe=* : Mot supplémentaire à sonder dans l\'index (répétable) — sert à tester une proposition du locuteur en séance} '
        .'{--no-hits : N\'interroge pas Meilisearch (feuille hors ligne, colonne « hits » vide)}';

    protected $description = 'Feuille de validation du vocabulaire wolof de recherche (TCK-339) : alias FR en vigueur, libellés wolof back et front, et hits déjà présents dans l\'index';

    /** Chemin du fichier de messages du front, relatif à la racine de l'API. */
    private const MESSAGES_FRONT = '/../takussan-web/src/messages/wo.json';

    public function handle(): int
    {
        $front = $this->libellesFront();
        $sondeHorsLigne = (bool) $this->option('no-hits');

        $lignes = [];
        $mots = [];

        foreach (PropertyType::cases() as $case) {
            $lignes[] = $this->ligne(
                domaine: 'type',
                cle: $case->value,
                aliasFr: Property::TYPE_SEARCH_ALIASES[$case->value] ?? '',
                back: $this->libelleBack('properties.type.'.$case->value),
                front: Arr::get($front, 'property.types.'.$case->value),
                mots: $mots,
            );
        }

        foreach (ContractType::cases() as $case) {
            $lignes[] = $this->ligne(
                domaine: 'contract',
                cle: $case->value,
                aliasFr: Property::CONTRACT_SEARCH_ALIASES[$case->value] ?? '',
                back: $this->libelleBack('properties.contract_type.'.$case->value),
                front: Arr::get($front, 'property.contractTypes.'.$case->value),
                mots: $mots,
            );
        }

        foreach ((array) $this->option('probe') as $mot) {
            $mot = trim((string) $mot);
            if ($mot !== '') {
                $mots[$mot] = array_unique(array_merge($mots[$mot] ?? [], ['--probe']));
            }
        }

        $hits = $sondeHorsLigne ? [] : $this->hits(array_keys($mots));

        $this->enTete($front, $sondeHorsLigne, $hits);
        $this->feuille($lignes, $hits, $sondeHorsLigne);
        $this->sonde($mots, $hits, $sondeHorsLigne);
        $this->consignes();

        return self::SUCCESS;
    }

    /**
     * @param  array<string,array<int,string>>  $mots
     * @return array<string,string>
     */
    private function ligne(string $domaine, string $cle, string $aliasFr, ?string $back, ?string $front, array &$mots): array
    {
        foreach ([[$back, 'lang/wo'], [$front, 'wo.json']] as [$mot, $source]) {
            if (is_string($mot) && trim($mot) !== '') {
                $mots[trim($mot)] = array_unique(array_merge($mots[trim($mot)] ?? [], [$source]));
            }
        }

        return [
            'domaine' => $domaine,
            'cle' => $cle,
            'alias_fr' => $aliasFr,
            'back' => $back ?? '—',
            'front' => $front ?? '—',
        ];
    }

    private function libelleBack(string $cle): ?string
    {
        $valeur = Lang::get($cle, [], 'wo');

        // Lang::get rend la CLÉ quand la traduction manque — le confondre avec un
        // libellé ferait passer une absence pour une valeur.
        return is_string($valeur) && $valeur !== $cle ? $valeur : null;
    }

    /** @return array<string,mixed> */
    private function libellesFront(): array
    {
        $chemin = base_path().self::MESSAGES_FRONT;

        if (! is_file($chemin)) {
            return [];
        }

        $decode = json_decode((string) file_get_contents($chemin), true);

        return is_array($decode) ? $decode : [];
    }

    /**
     * Interroge l'index applicatif, un mot à la fois, et rend le nombre de
     * documents atteints AINSI QUE leur répartition par type de bien.
     *
     * La répartition n'est pas décorative, c'est la moitié utile de la mesure :
     * un compte seul dit « ce mot rend 56 biens », la facette dit « ce mot rend
     * 56 BOUTIQUES ». Mesuré le 2026-08-21 : « Magasin », le libellé que le
     * front donne à `warehouse`, rend 56 documents dont **56 `shop` et 0
     * `warehouse`** — parce que « magasin » est déjà un jeton de l'alias
     * français de `shop`. Adopté comme alias de recherche, il enverrait tout
     * chercheur d'entrepôt sur des boutiques, et le compte non nul aurait eu
     * l'air d'un succès.
     *
     * `limit => 0` : on ne veut que les compteurs. Une valeur `null` signale une
     * MESURE ABSENTE (moteur injoignable, driver `collection` en test) — jamais
     * zéro, qui se lirait « aucune collision » et vaudrait un feu vert.
     *
     * @param  array<int,string>  $mots
     * @return array<string,array{n:int|null,types:string}>
     */
    private function hits(array $mots): array
    {
        $hits = [];

        foreach ($mots as $mot) {
            try {
                /** @var array<string,mixed> $brut */
                $brut = Property::search(
                    $mot,
                    fn ($index, string $q) => $index->search($q, ['limit' => 0, 'facets' => ['type']]),
                )->raw();

                $hits[$mot] = [
                    'n' => isset($brut['estimatedTotalHits']) ? (int) $brut['estimatedTotalHits'] : null,
                    'types' => $this->facettes($brut['facetDistribution']['type'] ?? []),
                ];
            } catch (Throwable $e) {
                $hits[$mot] = ['n' => null, 'types' => ''];
                $this->warn("  ⚠ index injoignable pour « {$mot} » : ".$e->getMessage());
            }
        }

        return $hits;
    }

    /** @param  array<string,int>  $distribution */
    private function facettes(array $distribution): string
    {
        arsort($distribution);

        $rendu = [];
        foreach ($distribution as $type => $n) {
            $rendu[] = "{$type}:{$n}";
        }

        return implode(' ', array_slice($rendu, 0, 4));
    }

    /**
     * @param  array<string,mixed>  $front
     * @param  array<string,array{n:int|null,types:string}>  $hits
     */
    private function enTete(array $front, bool $horsLigne, array $hits): void
    {
        $this->newLine();
        $this->line('<options=bold>FEUILLE DE VALIDATION — VOCABULAIRE WOLOF DE RECHERCHE (TCK-339)</>');
        $this->line(str_repeat('=', 78));
        $this->newLine();
        $this->line('  Index applicatif ....... '.(new Property)->searchableAs());
        $this->line('  Moteur ................. '.config('scout.driver'));
        $this->line('  Messages du front ...... '.($front === [] ? 'ABSENTS ('.base_path().self::MESSAGES_FRONT.')' : 'lus'));
        $this->line('  Colonne « hits » ....... '.($horsLigne ? 'DÉSACTIVÉE (--no-hits)' : count($hits).' mot(s) sondé(s)'));
        $this->newLine();
        $this->line('  <options=bold>Deux faits du moteur qui gouvernent le choix des mots</> (mesurés le 2026-08-21) :');
        $this->line('    • Les DIACRITIQUES sont normalisés à l\'indexation comme à la requête.');
        $this->line('      « mëublé » et « meuble » rendent le même ensemble : écrire l\'alias avec');
        $this->line('      ou sans ë / é ne change rien, ni en bien ni en mal.');
        $this->line('    • La TOLÉRANCE AUX FAUTES démarre à 5 caractères (oneTypo=5). Sous 5');
        $this->line('      lettres, elle est NULLE : « ker » ne rend pas « Keur » (0 contre 40).');
        $this->line('      Un alias de 3 ou 4 lettres n\'a droit à aucune approximation de saisie.');
        $this->line('    • Le DERNIER mot de la requête est cherché comme un PRÉFIXE : « appar »');
        $this->line('      rend les 210 appartements. Un alias wolof court peut donc être happé');
        $this->line('      par un mot français plus long qui le commence, sans que personne ne');
        $this->line('      l\'ait voulu — c\'est la colonne « types atteints » qui le révèle.');
        $this->newLine();
    }

    /**
     * @param  array<int,array<string,string>>  $lignes
     * @param  array<string,array{n:int|null,types:string}>  $hits
     */
    private function feuille(array $lignes, array $hits, bool $horsLigne): void
    {
        $rendu = [];

        foreach ($lignes as $l) {
            $ecart = $this->ecart($l['back'], $l['front']);

            $rendu[] = [
                $l['domaine'],
                $l['cle'],
                $l['alias_fr'],
                $l['back'],
                $l['front'],
                $ecart,
                $this->hitsLibelle($l['back'], $l['front'], $hits, $horsLigne),
                '', // ← la colonne du locuteur
            ];
        }

        $this->table(
            ['domaine', 'valeur', 'alias FR indexé', 'wolof back', 'wolof front', '≠', 'hits back/front', 'ALIAS WO À VALIDER'],
            $rendu,
        );
    }

    /**
     * Marque un ÉCART entre les deux libellés wolof du dépôt. Purement mécanique :
     * la commande compare deux chaînes, elle ne juge pas laquelle est juste — cela
     * demande un locuteur, et c'est l'objet de la séance.
     */
    private function ecart(string $back, string $front): string
    {
        if ($back === '—' || $front === '—') {
            return '?';
        }

        return mb_strtolower($back) === mb_strtolower($front) ? '' : '≠';
    }

    /** @param  array<string,array{n:int|null,types:string}>  $hits */
    private function hitsLibelle(string $back, string $front, array $hits, bool $horsLigne): string
    {
        if ($horsLigne) {
            return '—';
        }

        $rendu = [];

        foreach ([$back, $front] as $mot) {
            if ($mot === '—') {
                $rendu[] = '·';

                continue;
            }
            $n = $hits[trim($mot)]['n'] ?? null;
            $rendu[] = $n === null ? '?' : ($n > 0 ? $n.' ⚠' : '0');
        }

        return implode(' / ', $rendu);
    }

    /**
     * @param  array<string,array<int,string>>  $mots
     * @param  array<string,array{n:int|null,types:string}>  $hits
     */
    private function sonde(array $mots, array $hits, bool $horsLigne): void
    {
        if ($horsLigne) {
            $this->comment('  Sonde de corpus désactivée (--no-hits).');
            $this->newLine();

            return;
        }

        $rendu = [];
        foreach ($mots as $mot => $sources) {
            $rendu[] = [$mot, implode(', ', $sources), $hits[$mot]['n'] ?? '?', $hits[$mot]['types'] ?? ''];
        }

        usort($rendu, fn (array $a, array $b) => ((int) $b[2]) <=> ((int) $a[2]));

        $this->line('  <options=bold>SONDE DE CORPUS</> — ce que chaque mot atteint DÉJÀ, avant toute décision.');
        $this->line('  Un compte non nul n\'interdit pas le mot ; c\'est la colonne « types atteints »');
        $this->line('  qui tranche. Deux cas mesurés le 2026-08-21, et ils appellent des réponses');
        $this->line('  opposées :');
        $this->line('    • « Magasin » (libellé front de warehouse) rend 56 biens — <options=bold>shop:56,');
        $this->line('      warehouse:0</>. Le mot est DÉJÀ pris par l\'alias français de « boutique » :');
        $this->line('      l\'adopter enverrait tout chercheur d\'entrepôt sur des boutiques.');
        $this->line('    • « keur » rend 40 biens de tous types, parce que « Cité Keur Gorgui » est');
        $this->line('      un quartier. La collision est alors avec une ADRESSE, pas avec un type.');
        $this->table(['mot', 'source', 'hits', 'types atteints'], $rendu);
    }

    private function consignes(): void
    {
        $this->line('  <options=bold>LES TROIS QUESTIONS À POSER, DANS CET ORDRE</>');
        $this->newLine();
        $this->line('    1. Ce mot désigne-t-il bien CE TYPE DE BIEN — pas un objet voisin ?');
        $this->line('       (la colonne « wolof back » vient de lang/wo/properties.php, qui sert');
        $this->line('        l\'AFFICHAGE : rien ne garantit qu\'elle serve la RECHERCHE.)');
        $this->line('    2. Est-ce le mot qu\'on TAPERAIT pour chercher, ou celui qu\'on lit ?');
        $this->line('       Un alias de recherche est un mot d\'intention, pas une étiquette.');
        $this->line('    3. Y a-t-il un SECOND mot d\'usage courant ? Plusieurs jetons par ligne');
        $this->line('       sont permis, séparés par une espace — c\'est du rappel gagné.');
        $this->newLine();
        $this->line('  Les réponses se reportent dans <options=bold>Property::TYPE_SEARCH_ALIASES_WO</> et');
        $this->line('  <options=bold>Property::CONTRACT_SEARCH_ALIASES_WO</>, jamais dans lang/ : `scripts/deploy.sh`');
        $this->line('  réimporte l\'index sur un diff de app/Models/*.php ou de config/scout.php,');
        $this->line('  JAMAIS sur un diff de lang/ — un alias posé dans lang/ n\'atteindrait pas');
        $this->line('  l\'index, et rien ne rougirait.');
        $this->newLine();
        $this->line('  Vérifier une proposition en séance :');
        $this->line('    php artisan search:wolof-review-sheet --probe=<mot> --probe=<autre>');
        $this->newLine();
    }
}
