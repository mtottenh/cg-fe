import type { Middleware } from 'openapi-fetch'

export type UnauthorizedHandler = () => void

let onUnauthorized: UnauthorizedHandler = () => {}

export function setUnauthorizedHandler(handler: UnauthorizedHandler) {
  onUnauthorized = handler
}

export const errorMiddleware: Middleware = {
  onResponse: ({ response }) => {
    if (response.status === 401) {
      onUnauthorized()
    }
    return response
  },
}
