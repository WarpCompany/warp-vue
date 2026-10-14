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
