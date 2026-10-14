import { getCurrentScope, onScopeDispose, ref, type Ref } from 'vue'
import {
  openCheckoutModal,
  openCheckoutPopup,
  type CheckoutInstance,
  type CheckoutOptions,
  type CheckoutStatus,
  type WarpCheckoutError,
} from '@usewarp/js'
import { toCheckoutError } from './errors'

/** Options for `useWarpCheckout`. Cancellation is handled by `close()`, so `signal` is not accepted. */
export type UseWarpCheckoutOptions = Omit<CheckoutOptions, 'signal'>

export interface UseWarpCheckoutReturn {
  /**
   * Open the checkout in a full-screen modal. Options passed here override the ones given to
   * `useWarpCheckout`. Resolves to the instance, or `null` if opening failed (see `error`).
   */
  openModal: (overrides?: Partial<UseWarpCheckoutOptions>) => Promise<CheckoutInstance | null>
  /**
   * Open the checkout in a popup window. Call it directly from a click handler: the window is
   * opened synchronously so browsers do not block it.
   */
  openPopup: (overrides?: Partial<UseWarpCheckoutOptions>) => Promise<CheckoutInstance | null>
  /** Close the modal or popup, if one is open. */
  close: () => void
  /** Latest status reported by the checkout, or `null` before the first update. */
  status: Ref<CheckoutStatus | null>
  /** ID of the open session (`ps_...`), or `null`. */
  sessionId: Ref<string | null>
  /**
   * `true` from the moment a modal or popup is requested until it closes for any reason
   * (customer dismissal, also after a completed payment; cancel; return), `close()` is called,
   * or opening fails.
   */
  isOpen: Ref<boolean>
  /** Last error, cleared when a new checkout is opened. */
  error: Ref<WarpCheckoutError | null>
}

type Opener = (options: CheckoutOptions) => Promise<CheckoutInstance>

/**
 * Open the Warp checkout in a modal or popup. Closes it automatically when the calling
 * component (or effect scope) is disposed.
 */
export function useWarpCheckout(options: UseWarpCheckoutOptions = {}): UseWarpCheckoutReturn {
  const status = ref<CheckoutStatus | null>(null)
  const sessionId = ref<string | null>(null)
  const isOpen = ref(false)
  const error = ref<WarpCheckoutError | null>(null)

  let instance: CheckoutInstance | null = null
  let controller: AbortController | null = null
  let generation = 0

  function close(): void {
    generation++
    const current = instance
    instance = null
    isOpen.value = false
    current?.destroy()
    // Tears down a modal or popup that is still waiting for its checkout URL.
    controller?.abort()
    controller = null
  }

  // Not async on purpose: the opener must run synchronously inside the caller's
  // click handler so that popup blockers treat it as a user gesture.
  function open(opener: Opener, overrides?: Partial<UseWarpCheckoutOptions>): Promise<CheckoutInstance | null> {
    close()
    const gen = generation
    const active = () => gen === generation
    const merged: CheckoutOptions = { ...options, ...overrides }
    let reported: WarpCheckoutError | null = null
    const abort = (controller = new AbortController())

    status.value = null
    sessionId.value = null
    error.value = null
    isOpen.value = true

    const fail = (err: WarpCheckoutError) => {
      error.value = err
      close()
    }

    let pending: Promise<CheckoutInstance>
    try {
      pending = opener({
        ...merged,
        signal: abort.signal,
        onReady: () => {
          if (active()) merged.onReady?.()
        },
        onStatus: (next) => {
          if (!active()) return
          status.value = next
          merged.onStatus?.(next)
        },
        onComplete: () => {
          if (active()) merged.onComplete?.()
        },
        onCancel: () => {
          if (active()) merged.onCancel?.()
        },
        onReturn: () => {
          if (active()) merged.onReturn?.()
        },
        // @usewarp/js calls this last whenever the modal or popup closes itself (dismissed by
        // the customer, also after paying, or after cancel / return). Not called for close().
        onClose: () => {
          if (!active()) return
          close()
          merged.onClose?.()
        },
        onError: (err) => {
          if (!active()) return
          reported = err
          fail(err)
          merged.onError?.(err)
        },
      })
    } catch (err) {
      pending = Promise.reject(err)
    }

    return pending.then(
      (created) => {
        if (!active()) {
          created.destroy()
          return null
        }
        instance = created
        controller = null
        sessionId.value = created.sessionId
        if (created.status) status.value = created.status
        return created
      },
      (err: unknown) => {
        if (active() && err !== reported) {
          const error = toCheckoutError(err, 'load_failed', 'Could not open the checkout.')
          fail(error)
          merged.onError?.(error)
        }
        return null
      },
    )
  }

  if (getCurrentScope()) onScopeDispose(close)

  return {
    openModal: (overrides) => open(openCheckoutModal, overrides),
    openPopup: (overrides) => open(openCheckoutPopup, overrides),
    close,
    status,
    sessionId,
    isOpen,
    error,
  }
}
