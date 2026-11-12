<?php

namespace App\Services\Crm;

use App\Models\Customer;
use App\Models\User;
use App\Services\Notifications\Sms\PhoneNumber;
use App\Support\AdvisoryLock;
use App\Support\CaseInsensitive;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;

/**
 * TCK-591 — un client existe-t-il déjà dans cette agence, au même téléphone normalisé ou au même
 * e-mail replié ?
 *
 * Les deux requêtes écrivent exactement les expressions des index `customers_agency_phone_idx` et
 * `customers_agency_email_ci_idx` (ADR-0025) — une expression différente ne les emprunterait pas.
 *
 * Le résultat ne nomme que les fiches que l'appelant a le droit de voir : à un agent sans
 * `crm.view_all`, le doublon d'un collègue se signale sans livrer son nom.
 */
class CustomerDuplicateDetector
{
    /** TCK-2054 (ADR-0073 § 2) — l'espace de nom du verrou de création d'une fiche client. */
    public const LOCK_NAMESPACE = 'crm.customer';

    /**
     * TCK-2590 — le préfixe national le plus court que la sonde compare. En deçà, trop de fiches le
     * partagent pour que la réponse dise quelque chose de la personne saisie ; le front applique le
     * même seuil (`CHIFFRES_MIN_DU_PREFIXE`).
     */
    public const PROBE_PREFIX_MIN_DIGITS = 7;

    /** Cinq fiches au plus, à la sonde comme au 409 de la création. */
    private const MAX_MATCHES = 5;

    /**
     * TCK-2054 (ADR-0073) — sérialise la détection d'un doublon et la création d'une fiche : verrou
     * consultatif transactionnel de clé `(agence, téléphone canonique)`, ou `(agence, e-mail replié)`
     * quand le téléphone manque — les valeurs mêmes que {@see find()} compare. À appeler dans la
     * transaction qui couvre la détection ET la création, après ses verrous de ligne.
     *
     * Sans agence, ou sans téléphone ni e-mail, rien : le détecteur ne cherche rien non plus.
     */
    public static function lockCreation(?int $agencyId, ?string $phone, ?string $email): void
    {
        $parts = self::lockParts($agencyId, $phone, $email);
        if ($parts !== null) {
            AdvisoryLock::acquire(self::LOCK_NAMESPACE, ...$parts);
        }
    }

    /** @return list<string>|null les parties de la clé, `null` quand il n'y a rien à verrouiller */
    public static function lockParts(?int $agencyId, ?string $phone, ?string $email): ?array
    {
        if ($agencyId === null) {
            return null;
        }

        $phone = CustomerPhoneNormalizer::normalize($phone);
        if ($phone !== null) {
            return [(string) $agencyId, 'tel', $phone];
        }

        $email = $email !== null && trim($email) !== '' ? CaseInsensitive::fold(trim($email)) : null;

        return $email !== null ? [(string) $agencyId, 'email', $email] : null;
    }

    /**
     * @return list<array{id: ?int, name: ?string, stage: ?string, matched_on: string}>
     */
    public function find(?int $agencyId, ?string $phone, ?string $email, User $viewer, ?int $ignoreId = null): array
    {
        if ($agencyId === null) {
            return [];
        }

        $phone = CustomerPhoneNormalizer::normalize($phone);
        $email = $email !== null && trim($email) !== '' ? CaseInsensitive::fold(trim($email)) : null;
        if ($phone === null && $email === null) {
            return [];
        }

        $matches = Customer::query()
            ->where('agency_id', $agencyId)
            ->when($ignoreId !== null, fn (Builder $q) => $q->whereKeyNot($ignoreId))
            ->where(function (Builder $q) use ($phone, $email) {
                if ($phone !== null) {
                    $q->orWhere('phone', $phone);
                }
                if ($email !== null) {
                    $q->orWhereRaw(CaseInsensitive::sql('email').' = ?', [$email]);
                }
            })
            ->orderBy('id')
            ->limit(self::MAX_MATCHES)
            ->get();

        return $this->present($matches, $viewer, fn (Customer $c) => $phone !== null && $c->phone === $phone);
    }

    /**
     * TCK-2590 — la sonde PENDANT la saisie (`GET /api/customers/duplicates`) : comme {@see find()},
     * et de plus un numéro sénégalais ENTAMÉ — sept ou huit chiffres nationaux — se compare par
     * préfixe (`phone LIKE '+2217064820%'`), pour que « 70 648 20 » montre déjà la fiche.
     *
     * Le périmètre ne change pas : l'agence active seule, cinq fiches au plus. Le signalement masqué
     * (tout à `null`) ne vaut qu'à l'ÉGALITÉ — numéro complet ou e-mail, comme avant TCK-2590 : il
     * faut connaître le numéro entier pour apprendre qu'une fiche cachée le porte. Sous un préfixe,
     * seules les fiches que l'appelant lit reviennent ; sinon la sonde, allongée d'un chiffre à la
     * fois, rendrait le numéro d'une fiche qu'il ne peut pas ouvrir (constat de vérification de
     * TCK-2590 : seize appels, sous le limiteur de vingt par minute).
     * Un numéro trop court, ou qui n'est ni complet ni sénégalais, ne sonde rien.
     * La création (`find()`, 409) garde l'égalité stricte : un préfixe n'y désigne personne.
     *
     * @return list<array{id: ?int, name: ?string, stage: ?string, matched_on: string}>
     */
    public function probe(?int $agencyId, ?string $phone, ?string $email, User $viewer): array
    {
        if ($agencyId === null) {
            return [];
        }

        // Le préfixe d'abord : « +2217064820 » a la FORME d'un E.164 (`PhoneNumber::isValid` ne
        // compte pas les chiffres nationaux), mais ce n'est le numéro complet de personne.
        $prefix = self::senegalPrefix($phone);
        $normalized = $prefix === null ? CustomerPhoneNormalizer::normalize($phone) : null;
        $complete = $normalized !== null && PhoneNumber::isValid($normalized) ? $normalized : null;
        $email = $email !== null && trim($email) !== '' ? CaseInsensitive::fold(trim($email)) : null;
        if ($complete === null && $prefix === null && $email === null) {
            return [];
        }

        $matches = Customer::query()
            ->where('agency_id', $agencyId)
            ->where(function (Builder $q) use ($complete, $prefix, $email, $viewer) {
                if ($complete !== null) {
                    $q->orWhere('phone', $complete);
                }
                if ($prefix !== null) {
                    // Des chiffres seulement (`senegalPrefix`) : aucun joker à échapper. Sous
                    // `--locale=C`, un préfixe `LIKE` emprunte l'index `customers_agency_phone_idx`.
                    if (preg_match('/^\+221[0-9]{7,8}$/', $prefix) !== 1) {
                        throw new \LogicException('préfixe de sonde hors de sa forme');
                    }
                    // Sous un préfixe, les seules fiches que l'appelant LIT, à la règle de la liste
                    // (`visibleTo`) : masquée, la réponse ferait un oracle qui, chiffre à chiffre,
                    // reconstitue le numéro d'une fiche cachée. Filtré DANS la requête, pour que les
                    // fiches cachées n'occupent pas les cinq places de la limite.
                    $q->orWhere(fn (Builder $p) => $p->where('phone', 'like', $prefix.'%')->visibleTo($viewer));
                }
                if ($email !== null) {
                    $q->orWhereRaw(CaseInsensitive::sql('email').' = ?', [$email]);
                }
            })
            ->orderBy('id')
            ->limit(self::MAX_MATCHES)
            ->get();

        return $this->present($matches, $viewer, fn (Customer $c) => ($complete !== null && $c->phone === $complete)
            || ($prefix !== null && str_starts_with((string) $c->phone, $prefix)));
    }

    /**
     * `+221` suivi des chiffres nationaux saisis, quand il y en a sept ou huit (neuf : le numéro est
     * complet, et {@see CustomerPhoneNormalizer} le rend) ; `null` sinon. Accepte « 70 648 20 »,
     * « +221 70 648 20 », « 00221 70 648 20 » — et un « + » d'URL décodé en espace.
     */
    private static function senegalPrefix(?string $raw): ?string
    {
        // Une saisie qui porte autre chose que l'alphabet d'un numéro (chiffres, espaces, « + », « . »,
        // « - », parenthèses) n'est pas un numéro entamé : `%` et `_`, jokers de `LIKE`, ne sont pas
        // « nettoyés » en préfixe — ils font renoncer au préfixe.
        if (preg_match('/^[\d\s+().\-]*$/', (string) $raw) !== 1) {
            return null;
        }
        $digits = preg_replace('/\D+/', '', (string) $raw) ?? '';
        if (str_starts_with($digits, '00')) {
            $digits = substr($digits, 2);
        }
        // Un numéro national sénégalais commence par 7 ou 3, jamais par 221 : l'indicatif se retire sans ambiguïté.
        if (str_starts_with($digits, '221')) {
            $digits = substr($digits, 3);
        }

        $min = self::PROBE_PREFIX_MIN_DIGITS;

        // Le motif `LIKE` ne se bâtit que de ce préfixe : « +221 » et sept ou huit chiffres, rien d'autre.
        return preg_match('/^[37][0-9]{'.($min - 1).',7}$/', $digits) === 1 ? '+221'.$digits : null;
    }

    /**
     * @param  Collection<int, Customer>  $matches
     * @param  callable(Customer): bool  $phoneMatched
     * @return list<array{id: ?int, name: ?string, stage: ?string, matched_on: string}>
     */
    private function present(Collection $matches, User $viewer, callable $phoneMatched): array
    {
        return $matches->map(function (Customer $c) use ($viewer, $phoneMatched) {
            $visible = $viewer->can('view', $c);

            return [
                'id' => $visible ? $c->id : null,
                'name' => $visible ? $c->getFullNameAttribute() : null,
                // TCK-2588 — l'étape, pour la sonde pendant la saisie ; masquée comme le nom.
                'stage' => $visible ? $c->pipeline_stage?->value : null,
                'matched_on' => $phoneMatched($c) ? 'phone' : 'email',
            ];
        })->values()->all();
    }
}
