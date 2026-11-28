<?php

namespace Tests\Support;

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Contracts\Foundation\Application;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Storage;
use PDO;
use Tests\TestCase;
use Throwable;

/**
 * TCK-3013 (ADR-0140) — un jeu semé UNE fois par classe, lu par chacun de ses tests.
 *
 * Mesuré le 2026-11-28 : les tests du seeder faisaient 19 % du temps cumulé de la suite du back, et la
 * plupart ne faisaient que LIRE un jeu qu'ils semaient chacun à nouveau (`SeedingJourneyTest` trois
 * fois). Ce trait sème une fois, puis chaque test lit le même jeu.
 *
 * ## Une base à part, et pourquoi pas la base du processus
 *
 * Le semis est VALIDÉ (il ne peut pas vivre dans la transaction d'un test, qui est annulée à la fin de
 * celui-ci). Validé dans la base du processus ({@see TestDatabase}), il se verrait de la classe suivante
 * du même processus — en `--parallel` comme en séquentiel — jusqu'à ce que quelqu'un pense à l'effacer.
 * Il vit donc dans une base DÉDIÉE, `takussan_test_<jeton>_jeu_<classe>`, vers laquelle seule la classe
 * qui emploie ce trait pointe sa connexion. La base du processus n'est jamais touchée : l'isolation
 * entre classes tient par construction, pas par un nettoyage qu'on pourrait oublier.
 *
 * Elle porte le préfixe et l'horodatage de {@see TestDatabase} : une exécution tuée la laisse au
 * balayage des orphelines, comme les autres.
 *
 * ## L'isolation entre les tests de la classe
 *
 * Chaque test tourne dans une transaction annulée ({@see DatabaseTransactions}), sur la base du jeu.
 * Pas `RefreshDatabase` : premier de son processus, il lancerait `migrate:fresh` sur la connexion par
 * défaut — c'est-à-dire sur le jeu qu'il vient de semer.
 *
 * ## Ce qui n'est pas en base
 *
 *   · les fichiers : `Tests\TestCase::setUp()` refait à chaque test les deux disques de médias
 *     factices, et les VIDE (`Storage::fake()` nettoie sa racine). Ceux que le semis y a écrits
 *     (contrats figés) sont relevés après le semis et reposés au début de chaque test ;
 *   · ce que le semis rend hors de la base (le `SeedingContext`, un moteur espion…) :
 *     {@see semerLeJeu()} le rend, {@see jeu()} le relit.
 *
 * @phpstan-require-extends TestCase
 */
trait JeuSemePartage
{
    use DatabaseTransactions;

    /** Ce que {@see semerLeJeu()} a rendu, ou null avant le semis. */
    private static mixed $jeuSeme = null;

    private static bool $jeuPret = false;

    /** Un semis qui échoue échoue pour tous les tests de la classe, sans être rejoué à chacun. */
    private static ?Throwable $echecDuSemis = null;

    /** @var array<string, array<string, string>> disque → chemin → contenu */
    private static array $fichiersDuJeu = [];

    /** @var array{host: string, port: string|int, username: string, password: string}|null */
    private static ?array $serveurDuJeu = null;

    /**
     * Sème le jeu partagé, sur une base vide et migrée, HORS de toute transaction de test. Appelée une
     * fois par classe. Rend ce que les tests auront à relire hors de la base.
     */
    abstract protected static function semerLeJeu(Application $app): mixed;

    public function createApplication()
    {
        $app = parent::createApplication();
        $app['config']->set('database.connections.pgsql.database', self::nomDeLaBaseDuJeu());

        if (self::$echecDuSemis !== null) {
            throw self::$echecDuSemis;
        }

        if (! self::$jeuPret) {
            try {
                self::preparerLeJeu($app);
            } catch (Throwable $e) {
                throw self::$echecDuSemis = $e;
            }
        }

        return $app;
    }

    protected function setUp(): void
    {
        parent::setUp();

        // Après `Tests\TestCase::setUp()`, qui vient de vider les disques factices.
        foreach (self::$fichiersDuJeu as $disque => $fichiers) {
            foreach ($fichiers as $chemin => $contenu) {
                Storage::disk($disque)->put($chemin, $contenu);
            }
        }
    }

    public static function tearDownAfterClass(): void
    {
        if (self::$serveurDuJeu !== null) {
            self::supprimer(self::$serveurDuJeu, self::nomDeLaBaseDuJeu());
        }

        self::$jeuSeme = null;
        self::$jeuPret = false;
        self::$echecDuSemis = null;
        self::$fichiersDuJeu = [];
        self::$serveurDuJeu = null;

        parent::tearDownAfterClass();
    }

    /** Ce que {@see semerLeJeu()} a rendu. */
    protected function jeu(): mixed
    {
        return self::$jeuSeme;
    }

    /** La base du jeu : celle du processus, suffixée par la classe (deux classes, deux jeux). */
    protected static function nomDeLaBaseDuJeu(): string
    {
        return TestDatabase::name().'_jeu_'.substr(md5(static::class), 0, 8);
    }

    private static function preparerLeJeu(Application $app): void
    {
        /** @var array{host: string, port: string|int, username: string, password: string} $serveur */
        $serveur = $app['config']->get('database.connections.pgsql');
        self::$serveurDuJeu = $serveur;
        $nom = self::nomDeLaBaseDuJeu();

        // Une base laissée par une classe interrompue du même processus repart de zéro.
        self::supprimer($serveur, $nom);
        $pdo = self::maintenance($serveur);
        // Ni paramètre lié ni transaction pour `CREATE DATABASE` ; le nom est engendré ici (préfixe de
        // TestDatabase, jeton hexadécimal, empreinte hexadécimale), jamais lu d'une entrée extérieure.
        $pdo->exec('CREATE DATABASE "'.$nom.'"');
        $pdo->exec('COMMENT ON DATABASE "'.$nom.'" IS '.$pdo->quote((string) time()));
        // Filet de la fin anormale du processus (erreur fatale) ; le SIGKILL reste au balayage.
        register_shutdown_function(static fn () => self::supprimer($serveur, $nom));

        $app[Kernel::class]->call('migrate', ['--force' => true]);

        $disques = [config('media-library.disk_name'), config('media-library.public_disk_name')];
        foreach ($disques as $disque) {
            Storage::fake($disque);
        }

        self::$jeuSeme = static::semerLeJeu($app);

        foreach ($disques as $disque) {
            foreach (Storage::disk($disque)->allFiles() as $chemin) {
                self::$fichiersDuJeu[$disque][$chemin] = Storage::disk($disque)->get($chemin);
            }
        }

        self::$jeuPret = true;
    }

    /** @param array{host: string, port: string|int, username: string, password: string} $c */
    private static function maintenance(array $c): PDO
    {

        return new PDO(sprintf('pgsql:host=%s;port=%s;dbname=postgres', $c['host'], $c['port']), $c['username'], $c['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ]);
    }

    /** @param array{host: string, port: string|int, username: string, password: string} $serveur */
    private static function supprimer(array $serveur, string $nom): void
    {
        try {
            // WITH (FORCE) : la connexion du dernier test peut être encore ouverte.
            self::maintenance($serveur)->exec('DROP DATABASE IF EXISTS "'.$nom.'" WITH (FORCE)');
        } catch (Throwable) {
            // Le nettoyage ne fait jamais échouer une exécution.
        }
    }
}
