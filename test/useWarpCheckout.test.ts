import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
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

import { openCheckoutModal, openCheckoutPopup } from '@usewarp/js'
import { useWarpCheckout } from '../src'

const modalMock = vi.mocked(openCheckoutModal)
const popupMock = vi.mocked(openCheckoutPopup)
const URL_A = 'https://checkout.usewarp.net/session/ps_' + 'a'.repeat(32)

let instances: ReturnType<typeof fakeInstance>[]

beforeEach(() => {
  instances = []
  for (const fn of [modalMock, popupMock]) {
    fn.mockReset()
    fn.mockImplementation(async (options) => {
      const inst = fakeInstance(options)
      instances.push(inst)
      return inst
    })
  }
})

function setup(options: Parameters<typeof useWarpCheckout>[0] = {}) {
  const scope = effectScope()
  const checkout = scope.run(() => useWarpCheckout(options))!
  return { scope, checkout }
}

describe('useWarpCheckout', () => {
  it('opens a modal and tracks state', async () => {
    const onStatus = vi.fn()
    const onComplete = vi.fn()
    const { checkout } = setup({ checkoutUrl: URL_A, theme: 'light', onStatus, onComplete })
    const pending = checkout.openModal()
    expect(checkout.isOpen.value).toBe(true)
    expect(modalMock).toHaveBeenCalledTimes(1)
    expect(lastOptions(modalMock)).toMatchObject({ checkoutUrl: URL_A, theme: 'light' })

    const inst = await pending
    expect(inst).toBe(instances[0])
    expect(checkout.sessionId.value).toBe('ps_' + 'a'.repeat(32))

    const options = lastOptions(modalMock)
    options.onStatus?.('processing')
    expect(checkout.status.value).toBe('processing')
    options.onStatus?.('completed')
    options.onComplete?.()
    expect(checkout.status.value).toBe('completed')
    expect(onStatus).toHaveBeenCalledWith('completed')
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(checkout.isOpen.value).toBe(true)
  })

  it('lets open() override options', async () => {
    const { checkout } = setup({ theme: 'light' })
    await checkout.openModal({ checkoutUrl: URL_A, theme: 'dark' })
    expect(lastOptions(modalMock)).toMatchObject({ checkoutUrl: URL_A, theme: 'dark' })
  })

  it('calls openCheckoutPopup synchronously', () => {
    const { checkout } = setup({ fetchCheckoutUrl: async () => URL_A })
    void checkout.openPopup()
    expect(popupMock).toHaveBeenCalledTimes(1)
    expect(checkout.isOpen.value).toBe(true)
  })

  it('close() destroys the instance', async () => {
    const { checkout } = setup({ checkoutUrl: URL_A })
    await checkout.openModal()
    checkout.close()
    expect(instances[0]!.destroy).toHaveBeenCalledTimes(1)
    expect(checkout.isOpen.value).toBe(false)
  })

  it('closes on cancel and return and forwards the callbacks', async () => {
    const events: string[] = []
    const { checkout } = setup({
      checkoutUrl: URL_A,
      onCancel: () => events.push('cancel'),
      onReturn: () => events.push('return'),
      onClose: () => events.push('close'),
    })

    // @usewarp/js calls onCancel / onReturn, then onClose once it has closed itself.
    await checkout.openModal()
    lastOptions(modalMock).onCancel?.()
    expect(checkout.isOpen.value).toBe(true)
    lastOptions(modalMock).onClose?.()
    expect(checkout.isOpen.value).toBe(false)
    expect(instances[0]!.destroy).toHaveBeenCalled()

    await checkout.openPopup()
    lastOptions(popupMock).onReturn?.()
    lastOptions(popupMock).onClose?.()
    expect(checkout.isOpen.value).toBe(false)
    expect(instances[1]!.destroy).toHaveBeenCalled()
    expect(events).toEqual(['cancel', 'close', 'return', 'close'])
  })

  it('sets isOpen to false when the customer closes the modal after paying', async () => {
    const onCancel = vi.fn()
    const onClose = vi.fn()
    const { checkout } = setup({ checkoutUrl: URL_A, onCancel, onClose })
    await checkout.openModal()
    const options = lastOptions(modalMock)
    options.onStatus?.('completed')
    options.onComplete?.()
    expect(checkout.isOpen.value).toBe(true)
    options.onClose?.()
    expect(checkout.isOpen.value).toBe(false)
    expect(checkout.status.value).toBe('completed')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('sets isOpen to false when the popup window is closed', async () => {
    const onClose = vi.fn()
    const { checkout } = setup({ checkoutUrl: URL_A })
    await checkout.openPopup({ onClose })
    lastOptions(popupMock).onClose?.()
    expect(checkout.isOpen.value).toBe(false)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('sets isOpen to false when dismissed while still loading', async () => {
    let resolve!: () => void
    modalMock.mockImplementationOnce(
      (options) =>
        new Promise((r) => {
          resolve = () => {
            const inst = fakeInstance(options)
            instances.push(inst)
            r(inst as never)
          }
        }),
    )
    const onError = vi.fn()
    const { checkout } = setup({ fetchCheckoutUrl: async () => URL_A, onError })
    const pending = checkout.openModal()
    lastOptions(modalMock).onClose?.()
    expect(checkout.isOpen.value).toBe(false)
    resolve()
    await expect(pending).resolves.toBeNull()
    expect(instances[0]!.destroy).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })

  it('ignores onClose from a replaced or closed checkout', async () => {
    const onClose = vi.fn()
    const { checkout } = setup({ checkoutUrl: URL_A, onClose })
    await checkout.openModal()
    const first = lastOptions(modalMock)
    await checkout.openModal()
    first.onClose?.()
    expect(checkout.isOpen.value).toBe(true)
    checkout.close()
    lastOptions(modalMock).onClose?.()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('opening again replaces the previous checkout', async () => {
    const onStatus = vi.fn()
    const { checkout } = setup({ checkoutUrl: URL_A, onStatus })
    await checkout.openModal()
    const first = lastOptions(modalMock)
    await checkout.openModal()
    expect(instances[0]!.destroy).toHaveBeenCalled()
    first.onStatus?.('failed')
    expect(onStatus).not.toHaveBeenCalled()
    expect(checkout.status.value).toBeNull()
  })

  it('records errors and resolves null when opening fails', async () => {
    const error = new MockWarpCheckoutError('popup_blocked', 'blocked')
    popupMock.mockRejectedValueOnce(error)
    const onError = vi.fn()
    const { checkout } = setup({ checkoutUrl: URL_A, onError })
    await expect(checkout.openPopup()).resolves.toBeNull()
    expect(checkout.error.value).toBe(error)
    expect(checkout.isOpen.value).toBe(false)
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('does not report the same error twice', async () => {
    const error = new MockWarpCheckoutError('fetch_failed', 'down')
    modalMock.mockImplementationOnce(async (options) => {
      options.onError?.(error as never)
      throw error
    })
    const onError = vi.fn()
    const { checkout } = setup({ fetchCheckoutUrl: async () => URL_A, onError })
    await checkout.openModal()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(checkout.error.value).toBe(error)
  })

  it('closes when the scope is disposed', async () => {
    const { scope, checkout } = setup({ checkoutUrl: URL_A })
    await checkout.openModal()
    scope.stop()
    expect(instances[0]!.destroy).toHaveBeenCalledTimes(1)
    expect(checkout.isOpen.value).toBe(false)
  })

  it('aborts a checkout that is still loading when closed', async () => {
    let resolve!: () => void
    modalMock.mockImplementationOnce(
      (options) =>
        new Promise((r) => {
          resolve = () => {
            const inst = fakeInstance(options)
            instances.push(inst)
            r(inst as never)
          }
        }),
    )
    const { scope, checkout } = setup({ fetchCheckoutUrl: async () => URL_A })
    const pending = checkout.openModal()
    const options = lastOptions(modalMock)
    scope.stop()
    expect(options.signal?.aborted).toBe(true)
    resolve()
    await expect(pending).resolves.toBeNull()
    await flush()
    expect(instances[0]!.destroy).toHaveBeenCalledTimes(1)
  })

  it('works outside a component or scope', async () => {
    const checkout = useWarpCheckout({ checkoutUrl: URL_A })
    await checkout.openModal()
    checkout.close()
    expect(instances[0]!.destroy).toHaveBeenCalled()
  })
})
