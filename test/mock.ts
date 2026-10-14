import { vi } from 'vitest'
import type { CheckoutOptions, CheckoutStatus } from '@usewarp/js'

export class MockWarpCheckoutError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'WarpCheckoutError'
    this.code = code
  }
}

export interface FakeInstance {
  sessionId: string | null
  status: CheckoutStatus | null
  destroy: ReturnType<typeof vi.fn>
  options: CheckoutOptions
}

export function fakeInstance(options: CheckoutOptions, sessionId = 'ps_' + 'a'.repeat(32)): FakeInstance {
  return { sessionId, status: null, destroy: vi.fn(), options }
}

/** Last options passed to a mocked opener. */
export function lastOptions(fn: { mock: { calls: unknown[][] } }): CheckoutOptions {
  const call = fn.mock.calls[fn.mock.calls.length - 1]
  if (!call) throw new Error('not called')
  return call[call.length - 1] as CheckoutOptions
}

export const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
