/**
 * DetailProjectSelect — project picker row for the properties sidebar (TFG-34).
 *
 * Projects v2: Linear-style row — a "Project" subheader above the select and
 * a chevron link to the global project page (/projects/:id), shown only when
 * a project is set.
 *
 * Selecting the "No project" row maps to explicit null so the API's
 * undefined-vs-null distinction survives the client boundary (undefined key =
 * untouched; null = un-assign). Mirrors detail-assignee-select's sentinel
 * pattern, since Radix Select forbids an empty-string item value.
 */

import { describe, it, expect, vi } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { DetailProjectSelect } from './detail-project-select';
import type { ProjectMeta } from '@/types';

const projects: ProjectMeta[] = [
  { id: 'p1', name: 'Roadmap', icon: '📦' },
  { id: 'p2', name: 'Tech debt', icon: null },
];

// The chevron is a router Link — render inside a router.
const render = (ui: ReactElement) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);

describe('DetailProjectSelect', () => {
  it('renders a Project subheader above the select', () => {
    render(<DetailProjectSelect value="p1" projects={projects} onChange={() => {}} />);

    const subheader = screen.getByText('Project');
    const trigger = screen.getByRole('combobox', { name: 'Project' });
    expect(subheader.compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(
      0,
    );
  });

  it('renders an "Open project" chevron linking to the global project page', () => {
    render(<DetailProjectSelect value="p1" projects={projects} onChange={() => {}} />);

    expect(screen.getByRole('link', { name: 'Open project' })).toHaveAttribute(
      'href',
      '/projects/p1',
    );
  });

  it('hides the chevron when no project is set', () => {
    render(<DetailProjectSelect value={null} projects={projects} onChange={() => {}} />);

    expect(screen.queryByRole('link', { name: 'Open project' })).toBeNull();
  });

  it('shows the current project in the trigger', () => {
    render(<DetailProjectSelect value="p1" projects={projects} onChange={() => {}} />);

    expect(screen.getByRole('combobox', { name: 'Project' })).toHaveTextContent('Roadmap');
  });

  it('maps the No project option back to explicit null', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DetailProjectSelect value="p1" projects={projects} onChange={onChange} />);

    await user.click(screen.getByRole('combobox', { name: 'Project' }));
    await user.click(await screen.findByRole('option', { name: /no project/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('passes a picked project id through unchanged', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DetailProjectSelect value={null} projects={projects} onChange={onChange} />);

    await user.click(screen.getByRole('combobox', { name: 'Project' }));
    await user.click(await screen.findByRole('option', { name: /tech debt/i }));
    expect(onChange).toHaveBeenCalledWith('p2');
  });
});
