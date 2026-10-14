import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import { fakeInstance, flush, lastOptions, MockWarpCheckoutError } from './mock'

vi.mock('@usewarp/js', async () => {
  const { MockWarpCheckoutError } = await import('./mock')
  return {
    mountCheckout: vi.fn(),
    openCheckoutModal: vi.fn(),
    openCheckoutPopup: vi.fn(),
    parseCheckoutUrl: vi.fn(),
    WarpCheckoutError: MockWarpCheckoutError,
  }
})

import { openCheckoutModal, openCheckoutPopup, parseCheckoutUrl } from '@usewarp/js'
import { PayWithWarpButton } from '../src'

const modalMock = vi.mocked(openCheckoutModal)
const popupMock = vi.mocked(openCheckoutPopup)
const parseMock = vi.mocked(parseCheckoutUrl)
const URL_A = 'https://checkout.usewarp.net/session/ps_' + 'a'.repeat(32)

let instances: ReturnType<typeof fakeInstance>[]

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

beforeEach(() => {
  instances = []
  for (const fn of [modalMock, popupMock]) {
    fn.mockReset()
    fn.mockImplementation(async (options) => {
      await options.fetchCheckoutUrl?.()
      const inst = fakeInstance(options)
      instances.push(inst)
      return inst as never
    })
  }
  parseMock.mockReset()
  parseMock.mockImplementation((url: string) => ({ url: new URL(url), sessionId: 'ps_' + 'a'.repeat(32) }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<PayWithWarpButton>', () => {
  it('renders the default label', () => {
    const wrapper = mount(PayWithWarpButton, { props: { fetchCheckoutUrl: async () => URL_A } })
    const button = wrapper.find('button')
    expect(button.text()).toBe('Pay with Warp')
    expect(button.attributes('type')).toBe('button')
    expect(button.attributes('disabled')).toBeUndefined()
  })

  it('renders the default slot with the loading state', async () => {
    const d = deferred<string>()
    const wrapper = mount(PayWithWarpButton, {
      props: { fetchCheckoutUrl: () => d.promise },
      slots: { default: (props: { loading: boolean }) => h('span', props.loading ? 'Loading' : 'Buy now') },
    })
    expect(wrapper.text()).toBe('Buy now')
    await wrapper.find('button').trigger('click')
    expect(wrapper.text()).toBe('Loading')
    d.resolve(URL_A)
    await flush()
    expect(wrapper.text()).toBe('Buy now')
  })

  it('opens a modal by default and is busy while loading', async () => {
    const d = deferred<string>()
    const wrapper = mount(PayWithWarpButton, { props: { fetchCheckoutUrl: () => d.promise, theme: 'dark' } })
    const button = wrapper.find('button')
    await button.trigger('click')

    expect(modalMock).toHaveBeenCalledTimes(1)
    expect(popupMock).not.toHaveBeenCalled()
    expect(lastOptions(modalMock).theme).toBe('dark')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('aria-busy')).toBe('true')

    // A second click while loading is ignored.
    await button.trigger('click')
    expect(modalMock).toHaveBeenCalledTimes(1)

    d.resolve(URL_A)
    await flush()
    expect(button.attributes('disabled')).toBeUndefined()
    expect(button.attributes('aria-busy')).toBeUndefined()
  })

  it('opens a popup synchronously in the click handler', async () => {
    const wrapper = mount(PayWithWarpButton, { props: { fetchCheckoutUrl: async () => URL_A, mode: 'popup' } })
    wrapper.find('button').element.click()
    expect(popupMock).toHaveBeenCalledTimes(1)
    expect(modalMock).not.toHaveBeenCalled()
    await flush()
  })

  it('emits checkout events', async () => {
    const wrapper = mount(PayWithWarpButton, { props: { fetchCheckoutUrl: async () => URL_A } })
    await wrapper.find('button').trigger('click')
    await flush()
    const options = lastOptions(modalMock)
    options.onReady?.()
    options.onStatus?.('completed')
    options.onComplete?.()
    options.onReturn?.()
    options.onClose?.()
    expect(wrapper.emitted('ready')).toHaveLength(1)
    expect(wrapper.emitted('status')).toEqual([['completed']])
    expect(wrapper.emitted('complete')).toHaveLength(1)
    expect(wrapper.emitted('return')).toHaveLength(1)
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(instances[0]!.destroy).toHaveBeenCalled()
  })

  it('emits close without cancel when the modal is closed after paying', async () => {
    const wrapper = mount(PayWithWarpButton, { props: { fetchCheckoutUrl: async () => URL_A } })
    await wrapper.find('button').trigger('click')
    await flush()
    const options = lastOptions(modalMock)
    options.onComplete?.()
    options.onClose?.()
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toBeUndefined()
    expect(instances[0]!.destroy).toHaveBeenCalled()
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
  })

  it('emits cancel', async () => {
    const wrapper = mount(PayWithWarpButton, { props: { fetchCheckoutUrl: async () => URL_A } })
    await wrapper.find('button').trigger('click')
    await flush()
    lastOptions(modalMock).onCancel?.()
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('emits error and re-enables when opening fails', async () => {
    const error = new MockWarpCheckoutError('fetch_failed', 'down')
    modalMock.mockRejectedValueOnce(error)
    const wrapper = mount(PayWithWarpButton, { props: { fetchCheckoutUrl: async () => URL_A } })
    await wrapper.find('button').trigger('click')
    await flush()
    expect(wrapper.emitted('error')).toEqual([[error]])
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
  })

  it('redirects in redirect mode', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    const fetchCheckoutUrl = vi.fn(async () => URL_A)
    const wrapper = mount(PayWithWarpButton, {
      props: { fetchCheckoutUrl, mode: 'redirect', checkoutOrigin: 'https://checkout.usewarp.net' },
    })
    await wrapper.find('button').trigger('click')
    await flush()
    expect(fetchCheckoutUrl).toHaveBeenCalledTimes(1)
    expect(parseMock).toHaveBeenCalledWith(URL_A, 'https://checkout.usewarp.net')
    expect(assign).toHaveBeenCalledWith(URL_A)
    expect(modalMock).not.toHaveBeenCalled()
    expect(popupMock).not.toHaveBeenCalled()
    // Stays busy while the page navigates away.
    expect(wrapper.find('button').attributes('aria-busy')).toBe('true')
  })

  it('emits fetch_failed when the redirect URL cannot be fetched', async () => {
    const wrapper = mount(PayWithWarpButton, {
      props: { fetchCheckoutUrl: () => Promise.reject(new Error('500')), mode: 'redirect' },
    })
    await wrapper.find('button').trigger('click')
    await flush()
    const emitted = wrapper.emitted('error') as [MockWarpCheckoutError][]
    expect(emitted).toHaveLength(1)
    expect(emitted[0]![0]).toBeInstanceOf(MockWarpCheckoutError)
    expect(emitted[0]![0].code).toBe('fetch_failed')
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
  })

  it('emits invalid_checkout_url errors from parseCheckoutUrl unchanged', async () => {
    const error = new MockWarpCheckoutError('invalid_checkout_url', 'bad')
    parseMock.mockImplementationOnce(() => {
      throw error
    })
    const wrapper = mount(PayWithWarpButton, {
      props: { fetchCheckoutUrl: async () => 'https://evil.example/', mode: 'redirect' },
    })
    await wrapper.find('button').trigger('click')
    await flush()
    expect(wrapper.emitted('error')).toEqual([[error]])
  })

  it('respects disabled', async () => {
    const wrapper = mount(PayWithWarpButton, { props: { fetchCheckoutUrl: async () => URL_A, disabled: true } })
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    await wrapper.find('button').trigger('click')
    expect(modalMock).not.toHaveBeenCalled()
  })

  it('closes an open checkout on unmount', async () => {
    const wrapper = mount(PayWithWarpButton, { props: { fetchCheckoutUrl: async () => URL_A } })
    await wrapper.find('button').trigger('click')
    await flush()
    wrapper.unmount()
    expect(instances[0]!.destroy).toHaveBeenCalled()
  })
})
