export { WarpCheckout } from './WarpCheckout'
export { PayWithWarpButton, type PayWithWarpMode } from './PayWithWarpButton'
export { useWarpCheckout, type UseWarpCheckoutOptions, type UseWarpCheckoutReturn } from './useWarpCheckout'
export { WarpPlugin } from './plugin'
export { WarpCheckoutError } from '@usewarp/js'
export type { CheckoutInstance, CheckoutOptions, CheckoutStatus, CheckoutTheme } from '@usewarp/js'

declare module 'vue' {
  export interface GlobalComponents {
    WarpCheckout: typeof import('./WarpCheckout')['WarpCheckout']
    PayWithWarpButton: typeof import('./PayWithWarpButton')['PayWithWarpButton']
  }
}
