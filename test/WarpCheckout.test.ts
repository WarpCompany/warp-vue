import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { fakeInstance, flush, lastOptions, MockWarpCheckoutError } from './mock'

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
import { WarpCheckout } from '../src'

const mountMock = vi.mocked(mountCheckout)
const URL_A = 'https://checkout.usewarp.net/session/ps_' + 'a'.repeat(32)
const URL_B = 'https://checkout.usewarp.net/session/ps_' + 'b'.repeat(32)

let instances: ReturnType<typeof fakeInstance>[]

beforeEach(() => {
  instances = []
  mountMock.mockReset()
  mountMock.mockImplementation(async (_el, options) => {
    const inst = fakeInstance(options)
    instances.push(inst)
    return inst
  })
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('<WarpCheckout>', () => {
  it('renders a container without mounting during render', () => {
    const wrapper = mount(WarpCheckout, { props: { checkoutUrl: URL_A } })
    expect(wrapper.find('div.warp-checkout').exists()).toBe(true)
  })

  it('mounts on mount and destroys on unmount', async () => {
    const wrapper = mount(WarpCheckout, { props: { checkoutUrl: URL_A, theme: 'dark' }, attachTo: document.body })
    await flush()
    expect(mountMock).toHaveBeenCalledTimes(1)
    const [el, options] = mountMock.mock.calls[0]!
    expect(el).toBe(wrapper.element)
    expect(options).toMatchObject({ checkoutUrl: URL_A, theme: 'dark' })
    expect(options.signal).toBeInstanceOf(AbortSignal)

    wrapper.unmount()
    expect(instances[0]!.destroy).toHaveBeenCalledTimes(1)
  })

  it('does nothing without checkoutUrl or fetchCheckoutUrl', async () => {
    mount(WarpCheckout)
    await flush()
    expect(mountMock).not.toHaveBeenCalled()
  })

  it('passes fetchCheckoutUrl through', async () => {
    const fetchCheckoutUrl = vi.fn(async () => URL_A)
    mount(WarpCheckout, { props: { fetchCheckoutUrl } })
    await flush()
    expect(lastOptions(mountMock).fetchCheckoutUrl).toBe(fetchCheckoutUrl)
    expect(lastOptions(mountMock).checkoutUrl).toBeUndefined()
  })

  it('emits checkout events', async () => {
    const wrapper = mount(WarpCheckout, { props: { checkoutUrl: URL_A } })
    await flush()
    const options = lastOptions(mountMock)
    const error = new MockWarpCheckoutError('load_failed', 'nope')
    options.onReady?.()
    options.onStatus?.('processing')
    options.onComplete?.()
    options.onCancel?.()
    options.onReturn?.()
    options.onError?.(error as never)

    expect(wrapper.emitted('ready')).toHaveLength(1)
    expect(wrapper.emitted('status')).toEqual([['processing']])
    expect(wrapper.emitted('complete')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('return')).toHaveLength(1)
    expect(wrapper.emitted('error')).toEqual([[error]])
  })

  it('emits error when mounting rejects, once', async () => {
    const error = new MockWarpCheckoutError('invalid_checkout_url', 'bad')
    mountMock.mockImplementationOnce(async (_el, options) => {
      options.onError?.(error as never)
      throw error
    })
    const wrapper = mount(WarpCheckout, { props: { checkoutUrl: 'https://evil.example/x' } })
    await flush()
    expect(wrapper.emitted('error')).toEqual([[error]])
  })

  it('remounts when checkoutUrl changes', async () => {
    const wrapper = mount(WarpCheckout, { props: { checkoutUrl: URL_A } })
    await flush()
    await wrapper.setProps({ checkoutUrl: URL_B })
    await flush()
    expect(mountMock).toHaveBeenCalledTimes(2)
    expect(instances[0]!.destroy).toHaveBeenCalledTimes(1)
    expect(lastOptions(mountMock).checkoutUrl).toBe(URL_B)

    // Events from the old checkout are ignored.
    instances[0]!.options.onReady?.()
    expect(wrapper.emitted('ready')).toBeUndefined()
    instances[1]!.options.onReady?.()
    expect(wrapper.emitted('ready')).toHaveLength(1)
  })

  it('aborts and destroys a checkout that resolves after unmount', async () => {
    let resolve!: () => void
    mountMock.mockImplementationOnce(
      (_el, options) =>
        new Promise((r) => {
          resolve = () => {
            const inst = fakeInstance(options)
            instances.push(inst)
            r(inst)
          }
        }),
    )
    const wrapper = mount(WarpCheckout, { props: { checkoutUrl: URL_A } })
    await nextTick()
    const options = lastOptions(mountMock)
    wrapper.unmount()
    expect(options.signal?.aborted).toBe(true)
    resolve()
    await flush()
    expect(instances[0]!.destroy).toHaveBeenCalledTimes(1)
    options.onReady?.()
    expect(wrapper.emitted('ready')).toBeUndefined()
  })

  it('exposes remount', async () => {
    const wrapper = mount(WarpCheckout, { props: { checkoutUrl: URL_A } })
    await flush()
    await (wrapper.vm as unknown as { remount: () => Promise<void> }).remount()
    expect(mountMock).toHaveBeenCalledTimes(2)
    expect(instances[0]!.destroy).toHaveBeenCalled()
  })
})
