<?php

namespace Tests\Unit\Pont;

use App\Services\Messaging\CodesDuFil;
use App\Services\Messaging\SujetsDuFil;
use App\Services\Pont\GestesParLien;
use Tests\TestCase;

/**
 * TCK-2982 (ADR-0132 § 5) — le registre fermé des gestes par lien. Chaque code du catalogue qui attend un geste est
 * rangé UNE fois : il émet un lien, il est couvert par une notification mobile du même geste (le loyer : la
 * relance porte déjà le lien porteur d'ADR-0051 — aucun doublon), ou il n'a pas de lien, avec son motif.
 */
class RegistreDesGestesParLienTest extends TestCase
{
    public function test_chaque_code_qui_attend_un_geste_est_range_une_fois(): void
    {
        $attendent = array_values(array_filter(CodesDuFil::codes(), fn (string $code): bool => CodesDuFil::attend($code)));
        $emetteurs = array_values(array_filter(GestesParLien::codesEmetteurs(), fn (string $code): bool => CodesDuFil::attend($code)));
        $ranges = [...$emetteurs, ...GestesParLien::CODES_COUVERTS, ...array_keys(GestesParLien::SANS_LIEN)];

        sort($attendent);
        $tries = $ranges;
        sort($tries);
        $this->assertSame($attendent, $tries, 'un code `attend` non rangé, ou rangé deux fois');
        $this->assertSame(count($ranges), count(array_unique($ranges)));
    }

    public function test_le_loyer_est_couvert_et_n_emet_aucun_lien(): void
    {
        foreach (['lease_payment.due_soon', 'lease_payment.overdue', 'lease_payment.reminded'] as $code) {
            $this->assertContains($code, GestesParLien::CODES_COUVERTS);
            $this->assertNull(GestesParLien::gesteDuCode($code));
        }
    }

    public function test_chaque_geste_vise_un_type_du_fil_et_chaque_code_emetteur_existe_sur_cet_objet(): void
    {
        foreach (GestesParLien::gestes() as $geste) {
            $type = GestesParLien::typeDObjet($geste);
            $this->assertContains($type, SujetsDuFil::types());
            foreach (GestesParLien::codesEmetteurs() as $code) {
                if (GestesParLien::gesteDuCode($code) === $geste) {
                    $this->assertSame($type, CodesDuFil::entree($code)['objet'], $code);
                }
            }
        }
    }

    public function test_seul_maintenance_assigned_emet_sans_action_for(): void
    {
        foreach (GestesParLien::codesEmetteurs() as $code) {
            $this->assertSame(! CodesDuFil::attend($code), in_array($code, GestesParLien::codesSansActionFor(), true), $code);
        }
    }

    public function test_l_approbation_d_un_devis_n_est_pas_un_geste_par_lien(): void
    {
        $this->assertNull(GestesParLien::gesteDuCode('maintenance.quote_submitted'));
        $this->assertNull(GestesParLien::gesteDuCode('maintenance.quote_awaiting_owner'));
    }
}
