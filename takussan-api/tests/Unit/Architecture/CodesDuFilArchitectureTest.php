<?php

namespace Tests\Unit\Architecture;

use App\Events\Maintenance\MaintenanceStatusChanged;
use App\Services\Messaging\CodesDuFil;
use App\Services\Messaging\SujetsDuFil;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

/**
 * TCK-2958 (ADR-0128 § 3, AC4) — le catalogue des codes du fil, parcouru ENTIER.
 *
 * `data` est lu par TOUT participant du fil : aucune clé ne peut y porter un montant, un coût, un prix,
 * un téléphone, un e-mail ni une adresse — ce qui dépend du lecteur passe par la projection de l'objet.
 * Le motif est cherché DANS la clé (`provider_phone`, `total_amount`), pas seulement à l'identique.
 *
 * La forme du `metadata` (`{object: {type, id}, code, data}`, pour chaque code du catalogue) est
 * tenue par `EvenementsDuFilTest::test_la_forme_du_metadata_est_fermee_pour_tout_le_catalogue` : il lui
 * faut l'application (un modèle). TCK-2959 y a ajouté `action_for` (événements seulement), et rien
 * d'autre ne s'y ajoute sans changer ce test.
 */
class CodesDuFilArchitectureTest extends TestCase
{
    private const MOTIFS_INTERDITS = [
        'amount', 'montant', 'cost', 'cout', 'price', 'prix', 'phone', 'telephone', 'email',
        'address', 'adresse', 'street', 'rue',
    ];

    public function test_aucune_cle_de_data_ne_porte_une_donnee_qui_depend_du_lecteur(): void
    {
        $fautes = [];
        foreach (CodesDuFil::catalogue() as $code => $entree) {
            foreach ($entree['data'] as $cle) {
                foreach (self::MOTIFS_INTERDITS as $motif) {
                    if (str_contains(strtolower($cle), $motif)) {
                        $fautes[] = "{$code}.{$cle} ({$motif})";
                    }
                }
            }
        }

        $this->assertSame([], $fautes, 'clé de data interdite : passer par la projection de l\'objet');
        // Le parcours n'est pas vide (un catalogue vide rendrait ce test vert pour rien).
        $this->assertNotEmpty(CodesDuFil::catalogue());
    }

    public function test_chaque_code_vise_un_type_du_registre_et_une_nature_connue(): void
    {
        foreach (CodesDuFil::catalogue() as $code => $entree) {
            $this->assertContains($entree['objet'], SujetsDuFil::types(), "{$code} : type d'objet hors registre");
            $this->assertContains($entree['nature'], [CodesDuFil::NATURE_CARTE, CodesDuFil::NATURE_EVENEMENT], "{$code} : nature inconnue");
            $this->assertSame(array_values(array_unique($entree['data'])), $entree['data'], "{$code} : clé de data en double");
        }
    }

    /** Le listener est synchrone : une cause sans code ferait échouer (500) le geste sur la demande. */
    public function test_chaque_cause_d_intervention_a_son_code(): void
    {
        $causes = array_filter(
            (new ReflectionClass(MaintenanceStatusChanged::class))->getConstants(),
            fn (string $nom) => str_starts_with($nom, 'CAUSE_'),
            ARRAY_FILTER_USE_KEY,
        );
        $this->assertNotEmpty($causes);

        foreach ($causes as $cause) {
            $code = CodesDuFil::intervention($cause);
            $this->assertTrue(CodesDuFil::existe($code), "cause « {$cause} » sans code au catalogue");
            $this->assertSame('maintenance_request', CodesDuFil::entree($code)['objet']);
            $this->assertSame(CodesDuFil::NATURE_EVENEMENT, CodesDuFil::entree($code)['nature']);
        }
    }
}
