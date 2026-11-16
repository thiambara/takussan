<?php

namespace Tests\Feature\Architecture;

use App\Services\Auth\AccountTokenRevoker;
use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

/**
 * TCK-617 AC3 — toute suppression de jetons Sanctum passe par {@see AccountTokenRevoker}, qui coupe
 * aussi les liens d'agenda (décision du porteur, 2026-11-16 : TOUS les gestes de révocation).
 *
 * Lit le CODE de `app/` (commentaires retirés, blancs repliés, découpé en instructions) et rougit sur
 * une instruction qui supprime des jetons hors du point commun :
 *  - une chaîne `->tokens()… ->delete()` (relation Sanctum du compte) ;
 *  - une chaîne `PersonalAccessToken::… ->delete()`, ou un `$jeton->delete()` dont la variable vient
 *    de `PersonalAccessToken::` ;
 *  - `currentAccessToken()->delete()` ;
 *  - un `$q->delete()` dont la variable a été tirée de `->tokens()`.
 * Le grep du ticket (`tokens()->delete|tokens()->where`) ne voyait ni `PersonalAccessToken::query()`
 * (la révocation d'une session par le support) ni la requête mise en variable (`revokeSessions`).
 *
 * `EXEMPTES` est une liste FERMÉE, chaque entrée avec son motif ; une entrée qui ne supprime plus
 * rien en sort (la garde rougit aussi).
 */
class AccountTokenRevokerGuardTest extends TestCase
{
    /** @var array<string, string> chemin relatif à `app/` => motif */
    private const EXEMPTES = [
        'Services/Auth/AccountTokenRevoker.php' => 'le point commun lui-même',
        'Http/Controllers/Api/Auth/AuthController.php' => "la déconnexion : le titulaire ferme SA session, ce n'est pas une révocation",
        'Console/Commands/PruneIdleSessionTokens.php' => "l'expiration par inactivité : un jeton échu n'est pas un geste de révocation (aucun signal de vol), et le lien d'agenda a son propre cycle",
        'Services/Admin/ImpersonationService.php' => "la fin d'une impersonation : session en lecture seule (ADR-0055 § 3), qui ne peut créer aucun lien d'agenda — `EnforceImpersonationReadOnly` refuse le POST `me/calendar-feed`",
    ];

    public function test_every_token_deletion_goes_through_the_common_point(): void
    {
        $offenders = [];
        $seen = [];
        foreach ($this->phpFiles() as $relative => $path) {
            $hits = self::deletions((string) file_get_contents($path));
            if ($hits === []) {
                continue;
            }
            $seen[$relative] = true;
            if (! array_key_exists($relative, self::EXEMPTES)) {
                $offenders[] = $relative.' : '.implode(' | ', $hits);
            }
        }

        $this->assertSame([], $offenders, "Suppression de jetons hors d'AccountTokenRevoker (les liens d'agenda survivraient) :\n".implode("\n", $offenders));
        $this->assertSame([], array_values(array_diff(array_keys(self::EXEMPTES), array_keys($seen))), 'Exemption périmée : le fichier ne supprime plus de jetons.');
    }

    /** La garde voit bien les quatre formes (sinon elle serait verte sur tout). */
    public function test_the_guard_sees_each_form(): void
    {
        $forms = [
            '<?php $user->tokens()->delete();',
            "<?php \$user->tokens()\n    ->where('id', 3)\n    ->delete();",
            '<?php PersonalAccessToken::query()->whereKey(1)->delete();',
            '<?php $t = PersonalAccessToken::query()->whereKey(1)->firstOrFail(); $t->delete();',
            '<?php $request->user()->currentAccessToken()->delete();',
            "<?php \$q = \$target->tokens(); if (\$x) { \$q->where('id', '!=', 1); } \$n = \$q->delete();",
        ];
        foreach ($forms as $code) {
            $this->assertNotSame([], self::deletions($code), $code);
        }

        foreach ([
            '<?php // $user->tokens()->delete();',
            '<?php $user->tokens()->exists(); $other->delete();',
            '<?php $tokens = $user->tokens()->orderBy("id")->get();',
        ] as $innocent) {
            $this->assertSame([], self::deletions($innocent), $innocent);
        }
    }

    /** @return list<string> les instructions qui suppriment des jetons */
    private static function deletions(string $source): array
    {
        $code = '';
        foreach (\PhpToken::tokenize($source) as $token) {
            if ($token->is([T_COMMENT, T_DOC_COMMENT, T_OPEN_TAG])) {
                continue;
            }
            $code .= $token->is(T_WHITESPACE) ? ' ' : $token->text;
        }
        $code = (string) preg_replace('/\s*(->|\?->)\s*/', '$1', $code);

        $hits = [];
        $tainted = [];
        foreach (explode(';', $code) as $statement) {
            $statement = trim((string) preg_replace('/\s+/', ' ', $statement));
            $fromTokens = str_contains($statement, '->tokens()') || str_contains($statement, 'PersonalAccessToken::');
            $deletes = (bool) preg_match('/\??->delete\(\)/', $statement);

            if (preg_match('/^(?:.*[{}]\s*)?(\$\w+)\s*=\s*[^=]/', $statement, $m) === 1) {
                if ($fromTokens && ! $deletes) {
                    $tainted[$m[1]] = true;
                } else {
                    unset($tainted[$m[1]]);
                }
            }

            $viaVariable = false;
            foreach (array_keys($tainted) as $var) {
                if (preg_match('/'.preg_quote($var, '/').'\??->(?:\w+\([^;]*\)\??->)*delete\(\)/', $statement) === 1) {
                    $viaVariable = true;
                }
            }

            if (($fromTokens && $deletes) || $viaVariable || preg_match('/currentAccessToken\(\)\??->delete\(\)/', $statement) === 1) {
                $hits[] = mb_substr($statement, 0, 120);
            }
        }

        return $hits;
    }

    /** @return iterable<string, string> */
    private function phpFiles(): iterable
    {
        $root = dirname(__DIR__, 3).'/app';
        $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, RecursiveDirectoryIterator::SKIP_DOTS));
        foreach ($files as $file) {
            if ($file->getExtension() === 'php') {
                yield substr($file->getPathname(), strlen($root) + 1) => $file->getPathname();
            }
        }
    }
}
