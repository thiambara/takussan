<?php

namespace Tests\Feature\Validation;

use App\Http\Requests\AgencyUpdateRequest;
use App\Http\Requests\Api\Admin\StoreAgencyOnboardingRequest;
use App\Http\Requests\Api\AttachGuarantorLeaseRequest;
use App\Http\Requests\Api\MarkPaidLeasePaymentRequest;
use App\Http\Requests\Api\StoreAgencyRequest;
use App\Http\Requests\Api\StoreBookingPaymentRequest;
use App\Http\Requests\Api\StoreCustomerRequest;
use App\Http\Requests\Api\StoreForAgencyReviewRequest;
use App\Http\Requests\Api\StoreForPropertyReviewRequest;
use App\Http\Requests\Api\StoreGuarantorRequest;
use App\Http\Requests\Api\StoreTagRequest;
use App\Http\Requests\Api\UpdateCustomerRequest;
use App\Http\Requests\Api\UpdateGuarantorRequest;
use App\Http\Requests\Api\UpdateTagRequest;
use App\Http\Requests\Auth\RegisterRequest;
use App\Http\Requests\Public\PublicPropertySlugRequest;
use App\Http\Requests\Public\VisitRequestPublicPropertyRequest;
use App\Models\Property;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Routing\Route;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-1111 (P91.07) — une clé de requête qui écrit dans un `varchar(N)` porte un `max:` au plus égal
 * à N. Sans lui, une valeur trop longue atteint PostgreSQL (`SQLSTATE[22001]`), que
 * `bootstrap/app.php` ne traduit pas : l'appelant reçoit un 500, jamais un 422 sur le champ
 * (angle 91 du fichier de pistes, TCK-1106 à TCK-1110).
 *
 * Pendant de `ReglesNullableFaceAuSchemaTest` (TCK-982). Pour chaque couple listé, elle vérifie :
 *  1. la colonne est toujours un `varchar(N)` (`information_schema`) — une liste périmée rougit ;
 *  2. la règle de la clé porte un `max:K`, avec K ≤ N ;
 *  3. la règle, jouée seule, refuse N+1 caractères sur cette clé et accepte K caractères — le refus
 *     vient donc de la longueur, et non d'un format (une clé e-mail reçoit une adresse valide).
 *
 * ⚠ Ce qu'elle ne voit pas : un couple qu'elle ne liste pas. Une requête neuve qui écrit dans un
 * `varchar` n'y entre que si on l'y ajoute.
 */
class BornesMaxFaceAuSchemaTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array<string, array{class-string<FormRequest>, string, string, string}>
     */
    public static function couples(): array
    {
        $couples = [
            // TCK-1106 (P91.01)
            'agence, création, nom' => [StoreAgencyRequest::class, 'name', 'agencies', 'name'],
            'agence, création, téléphone' => [StoreAgencyRequest::class, 'phone', 'agencies', 'phone'],
            'agence, création, agrément' => [StoreAgencyRequest::class, 'license_number', 'agencies', 'license_number'],
            'agence, modification, nom' => [AgencyUpdateRequest::class, 'name', 'agencies', 'name'],
            'agence, modification, téléphone' => [AgencyUpdateRequest::class, 'phone', 'agencies', 'phone'],
            'agence, modification, agrément' => [AgencyUpdateRequest::class, 'license_number', 'agencies', 'license_number'],
            'agence, console, téléphone' => [StoreAgencyOnboardingRequest::class, 'agency.phone', 'agencies', 'phone'],
            // TCK-1107 (P91.02)
            'étiquette, création, couleur' => [StoreTagRequest::class, 'color', 'tags', 'color'],
            'étiquette, création, icône' => [StoreTagRequest::class, 'icon', 'tags', 'icon'],
            'étiquette, modification, couleur' => [UpdateTagRequest::class, 'color', 'tags', 'color'],
            'étiquette, modification, icône' => [UpdateTagRequest::class, 'icon', 'tags', 'icon'],
            // TCK-1109 (P91.04)
            'client, création, prénom' => [StoreCustomerRequest::class, 'first_name', 'customers', 'first_name'],
            'client, création, nom' => [StoreCustomerRequest::class, 'last_name', 'customers', 'last_name'],
            'client, création, profession' => [StoreCustomerRequest::class, 'occupation', 'customers', 'occupation'],
            'client, modification, prénom' => [UpdateCustomerRequest::class, 'first_name', 'customers', 'first_name'],
            'client, modification, nom' => [UpdateCustomerRequest::class, 'last_name', 'customers', 'last_name'],
            'client, modification, profession' => [UpdateCustomerRequest::class, 'occupation', 'customers', 'occupation'],
            // TCK-1110 (P91.05)
            'inscription, e-mail' => [RegisterRequest::class, 'email', 'users', 'email'],
            'client, création, e-mail' => [StoreCustomerRequest::class, 'email', 'customers', 'email'],
            'client, modification, e-mail' => [UpdateCustomerRequest::class, 'email', 'customers', 'email'],
            'agence, création, e-mail' => [StoreAgencyRequest::class, 'email', 'agencies', 'email'],
            'agence, modification, e-mail' => [AgencyUpdateRequest::class, 'email', 'agencies', 'email'],
            'visite publique, e-mail' => [VisitRequestPublicPropertyRequest::class, 'visitor_email', 'property_visits', 'visitor_email'],
            // TCK-1112 (P91.08)
            'avis d\'agence, titre' => [StoreForAgencyReviewRequest::class, 'title', 'reviews', 'title'],
            'avis de bien, titre' => [StoreForPropertyReviewRequest::class, 'title', 'reviews', 'title'],
            'encaissement d\'échéance, référence' => [MarkPaidLeasePaymentRequest::class, 'transaction_id', 'lease_payments', 'transaction_id'],
            'paiement de réservation, référence' => [StoreBookingPaymentRequest::class, 'transaction_id', 'booking_payments', 'transaction_id'],
        ];

        // TCK-1108 (P91.03), et TCK-1110 (P91.05) pour l'adresse : les trois voies d'un garant.
        foreach ([
            'création' => StoreGuarantorRequest::class,
            'modification' => UpdateGuarantorRequest::class,
            'ajout à un bail' => AttachGuarantorLeaseRequest::class,
        ] as $voie => $requete) {
            foreach (['first_name', 'last_name', 'phone', 'occupation', 'employer', 'relationship_to_tenant', 'email'] as $cle) {
                $couples["garant, {$voie}, {$cle}"] = [$requete, $cle, 'guarantors', $cle];
            }
        }

        return $couples;
    }

    /** @param  class-string<FormRequest>  $requete */
    #[DataProvider('couples')]
    public function test_une_cle_qui_ecrit_dans_un_varchar_est_bornee_a_sa_largeur(
        string $requete,
        string $cle,
        string $table,
        string $colonne,
    ): void {
        $colonneLue = DB::table('information_schema.columns')
            ->where('table_schema', DB::raw('current_schema()'))
            ->where('table_name', $table)
            ->where('column_name', $colonne)
            ->first(['data_type', 'character_maximum_length']);

        $this->assertNotNull($colonneLue, "{$table}.{$colonne} n'existe plus : retirer le couple de la liste.");
        $this->assertSame('character varying', $colonneLue->data_type, "{$table}.{$colonne} n'est plus un varchar : retirer le couple de la liste.");
        $largeur = (int) $colonneLue->character_maximum_length;

        $regles = $this->regles($requete);
        $this->assertArrayHasKey($cle, $regles, "{$requete} ne valide plus « {$cle} ».");

        $regle = is_string($regles[$cle]) ? explode('|', $regles[$cle]) : $regles[$cle];
        $bornes = array_map(
            fn (string $r) => (int) substr($r, 4),
            array_values(array_filter($regle, fn ($r) => is_string($r) && str_starts_with($r, 'max:'))),
        );
        $this->assertNotEmpty($bornes, "{$requete} : « {$cle} » écrit dans {$table}.{$colonne}, varchar({$largeur}), sans max: ; une valeur trop longue y rendrait 500 et non 422.");
        $borne = min($bornes);
        $this->assertLessThanOrEqual($largeur, $borne, "{$requete} : « {$cle} » borné à {$borne}, au-delà de {$table}.{$colonne}, varchar({$largeur}).");

        $trop = Validator::make(Arr::undot([$cle => self::valeur($cle, $largeur + 1)]), [$cle => $regles[$cle]]);
        $this->assertTrue($trop->fails(), "{$requete} : « {$cle} » accepte ".($largeur + 1).' caractères.');
        $this->assertArrayHasKey($cle, $trop->errors()->toArray());

        $juste = Validator::make(Arr::undot([$cle => self::valeur($cle, $borne)]), [$cle => $regles[$cle]]);
        $this->assertFalse($juste->fails(), "{$requete} : « {$cle} » refuse {$borne} caractères, sa propre borne : le refus de N+1 ne prouve rien.");
    }

    /**
     * Les règles d'une requête hors de sa route. Une requête du site public résout son bien par le
     * slug de la route (`PublicPropertySlugRequest::property()`) : elle reçoit un bien publié.
     *
     * @param  class-string<FormRequest>  $requete
     * @return array<string, mixed>
     */
    private function regles(string $requete): array
    {
        $instance = new $requete;

        if ($instance instanceof PublicPropertySlugRequest) {
            $slug = Property::factory()->published()->create()->slug;
            $route = (new Route('POST', 'biens/{slug}', []))->bind(Request::create("biens/{$slug}", 'POST'));
            $instance->setRouteResolver(fn () => $route);
        }

        return $instance->rules();
    }

    /** Une valeur de la longueur voulue, valide pour le format de la clé (adresse e-mail comprise). */
    private static function valeur(string $cle, int $longueur): string
    {
        if (! str_ends_with($cle, 'email')) {
            return str_repeat('a', $longueur);
        }

        $domaine = 'sn';
        while (strlen($domaine) < $longueur - 1 - 61) {
            $domaine = str_repeat('d', 60).'.'.$domaine;
        }

        return str_repeat('a', $longueur - 1 - strlen($domaine)).'@'.$domaine;
    }
}
