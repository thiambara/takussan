<?php

namespace Tests\Feature\Database;

use App\Models\Tag;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Le critère d'acceptation n°5 de la migration PostgreSQL — et le seul danger du
 * chantier qui ne se signalait par AUCUN rouge.
 *
 * ## Ce que ces tests gardent
 *
 * L'ancienne production comparait les chaînes en `utf8mb4_0900_ai_ci` : insensible à
 * la casse. `Dakar` et `dakar` violaient donc l'unicité de `tags.name`. PostgreSQL en
 * `--locale=C` compare octet à octet : ce sont deux lignes.
 *
 * **Une contrainte qui change de sens ne lève pas d'erreur — elle laisse passer un
 * doublon.** La suite entière est restée verte pendant tout le chantier sur ce point,
 * non parce qu'il était sain, mais parce que **pas un seul de ses ~2660 tests
 * n'insérait de variante de casse**. Le défaut se serait manifesté dans les données.
 *
 * ## Pourquoi ces tests écrivent en SQL brut
 *
 * Parce que c'est le seul niveau qui prouve quelque chose. `User::setEmailAttribute()`
 * met déjà l'e-mail en minuscules : passer par le modèle testerait le mutateur, pas la
 * contrainte — et rendrait vert un schéma sans index. On écrit donc directement dans la
 * table, exactement comme le ferait un seeder, une commande de reprise ou un
 * `updateQuietly`. *La normalisation applicative garde le comportement ; l'index garde
 * les données. Ce fichier teste le second.*
 *
 * ## Ce qu'ils ne gardent PAS, et c'est écrit dans la migration
 *
 * L'insensibilité aux ACCENTS **au niveau de la collation**. Sur une colonne texte
 * quelconque, `Café` et `Cafe` sont désormais deux valeurs distinctes : la restaurer
 * exigerait l'extension `unaccent`, qu'ADR-0020 refuse d'installer sans ticket.
 *
 * ⚠ Mais pour les TAGS, elle survit — par un chemin qu'aucune des décisions du chantier
 * n'avait prévu : `Str::slug()` translittère, donc `Café` et `Cafe` produisent le même
 * slug, et c'est l'unicité du slug qui refuse la seconde ligne. Mesuré, pas supposé —
 * ce test l'a découvert en échouant sur l'affirmation inverse. Il l'épingle désormais,
 * pour que le premier qui touche à la génération du slug le sache.
 */
class CaseInsensitiveUniquenessTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return list<array{0: string, 1: string}>
     */
    public static function colonnesUniques(): array
    {
        return [
            'tags.name' => ['tags', 'name'],
            'users.username' => ['users', 'username'],
            'users.email' => ['users', 'email'],
        ];
    }

    #[DataProvider('colonnesUniques')]
    public function test_une_variante_de_casse_est_refusee(string $table, string $colonne): void
    {
        $valeur = 'Dakar'.bin2hex(random_bytes(4));

        $this->insererBrut($table, $colonne, $valeur);

        $this->expectException(QueryException::class);

        // Même valeur, casse inversée. Sous `ai_ci` c'était un doublon ; sous
        // `--locale=C` sans index sur `LOWER()`, ce serait une ligne acceptée.
        $this->insererBrut($table, $colonne, strtoupper($valeur));
    }

    public function test_la_casse_stockee_est_preservee(): void
    {
        // On indexe `LOWER(col)`, on ne force PAS la colonne en minuscules : seule la
        // COMPARAISON devient insensible à la casse — ce que faisait `ai_ci`.
        $tag = Tag::query()->create(['name' => 'Almadies', 'type' => 'amenity']);

        $this->assertSame('Almadies', $tag->fresh()->name);
    }

    public function test_les_accents_restent_confondus_pour_les_tags_mais_par_le_slug(): void
    {
        // ⚠ CE TEST A ÉTÉ ÉCRIT À L'ENVERS, PUIS CORRIGÉ PAR CE QU'IL A MESURÉ.
        //
        // Il affirmait d'abord que `Cafe` et `Café` sont désormais DEUX tags, la
        // collation `--locale=C` ne confondant plus les accents. C'est vrai de la
        // colonne `name` — et **faux du modèle**, ce que l'exécution a immédiatement
        // dit : `SQLSTATE[23505] duplicate key value violates unique constraint
        // "tags_slug_unique"`.
        //
        // La raison : `Tag::booted()` fabrique le slug par `Str::slug($name)`, qui
        // TRANSLITTÈRE les accents. `Str::slug('Café')` et `Str::slug('Cafe')` rendent
        // tous deux `cafe`, et l'unicité du slug refuse la seconde ligne.
        //
        // **L'insensibilité aux accents survit donc pour les tags — pas par la
        // collation, mais par le slug.** Ce n'était écrit nulle part, et personne ne
        // l'avait relevé en décidant ADR-0020 : la migration ne perd, sur ce modèle,
        // rien de ce qu'`ai_ci` garantissait.
        //
        // *Une garantie qui tient par un chemin qu'on n'a pas prévu tient quand même —
        // mais tant qu'elle n'est pas épinglée, le premier qui touche à la génération
        // du slug la casse sans le savoir.* C'est ce que ce test épingle.
        Tag::query()->create(['name' => 'Cafe', 'type' => 'amenity']);

        $this->expectException(QueryException::class);

        Tag::query()->create(['name' => 'Café', 'type' => 'amenity']);
    }

    public function test_plusieurs_username_nuls_restent_permis(): void
    {
        // En PostgreSQL deux NULL ne sont jamais égaux : un index unique en laisse
        // passer autant qu'on veut. `users.username` est nullable, et cet index ne doit
        // pas le changer — sans quoi la migration casserait toute création d'utilisateur
        // sans pseudonyme.
        User::factory()->count(2)->create(['username' => null]);

        $this->assertSame(2, User::query()->whereNull('username')->count());
    }

    private function insererBrut(string $table, string $colonne, string $valeur): void
    {
        $lignes = [
            'tags' => fn () => ['name' => $valeur, 'slug' => 'x'.bin2hex(random_bytes(6)), 'type' => 'amenity'],
            'users' => fn () => [
                'first_name' => 'T', 'last_name' => 'T',
                'email' => $colonne === 'email' ? $valeur : bin2hex(random_bytes(8)).'@example.test',
                'username' => $colonne === 'username' ? $valeur : null,
                'password' => 'x',
                'created_at' => now(), 'updated_at' => now(),
            ],
        ];

        DB::table($table)->insert($lignes[$table]());
    }
}
