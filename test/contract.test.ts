import { describe, expect, it } from 'vitest'
import * as warp from '@usewarp/js'

// Runs against the real @usewarp/js to catch API drift between the two packages.
describe('@usewarp/js contract', () => {
  it('exports the functions this package calls', () => {
    expect(typeof warp.mountCheckout).toBe('function')
    expect(typeof warp.openCheckoutModal).toBe('function')
    expect(typeof warp.openCheckoutPopup).toBe('function')
    expect(typeof warp.parseCheckoutUrl).toBe('function')
  })

  it('constructs WarpCheckoutError with a code', () => {
    const error = new warp.WarpCheckoutError('fetch_failed', 'x', { cause: 1 })
    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe('fetch_failed')
  })
})
