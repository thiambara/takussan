<?php

namespace App\Services\Admin;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\Property;
use App\Models\User;
use App\Services\Notifications\Sms\PhoneNumber;
use App\Support\CaseInsensitive;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;

/**
 * La recherche globale de la console (TCK-600, S19).
 *
 * Par la BASE, jamais par l'index public (TCK-578) : un brouillon privé, un bien d'une agence
 * suspendue, un compte bloqué doivent se trouver. Ce que la saisie reconnaît se cherche par
 * ÉGALITÉ — e-mail, téléphone (normalisé E.164, `77 123 45 67` → `+221771234567`), référence,
 * identifiant de transaction, NINEA — et passe en tête ; le texte libre (3 caractères au moins)
 * se cherche par `CaseInsensitive`, jamais par `like` nu (piège n°9 : « diop » ne trouvait pas
 * « Diop »). Cinq résultats au plus par type.
 *
 * ⚠ Aucune colonne chiffrée n'y entre (coordination TCK-601) : ni RIB, ni pièce du bailleur, ni
 * `agency_upgrade_requests.ninea` (chiffrée par 601). Le NINEA se cherche dans
 * `agencies.metadata->legal_info`, en clair.
 *
 * Raccord TCK-601 : quand `PersonalDataAccessLogger` sera fusionné, chaque compte rendu ici se
 * trace par `record($operateur, $user, PersonalDataAccessLogger::SURFACE_GLOBAL_SEARCH)` — celui des
 * deux tickets qui fusionne en second ajoute l'appel (voir `search()`).
 */
class AdminGlobalSearchService
{
    public const PER_TYPE = 5;

    public const FREE_TEXT_MIN = 3;

    /**
     * @return list<array{type:string,id:int,label:string,sublabel:?string,agency:?array{id:int,name:string},url:?string}>
     */
    public function search(string $q): array
    {
        $q = trim($q);
        $exact = collect()
            ->concat($this->byEmail($q))
            ->concat($this->byPhone($q))
            ->concat($this->byToken($q));

        $free = mb_strlen($q) >= self::FREE_TEXT_MIN ? $this->byFreeText($q) : collect();

        // Les correspondances exactes d'abord ; un même objet n'apparaît qu'une fois.
        return $exact->concat($free)
            ->unique(fn (array $hit) => $hit['type'].':'.$hit['id'])
            ->groupBy('type')
            ->flatMap(fn (Collection $hits) => $hits->take(self::PER_TYPE))
            ->sortBy(fn (array $hit) => $exact->contains(fn (array $e) => $e['type'] === $hit['type'] && $e['id'] === $hit['id']) ? 0 : 1)
            ->values()
            ->all();
    }

    /** @return Collection<int,array<string,mixed>> */
    private function byEmail(string $q): Collection
    {
        if (filter_var($q, FILTER_VALIDATE_EMAIL) === false) {
            return collect();
        }
        $folded = CaseInsensitive::fold($q);

        return $this->users(User::query()->whereRaw(CaseInsensitive::sql('email').' = ?', [$folded]))
            ->concat($this->agencies(Agency::query()->whereRaw(CaseInsensitive::sql('email').' = ?', [$folded])));
    }

    /** @return Collection<int,array<string,mixed>> */
    private function byPhone(string $q): Collection
    {
        $phone = self::phoneCandidate($q);
        if ($phone === null) {
            return collect();
        }

        return $this->users(User::query()->where('phone', $phone))
            ->concat($this->agencies(Agency::query()->where('phone', $phone)));
    }

    /**
     * Une saisie d'un seul tenant, avec un chiffre : référence, identifiant de transaction, NINEA.
     *
     * @return Collection<int,array<string,mixed>>
     */
    private function byToken(string $q): Collection
    {
        if (preg_match('/^[\w.\-\/]{4,}$/u', $q) !== 1 || preg_match('/\d/', $q) !== 1) {
            return collect();
        }
        $forms = array_values(array_unique([$q, mb_strtoupper($q)]));
        $ninea = preg_replace('/\s+/', '', $q);

        return collect()
            ->concat($this->properties(Property::query()->whereIn('reference_number', $forms)))
            ->concat($this->bookings(Booking::query()->whereIn('reference_number', $forms)))
            ->concat($this->leases(Lease::query()->whereIn('reference_number', $forms)))
            ->concat($this->invoices(Invoice::query()->where(fn (Builder $w) => $w->whereIn('reference_number', $forms)->orWhereIn('transaction_id', $forms))))
            ->concat($this->bookingPayments(BookingPayment::query()->where(fn (Builder $w) => $w->whereIn('reference_number', $forms)->orWhereIn('transaction_id', $forms))))
            ->concat($this->leasePayments(LeasePayment::query()->where(fn (Builder $w) => $w->whereIn('reference_number', $forms)->orWhereIn('transaction_id', $forms))))
            ->concat($this->payouts(Payout::query()->where(fn (Builder $w) => $w->whereIn('reference_number', $forms)->orWhereIn('transaction_id', $forms))))
            ->concat($this->agencies(Agency::query()->whereRaw("metadata->'legal_info'->>'ninea' = ?", [$ninea])));
    }

    /** @return Collection<int,array<string,mixed>> */
    private function byFreeText(string $q): Collection
    {
        $words = array_values(array_filter(preg_split('/\s+/u', CaseInsensitive::fold($q)) ?: []));
        $like = fn (string $word): string => '%'.addcslashes($word, '\\%_').'%';

        $users = User::query();
        foreach ($words as $word) {
            $users->where(function (Builder $w) use ($word, $like): void {
                foreach (['first_name', 'last_name', 'email', 'username'] as $column) {
                    $w->orWhereRaw(CaseInsensitive::sql($column).' like ?', [$like($word)]);
                }
            });
        }

        $phrase = $like(CaseInsensitive::fold($q));

        return $this->users($users)
            ->concat($this->agencies(Agency::query()->where(fn (Builder $w) => $w
                ->whereRaw(CaseInsensitive::sql('name').' like ?', [$phrase])
                ->orWhereRaw(CaseInsensitive::sql('slug').' like ?', [$phrase]))))
            ->concat($this->properties(Property::query()->whereRaw(CaseInsensitive::sql('title').' like ?', [$phrase])));
    }

    /**
     * `77 123 45 67`, `+221 77 123 45 67`, `00221771234567`, `221771234567` → `+221771234567` ;
     * `null` si la saisie n'a pas la forme d'un numéro.
     */
    public static function phoneCandidate(string $q): ?string
    {
        $compact = preg_replace('/[\s.\-()]/', '', $q) ?? $q;
        $candidate = match (true) {
            preg_match('/^[37]\d{8}$/', $compact) === 1 => '+221'.$compact,
            preg_match('/^221[37]\d{8}$/', $compact) === 1 => '+'.$compact,
            str_starts_with($compact, '00') => '+'.substr($compact, 2),
            str_starts_with($compact, '+') => $compact,
            default => null,
        };
        if ($candidate === null) {
            return null;
        }

        try {
            return PhoneNumber::normalize($candidate);
        } catch (\InvalidArgumentException) {
            return null;
        }
    }

    /** @return Collection<int,array<string,mixed>> */
    private function users(Builder $query): Collection
    {
        return $query->limit(self::PER_TYPE)->get(['id', 'first_name', 'last_name', 'email'])
            ->map(fn (User $u) => $this->hit('user', $u, $u->full_name ?: $u->email, $u->email, null, "/super-admin/users/{$u->id}"));
    }

    /** @return Collection<int,array<string,mixed>> */
    private function agencies(Builder $query): Collection
    {
        return $query->limit(self::PER_TYPE)->get(['id', 'name', 'slug'])
            ->map(fn (Agency $a) => $this->hit('agency', $a, $a->name, $a->slug, $a, "/super-admin/agencies/{$a->id}"));
    }

    /** @return Collection<int,array<string,mixed>> */
    private function properties(Builder $query): Collection
    {
        return $query->with('agency:id,name')->limit(self::PER_TYPE)->get(['id', 'title', 'reference_number', 'agency_id'])
            ->map(fn (Property $p) => $this->hit('property', $p, (string) $p->title, $p->reference_number, $p->agency, $this->agencyUrl($p->agency_id)));
    }

    /** @return Collection<int,array<string,mixed>> */
    private function bookings(Builder $query): Collection
    {
        return $query->with('agency:id,name')->limit(self::PER_TYPE)->get(['id', 'reference_number', 'agency_id'])
            ->map(fn (Booking $b) => $this->hit('booking', $b, (string) $b->reference_number, null, $b->agency, $this->agencyUrl($b->agency_id)));
    }

    /** @return Collection<int,array<string,mixed>> */
    private function leases(Builder $query): Collection
    {
        return $query->with('agency:id,name')->limit(self::PER_TYPE)->get(['id', 'reference_number', 'agency_id'])
            ->map(fn (Lease $l) => $this->hit('lease', $l, (string) $l->reference_number, null, $l->agency, $this->agencyUrl($l->agency_id)));
    }

    /** @return Collection<int,array<string,mixed>> */
    private function invoices(Builder $query): Collection
    {
        return $query->with('agency:id,name')->limit(self::PER_TYPE)->get(['id', 'reference_number', 'transaction_id', 'agency_id'])
            ->map(fn (Invoice $i) => $this->hit('invoice', $i, (string) $i->reference_number, $i->transaction_id, $i->agency, $this->agencyUrl($i->agency_id)));
    }

    /** @return Collection<int,array<string,mixed>> */
    private function bookingPayments(Builder $query): Collection
    {
        return $query->with('booking.agency:id,name')->limit(self::PER_TYPE)->get(['id', 'reference_number', 'transaction_id', 'booking_id'])
            ->map(fn (BookingPayment $p) => $this->hit('payment', $p, (string) ($p->reference_number ?? $p->transaction_id), $p->transaction_id, $p->booking?->agency, $this->agencyUrl($p->booking?->agency_id)));
    }

    /** @return Collection<int,array<string,mixed>> */
    private function leasePayments(Builder $query): Collection
    {
        return $query->with('lease.agency:id,name')->limit(self::PER_TYPE)->get(['id', 'reference_number', 'transaction_id', 'lease_id'])
            ->map(fn (LeasePayment $p) => $this->hit('payment', $p, (string) ($p->reference_number ?? $p->transaction_id), $p->transaction_id, $p->lease?->agency, $this->agencyUrl($p->lease?->agency_id)));
    }

    /** @return Collection<int,array<string,mixed>> */
    private function payouts(Builder $query): Collection
    {
        return $query->with('agency:id,name')->limit(self::PER_TYPE)->get(['id', 'reference_number', 'transaction_id', 'agency_id'])
            ->map(fn (Payout $p) => $this->hit('payout', $p, (string) ($p->reference_number ?? $p->transaction_id), $p->transaction_id, $p->agency, $this->agencyUrl($p->agency_id)));
    }

    private function agencyUrl(?int $agencyId): ?string
    {
        return $agencyId === null ? null : "/super-admin/agencies/{$agencyId}";
    }

    /**
     * @return array{type:string,id:int,label:string,sublabel:?string,agency:?array{id:int,name:string},url:?string}
     */
    private function hit(string $type, Model $model, string $label, ?string $sublabel, ?Agency $agency, ?string $url): array
    {
        return [
            'type' => $type,
            'id' => (int) $model->getKey(),
            'label' => $label,
            'sublabel' => $sublabel,
            'agency' => $agency === null ? null : ['id' => (int) $agency->id, 'name' => (string) $agency->name],
            'url' => $url,
        ];
    }
}
