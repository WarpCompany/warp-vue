import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, type PropType } from 'vue'
import { mountCheckout, type CheckoutInstance, type CheckoutTheme, type WarpCheckoutError } from '@usewarp/js'
import { checkoutEmits } from './emits'
import { toCheckoutError } from './errors'

/**
 * Inline embedded checkout. Renders a container and mounts the Warp checkout iframe into it
 * once the component is mounted in the browser (safe to render on the server).
 */
export const WarpCheckout = defineComponent({
  name: 'WarpCheckout',
  props: {
    /** `checkout_url` of a session created on your server. */
    checkoutUrl: { type: String, default: undefined },
    /** Async function that creates a session on your server and resolves to its `checkout_url`. */
    fetchCheckoutUrl: { type: Function as PropType<() => Promise<string>>, default: undefined },
    /** `'light'`, `'dark'` or `'auto'` (follow the system setting). */
    theme: { type: String as PropType<CheckoutTheme>, default: undefined },
    /** Override for a self-hosted or staging checkout. `checkoutUrl` must match this origin. */
    checkoutOrigin: { type: String, default: undefined },
  },
  emits: checkoutEmits,
  setup(props, { emit, expose }) {
    const container = ref<HTMLElement | null>(null)
    let instance: CheckoutInstance | null = null
    let controller: AbortController | null = null
    // Incremented on every (re)mount and on unmount, so callbacks and promises from an
    // older checkout are ignored once it has been replaced.
    let generation = 0

    function destroy(): void {
      generation++
      const current = instance
      instance = null
      current?.destroy()
      // Tears down a checkout that is still loading (for example while fetchCheckoutUrl runs).
      controller?.abort()
      controller = null
    }

    async function mount(): Promise<void> {
      destroy()
      const gen = generation
      const el = container.value
      if (!el || (!props.checkoutUrl && !props.fetchCheckoutUrl)) return

      const active = () => gen === generation
      let reported: WarpCheckoutError | null = null
      const fetchCheckoutUrl = props.fetchCheckoutUrl
      const abort = (controller = new AbortController())

      try {
        const created = await mountCheckout(el, {
          checkoutUrl: props.checkoutUrl,
          fetchCheckoutUrl: props.checkoutUrl ? undefined : fetchCheckoutUrl,
          theme: props.theme,
          checkoutOrigin: props.checkoutOrigin,
          signal: abort.signal,
          onReady: () => active() && emit('ready'),
          onStatus: (status) => active() && emit('status', status),
          onComplete: () => active() && emit('complete'),
          onCancel: () => active() && emit('cancel'),
          onReturn: () => active() && emit('return'),
          onError: (error) => {
            if (!active()) return
            reported = error
            emit('error', error)
          },
        })
        if (active()) {
          instance = created
          controller = null
        } else {
          created.destroy()
        }
      } catch (error) {
        if (active() && error !== reported) {
          emit('error', toCheckoutError(error, 'load_failed', 'Could not load the checkout.'))
        }
      }
    }

    onMounted(() => {
      void mount()
    })
    onBeforeUnmount(destroy)
    watch(
      () => [props.checkoutUrl, props.theme, props.checkoutOrigin],
      () => {
        void mount()
      },
    )

    expose({
      /** Destroy the current checkout and mount it again (for example to create a fresh session). */
      remount: mount,
    })

    return () => h('div', { ref: container, class: 'warp-checkout' })
  },
})
