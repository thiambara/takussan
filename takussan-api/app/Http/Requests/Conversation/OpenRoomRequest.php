<?php

namespace App\Http\Requests\Conversation;

use App\Http\Requests\BaseFormRequest;
use App\Models\Booking;
use App\Models\Lease;
use App\Services\Messaging\SallesDuFil;
use App\Services\Messaging\SujetsDuFil;
use Illuminate\Validation\Rule;

/**
 * TCK-2960 (ADR-0128 § 2) — `POST /api/conversations/rooms` `{subject_type, subject_id}` : ouvrir la
 * salle d'un bail ou d'une réservation depuis sa fiche.
 *
 * `authorize()` court AVANT les règles. Un `subject_type` hors des types à salle (`maintenance_request`, un
 * type hors registre) ou un `subject_id` mal formé passent, et les règles les refusent en 422 — sans cela,
 * `SujetsDuFil::resoudre` lèverait sur un type inconnu (500). Une demande BIEN FORMÉE dont l'objet est
 * absent ou supprimé reçoit le refus (403), comme l'objet d'un tiers : la route ne dit pas quels baux et
 * quelles réservations existent (règle de TCK-1070, `LeaseContextExistenceOracleTest`). Un objet résolu est
 * jugé par sa politique (`SujetsDuFil::peutLire`).
 */
class OpenRoomRequest extends BaseFormRequest
{
    private Lease|Booking|null $objet = null;

    private bool $resolu = false;

    public function authorize(): bool
    {
        if ($this->user() === null) {
            return false;
        }
        if (! $this->bienFormee()) {
            return true;
        }

        $objet = $this->objet();

        return $objet !== null && SujetsDuFil::peutLire($this->user(), $objet);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'subject_type' => ['required', 'string', Rule::in(array_values(array_intersect(SallesDuFil::typesAvecSalle(), SujetsDuFil::typesSujets())))],
            'subject_id' => ['required', 'integer', 'min:1'],
        ];
    }

    /** Un type à salle et un identifiant entier positif : ce que les règles accepteront. */
    private function bienFormee(): bool
    {
        return in_array($this->input('subject_type'), SallesDuFil::typesAvecSalle(), true)
            && filter_var($this->input('subject_id'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) !== false;
    }

    /** L'objet vivant (non supprimé) que la requête désigne, ou `null`. */
    public function objet(): Lease|Booking|null
    {
        if ($this->resolu) {
            return $this->objet;
        }
        $this->resolu = true;

        if (! $this->bienFormee()) {
            return null;
        }

        $objet = SujetsDuFil::resoudre((string) $this->input('subject_type'), (int) $this->input('subject_id'));

        return $this->objet = ($objet instanceof Lease || $objet instanceof Booking) && ! $objet->trashed() ? $objet : null;
    }
}
