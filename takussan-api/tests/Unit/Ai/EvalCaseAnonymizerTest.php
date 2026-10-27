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

    public function test_a_two_letter_value_is_matched_in_every_case(): void
    {
        // La valeur entière est toujours cherchée, même si c'est un mot courant : un nom qui fuit coûte plus qu'un mot abîmé.
        $out = (new EvalCaseAnonymizer)->anonymize('Hotel et tel quel, El Hadj, el patio', ['contact_nom' => 'El'])['input'];

        $this->assertSame('Hotel et tel quel, [NOM] Hadj, [NOM] patio', $out);
    }

    public function test_a_two_letter_word_of_a_longer_name_does_not_cut_longer_words(): void
    {
        $out = (new EvalCaseAnonymizer)->anonymize('Hotel de Diop, tel quel, el patio, Baobab', ['contact_nom' => 'El Diop'])['input'];

        $this->assertSame('Hotel de [NOM], tel quel, el patio, Baobab', $out);
    }

    /** @return array<string, array{0: array<string, string>, 1: string, 2: string}> */
    public static function shortSurnames(): array
    {
        return [
            'Ba après M.' => [['proprietaire' => 'Ibrahima Ba'], 'M. Ba vous appelle', 'M. [NOM] vous appelle'],
            'Ba en capitales' => [['proprietaire' => 'Ibrahima Ba'], 'M. BA vous appelle', 'M. [NOM] vous appelle'],
            'Ly après Mme' => [['contact_nom' => 'Awa Ly'], 'Contactez Mme Ly', 'Contactez Mme [NOM]'],
            'Sy seul' => [['contact_nom' => 'Sy'], 'Voir M. Sy', 'Voir M. [NOM]'],
            'Ka accentué' => [['contact_nom' => 'Aïssatou Ká'], 'Voir Mme Ka.', 'Voir Mme [NOM].'],
            'Ba minuscule dans la valeur' => [['contact_nom' => 'ba'], 'Voir M. Ba', 'Voir M. [NOM]'],
            'Ba n\'entre pas dans Baobab' => [['proprietaire' => 'Ibrahima Ba'], 'Baobab, Bah et Abba', 'Baobab, Bah et Abba'],
        ];
    }

    /** @param array<string, string> $expected */
    #[DataProvider('shortSurnames')]
    public function test_two_letter_surnames_do_not_leak(array $expected, string $input, string $wanted): void
    {
        $this->assertSame($wanted, (new EvalCaseAnonymizer)->anonymize($input, $expected)['input']);
    }

    /** @return array<string, array{0: array<string, string>, 1: string, 2: string}> */
    public static function lowercaseShortNames(): array
    {
        return [
            'Ba en minuscules, valeur entière' => [['contact_name' => 'Ba'], 'ba est là. m. ba.', '[NOM] est là. m. [NOM].'],
            'Le Roux : le mot courant reste' => [['contact_name' => 'Le Roux'], 'Le prix. Le Roux appelle.', 'Le prix. [NOM] appelle.'],
            'SA Immo : sa reste' => [['contact_name' => 'SA Immo'], 'Sa maison', 'Sa maison'],
            'Ly en minuscules' => [['contact_name' => 'Awa Ly'], 'mme ly', 'mme [NOM]'],
            'Baobab et Bamako intacts' => [['contact_name' => 'Ba'], 'Baobab, Bamako', 'Baobab, Bamako'],
            'Ba dans un nom plus long' => [['contact_name' => 'Ibrahima Ba'], 'baobab et ba', 'baobab et [NOM]'],
        ];
    }

    /** @param array<string, string> $expected */
    #[DataProvider('lowercaseShortNames')]
    public function test_two_letter_name_words_are_matched_in_lowercase_except_stop_words(array $expected, string $input, string $wanted): void
    {
        $this->assertSame($wanted, (new EvalCaseAnonymizer)->anonymize($input, $expected)['input']);
    }

    /** @return array<string, array{0: string, 1: string, 2: string}> */
    public static function reverseApostrophes(): array
    {
        return [
            "valeur sans apostrophe, texte N'Diaye" => ['Ndiaye', "N'Diaye, N’Diaye", '[NOM], [NOM]'],
            "valeur Mbaye, texte M'Baye" => ['Mbaye', "M'Baye", '[NOM]'],
            'valeur Diaye, texte N\'Diaye : pas de N\' qui reste' => ['Diaye', "N'Diaye", '[NOM]'],
            'valeur Diaye, apostrophe typographique' => ['Diaye', 'Voir N’Diaye.', 'Voir [NOM].'],
            'valeur Diaye, backtick et U+00B4' => ['Diaye', 'N`Diaye et M´Diaye', '[NOM] et [NOM]'],
            'valeur Diaye, mot plus long avant : intact' => ['Diaye', 'Mme Diaye', 'Mme [NOM]'],
            'valeur Mbaye, texte M’Baye en majuscules' => ['Mbaye', 'M’BAYE', '[NOM]'],
        ];
    }

    #[DataProvider('reverseApostrophes')]
    public function test_a_name_is_found_with_or_without_the_apostrophe_of_the_text(string $name, string $input, string $wanted): void
    {
        $this->assertSame($wanted, (new EvalCaseAnonymizer)->anonymize($input, ['contact_nom' => $name])['input']);
    }

    public function test_a_zero_width_character_between_two_name_words_is_a_boundary(): void
    {
        foreach (["Awa\u{200B}Diop", "Awa\u{200B}\u{200B}Diop", "Awa\u{200D}Diop", "Awa \u{200B}Diop"] as $input) {
            $out = (new EvalCaseAnonymizer)->anonymize($input, ['contact_nom' => 'Awa Diop'])['input'];
            $this->assertSame('[NOM]', $out, bin2hex($input));
        }
        $out = (new EvalCaseAnonymizer)->anonymize("Awa\u{200B}Diop", ['contact_nom' => 'Awa'])['input'];
        $this->assertStringNotContainsString('Awa', $out);
    }

    public function test_a_one_letter_word_is_never_a_needle(): void
    {
        $out = (new EvalCaseAnonymizer)->anonymize('M. A et B Diop', ['contact_nom' => 'A B'])['input'];

        $this->assertSame('M. A et B Diop', $out);
    }

    /** @return array<string, array{0: string, 1: string, 2: list<string>}> */
    public static function apostropheNames(): array
    {
        return [
            "N'Diaye" => ["Moussa N'Diaye", "Voir Mr N’Diaye et NDiaye et Diaye et n'diaye et N\u{02BC}Diaye", ['diaye']],
            "M'Baye" => ["Awa M'Baye", 'Mme M’Baye, MBaye, Baye, M\'BAYE', ['baye']],
            'valeur typographique' => ['Moussa N’Diaye', "Voir N'Diaye et Diaye", ['diaye']],
            'trait d\'union' => ['Jean-Pierre Ndiaye', 'Voir Pierre, Jean-Pierre et Ndiaye', ['pierre', 'ndiaye', 'jean']],
        ];
    }

    /** @param list<string> $traces */
    #[DataProvider('apostropheNames')]
    public function test_a_name_with_an_apostrophe_leaves_no_trace(string $name, string $input, array $traces): void
    {
        $out = (new EvalCaseAnonymizer)->anonymize($input, ['contact_nom' => $name])['input'];

        foreach ($traces as $trace) {
            $this->assertStringNotContainsStringIgnoringCase($trace, $out, "« $out »");
        }
    }

    public function test_invisible_characters_inside_a_name_do_not_hide_it(): void
    {
        $out = (new EvalCaseAnonymizer)->anonymize("Aw\u{200B}a Di\u{00AD}op", ['contact_nom' => 'Awa Diop'])['input'];
        $this->assertSame('[NOM]', $out);

        $out = (new EvalCaseAnonymizer)->anonymize('Voir Awa Diop', ['contact_nom' => "A\u{200D}wa\u{FEFF} Di\u{2060}op"])['input'];
        $this->assertSame('Voir [NOM]', $out);

        $out = (new EvalCaseAnonymizer)->anonymize("Appelez le 77\u{200C}123 45\u{200B}67", [])['input'];
        $this->assertSame('Appelez le [TELEPHONE]', $out);
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
            'username' => ['username', 'awa_diop', '[NOM]'],
            'user_name' => ['user_name', 'awa_diop', '[NOM]'],
            'userName' => ['userName', 'awa_diop', '[NOM]'],
            'nombre_contacts' => ['nombre_contacts', 3, 3],
            'contact_count' => ['contact_count', 3, 3],
            'contactCount' => ['contactCount', 3, 3],
            'nb_proprietaires' => ['nb_proprietaires', 2, 2],
            'contact_preferred' => ['contact_preferred', 'email', 'email'],
            'contact_prefere' => ['contact_prefere', 'email', 'email'],
            'type_vendeur' => ['type_vendeur', 'particulier', 'particulier'],
            'owner_type' => ['owner_type', 'agence', 'agence'],
            'statut_proprietaire' => ['statut_proprietaire', 'actif', 'actif'],
            'owner_status' => ['owner_status', 'actif', 'actif'],
            'nom_quartier' => ['nom_quartier', 'Mermoz', 'Mermoz'],
            'neighbourhood_name' => ['neighbourhood_name', 'Mermoz', 'Mermoz'],
            'ville_contact' => ['ville_contact', 'Dakar', 'Dakar'],
            'zone_adresse' => ['zone_adresse', 'Almadies', 'Almadies'],
            'lieu_rendez_vous_contact' => ['lieu_rendez_vous_contact', 'Plateau', 'Plateau'],
            'preferred_contact_name' => ['preferred_contact_name', 'Awa Diop', '[NOM]'],
            'owner_city_name' => ['owner_city_name', 'Awa Diop', '[NOM]'],
            'type_contact_name' => ['type_contact_name', 'Awa Diop', '[NOM]'],
            'contact_phone_type' => ['contact_phone_type', 'mobile', '[TELEPHONE]'],
            'type_telephone' => ['type_telephone', 'fixe', '[TELEPHONE]'],
            'status_owner' => ['status_owner', 'actif', 'actif'],
            'nom_ville' => ['nom_ville', 'Dakar', 'Dakar'],
            'city_name' => ['city_name', 'Dakar', 'Dakar'],
            'nom_zone' => ['nom_zone', 'Almadies', 'Almadies'],
            'nom_lieu' => ['nom_lieu', 'Plateau', 'Plateau'],
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

    /**
     * TCK-2400 — les formes partagées avec `check-ai-evals-pii.mjs`, chacune avec le jeton attendu
     * (`null` : le texte reste tel quel).
     *
     * @return array<string, array{string, ?string}>
     */
    public static function formesPartagees(): array
    {
        $formes = json_decode((string) file_get_contents(dirname(__DIR__, 2).'/fixtures/ai/donnees-personnelles.json'), true, flags: JSON_THROW_ON_ERROR);
        $cas = [];
        foreach (['telephones' => PhoneMasker::TOKEN, 'courriels' => EvalCaseAnonymizer::EMAIL_TOKEN, 'pas_personnel' => null] as $genre => $jeton) {
            foreach ($formes[$genre] as $nom => $texte) {
                $cas["{$genre} — {$nom}"] = [$texte, $jeton];
            }
        }

        return $cas;
    }

    #[DataProvider('formesPartagees')]
    public function test_every_shared_form_is_masked_and_prices_are_kept(string $texte, ?string $jeton): void
    {
        $out = (new EvalCaseAnonymizer)->anonymize("Contact : {$texte}, merci", ['prix' => 1])['input'];

        $this->assertSame('Contact : '.($jeton ?? $texte).', merci', $out);
    }
}
