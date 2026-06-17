// Copyright 2025 IBM Corp.
// Licensed under the Apache License, Version 2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { PluginActionForm } from './PluginActionForm';
import type { PluginAction, PluginActionResult } from '@/types';

const ACTION: PluginAction = {
  label: 'Simulate this',
  endpoint: '/plugins/simulate/simulate',
  method: 'POST',
  params_schema: {
    type: 'object',
    properties: {
      vmcp_uuid: { type: 'string', description: 'UUID of the real vMCP to simulate' },
    },
    required: ['vmcp_uuid'],
  },
};

const PENDING_RESULT: PluginActionResult = {
  success: true,
  message: 'Simulation is starting...',
  data: { job_id: 'job-abc', status: 'pending' },
};

describe('PluginActionForm — simulate polling', () => {
  const mockOnClose = vi.fn();
  let capturedIntervalFn: (() => Promise<void>) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedIntervalFn = null;
    vi.spyOn(window, 'setInterval').mockImplementation((fn: any) => {
      capturedIntervalFn = fn;
      return 42 as any;
    });
    vi.spyOn(window, 'clearInterval').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderForm = (onSubmit: () => Promise<PluginActionResult>) =>
    render(
      <PluginActionForm
        action={ACTION}
        pluginName="simulate"
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={onSubmit}
      />
    );

  it('shows info alert and disabled spinner button after a pending job response', async () => {
    const onSubmit = vi.fn().mockResolvedValue(PENDING_RESULT);

    renderForm(onSubmit);
    fireEvent.click(screen.getByRole('button', { name: /Execute/i }));

    await waitFor(() => {
      expect(screen.getByText(/Simulation is starting/i)).toBeDefined();
    });

    const btn = screen.getByRole('button', { name: /Starting simulation/i });
    expect(btn).toBeDisabled();
  });

  it('transitions to ready: shows success alert and "Done" button', async () => {
    const onSubmit = vi.fn().mockResolvedValue(PENDING_RESULT);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ready', sim_vmcp_uuid: 'sim-1' }),
    });

    renderForm(onSubmit);
    fireEvent.click(screen.getByRole('button', { name: /Execute/i }));

    await waitFor(() => expect(capturedIntervalFn).not.toBeNull());

    await act(async () => {
      await capturedIntervalFn!();
    });

    await waitFor(() => {
      expect(screen.getByText(/Simulation is ready/i)).toBeDefined();
    });

    const doneBtn = screen.getByRole('button', { name: /Done/i });
    expect(doneBtn).not.toBeDisabled();
  });

  it('transitions to failed: shows danger alert with detail and restores "Execute" button', async () => {
    const onSubmit = vi.fn().mockResolvedValue(PENDING_RESULT);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'failed', detail: 'harness boom' }),
    });

    renderForm(onSubmit);
    fireEvent.click(screen.getByRole('button', { name: /Execute/i }));

    await waitFor(() => expect(capturedIntervalFn).not.toBeNull());

    await act(async () => {
      await capturedIntervalFn!();
    });

    await waitFor(() => {
      expect(screen.getByText(/Simulation failed/i)).toBeDefined();
      expect(screen.getByText(/harness boom/i)).toBeDefined();
    });

    expect(screen.getByRole('button', { name: /Execute/i })).not.toBeDisabled();
  });

  it('shows poll-error warning after 3 consecutive fetch failures', async () => {
    const onSubmit = vi.fn().mockResolvedValue(PENDING_RESULT);
    global.fetch = vi.fn().mockRejectedValue(new Error('network error'));

    renderForm(onSubmit);
    fireEvent.click(screen.getByRole('button', { name: /Execute/i }));

    await waitFor(() => expect(capturedIntervalFn).not.toBeNull());

    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await capturedIntervalFn!();
      });
    }

    await waitFor(() => {
      expect(screen.getByText(/Could not confirm simulation status/i)).toBeDefined();
    });
  });
});
