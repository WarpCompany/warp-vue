import type { CheckoutStatus, WarpCheckoutError } from '@usewarp/js'

/** Runtime emits declaration shared by the components. */
export const checkoutEmits = {
  ready: () => true,
  status: (_status: CheckoutStatus) => true,
  complete: () => true,
  cancel: () => true,
  return: () => true,
  error: (_error: WarpCheckoutError) => true,
}

/** Emits of `<PayWithWarpButton>`: the shared ones plus `close` for the modal and popup. */
export const buttonEmits = {
  ...checkoutEmits,
  close: () => true,
}
