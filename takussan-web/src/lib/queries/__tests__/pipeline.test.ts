import { describe, expect, it } from 'vitest';

import { buildQueryString } from '@/lib/api';
import { buildPipelineColumnParams } from '../pipeline';

describe('pipeline queries', () => {
  it('builds a sparse active stage query for kanban columns', () => {
    const params = buildPipelineColumnParams({ stage: 'qualified', perPage: 25 });
    const qs = new URLSearchParams(buildQueryString(params));

    expect(qs.get('filter[pipeline_stage]')).toBe('qualified');
    expect(qs.get('filter[status]')).toBe('active');
    expect(qs.get('fields[customers]')).toBe(
      // TCK-591 — `phone` : « Appeler » / « WhatsApp » sur la carte. TCK-2592 — la carte enrichie.
      'id,first_name,last_name,phone,pipeline_stage,updated_at,created_at,added_by_id,' +
        'seeking_contract_type,budget_max,seeking_property_types,seeking_cities,seeking_neighborhoods,' +
        'last_contacted_at,next_action,follow_up,referent,suggested_stage',
    );
    // TCK-2592 — le référent (calculé) remplace l'auteur : plus d'`addedBy`.
    expect(qs.get('fields[users]')).toBeNull();
    expect(qs.get('include')).toBe('tasksCount');
    // TCK-2592 — la relance la plus ancienne d'abord, comme la liste.
    expect(qs.get('sort')).toBe('-follow_up_days');
    expect(qs.get('per_page')).toBe('25');
    expect(qs.get('page')).toBeNull();
  });

  it('asks for the next page when « Charger plus » is used (TCK-591)', () => {
    const qs = new URLSearchParams(buildQueryString(buildPipelineColumnParams({ stage: 'lead', page: 2 })));

    expect(qs.get('page')).toBe('2');
    expect(qs.get('per_page')).toBe('50');
  });
});
