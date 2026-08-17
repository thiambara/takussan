<?php

namespace App\Console\Commands;

use App\Services\Auth\SuperAdminBootstrapService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;
use Throwable;

/**
 * TCK-263 — provision the very first super-admin on a fresh
 * environment without going through the UI or hand-editing the DB.
 *
 * Two modes:
 *   - **Interactive** (default): prompts for every field, retries on
 *     validation failure.
 *   - **Non-interactive** (`--no-interaction`): all fields must be
 *     passed as flags; missing or invalid input fails fast.
 *
 * On success the 8 plain-text recovery codes are printed once — they
 * are hashed before persistence and cannot be recovered later.
 *
 * TCK-309 — la commande s'appelait `takussan:create-super-admin`, seul
 * usage du préfixe `takussan:` sur 16 commandes maison. Les 15 autres
 * portent un préfixe de DOMAINE (`media:`, `invitations:`, `sms:`…), et
 * le domaine de celle-ci est `platform:` — celui que porte déjà sa
 * jumelle `platform:grant-super-admin`. Deux préfixes plateforme
 * concurrents, c'est un choix à refaire à chaque nouvelle commande, donc
 * un désordre qui se reproduit (ardoise D-38).
 *
 * ⚠ L'ANCIEN NOM RESTE UN ALIAS, et ce n'est pas de la prudence : il est
 * cité dans `docs/features.md` (§2.1) et dans la spec d'onboarding du
 * 2026-05-10, deux documents dont ce ticket n'a pas le droit de changer
 * une ligne. *Renommer une commande qu'un document de référence prescrit,
 * c'est fabriquer une panne pour le jour de l'installation.* L'alias
 * fonctionne à l'identique et AVERTIT à chaque invocation ; il se retire
 * quand `docs/features.md` aura été mis à jour par une passe de spec.
 */
class CreateSuperAdmin extends Command
{
    protected $signature = 'platform:create-super-admin
        {--email= : Email address of the super-admin}
        {--password= : Password (12+ chars, mixed case, digit, symbol)}
        {--first-name= : First name}
        {--last-name= : Last name}
        {--locale=fr : Preferred locale (fr/en/wo)}';

    /**
     * Alias DÉPRÉCIÉ (TCK-309) — ex-nom canonique, conservé le temps que
     * `docs/features.md` cesse de le prescrire. `scripts/check-command-prefixes.mjs`
     * le tolère ICI et nulle part ailleurs : un `takussan:` en `$signature`
     * casse la CI.
     */
    protected $aliases = ['takussan:create-super-admin'];

    protected $description = 'Bootstrap the first super-admin (creates user, 2FA, role, activity log).';

    public function __construct(private readonly SuperAdminBootstrapService $service)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $this->warnIfInvokedByDeprecatedAlias();

        $interactive = ! $this->option('no-interaction');

        try {
            $data = $interactive
                ? $this->collectInteractive()
                : $this->collectFromOptions();
        } catch (Throwable $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        try {
            $result = $this->service->bootstrap($data, source: 'artisan');
        } catch (Throwable $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->renderSuccess($result['user']->email, $result['recovery_codes']);

        return self::SUCCESS;
    }

    /**
     * TCK-309 — un alias déprécié qui ne le dit pas ne se retire jamais :
     * personne n'apprend qu'il l'est. Symfony passe le nom RÉELLEMENT tapé
     * en `argv[1]`, c'est le seul endroit où l'on peut le lire.
     */
    private function warnIfInvokedByDeprecatedAlias(): void
    {
        $invoque = (string) ($_SERVER['argv'][1] ?? '');

        if (in_array($invoque, $this->aliases, true)) {
            $this->warn(
                "⚠  « {$invoque} » est DÉPRÉCIÉ depuis TCK-309 — utiliser « {$this->getName()} ».",
            );
            $this->warn('   L\'alias fonctionne à l\'identique, et disparaîtra.');
            $this->newLine();
        }
    }

    /**
     * @return array{email:string,password:string,first_name:string,last_name:string,locale:string}
     */
    private function collectInteractive(): array
    {
        $email = $this->askValidated(
            'Email',
            $this->option('email'),
            ['required', 'email:filter', 'unique:users,email'],
        );

        $password = $this->askValidated(
            'Password (12+ chars, 1 upper, 1 lower, 1 digit, 1 special)',
            $this->option('password'),
            ['required', 'string', $this->passwordRule()],
            secret: true,
        );

        $firstName = $this->askValidated(
            'First name',
            $this->option('first-name'),
            ['required', 'string', 'max:255'],
        );

        $lastName = $this->askValidated(
            'Last name',
            $this->option('last-name'),
            ['required', 'string', 'max:255'],
        );

        $locale = $this->askValidated(
            'Locale (fr/en/wo)',
            $this->option('locale') ?: 'fr',
            ['required', 'in:fr,en,wo'],
        );

        return [
            'email' => $email,
            'password' => $password,
            'first_name' => $firstName,
            'last_name' => $lastName,
            'locale' => $locale,
        ];
    }

    /**
     * @return array{email:string,password:string,first_name:string,last_name:string,locale:string}
     */
    private function collectFromOptions(): array
    {
        $data = [
            'email' => (string) $this->option('email'),
            'password' => (string) $this->option('password'),
            'first_name' => (string) $this->option('first-name'),
            'last_name' => (string) $this->option('last-name'),
            'locale' => (string) ($this->option('locale') ?: 'fr'),
        ];

        $validator = Validator::make($data, [
            'email' => ['required', 'email:filter', 'unique:users,email'],
            'password' => ['required', 'string', $this->passwordRule()],
            'first_name' => ['required', 'string', 'max:255'],
            'last_name' => ['required', 'string', 'max:255'],
            'locale' => ['required', 'in:fr,en,wo'],
        ]);

        if ($validator->fails()) {
            $messages = collect($validator->errors()->all())->implode("\n  - ");
            throw new \RuntimeException(
                "Invalid input — every field must be passed as a flag in --no-interaction mode:\n  - ".$messages,
            );
        }

        return $data;
    }

    /**
     * Prompt + validate loop. Reuses a value pre-supplied via flag (e.g.
     * partial CLI input under interactive mode) before falling back to
     * an actual prompt. Keeps re-asking until validation passes.
     *
     * @param  array<int,mixed>  $rules
     */
    private function askValidated(string $label, ?string $preset, array $rules, bool $secret = false): string
    {
        $value = $preset;

        while (true) {
            if ($value === null || $value === '') {
                $value = $secret ? $this->secret($label) : $this->ask($label);
            }

            $validator = Validator::make(
                ['field' => $value],
                ['field' => $rules],
            );

            if (! $validator->fails()) {
                return (string) $value;
            }

            foreach ($validator->errors()->all() as $msg) {
                $this->error($msg);
            }
            $value = null;
        }
    }

    private function passwordRule(): Password
    {
        return Password::min(12)->mixedCase()->numbers()->symbols();
    }

    /**
     * @param  array<int,string>  $recoveryCodes
     */
    private function renderSuccess(string $email, array $recoveryCodes): void
    {
        $this->newLine();
        $this->info("Super-admin {$email} created successfully.");
        $this->newLine();

        $this->warn('================================================================');
        $this->warn(' STORE THESE RECOVERY CODES NOW — THEY WILL NOT BE SHOWN AGAIN. ');
        $this->warn('================================================================');
        $this->newLine();

        $this->table(
            ['#', 'Recovery code'],
            collect($recoveryCodes)
                ->map(fn (string $code, int $i) => [$i + 1, $code])
                ->all(),
        );

        $this->newLine();
        $this->line(' • 2FA TOTP secret has been provisioned and enabled.');
        $this->line(' • Force-2FA-at-first-login flag is set; the operator will be');
        $this->line('   prompted to confirm a fresh authenticator app on first login.');
    }
}
