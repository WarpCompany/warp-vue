import { describe, expect, it } from 'vitest'
import * as warp from '@warpfi/js'

// Runs against the real @warpfi/js to catch API drift between the two packages.
describe('@warpfi/js contract', () => {
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

  it('calls onClose after a completed modal is dismissed', async () => {
    const sessionId = 'ps_' + 'a'.repeat(32)
    const events: string[] = []
    await warp.openCheckoutModal({
      checkoutUrl: `https://checkout.usewarp.net/session/${sessionId}`,
      onCancel: () => events.push('cancel'),
      onClose: () => events.push('close'),
    })
    const iframe = document.querySelector('.warp-overlay iframe') as HTMLIFrameElement
    const event = new MessageEvent('message', {
      origin: 'https://checkout.usewarp.net',
      data: { source: 'warp-checkout', version: 1, session_id: sessionId, type: 'status', status: 'completed' },
    })
    Object.defineProperty(event, 'source', { value: iframe.contentWindow })
    window.dispatchEvent(event)
    ;(document.querySelector('.warp-close') as HTMLButtonElement).click()
    expect(events).toEqual(['close'])
    expect(document.querySelector('.warp-overlay')).toBeNull()
  })
})
