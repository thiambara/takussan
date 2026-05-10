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
 */
class CreateSuperAdmin extends Command
{
    protected $signature = 'takussan:create-super-admin
        {--email= : Email address of the super-admin}
        {--password= : Password (12+ chars, mixed case, digit, symbol)}
        {--first-name= : First name}
        {--last-name= : Last name}
        {--locale=fr : Preferred locale (fr/en/wo)}';

    protected $description = 'Bootstrap the first super-admin (creates user, 2FA, role, activity log).';

    public function __construct(private readonly SuperAdminBootstrapService $service)
    {
        parent::__construct();
    }

    public function handle(): int
    {
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
