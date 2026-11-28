<?php

namespace Tests\Feature\Validation;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-1110 (P91.05) — la règle `email` de Laravel ne borne pas la longueur, et les colonnes
 * d'adresse sont des `varchar(255)`. Chaque voie qui écrit une adresse la borne à la colonne :
 * au-delà, 422 sur la clé, et non le 500 de PostgreSQL (22001). À la borne, l'écriture passe.
 *
 * TCK-3015 (ADR-0140 § 4) — la borne de CHAQUE voie est tenue par le recensement
 * `Validation\BornesMaxFaceAuSchemaTest` ; ce fichier n'en garde qu'un témoin HTTP, la preuve que la requête
 * bornée est bien celle que la route reçoit.
 */
class EmailFieldLengthTest extends ApiTestCase
{
    use RefreshDatabase;

    /** Une adresse valide de la longueur voulue : domaine en étiquettes de 60, partie locale ≤ 64. */
    private static function adresse(int $longueur): string
    {
        $domaine = 'sn';
        while (strlen($domaine) < $longueur - 1 - 61) {
            $domaine = str_repeat('d', 60).'.'.$domaine;
        }

        return str_repeat('a', $longueur - 1 - strlen($domaine)).'@'.$domaine;
    }

    public function test_l_adresse_temoin_a_la_longueur_voulue(): void
    {
        $this->assertSame(256, strlen(self::adresse(256)));
        $this->assertSame(255, strlen(self::adresse(255)));
    }

    public function test_inscription(): void
    {
        $corps = fn (string $email) => [
            'terms_accepted' => true,
            'first_name' => 'Awa',
            'last_name' => 'Diop',
            'email' => $email,
            'password' => 'Motdepasse-Solide-2026',
            'password_confirmation' => 'Motdepasse-Solide-2026',
        ];

        $this->postJson('/api/auth/register', $corps(self::adresse(256)))
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');
        $this->assertSame(0, User::query()->count());

        $this->postJson('/api/auth/register', $corps(self::adresse(255)))->assertCreated();
    }
}
