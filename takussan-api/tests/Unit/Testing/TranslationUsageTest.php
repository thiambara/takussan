<?php

namespace Tests\Unit\Testing;

use PHPUnit\Framework\TestCase;
use Tests\Support\TestDirectory;
use Tests\Support\TranslationUsage;

/**
 * L'arête `lang/<locale>/<domaine>.php` → ses consommateurs (TCK-476).
 *
 * ⚠ Ces tests sont écrits dans le sens de l'OUBLI, pas de l'excès : une carte
 * d'impact qui sur-sélectionne coûte des secondes, une carte qui sous-sélectionne
 * produit un faux vert. Les deux propriétés qui comptent sont donc « le second
 * ordre trouve le Mailable » et « une prose n'est pas une consommation » — les
 * deux cas mesurés sur le dépôt réel avant d'être figés ici.
 */
class TranslationUsageTest extends TestCase
{
    private string $racine;

    protected function setUp(): void
    {
        parent::setUp();

        $this->racine = sys_get_temp_dir().'/tck476-'.bin2hex(random_bytes(6));
    }

    protected function tearDown(): void
    {
        TestDirectory::removeRecursively($this->racine);

        parent::tearDown();
    }

    private function ecrire(string $relatif, string $contenu): void
    {
        $chemin = $this->racine.'/'.$relatif;
        $dossier = dirname($chemin);

        // `@mkdir()` ne suffit PAS : le gestionnaire d'erreurs de PHPUnit ignore
        // l'opérateur de suppression et transforme le `File exists` du second appel en
        // avertissement de test.
        if (! is_dir($dossier)) {
            mkdir($dossier, 0o777, true);
        }

        file_put_contents($chemin, $contenu);
    }

    private function usage(): TranslationUsage
    {
        return new TranslationUsage($this->racine);
    }

    public function test_a_file_naming_a_key_of_the_domain_is_a_consumer(): void
    {
        $this->ecrire('app/Services/InvitationService.php', "<?php abort(404, __('invitations.errors.token_not_found'));");
        $this->ecrire('app/Services/Ailleurs.php', "<?php return __('team.title');");

        $this->assertSame(['app/Services/InvitationService.php'], $this->usage()->consumersOf('invitations'));
    }

    /**
     * La forme réelle de `BaseResource::enumLabel()` et de `SearchWolofReviewSheet` :
     * le domaine est collé au guillemet ouvrant, la clé est concaténée après.
     */
    public function test_a_dynamically_concatenated_key_is_a_consumer(): void
    {
        $this->ecrire('app/Http/Resources/PropertyResource.php', "<?php \$this->enumLabel(\$x, 'properties.type');");
        $this->ecrire('app/Console/Commands/Feuille.php', "<?php Lang::get('properties.contract_type.'.\$case->value, [], 'wo');");

        $this->assertSame(
            ['app/Console/Commands/Feuille.php', 'app/Http/Resources/PropertyResource.php'],
            $this->usage()->consumersOf('properties'),
        );
    }

    /**
     * LE test qui justifie le second ordre. Mesuré le 2026-08-30 sur le dépôt :
     * `app/Mail/InvitationMailable.php` ne cite AUCUNE clé `invitations.*` — c'est la
     * vue qu'il rend qui les porte. Une règle de premier ordre seul aurait donc laissé
     * hors sélection tous les tests qui couvrent ce Mailable.
     */
    public function test_a_view_carrying_the_keys_resolves_to_what_renders_it(): void
    {
        $this->ecrire('resources/views/emails/invitation.blade.php', "<h1>{{ __('invitations.roles.agent') }}</h1>");
        $this->ecrire('app/Mail/InvitationMailable.php', "<?php return new Content(view: 'emails.invitation');");

        $this->assertSame(
            ['app/Mail/InvitationMailable.php'],
            $this->usage()->consumersOf('invitations'),
            'la vue est REMPLACÉE par ce qui la rend : elle-même ne se situe pas dans la carte',
        );
    }

    /**
     * `emails.notifications.digest` et `emails.notifications.notification-digest`
     * coexistent dans le dépôt : le premier est un préfixe du second, et seule la
     * délimitation de fin les sépare.
     */
    public function test_a_view_name_that_prefixes_another_does_not_capture_it(): void
    {
        $this->ecrire('resources/views/emails/notifications/digest.blade.php', "{{ __('notifications.title') }}");
        $this->ecrire('app/Mail/DailyDigest.php', "<?php return new Content(markdown: 'emails.notifications.digest');");
        $this->ecrire('app/Mail/AutreDigest.php', "<?php return new Content(markdown: 'emails.notifications.notification-digest');");

        $this->assertSame(['app/Mail/DailyDigest.php'], $this->usage()->consumersOf('notifications'));
    }

    /**
     * Une vue que rien ne rend reste SOUS SON PROPRE CHEMIN — `ImpactSelector` ne sait
     * pas la situer et escalade. Le doute se rend visible, il ne se comble pas.
     */
    public function test_a_view_that_nothing_renders_stays_under_its_own_path(): void
    {
        $this->ecrire('resources/views/emails/orpheline.blade.php', "{{ __('owners.title') }}");

        $this->assertSame(['resources/views/emails/orpheline.blade.php'], $this->usage()->consumersOf('owners'));
    }

    /**
     * LA régression du 2026-08-30 : le premier balayage a fait escalader
     * `lang/en/invitations.php` sur `tests/Support/TranslationUsage.php` — c'est-à-dire
     * sur le balayeur lui-même, dont le docblock cite une clé en exemple. *Un balayage
     * naïf se prend lui-même pour un consommateur.*
     */
    public function test_a_key_named_in_a_comment_is_not_a_consumption(): void
    {
        $this->ecrire('app/Support/Prose.php', "<?php\n\n/** Exemple : __('invitations.errors.token_expired'). */\n// et aussi 'invitations.roles.agent'\nclass Prose {}\n");

        $this->assertSame([], $this->usage()->consumersOf('invitations'));
    }

    public function test_an_unknown_domain_has_no_consumer(): void
    {
        $this->ecrire('app/Support/X.php', "<?php return __('team.title');");

        $this->assertSame([], $this->usage()->consumersOf('inexistant'));
    }

    /**
     * Le domaine vient d'un chemin, donc du monde extérieur : il ne doit jamais
     * atteindre l'expression rationnelle sans contrôle.
     */
    public function test_a_domain_that_is_not_a_plain_name_yields_nothing(): void
    {
        $this->ecrire('app/Support/X.php', "<?php return __('team.title');");

        $this->assertSame([], $this->usage()->consumersOf('.*'));
        $this->assertSame([], $this->usage()->consumersOf('../../etc/passwd'));
    }
}
