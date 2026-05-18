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
      'id,first_name,last_name,pipeline_stage,updated_at,created_at,added_by_id',
    );
    expect(qs.get('fields[users]')).toBe('id,first_name,last_name');
    expect(qs.get('include')).toBe('addedBy,tasksCount');
    expect(qs.get('sort')).toBe('-updated_at');
    expect(qs.get('per_page')).toBe('25');
  });
});
