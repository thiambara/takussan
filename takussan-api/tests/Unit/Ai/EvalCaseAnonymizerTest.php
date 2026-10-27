<?php

namespace Tests\Unit\Ai;

use App\Services\Ai\Evaluation\EvalCaseAnonymizer;
use App\Support\PhoneMasker;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * TCK-2384 — l'anonymisation d'un cas d'évaluation est définitive une fois commitée : un nom
 * employé en partie, en capitales, sans accent ou avec une espace insécable doit disparaître aussi.
 */
class EvalCaseAnonymizerTest extends TestCase
{
    /** @return array<string, array{0: string, 1: string, 2: list<string>}> */
    public static function nameCases(): array
    {
        return [
            'prénom seul et nom précédé de Mme' => ['Awa Diop', 'Contactez Awa ou Mme Diop', ['Awa', 'Diop']],
            'capitales' => ['Awa Diop', 'AWA DIOP', ['AWA', 'DIOP']],
            'espace insécable' => ['Awa Diop', "Awa\u{00A0}Diop", ['Awa', 'Diop']],
            'espace fine insécable' => ['Awa Diop', "Awa\u{202F}Diop", ['Awa', 'Diop']],
            'retour à la ligne' => ['Awa Diop', "Awa\nDiop", ['Awa', 'Diop']],
            'espaces multiples' => ['Awa Diop', 'Awa  Diop', ['Awa', 'Diop']],
            'capitales accentuées' => ['Aïssatou Sène', 'AÏSSATOU SÈNE', ['SÈNE', 'SENE', 'AÏSSATOU', 'AISSATOU']],
            'minuscules accentuées' => ['Aïssatou Sène', 'aïssatou sène', ['aïssatou', 'sène']],
            'sans accent' => ['Aïssatou Sène', 'Aissatou Sene', ['Aissatou', 'Sene']],
            'valeur sans accent, texte accentué' => ['Aissatou Sene', 'Appelez Aïssatou Sène', ['Aïssatou', 'Sène', 'Aissatou', 'Sene']],
            'décomposé NFD' => ['Aïssatou Sène', "Ai\u{0308}ssatou Se\u{0300}ne", ['ssatou', "\u{0308}", "\u{0300}", 'Se']],
        ];
    }

    /** @param list<string> $traces */
    #[DataProvider('nameCases')]
    public function test_a_name_leaves_no_trace_whatever_its_form(string $name, string $input, array $traces): void
    {
        $out = (new EvalCaseAnonymizer)->anonymize($input, ['contact_nom' => $name])['input'];

        foreach ($traces as $trace) {
            $this->assertStringNotContainsStringIgnoringCase($trace, $out, "« $out »");
        }
        $this->assertStringContainsString(EvalCaseAnonymizer::NAME_TOKEN, $out);
    }

    public function test_words_that_are_not_names_keep_their_accents(): void
    {
        $out = (new EvalCaseAnonymizer)->anonymize('Appartement à Mermoz, éclairé. Contactez Aïssatou Sène', ['contact_nom' => 'Aïssatou Sène'])['input'];

        $this->assertSame('Appartement à Mermoz, éclairé. Contactez [NOM]', $out);
    }

    public function test_a_short_value_is_not_used_as_a_needle(): void
    {
        $out = (new EvalCaseAnonymizer)->anonymize('Hotel et tel quel, El Hadj', ['contact_nom' => 'El'])['input'];

        $this->assertSame('Hotel et tel quel, El Hadj', $out);
    }

    public function test_a_short_word_of_a_longer_name_is_not_used_alone(): void
    {
        $out = (new EvalCaseAnonymizer)->anonymize('Hotel de Diop, tel quel, el patio', ['contact_nom' => 'El Diop'])['input'];

        $this->assertSame('Hotel de [NOM], tel quel, el patio', $out);
    }

    public function test_a_name_inside_a_longer_word_is_left_alone(): void
    {
        $out = (new EvalCaseAnonymizer)->anonymize('Awacs et Diopside', ['contact_nom' => 'Awa Diop'])['input'];

        $this->assertSame('Awacs et Diopside', $out);
    }

    public function test_personal_keys_are_detected_broadly(): void
    {
        $expected = [
            'contacts' => ['Awa Diop'],
            'telephone' => 771234567,
            'contactNom' => 'Awa Diop',
            'adresse' => 'Mermoz',
            'quartier' => 'Mermoz',
        ];

        $out = (new EvalCaseAnonymizer)->anonymize('Villa à Mermoz', $expected);

        $this->assertSame([
            'contacts' => ['[NOM]'],
            'telephone' => PhoneMasker::TOKEN,
            'contactNom' => '[NOM]',
            'adresse' => EvalCaseAnonymizer::ADDRESS_TOKEN,
            'quartier' => 'Mermoz',
        ], $out['expected']);
        $this->assertSame('Villa à Mermoz', $out['input']);
    }

    /** @return array<string, array{0: string, 1: mixed, 2: mixed}> */
    public static function keyCases(): array
    {
        return [
            'proprietaire' => ['proprietaire', 'Awa Diop', '[NOM]'],
            'vendeur' => ['vendeur', 'Awa Diop', '[NOM]'],
            'whatsapp' => ['whatsapp', '77 123 45 67', '[TELEPHONE]'],
            'whatsapp nombre' => ['whatsapp', 771234567, '[TELEPHONE]'],
            'telephone2' => ['telephone2', '77 123 45 67', '[TELEPHONE]'],
            'nom_complet' => ['nom_complet', 'Awa Diop', '[NOM]'],
            'email_pro' => ['email_pro', 'awa@exemple.sn', '[EMAIL]'],
            'camelCase' => ['contactEmail', 'awa@exemple.sn', '[EMAIL]'],
            'majuscules' => ['CONTACT_NOM', 'Awa Diop', '[NOM]'],
            'adresse_complete' => ['adresse_complete', 'Rue 10', '[ADRESSE]'],
            'nombre n\'est pas un nom' => ['nombre_chambres', 3, 3],
            'hotel n\'est pas un téléphone' => ['hotel', 'Terrou-Bi', 'Terrou-Bi'],
            'prix' => ['prix', 100, 100],
        ];
    }

    #[DataProvider('keyCases')]
    public function test_each_personal_key_gets_the_token_of_its_kind(string $key, mixed $value, mixed $token): void
    {
        $out = (new EvalCaseAnonymizer)->anonymize('', [$key => $value]);

        $this->assertSame([$key => $token], $out['expected']);
    }

    public function test_every_string_under_a_personal_array_is_tokenized_and_used_as_a_needle(): void
    {
        $out = (new EvalCaseAnonymizer)->anonymize(
            'Voir Awa ou Moussa Fall, appelez Moussa',
            ['contacts' => [['nom' => 'Awa Diop'], 'Moussa Fall'], 'nested' => ['proprietaire' => ['Ibrahima Ba']]],
        );

        $this->assertSame('Voir [NOM] ou [NOM], appelez [NOM]', $out['input']);
        $this->assertSame(['contacts' => [['nom' => '[NOM]'], '[NOM]'], 'nested' => ['proprietaire' => ['[NOM]']]], $out['expected']);
    }

    public function test_an_address_is_not_used_as_a_needle(): void
    {
        $out = (new EvalCaseAnonymizer)->anonymize('Villa à Mermoz, rue Mermoz 12', ['adresse' => 'Rue Mermoz 12']);

        $this->assertSame('Villa à Mermoz, rue Mermoz 12', $out['input']);
    }

    public function test_personal_values_of_the_proposal_are_also_removed_from_the_input(): void
    {
        $out = (new EvalCaseAnonymizer)->anonymize('Chez Awa Diop', ['titre' => 'Villa'], ['contact_nom' => 'Awa Diop']);

        $this->assertSame('Chez [NOM]', $out['input']);
    }

    public function test_phones_and_emails_are_still_masked(): void
    {
        $out = (new EvalCaseAnonymizer)->anonymize("Appelez le 77\u{00A0}123\u{202F}45 67 ou awa.diop@exemple.sn", []);

        $this->assertSame('Appelez le [TELEPHONE] ou [EMAIL]', $out['input']);
    }

    public function test_an_email_containing_the_name_becomes_one_token(): void
    {
        $out = (new EvalCaseAnonymizer)->anonymize('Awa Diop : awa.diop@exemple.sn', ['contact_nom' => 'Awa Diop']);

        $this->assertSame('[NOM] : [EMAIL]', $out['input']);
    }
}
