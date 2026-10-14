import { defineComponent, h, ref, type PropType } from 'vue'
import { parseCheckoutUrl, type CheckoutTheme } from '@usewarp/js'
import { buttonEmits } from './emits'
import { toCheckoutError } from './errors'
import { useWarpCheckout } from './useWarpCheckout'

export type PayWithWarpMode = 'modal' | 'popup' | 'redirect'

/**
 * A button that creates a session through `fetchCheckoutUrl` and opens the checkout in a
 * modal (default), a popup window, or by redirecting the page.
 */
export const PayWithWarpButton = defineComponent({
  name: 'PayWithWarpButton',
  props: {
    /** Async function that creates a session on your server and resolves to its `checkout_url`. */
    fetchCheckoutUrl: { type: Function as PropType<() => Promise<string>>, required: true },
    /** How to open the checkout. */
    mode: { type: String as PropType<PayWithWarpMode>, default: 'modal' },
    /** `'light'`, `'dark'` or `'auto'` (follow the system setting). Not used for redirects. */
    theme: { type: String as PropType<CheckoutTheme>, default: undefined },
    /** Override for a self-hosted or staging checkout. */
    checkoutOrigin: { type: String, default: undefined },
    /** Disable the button. */
    disabled: { type: Boolean, default: false },
  },
  emits: buttonEmits,
  setup(props, { emit, slots, expose }) {
    const loading = ref(false)
    const checkout = useWarpCheckout({
      onReady: () => emit('ready'),
      onStatus: (status) => emit('status', status),
      onComplete: () => emit('complete'),
      onCancel: () => emit('cancel'),
      onReturn: () => emit('return'),
      onError: (error) => emit('error', error),
      onClose: () => emit('close'),
    })

    async function redirect(): Promise<void> {
      let url: string
      try {
        url = await props.fetchCheckoutUrl()
      } catch (cause) {
        throw toCheckoutError(cause, 'fetch_failed', 'Could not create a checkout session.')
      }
      const parsed = parseCheckoutUrl(url, props.checkoutOrigin)
      window.location.assign(parsed.url.toString())
    }

    function onClick(): void {
      if (loading.value || props.disabled) return
      loading.value = true

      if (props.mode === 'redirect') {
        // Keep the button busy while the page navigates away; re-enable only on failure.
        redirect().catch((error: unknown) => {
          loading.value = false
          emit('error', toCheckoutError(error, 'load_failed', 'Could not open the checkout.'))
        })
        return
      }

      const options = {
        fetchCheckoutUrl: props.fetchCheckoutUrl,
        theme: props.theme,
        checkoutOrigin: props.checkoutOrigin,
      }
      // Called synchronously from the click so that popups are not blocked.
      const pending = props.mode === 'popup' ? checkout.openPopup(options) : checkout.openModal(options)
      void pending.finally(() => {
        loading.value = false
      })
    }

    expose({ close: checkout.close })

    return () =>
      h(
        'button',
        {
          type: 'button',
          class: 'warp-pay-button',
          disabled: props.disabled || loading.value,
          'aria-busy': loading.value ? 'true' : undefined,
          onClick,
        },
        slots.default ? slots.default({ loading: loading.value }) : 'Pay with Warp',
      )
  },
})
