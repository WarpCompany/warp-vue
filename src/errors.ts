import { WarpCheckoutError } from '@warpfi/js'

/** Returns `error` if it is already a WarpCheckoutError, otherwise wraps it. */
export function toCheckoutError(
  error: unknown,
  code: WarpCheckoutError['code'],
  message: string,
): WarpCheckoutError {
  if (error instanceof WarpCheckoutError) return error
  return new WarpCheckoutError(code, message, { cause: error })
}
