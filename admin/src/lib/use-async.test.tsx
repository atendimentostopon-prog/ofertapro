import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAsync } from './use-async';

describe('useAsync', () => {
  it('resolve dados', async () => {
    const { result } = renderHook(() => useAsync(() => Promise.resolve(42), []));
    await waitFor(() => expect(result.current.data).toBe(42));
    expect(result.current.loading).toBe(false);
  });
  it('captura erro', async () => {
    const { result } = renderHook(() => useAsync(() => Promise.reject(new Error('x')), []));
    await waitFor(() => expect(result.current.error).toBe('x'));
  });
  it('reload re-executa', async () => {
    const fn = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const { result } = renderHook(() => useAsync(fn, []));
    await waitFor(() => expect(result.current.data).toBe(1));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toBe(2));
  });
});
