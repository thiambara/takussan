<?php

namespace App\Services\Visit;

use App\Models\Customer;
use App\Models\CustomerNote;
use App\Models\Enums\CustomerNoteKind;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\VisitReportOutcome;
use App\Models\Enums\VisitStatus;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Crm\ContactGestureService;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2578 (ADR-0101) — écrit le compte rendu d'une visite et le recopie sur la fiche client.
 *
 *   · **Un geste pour clore** : sur une visite `confirmed` dont l'heure est passée, le compte rendu
 *     la passe d'abord à `completed` comme `PropertyVisitController::complete` (statut et
 *     `completed_at` ; les rappels ne visent que les visites `confirmed`), dans la même
 *     transaction. Toute autre visite non terminée : 409 `visit.report_not_closable`.
 *   · **Une note par visite** : quand la visite a une fiche client, le compte rendu y est recopié en
 *     UNE note épinglée `visit_report` qui cite la visite (`property_visit_id`) ; une modification
 *     réécrit cette note. Le corps est la note libre de l'agent : le verdict et les objections sont
 *     des codes, que le front rend dans la langue du lecteur.
 *   · **L'étape est proposée, jamais écrite** (ADR-0103, décision 11a) : `suggestedStage()`.
 *   · `follow_up` trace le choix de l'agent ; rien n'est déclenché ici (ADR-0101 § 3).
 */
class VisitReportService
{
    /** Les étapes depuis lesquelles un verdict « intéressé » propose « qualifié ». */
    private const STAGES_BEFORE_QUALIFIED = [CustomerPipelineStage::Lead, CustomerPipelineStage::Prospect];

    /**
     * @param  array<string, mixed>  $data  validé par `StorePropertyVisitReportRequest`
     * @return array{visit: PropertyVisit, note: ?CustomerNote, suggested_stage: ?array{from: string, to: string}}
     */
    public function write(PropertyVisit $visit, User $author, array $data, bool $creating): array
    {
        return DB::transaction(function () use ($visit, $author, $data, $creating): array {
            /** @var PropertyVisit $locked */
            $locked = PropertyVisit::query()->whereKey($visit->getKey())->lockForUpdate()->firstOrFail();

            abort_code_unless($locked->isClosableByReport(), 409, 'visit.report_not_closable');
            abort_code_if($creating && $locked->hasReport(), 409, 'visit.report_exists');
            abort_code_if(! $creating && ! $locked->hasReport(), 409, 'visit.report_missing');

            $attributes = [
                'reported_at' => now(),
                'reported_by_id' => $author->id,
            ];
            if ($creating || array_key_exists('outcome', $data)) {
                $attributes['report_outcome'] = $data['outcome'];
            }
            if ($creating || array_key_exists('objections', $data)) {
                $attributes['report_objections'] = array_values(array_unique($data['objections'] ?? []));
            }
            if ($creating || array_key_exists('note', $data)) {
                $attributes['report_note'] = $data['note'] ?? null;
            }
            if ($creating || array_key_exists('follow_up', $data)) {
                $attributes['report_follow_up'] = $data['follow_up'] ?? null;
            }

            // Un geste pour clore : la visite confirmée et passée est terminée comme par `complete`.
            if ($locked->status === VisitStatus::Confirmed) {
                $attributes['status'] = VisitStatus::Completed;
                $attributes['completed_at'] = now();
            }

            $locked->update($attributes);

            $customer = $locked->customer;
            $note = $customer !== null ? $this->writeNote($locked, $customer, $author) : null;

            // TCK-2583 — un compte rendu est un contact : le dernier contact de la fiche avance.
            if ($customer !== null) {
                app(ContactGestureService::class)->touchCustomer($customer);
            }

            return [
                'visit' => $locked,
                'note' => $note,
                'suggested_stage' => $this->suggestedStage($locked, $customer),
            ];
        });
    }

    /**
     * ADR-0101 § 2 — la note `visit_report` de la visite, réécrite si elle existe. Sa mise à jour
     * n'entre pas au journal : le flux du client porte UNE entrée par compte rendu (la création de
     * la note), enrichie du verdict courant par `CustomerActivityFeed`.
     */
    private function writeNote(PropertyVisit $visit, Customer $customer, User $author): CustomerNote
    {
        $body = (string) ($visit->report_note ?? '');

        $note = CustomerNote::query()
            ->where('property_visit_id', $visit->id)
            ->where('kind', CustomerNoteKind::VisitReport->value)
            ->first();

        if ($note === null) {
            return CustomerNote::create([
                'customer_id' => $customer->id,
                'author_id' => $author->id,
                'property_visit_id' => $visit->id,
                'kind' => CustomerNoteKind::VisitReport,
                'body' => $body,
                'pinned' => true,
            ]);
        }

        $note->disableLogging();
        $note->update([
            'customer_id' => $customer->id,
            'author_id' => $author->id,
            'body' => $body,
            'pinned' => true,
        ]);
        $note->enableLogging();

        return $note;
    }

    /**
     * ADR-0101 / ADR-0103 — « intéressé » sur une fiche à `lead` ou `prospect` propose `qualified` ;
     * sinon rien. Une lecture : aucune étape n'est écrite.
     *
     * @return array{from: string, to: string}|null
     */
    public function suggestedStage(PropertyVisit $visit, ?Customer $customer): ?array
    {
        if ($customer === null
            || $visit->report_outcome !== VisitReportOutcome::Interested
            || ! in_array($customer->pipeline_stage, self::STAGES_BEFORE_QUALIFIED, true)) {
            return null;
        }

        return ['from' => $customer->pipeline_stage->value, 'to' => CustomerPipelineStage::Qualified->value];
    }

    /**
     * ADR-0101 § 7 — à l'effacement d'une fiche client ou du compte d'un visiteur, le seul texte
     * libre du compte rendu (`report_note`) est vidé ; le verdict, les objections et la suite —
     * des codes sans texte — restent pour les statistiques de l'agence.
     */
    public static function forgetNotesOfCustomer(int $customerId): void
    {
        PropertyVisit::query()
            ->where('customer_id', $customerId)
            ->whereNotNull('report_note')
            ->update(['report_note' => null]);
    }

    /** @see self::forgetNotesOfCustomer() */
    public static function forgetNotesOfVisitor(int $userId): void
    {
        PropertyVisit::query()
            ->where('visitor_id', $userId)
            ->whereNotNull('report_note')
            ->update(['report_note' => null]);
    }
}
