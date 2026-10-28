<?php

namespace Tests\Unit\Radar;

use App\Models\RadarConsent;
use App\Services\Radar\RadarConsentVerdict;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

/**
 * TCK-2388 (ADR-0077 §3) — la sortie de `radar.verification_accord`, relue par du code : le numéro se compare en E.164 quand il se
 * lit (le code l'emporte sur le modèle), les clauses se dédoublonnent et se bornent, une sortie hors schéma lève.
 */
class RadarConsentVerdictTest extends TestCase
{
    private const NUMERO = '+221771234567';

    /**
     * @param  array<string, mixed>  $surcharge
     * @return array<string, mixed>
     */
    private static function sortie(array $surcharge = []): array
    {
        return $surcharge + [
            'transcript' => "Takussan : Bonjour Awa, ...\nAnnonceur : OUI",
            'reply_text' => 'OUI',
            'counterpart_phone' => '77 123 45 67',
            'counterpart_name' => 'Awa Fall',
            'number_matches' => true,
            'name_matches' => true,
            'clauses_found' => [1, 2, 3, 4],
            'classification' => 'consent',
            'confidence' => 'high',
        ];
    }

    public function test_un_numero_lisible_se_compare_par_le_code(): void
    {
        $verdict = RadarConsentVerdict::from(self::sortie(), self::NUMERO, 4);

        $this->assertTrue($verdict['number_matches']);
        $this->assertSame('code', $verdict['number_checked_by']);
        $this->assertSame('77 123 45 67', $verdict['counterpart_phone']);
        $this->assertSame([], $verdict['discordances']);
    }

    public function test_un_numero_illisible_laisse_le_booleen_du_modele_et_le_dit(): void
    {
        foreach ([null, 'numéro masqué', '   '] as $affiche) {
            foreach ([true, false, null] as $dit) {
                $verdict = RadarConsentVerdict::from(self::sortie(['counterpart_phone' => $affiche, 'number_matches' => $dit]), self::NUMERO, 4);

                $this->assertSame($dit, $verdict['number_matches']);
                $this->assertSame('model', $verdict['number_checked_by']);
            }
        }
        // Sans numéro d'annonceur à comparer, le code ne peut rien juger non plus.
        $this->assertSame('model', RadarConsentVerdict::from(self::sortie(), null, 4)['number_checked_by']);
    }

    public function test_un_numero_lu_mais_different_est_faux_meme_si_le_modele_dit_vrai(): void
    {
        $verdict = RadarConsentVerdict::from(self::sortie(['counterpart_phone' => '+221 78 999 88 77', 'number_matches' => true]), self::NUMERO, 4);

        $this->assertFalse($verdict['number_matches']);
        $this->assertSame('code', $verdict['number_checked_by']);
        $this->assertSame(['number_mismatch'], $verdict['discordances']);
    }

    public function test_un_numero_lu_et_identique_est_vrai_meme_si_le_modele_dit_faux(): void
    {
        $verdict = RadarConsentVerdict::from(self::sortie(['counterpart_phone' => '+221771234567', 'number_matches' => false]), self::NUMERO, 4);

        $this->assertTrue($verdict['number_matches']);
        $this->assertSame('code', $verdict['number_checked_by']);
    }

    public function test_les_clauses_sont_dedoublonnees_triees_et_bornees(): void
    {
        $verdict = RadarConsentVerdict::from(self::sortie(['clauses_found' => [4, 1, 1, 9, 2, 3, 0, -1, '2', 2.0]]), self::NUMERO, 4);

        $this->assertSame([1, 2, 3, 4], $verdict['clauses_found']);
        $this->assertTrue($verdict['clauses_complete']);

        $incomplet = RadarConsentVerdict::from(self::sortie(['clauses_found' => [1, 2]]), self::NUMERO, 4);
        $this->assertSame([1, 2], $incomplet['clauses_found']);
        $this->assertFalse($incomplet['clauses_complete']);
        $this->assertSame(['clauses_missing'], $incomplet['discordances']);

        // Aucune clause lue (la capture ne montre que la réponse) : incomplet, jamais « complet par défaut ».
        $this->assertFalse(RadarConsentVerdict::from(self::sortie(['clauses_found' => []]), self::NUMERO, 4)['clauses_complete']);
        $this->assertFalse(RadarConsentVerdict::from(self::sortie(['clauses_found' => []]), self::NUMERO, 0)['clauses_complete']);
    }

    public function test_une_sortie_hors_schema_leve(): void
    {
        $manques = ['transcript', 'reply_text', 'counterpart_phone', 'counterpart_name', 'number_matches', 'name_matches', 'clauses_found', 'classification', 'confidence'];
        foreach ($manques as $cle) {
            $sortie = self::sortie();
            unset($sortie[$cle]);
            try {
                RadarConsentVerdict::from($sortie, self::NUMERO, 4);
                $this->fail("La clé « {$cle} » manquante aurait dû lever.");
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }

        foreach ([['classification' => 'accord'], ['classification' => null], ['confidence' => 'certain'], ['transcript' => ['x']], ['clauses_found' => 'tout']] as $mauvaise) {
            try {
                RadarConsentVerdict::from(self::sortie($mauvaise), self::NUMERO, 4);
                $this->fail('Une valeur hors schéma aurait dû lever : '.json_encode($mauvaise));
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function test_la_classification_non_accord_est_une_discordance(): void
    {
        foreach (['refusal', 'stop', 'question', 'ambiguous'] as $classe) {
            $this->assertSame(['not_consent'], RadarConsentVerdict::from(self::sortie(['classification' => $classe]), self::NUMERO, 4)['discordances'], $classe);
        }
    }

    public function test_discordances_d_une_reponse_enregistree(): void
    {
        $reponse = fn (?array $verdict) => new RadarConsent(['ai_verdict' => $verdict]);
        $verdict = fn (array $s = []) => RadarConsentVerdict::from(self::sortie($s), self::NUMERO, 4);

        // Aucun verdict : en cours, ou échec.
        $this->assertSame(['no_verdict'], RadarConsentVerdict::discordances($reponse(null)));
        $this->assertSame(['no_verdict'], RadarConsentVerdict::discordances($reponse([])));
        // Un accord concordant n'a aucune discordance.
        $this->assertSame([], RadarConsentVerdict::discordances($reponse($verdict())));
        // Les trois autres, seules puis ensemble.
        $this->assertSame(['number_mismatch'], RadarConsentVerdict::discordances($reponse($verdict(['counterpart_phone' => '+221789998877']))));
        $this->assertSame(['clauses_missing'], RadarConsentVerdict::discordances($reponse($verdict(['clauses_found' => [1]]))));
        $this->assertSame(['not_consent'], RadarConsentVerdict::discordances($reponse($verdict(['classification' => 'question']))));
        $this->assertSame(
            ['number_mismatch', 'clauses_missing', 'not_consent'],
            RadarConsentVerdict::discordances($reponse($verdict(['counterpart_phone' => '+221789998877', 'clauses_found' => [], 'classification' => 'ambiguous']))),
        );
        // Un numéro illisible dont le nom concorde n'est pas une discordance : l'opérateur le voit sur les captures.
        $this->assertSame([], RadarConsentVerdict::discordances($reponse($verdict(['counterpart_phone' => null, 'number_matches' => null, 'name_matches' => true]))));
    }

    public function test_ni_le_numero_ni_le_nom_ne_confirment_l_annonceur(): void
    {
        $verdict = fn (array $s) => RadarConsentVerdict::from(self::sortie($s + ['counterpart_phone' => null, 'number_matches' => null]), self::NUMERO, 4);

        // Numéro illisible ET nom non confirmé (faux ou illisible) : `identity_unverified`.
        $this->assertSame(['identity_unverified'], $verdict(['name_matches' => false])['discordances']);
        $this->assertSame(['identity_unverified'], $verdict(['name_matches' => null])['discordances']);
        // Le nom confirme : rien.
        $this->assertSame([], $verdict(['name_matches' => true])['discordances']);
        // Un numéro lu et différent est `number_mismatch` SEUL, quel que soit le nom ; un numéro concordant n'en donne jamais.
        $this->assertSame(['number_mismatch'], RadarConsentVerdict::from(self::sortie(['counterpart_phone' => '+221 78 999 88 77', 'name_matches' => false]), self::NUMERO, 4)['discordances']);
        $this->assertSame([], RadarConsentVerdict::from(self::sortie(['name_matches' => false]), self::NUMERO, 4)['discordances']);
        // Sans numéro d'annonceur à comparer et sans booléen du modèle : le numéro est illisible.
        $this->assertSame(['identity_unverified'], RadarConsentVerdict::from(self::sortie(['number_matches' => null, 'name_matches' => null]), null, 4)['discordances']);
    }
}
