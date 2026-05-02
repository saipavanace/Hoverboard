import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CategoryCascadeFilter from './CategoryCascadeFilter.jsx';

const CLEAR = '__HB_FILTER_CLEAR__';

describe('CategoryCascadeFilter', () => {
  it('clears to empty when All is chosen on first select (nested closure depth)', () => {
    const roots = [
      {
        label: 'Category1',
        path: 'Category1',
        children: [
          { label: 'Sub A', path: 'Category1 / Sub A', children: [] },
          { label: 'Sub B', path: 'Category1 / Sub B', children: [] },
        ],
      },
    ];
    const onChange = vi.fn();

    render(
      <CategoryCascadeFilter roots={roots} value="Category1" onChange={onChange} />
    );

    const primary = screen.getByRole('combobox', { name: 'Category' });
    fireEvent.change(primary, { target: { value: CLEAR } });

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('hides root clear option when hideRootClear (VR create)', () => {
    const roots = [
      {
        label: 'A',
        path: 'A',
        children: [{ label: 'B', path: 'A / B', children: [] }],
      },
    ];
    const onChange = vi.fn();
    render(
      <CategoryCascadeFilter
        hideRootClear
        showHeaderLabel={false}
        roots={roots}
        value="A / B"
        onChange={onChange}
      />
    );
    const primary = screen.getByRole('combobox', { name: 'Category' });
    const opts = Array.from(primary.querySelectorAll('option')).map((o) => o.value);
    expect(opts).not.toContain(CLEAR);
    expect(opts).toEqual(['A']);
  });

  it('clears only sub-level when Any is chosen on second select', () => {
    const roots = [
      {
        label: 'Category1',
        path: 'Category1',
        children: [
          { label: 'Sub A', path: 'Category1 / Sub A', children: [] },
        ],
      },
    ];
    const onChange = vi.fn();

    render(
      <CategoryCascadeFilter
        roots={roots}
        value="Category1 / Sub A"
        onChange={onChange}
      />
    );

    const sub = screen.getByRole('combobox', { name: 'Subcategory 1' });
    fireEvent.change(sub, { target: { value: CLEAR } });

    expect(onChange).toHaveBeenCalledWith('Category1');
  });
});
