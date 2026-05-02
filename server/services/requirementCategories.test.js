import { describe, it, expect } from 'vitest';
import {
  flattenAllowedCategoryValues,
  sqlCategoryBranchClause,
} from './requirementCategories.js';

describe('flattenAllowedCategoryValues', () => {
  it('accepts legacy flat strings', () => {
    expect(flattenAllowedCategoryValues(['System', ' CHI '])).toEqual(['System', 'CHI']);
  });

  it('builds paths for one level of children', () => {
    const out = flattenAllowedCategoryValues([
      { name: 'Category1', children: ['SubA', 'SubB'] },
      { name: 'Category2', children: ['X'] },
    ]);
    expect(out).toContain('Category1 / SubA');
    expect(out).toContain('Category1 / SubB');
    expect(out).toContain('Category2 / X');
    expect(out).toHaveLength(3);
  });

  it('allows a parent with no children as a leaf', () => {
    expect(flattenAllowedCategoryValues([{ name: 'OnlyParent' }])).toEqual(['OnlyParent']);
  });

  it('nests objects under parents', () => {
    const out = flattenAllowedCategoryValues([
      {
        name: 'Systems',
        children: [{ name: 'Interfaces', children: ['UART', 'PCIe'] }],
      },
    ]);
    expect(out).toEqual(['Systems / Interfaces / UART', 'Systems / Interfaces / PCIe']);
  });
});

describe('sqlCategoryBranchClause', () => {
  it('is empty for blank prefix', () => {
    expect(sqlCategoryBranchClause('x.category', '')).toEqual({ clause: '', params: [] });
  });
  it('matches exact and descendants', () => {
    const { clause, params } = sqlCategoryBranchClause('drs.category', 'Cat / A');
    expect(clause).toContain('drs.category = ?');
    expect(clause).toContain('LIKE ?');
    expect(params).toEqual(['Cat / A', 'Cat / A / %']);
  });
});
