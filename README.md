<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./.github/assets/symbol_white.png" />
    <img src="./.github/assets/symbol_black.png" alt="Warp" height="64" />
  </picture>
</p>

<h1 align="center">Pay with Warp: Vue</h1>

<p align="center">
  Vue 3 components and a composable for embedding the <a href="https://usewarp.net">Pay with Warp</a> checkout in your app.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@usewarp/vue"><img src="https://img.shields.io/npm/v/@usewarp/vue?color=9E1FAA" alt="npm" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT" /></a>
  <a href="https://developer.usewarp.net"><img src="https://img.shields.io/badge/docs-developer.usewarp.net-9E1FAA" alt="Docs" /></a>
</p>

---

Your server creates a checkout session with your secret key and returns its `checkout_url`. These components show that checkout inside your page (inline, in a modal or in a popup) so the customer never leaves your site. The customer pays, and Warp notifies your server with a signed webhook. This package wraps [`@usewarp/js`](https://github.com/WarpCompany/warp-js).

> [!WARNING]
> This project is under active development. Test with `sk_test_` keys on testnets before accepting mainnet payments.

## Features

- `<WarpCheckout>` for an inline checkout that resizes to fit its content
- `<PayWithWarpButton>` that opens the checkout in a modal, a popup or by redirect
- `useWarpCheckout()` composable with reactive `status`, `sessionId`, `isOpen` and `error`
- Safe to render on the server (Nuxt): nothing touches the DOM until the component is mounted
- Cleans up automatically when components unmount or effect scopes are disposed
- Light, dark or system theme
- Fully typed, ESM and CommonJS

## Installation

Requirements: Vue 3.3 or later.

```bash
npm install @usewarp/vue
```

## Usage

Create the session on your server with [`@usewarp/node`](https://github.com/WarpCompany/warp-node). Never use your secret key in the browser. In Nuxt, a server route looks like this:

```ts
// server/api/checkout.post.ts
import Warp from '@usewarp/node'

const warp = new Warp(process.env.WARP_SECRET_KEY!)

export default defineEventHandler(async () => {
  const session = await warp.checkout.sessions.create({
    amount_usd: '49.99',
    description: 'Pro plan',
    return_url: 'https://example.com/thanks',
    cancel_url: 'https://example.com/cart',
  })
  return { checkoutUrl: session.checkout_url }
})
```

Then render the checkout. `fetch-checkout-url` is called once the component mounts in the browser:

```vue
<script setup lang="ts">
import { WarpCheckout } from '@usewarp/vue'

async function createSession() {
  const { checkoutUrl } = await $fetch<{ checkoutUrl: string }>('/api/checkout', { method: 'POST' })
  return checkoutUrl
}

function onComplete() {
  navigateTo('/thanks')
}
</script>

<template>
  <WarpCheckout :fetch-checkout-url="createSession" theme="auto" @complete="onComplete" />
</template>
```

If you already have a `checkout_url` (for example from server-side rendering), pass it with `:checkout-url` instead. Changing `checkout-url` replaces the checkout with the new session.

Outside Nuxt, use `fetch` in place of `$fetch` and any backend that returns the `checkout_url`.

### Modal button

`<PayWithWarpButton>` creates the session when clicked and opens the checkout in a full-screen modal. The button is disabled and has `aria-busy="true"` while the session is being created.

```vue
<script setup lang="ts">
import { PayWithWarpButton, type WarpCheckoutError } from '@usewarp/vue'

async function createSession() {
  const res = await fetch('/api/checkout', { method: 'POST' })
  const { checkoutUrl } = await res.json()
  return checkoutUrl as string
}

function onComplete() {
  // Update the UI. Fulfil the order from your webhook handler.
}

function onError(error: WarpCheckoutError) {
  console.error(error.code, error.message)
}
</script>

<template>
  <PayWithWarpButton :fetch-checkout-url="createSession" @complete="onComplete" @error="onError">
    <template #default="{ loading }">{{ loading ? 'Loading...' : 'Pay with Warp' }}</template>
  </PayWithWarpButton>
</template>
```

The modal closes on Escape, the backdrop or its close button (emits `cancel` if the payment has not completed), after the customer cancels on the checkout page (emits `cancel`), and after the customer clicks "Back to merchant" on the success page (emits `return`). Every time the modal or popup closes, `close` is emitted last.

### Popup fallback

Use `mode="popup"` when your site cannot be framed, or `mode="redirect"` to send the customer to the hosted checkout page.

```vue
<PayWithWarpButton :fetch-checkout-url="createSession" mode="popup" @complete="onComplete" />
```

The popup window is opened synchronously in the click handler, so browsers do not block it. If one is blocked anyway, `error` is emitted with code `popup_blocked`.

### Composable

`useWarpCheckout` gives you the same modal and popup with your own UI. Call `openPopup` directly from a click handler, without awaiting anything first.

```vue
<script setup lang="ts">
import { useWarpCheckout } from '@usewarp/vue'

async function createSession() {
  const res = await fetch('/api/checkout', { method: 'POST' })
  const { checkoutUrl } = await res.json()
  return checkoutUrl as string
}

const { openModal, openPopup, close, status, sessionId, isOpen, error } = useWarpCheckout({
  fetchCheckoutUrl: createSession,
  onComplete: () => console.log('paid'),
})
</script>

<template>
  <button :disabled="isOpen" @click="openModal()">Pay</button>
  <button :disabled="isOpen" @click="openPopup()">Pay in a new window</button>
  <p v-if="status">Status: {{ status }} ({{ sessionId }})</p>
  <p v-if="error">{{ error.message }}</p>
</template>
```

`openModal` and `openPopup` accept options that override the ones given to `useWarpCheckout`, and resolve to the checkout instance, or `null` if it could not be opened (see `error`). `isOpen` becomes `false` whenever the modal or popup closes, including when the customer closes it after paying (the `onClose` option is called then), and on `close()`. The checkout closes automatically when the component unmounts.

### Global registration

The components can be imported where they are used, or registered globally:

```ts
import { createApp } from 'vue'
import { WarpPlugin } from '@usewarp/vue'
import App from './App.vue'

createApp(App).use(WarpPlugin).mount('#app')
```

In Nuxt, register it from a plugin (`plugins/warp.ts`) with `nuxtApp.vueApp.use(WarpPlugin)`.

### Allowed origins

The checkout can only be framed by the origins of the session's `return_url` and `cancel_url`. Create sessions with URLs on the same origin as the page that embeds the checkout. For sessions without either URL the checkout cannot be framed and sends no events; use `mode="redirect"` for those. Testnet sessions (created with an `sk_test_` key) can also be embedded from `http://localhost` and `http://127.0.0.1` on any port.

### Confirming payment

Events are UI signals so you can update the page. They are not proof of payment. Confirm the payment on your server with the `payment.completed` [webhook](https://developer.usewarp.net/warp-pay/webhooks), or by retrieving the session with `warp.checkout.sessions.retrieve(id)`, before fulfilling the order.

### Props and events

`<WarpCheckout>` props:

| Prop | Type | Description |
| ---- | ---- | ----------- |
| `checkout-url` | `string` | `checkout_url` of a session created on your server |
| `fetch-checkout-url` | `() => Promise<string>` | Creates a session on your server and resolves to its `checkout_url`. Used when `checkout-url` is not set |
| `theme` | `'light' \| 'dark' \| 'auto'` | Default `'auto'` (follows the customer's system setting) |
| `checkout-origin` | `string` | Self-hosted or staging checkout. Default `https://checkout.usewarp.net` |

`<PayWithWarpButton>` props:

| Prop | Type | Description |
| ---- | ---- | ----------- |
| `fetch-checkout-url` | `() => Promise<string>` | Required. Creates a session on your server and resolves to its `checkout_url` |
| `mode` | `'modal' \| 'popup' \| 'redirect'` | Default `'modal'` |
| `theme` | `'light' \| 'dark' \| 'auto'` | Default `'auto'`. Not used for redirects |
| `checkout-origin` | `string` | Self-hosted or staging checkout |
| `disabled` | `boolean` | Disable the button |

The default slot receives `{ loading }`. Without a slot the label is "Pay with Warp".

Events (both components unless noted):

| Event | Payload | When |
| ----- | ------- | ---- |
| `ready` | | The checkout page loaded |
| `status` | `CheckoutStatus` | On load and whenever the status changes: `pending`, `processing`, `completed`, `failed`, `expired` |
| `complete` | | The status became `completed` |
| `cancel` | | The customer cancelled, or closed the modal or popup before the payment completed |
| `return` | | The customer clicked "Back to merchant" on the success page |
| `error` | `WarpCheckoutError` | The checkout could not be opened. `error.code` is `invalid_checkout_url`, `fetch_failed`, `popup_blocked` or `load_failed` |
| `close` | | `<PayWithWarpButton>` only, modal and popup modes. The checkout closed, after any `cancel` or `return`, including when the customer closes it after paying. Not emitted when you call the exposed `close()` |

`useWarpCheckout` accepts the same callbacks as options (`onReady`, `onStatus`, `onComplete`, `onCancel`, `onReturn`, `onError`) plus `onClose`, which matches the `close` event.

## API

| Export | Description |
| ------ | ----------- |
| `WarpCheckout` | Inline checkout component |
| `PayWithWarpButton` | Button that opens the checkout in a modal, popup or by redirect |
| `useWarpCheckout(options)` | Composable returning `{ openModal, openPopup, close, status, sessionId, isOpen, error }` |
| `WarpPlugin` | Optional plugin that registers both components globally |
| `WarpCheckoutError` | Error class with a `code` (re-exported from `@usewarp/js`) |
| `CheckoutStatus`, `CheckoutTheme`, `CheckoutOptions`, `CheckoutInstance` | Types re-exported from `@usewarp/js` |
| `PayWithWarpMode`, `UseWarpCheckoutOptions`, `UseWarpCheckoutReturn` | Types for the button and composable |

## Documentation

| Topic | Description |
| ----- | ----------- |
| [Embedded checkout](https://developer.usewarp.net/warp-pay/embedded-checkout) | Embed modes, events, allowed origins |
| [Webhooks](https://developer.usewarp.net/warp-pay/webhooks) | Signature verification and retries |
| [API reference](https://developer.usewarp.net/api-reference/introduction) | Endpoints, parameters and errors |

Full product documentation is at [developer.usewarp.net](https://developer.usewarp.net).

## Development

```bash
git clone https://github.com/WarpCompany/warp-vue.git
cd warp-vue
npm install
npm test
npm run build
```

Until `@usewarp/js` is published to npm, clone [warp-js](https://github.com/WarpCompany/warp-js) next to this repository, build it, and install it with `npm install --no-save ../warp-js` instead of `npm install`.

## Project structure

```
src/            Components, composable, plugin and shared helpers
test/           Vitest tests (jsdom, @usewarp/js mocked)
```

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).

Please report security issues privately as described in [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE)
