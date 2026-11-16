<?php

namespace Tests\Unit\Support;

use App\Support\MotsDuSignalement;
use PHPUnit\Framework\TestCase;

/**
 * TCK-2943 (ADR-0122 § 1) — le texte du signalement, tel qu'il sort vers un prestataire qui n'a encore rien accepté :
 * numéros et courriels masqués, valeurs connues du dossier (nom, rue) remplacées, coupé à 280 caractères.
 */
class MotsDuSignalementTest extends TestCase
{
    public function test_le_numero_est_masque(): void
    {
        $this->assertSame(
            "fuite sous l'évier, appelez-moi au [TELEPHONE]",
            MotsDuSignalement::citer("fuite sous l'évier, appelez-moi au 77 123 45 67", []),
        );
    }

    public function test_le_courriel_est_masque(): void
    {
        $this->assertSame('écrivez à [EMAIL] svp', MotsDuSignalement::citer('écrivez à aminata.diop@example.com svp', []));
    }

    public function test_les_valeurs_connues_sont_remplacees_sans_egard_a_la_casse(): void
    {
        $texte = MotsDuSignalement::citer('Ici AMINATA Diop, au 12 rue Carnot, immeuble Fatou, 2e étage.', [
            MotsDuSignalement::NOM => ['Aminata', 'Diop'],
            MotsDuSignalement::ADRESSE => ['12 rue Carnot, immeuble Fatou'],
        ]);

        $this->assertSame('Ici [NOM] [NOM], au [ADRESSE], 2e étage.', $texte);
    }

    public function test_une_valeur_de_moins_de_trois_lettres_n_est_pas_cherchee(): void
    {
        // « Ba » rongerait « Bac », « Baignoire »…
        $this->assertSame('La baignoire fuit', MotsDuSignalement::citer('La baignoire fuit', [MotsDuSignalement::NOM => ['Ba', '', null]]));
    }

    public function test_une_valeur_n_est_remplacee_que_mot_entier(): void
    {
        // « Sow » ne ronge pas « Sowar ».
        $this->assertSame('[NOM] habite rue Sowar', MotsDuSignalement::citer('Sow habite rue Sowar', [MotsDuSignalement::NOM => ['Sow']]));
    }

    public function test_le_texte_long_est_coupe_a_un_mot_entier(): void
    {
        $texte = MotsDuSignalement::citer(str_repeat('robinet ', 60), []);

        $this->assertNotNull($texte);
        $this->assertLessThanOrEqual(MotsDuSignalement::LONGUEUR + 1, mb_strlen($texte));
        $this->assertStringEndsWith('robinet…', $texte);
    }

    public function test_le_masquage_precede_la_coupe(): void
    {
        // Un numéro à cheval sur la coupe ne laisse pas ses premiers chiffres.
        $texte = MotsDuSignalement::citer(str_repeat('a', 270).' 77 123 45 67 et la suite', []);

        $this->assertStringNotContainsString('77 1', (string) $texte);
    }

    public function test_un_texte_vide_rend_null(): void
    {
        $this->assertNull(MotsDuSignalement::citer(null, []));
        $this->assertNull(MotsDuSignalement::citer("  \n ", []));
    }
}
