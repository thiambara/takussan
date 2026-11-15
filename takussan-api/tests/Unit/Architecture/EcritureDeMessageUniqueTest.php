<?php

namespace Tests\Unit\Architecture;

use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

/**
 * TCK-2782 — un message s'écrit par `App\Services\Messaging\ConversationWriter`, qui le juge comme un envoi
 * (`ConversationAccess::allowsWriting`), et nulle part ailleurs : le message initial d'une directe reprise
 * s'écrivait à côté, jugé par les seules gardes de création, et toute règle ajoutée à `allowsWriting` y était
 * contournée.
 *
 * Deux exceptions, chacune pour sa raison :
 * - `PublicPropertyController` — le contact public d'une annonce, la porte du VISITEUR, jugée par son propre
 *   formulaire ; un bailleur suspendu y écrit à sa propre annonce comme tout visiteur (décision y q2 du 2026-11-13) ;
 * - `SystemMessageFactory` — un avis système n'a pas d'auteur.
 *
 * Balayé : `app/`. La garde lit les jetons PHP (`token_get_all`), sans commentaires ni espaces, et refuse :
 * `messages()->create(`, `->createQuietly(`, `->forceCreate(`, `->save(`, `->saveQuietly(`, `->createMany(`,
 * `->saveMany(` sur `messages()` ; `Message::create(`, `::forceCreate(`, `::createQuietly(`, `::insert(`,
 * `::insertOrIgnore(`, `::upsert(`, `::query()->create(` / `->insert(` ; `new Message(` ; `DB::table('messages')`
 * suivi d'une écriture.
 *
 * **Hors d'atteinte, c'est un plancher** : une relation rangée dans une variable (`$r = $c->messages(); $r->create(…)`),
 * un modèle sous un autre nom (`$m = Message::class; $m::create(…)`), un `DB::insert` en SQL brut. La relecture les
 * attrape, pas cette garde.
 *
 * La liste est FERMÉE dans les deux sens : un écrivain neuf rougit, et une exception qui n'écrit plus aussi — c'est
 * aussi ce qui garde la garde : un balayage qui ne verrait plus les trois écrivains rougirait.
 */
class EcritureDeMessageUniqueTest extends TestCase
{
    /** @var array<string, string> fichier (relatif à `app/`) => raison */
    private const PERMIS = [
        'Services/Messaging/ConversationWriter.php' => 'le point d’écriture : allowsWriting, puis le message',
        'Http/Controllers/Public/PublicPropertyController.php' => 'contact public d’une annonce : la porte du visiteur (décision y q2)',
        'Services/Messaging/SystemMessageFactory.php' => 'avis système : sans auteur',
    ];

    private const ECRITURES = 'create|createQuietly|forceCreate|forceCreateQuietly|save|saveQuietly|createMany|saveMany|createManyQuietly|insert|insertOrIgnore|insertGetId|upsert|firstOrCreate|updateOrCreate';

    private static function racine(): string
    {
        return dirname(__DIR__, 3).'/app';
    }

    /**
     * Le code sans commentaires, chaque blanc réduit à une espace, et chaque chaîne vidée — sauf `'messages'`, que
     * la forme `DB::table('messages')` doit voir : une chaîne qui CITE une écriture n'en est pas une.
     */
    public static function compacte(string $source): string
    {
        $sortie = '';
        foreach (token_get_all($source) as $jeton) {
            if (! is_array($jeton)) {
                $sortie .= $jeton;

                continue;
            }
            $sortie .= match (true) {
                in_array($jeton[0], [T_COMMENT, T_DOC_COMMENT], true) => ' ',
                $jeton[0] === T_WHITESPACE => ' ',
                $jeton[0] === T_CONSTANT_ENCAPSED_STRING => trim($jeton[1], '\'"') === 'messages' ? "'messages'" : "''",
                $jeton[0] === T_ENCAPSED_AND_WHITESPACE => '',
                default => $jeton[1],
            };
        }

        return (string) preg_replace('/\s+/', ' ', $sortie);
    }

    /** @return list<string> les formes d'écriture trouvées dans `$source` */
    public static function ecritures(string $source): array
    {
        $code = self::compacte($source);
        $e = self::ECRITURES;
        $chaine = '(?:\s?->\s?[A-Za-z_]+\s?\([^;]*?\))*?';
        $motifs = [
            'relation' => "/->\s?messages\s?\(\s?\){$chaine}\s?->\s?(?:{$e})\s?\(/",
            'modele' => "/(?<![A-Za-z0-9_\\\\])\\\\?(?:App\\\\Models\\\\)?Message\s?::\s?(?:(?:{$e})|query\s?\(\s?\){$chaine}\s?->\s?(?:{$e}))\s?\(/",
            'new' => '/\bnew\s\\\\?(?:App\\\\Models\\\\)?Message\s?\(/',
            'table' => "/::\s?table\s?\(\s?'messages'\s?\){$chaine}\s?->\s?(?:{$e})\s?\(/",
        ];

        $trouvees = [];
        foreach ($motifs as $nom => $motif) {
            if (preg_match($motif, $code) === 1) {
                $trouvees[] = $nom;
            }
        }

        return $trouvees;
    }

    /** @return array<string, list<string>> fichier (relatif à `app/`) => formes */
    private static function ecrivains(): array
    {
        $racine = self::racine();
        $trouves = [];
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($racine, RecursiveDirectoryIterator::SKIP_DOTS)) as $fichier) {
            if ($fichier->getExtension() !== 'php') {
                continue;
            }
            $formes = self::ecritures((string) file_get_contents($fichier->getPathname()));
            if ($formes !== []) {
                $trouves[substr($fichier->getPathname(), strlen($racine) + 1)] = $formes;
            }
        }
        ksort($trouves);

        return $trouves;
    }

    public function test_un_message_ne_s_ecrit_que_par_le_point_d_ecriture_et_les_deux_exceptions(): void
    {
        $ecrivains = self::ecrivains();

        $this->assertSame([], array_diff_key($ecrivains, self::PERMIS), 'un message écrit hors de ConversationWriter : passer par lui, ou ajouter le fichier à PERMIS avec sa raison');
        $this->assertSame([], array_keys(array_diff_key(self::PERMIS, $ecrivains)), 'une exception de PERMIS n’écrit plus de message : la retirer');
    }

    public function test_la_garde_voit_chaque_forme_et_ignore_les_commentaires(): void
    {
        $rouges = [
            '$conversation->messages()->create([]);',
            '$c->messages()->latest()->create([]);',
            '$c -> messages ( ) -> forceCreate ( [] ) ;',
            '$c->messages()->save($m);',
            'Message::create([]);',
            'return Message::create([]);',
            '\App\Models\Message::insert([]);',
            'Message::query()->create([]);',
            'Message::query()->where("a", 1)->upsert([], []);',
            '$m = new Message(["content" => "x"]);',
            'DB::table("messages")->insert([]);',
            "DB::table('messages')->where('id', 1)->insertOrIgnore([]);",
        ];
        foreach ($rouges as $ligne) {
            $this->assertNotSame([], self::ecritures("<?php {$ligne}"), "non vu : {$ligne}");
        }

        $verts = [
            '// $conversation->messages()->create([]);',
            '/** Message::create([]) */ $x = 1;',
            '$c->messages()->where("a", 1)->get();',
            'Message::query()->whereKey(1)->update(["read" => true]);',
            '$c->messages()->count();',
            'SystemMessage::create([]);',
            'new MessageResource($m);',
            'DB::table("conversations")->insert([]);',
            '$x = "Message::create(";',
            '$x = \'$c->messages()->create(\';',
            'return new MessageResource($m);',
        ];
        foreach ($verts as $ligne) {
            $this->assertSame([], self::ecritures("<?php {$ligne}"), "faux positif : {$ligne}");
        }
    }
}
