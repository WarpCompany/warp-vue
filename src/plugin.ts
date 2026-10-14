import type { App, Plugin } from 'vue'
import { PayWithWarpButton } from './PayWithWarpButton'
import { WarpCheckout } from './WarpCheckout'

/** Registers `<WarpCheckout>` and `<PayWithWarpButton>` globally. Optional. */
export const WarpPlugin: Plugin = {
  install(app: App) {
    app.component('WarpCheckout', WarpCheckout)
    app.component('PayWithWarpButton', PayWithWarpButton)
  },
}
