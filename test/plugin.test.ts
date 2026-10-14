import { describe, expect, it, vi } from 'vitest'
import { createSSRApp, defineComponent, h, resolveComponent } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { mount } from '@vue/test-utils'

vi.mock('@warpfi/js', async () => {
  const { MockWarpCheckoutError } = await import('./mock')
  return {
    mountCheckout: vi.fn(),
    openCheckoutModal: vi.fn(),
    openCheckoutPopup: vi.fn(),
    parseCheckoutUrl: vi.fn(),
    WarpCheckoutError: MockWarpCheckoutError,
  }
})

import { mountCheckout } from '@warpfi/js'
import { PayWithWarpButton, WarpCheckout, WarpCheckoutError, WarpPlugin } from '../src'

describe('WarpPlugin', () => {
  it('registers both components globally', () => {
    const App = defineComponent({
      setup() {
        return () =>
          h('div', [
            h(resolveComponent('WarpCheckout')),
            h(resolveComponent('PayWithWarpButton'), { fetchCheckoutUrl: async () => '' }),
          ])
      },
    })
    const wrapper = mount(App, { global: { plugins: [WarpPlugin] } })
    expect(wrapper.findComponent(WarpCheckout).exists()).toBe(true)
    expect(wrapper.findComponent(PayWithWarpButton).exists()).toBe(true)
  })

  it('re-exports WarpCheckoutError', () => {
    expect(new WarpCheckoutError('destroyed', 'x').code).toBe('destroyed')
  })
})

describe('server rendering', () => {
  it('renders without touching the checkout', async () => {
    const app = createSSRApp({
      render: () => [
        h(WarpCheckout, { checkoutUrl: 'https://checkout.usewarp.net/session/ps_' + 'a'.repeat(32) }),
        h(PayWithWarpButton, { fetchCheckoutUrl: async () => '' }),
      ],
    })
    const html = await renderToString(app)
    expect(html).toContain('class="warp-checkout"')
    expect(html).toContain('Pay with Warp')
    expect(mountCheckout).not.toHaveBeenCalled()
  })
})
