import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createJwtPermission,
  jwtAuth,
  jwtPermission,
  getCurrentUser,
  isAuthenticated,
} from '../src/index'
import type { PermissionContext, RouteRule } from '../src/index'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Hoa-style context (ctx.res exists) */
function makeHoaCtx(overrides: Partial<PermissionContext> = {}): PermissionContext {
  return {
    request: { method: 'GET', url: '/' },
    res: { status: undefined, body: undefined },
    state: {},
    ...overrides,
  }
}

/** Koa-style context (no ctx.res, status/body on ctx root) */
function makeKoaCtx(overrides: Partial<PermissionContext> = {}): PermissionContext {
  return {
    request: { method: 'GET', url: '/' },
    state: {},
    status: undefined,
    body: undefined,
    ...overrides,
  }
}

const noop = async () => { }

// ---------------------------------------------------------------------------
// getCurrentUser
// ---------------------------------------------------------------------------

describe('getCurrentUser', () => {
  it('returns user when state.user is present', () => {
    const user = { id: 1, name: 'alice' }
    expect(getCurrentUser({ state: { user } })).toBe(user)
  })

  it('returns null when state is undefined', () => {
    expect(getCurrentUser({})).toBeNull()
  })

  it('returns null when state.user is undefined', () => {
    expect(getCurrentUser({ state: {} })).toBeNull()
  })

  it('returns null when state.user is null', () => {
    expect(getCurrentUser({ state: { user: null } })).toBeNull()
  })

  it('returns any truthy value stored as user (e.g. string)', () => {
    expect(getCurrentUser({ state: { user: 'token' } })).toBe('token')
  })
})

// ---------------------------------------------------------------------------
// isAuthenticated
// ---------------------------------------------------------------------------

describe('isAuthenticated', () => {
  it('returns true when state.user is present', () => {
    expect(isAuthenticated({ state: { user: { id: 1 } } })).toBe(true)
  })

  it('returns false when state is undefined', () => {
    expect(isAuthenticated({})).toBe(false)
  })

  it('returns false when state.user is undefined', () => {
    expect(isAuthenticated({ state: {} })).toBe(false)
  })

  it('returns false when state.user is null', () => {
    expect(isAuthenticated({ state: { user: null } })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Aliases
// ---------------------------------------------------------------------------

describe('jwtAuth / jwtPermission aliases', () => {
  it('jwtAuth is the same reference as createJwtPermission', () => {
    expect(jwtAuth).toBe(createJwtPermission)
  })

  it('jwtPermission is the same reference as createJwtPermission', () => {
    expect(jwtPermission).toBe(createJwtPermission)
  })
})

// ---------------------------------------------------------------------------
// createJwtPermission — public routes
// ---------------------------------------------------------------------------

describe('createJwtPermission – public routes', () => {
  it('passes through a public route without checking authentication', async () => {
    const middleware = createJwtPermission({
      publicRoutes: [{ method: 'POST', path: '/api/auth/login' }],
      protectedRoutes: [],
    })
    const ctx = makeHoaCtx({ request: { method: 'POST', url: '/api/auth/login' } })
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(next).toHaveBeenCalledOnce()
    expect((ctx as any).res.status).toBeUndefined()
  })

  it('passes through a public route even when user is absent', async () => {
    const middleware = createJwtPermission({
      publicRoutes: [{ method: 'GET', path: '/api/health' }],
      protectedRoutes: [],
    })
    const ctx = makeHoaCtx({ request: { method: 'GET', url: '/api/health' }, state: {} })
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('matches path parameters in public routes', async () => {
    const middleware = createJwtPermission({
      publicRoutes: [{ method: 'GET', path: '/public/items/:id' }],
      protectedRoutes: [],
    })
    const ctx = makeHoaCtx({ request: { method: 'GET', url: '/public/items/42' } })
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(next).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// createJwtPermission — protected routes
// ---------------------------------------------------------------------------

describe('createJwtPermission – protected routes', () => {
  it('passes through a protected route when user is authenticated', async () => {
    const middleware = createJwtPermission({
      protectedRoutes: [{ method: 'GET', path: '/api/profile' }],
    })
    const ctx = makeHoaCtx({
      request: { method: 'GET', url: '/api/profile' },
      state: { user: { id: 1 } },
    })
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(next).toHaveBeenCalledOnce()
    expect((ctx as any).res.status).toBeUndefined()
  })

  it('returns 401 (Hoa style) when protected route has no user', async () => {
    const middleware = createJwtPermission({
      protectedRoutes: [{ method: 'GET', path: '/api/profile' }],
    })
    const ctx = makeHoaCtx({ request: { method: 'GET', url: '/api/profile' }, state: {} })
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(next).not.toHaveBeenCalled()
    expect((ctx as any).res.status).toBe(401)
    expect((ctx as any).res.body.code).toBe('UNAUTHORIZED')
  })

  it('returns 401 (Koa style) when protected route has no user', async () => {
    const middleware = createJwtPermission({
      protectedRoutes: [{ method: 'GET', path: '/api/profile' }],
    })
    const ctx = makeKoaCtx({ request: { method: 'GET', url: '/api/profile' }, state: {} })
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(next).not.toHaveBeenCalled()
    expect(ctx.status).toBe(401)
    expect((ctx.body as any).code).toBe('UNAUTHORIZED')
  })

  it('matches path parameters in protected routes', async () => {
    const middleware = createJwtPermission({
      protectedRoutes: [{ method: 'DELETE', path: '/api/users/:id' }],
    })
    const ctx = makeHoaCtx({
      request: { method: 'DELETE', url: '/api/users/99' },
      state: { user: { id: 1 } },
    })
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('returns 401 for protected path-param route with no user', async () => {
    const middleware = createJwtPermission({
      protectedRoutes: [{ method: 'DELETE', path: '/api/users/:id' }],
    })
    const ctx = makeHoaCtx({
      request: { method: 'DELETE', url: '/api/users/99' },
      state: {},
    })
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(next).not.toHaveBeenCalled()
    expect((ctx as any).res.status).toBe(401)
  })

  it('matches routes with multiple path parameters', async () => {
    const middleware = createJwtPermission({
      protectedRoutes: [{ method: 'GET', path: '/api/users/:userId/posts/:postId' }],
    })
    const ctx = makeHoaCtx({
      request: { method: 'GET', url: '/api/users/123/posts/456' },
      state: { user: { id: 1 } },
    })
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(next).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// createJwtPermission — unknown routes (default allow)
// ---------------------------------------------------------------------------

describe('createJwtPermission – unknown routes', () => {
  it('passes through routes not in either list', async () => {
    const middleware = createJwtPermission({
      publicRoutes: [{ method: 'POST', path: '/api/login' }],
      protectedRoutes: [{ method: 'GET', path: '/api/profile' }],
    })
    const ctx = makeHoaCtx({ request: { method: 'GET', url: '/api/unknown' } })
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(next).toHaveBeenCalledOnce()
    expect((ctx as any).res.status).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// createJwtPermission — method matching
// ---------------------------------------------------------------------------

describe('createJwtPermission – method matching', () => {
  it('matches route method when rule uses lowercase', async () => {
    const middleware = createJwtPermission({
      publicRoutes: [{ method: 'get', path: '/api/test' }],
      protectedRoutes: [],
    })
    const ctx = makeHoaCtx({ request: { method: 'GET', url: '/api/test' } })
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('normalizes lowercase request method to uppercase', async () => {
    const middleware = createJwtPermission({
      publicRoutes: [{ method: 'POST', path: '/api/test' }],
      protectedRoutes: [],
    })
    const ctx = makeHoaCtx({ request: { method: 'post', url: '/api/test' } })
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('does not match route when method differs', async () => {
    const middleware = createJwtPermission({
      protectedRoutes: [{ method: 'POST', path: '/api/test' }],
      publicRoutes: [],
    })
    // GET /api/test — method differs, treated as unknown, passes through
    const ctx = makeHoaCtx({ request: { method: 'GET', url: '/api/test' }, state: {} })
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(next).toHaveBeenCalledOnce()
    expect((ctx as any).res.status).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// createJwtPermission — URL handling
// ---------------------------------------------------------------------------

describe('createJwtPermission – URL handling', () => {
  it('strips query string before matching', async () => {
    const middleware = createJwtPermission({
      publicRoutes: [{ method: 'GET', path: '/api/search' }],
      protectedRoutes: [],
    })
    const ctx = makeHoaCtx({ request: { method: 'GET', url: '/api/search?q=hello&page=1' } })
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('decodes %xx encoded paths before matching', async () => {
    const middleware = createJwtPermission({
      publicRoutes: [{ method: 'GET', path: '/api/users/info' }],
      protectedRoutes: [],
    })
    // %69 = 'i', so %69nfo = 'info'
    const ctx = makeHoaCtx({ request: { method: 'GET', url: '/api/users/%69nfo' } })
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('falls back to raw path when %xx is invalid (no throw)', async () => {
    const middleware = createJwtPermission({
      publicRoutes: [],
      protectedRoutes: [],
    })
    // %zz is invalid for decodeURIComponent — should not throw; unknown route passes through
    const ctx = makeHoaCtx({ request: { method: 'GET', url: '/api/%zz' } })
    const next = vi.fn(noop)
    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(next).toHaveBeenCalledOnce()
  })

  it('accepts URL object in request.url (calls toString())', async () => {
    const middleware = createJwtPermission({
      publicRoutes: [{ method: 'GET', path: '/api/data' }],
      protectedRoutes: [],
    })
    const ctx = makeHoaCtx({
      request: { method: 'GET', url: { toString: () => '/api/data?foo=bar' } as any },
    })
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('uses ctx.req as fallback when ctx.request is absent', async () => {
    const middleware = createJwtPermission({
      publicRoutes: [{ method: 'GET', path: '/api/fallback' }],
      protectedRoutes: [],
    })
    const ctx: PermissionContext = {
      req: { method: 'GET', url: '/api/fallback' },
      state: {},
    }
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('defaults to GET / when no request info is present', async () => {
    const middleware = createJwtPermission({
      publicRoutes: [{ method: 'GET', path: '/' }],
      protectedRoutes: [],
    })
    const ctx: PermissionContext = { state: {} }
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(next).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// createJwtPermission — path regex edge cases
// ---------------------------------------------------------------------------

describe('createJwtPermission – path regex', () => {
  it('escapes dots in static path segments (/api/v1.0/ must not match /api/v1X0/)', async () => {
    const middleware = createJwtPermission({
      protectedRoutes: [{ method: 'GET', path: '/api/v1.0/users' }],
      publicRoutes: [],
    })

    // /api/v1X0/users does NOT match the rule → treated as unknown → passes through
    const ctxMiss = makeHoaCtx({ request: { method: 'GET', url: '/api/v1X0/users' }, state: {} })
    const nextMiss = vi.fn(noop)
    await middleware(ctxMiss, nextMiss)
    expect(nextMiss).toHaveBeenCalledOnce()
    expect((ctxMiss as any).res.status).toBeUndefined()

    // /api/v1.0/users matches the rule → protected, no user → 401
    const ctxHit = makeHoaCtx({ request: { method: 'GET', url: '/api/v1.0/users' }, state: {} })
    const nextHit = vi.fn(noop)
    await middleware(ctxHit, nextHit)
    expect(nextHit).not.toHaveBeenCalled()
    expect((ctxHit as any).res.status).toBe(401)
  })

  it('does not match partial path segments (/api/items must not match /api/items/extra)', async () => {
    const middleware = createJwtPermission({
      protectedRoutes: [{ method: 'GET', path: '/api/items' }],
      publicRoutes: [],
    })
    const ctx = makeHoaCtx({
      request: { method: 'GET', url: '/api/items/extra' },
      state: {},
    })
    const next = vi.fn(noop)
    await middleware(ctx, next)
    // /api/items/extra is unknown → passes through
    expect(next).toHaveBeenCalledOnce()
    expect((ctx as any).res.status).toBeUndefined()
  })

  it('does not match superstring of param segment', async () => {
    const middleware = createJwtPermission({
      protectedRoutes: [{ method: 'GET', path: '/api/users/:id' }],
      publicRoutes: [],
    })
    // /api/users/ (empty segment) should not match :id (requires at least one char)
    const ctx = makeHoaCtx({ request: { method: 'GET', url: '/api/users/' }, state: {} })
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(next).toHaveBeenCalledOnce()
    expect((ctx as any).res.status).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// createJwtPermission — custom matching functions
// ---------------------------------------------------------------------------

describe('createJwtPermission – custom matching functions', () => {
  it('calls isPublicRoute with normalized method and decoded path', async () => {
    const isPublicRoute = vi.fn((_method: string, path: string) =>
      path.startsWith('/public'),
    )
    const middleware = createJwtPermission({ isPublicRoute })
    const ctx = makeHoaCtx({ request: { method: 'get', url: '/public/resource?v=1' } })
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(isPublicRoute).toHaveBeenCalledWith('GET', '/public/resource')
    expect(next).toHaveBeenCalledOnce()
  })

  it('calls isProtectedRoute when isPublicRoute returns false', async () => {
    const isPublicRoute = vi.fn(() => false)
    const isProtectedRoute = vi.fn((_method: string, path: string) =>
      path.startsWith('/admin'),
    )
    const middleware = createJwtPermission({ isPublicRoute, isProtectedRoute })
    const ctx = makeHoaCtx({
      request: { method: 'GET', url: '/admin/dashboard' },
      state: {},
    })
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(isProtectedRoute).toHaveBeenCalledWith('GET', '/admin/dashboard')
    expect(next).not.toHaveBeenCalled()
    expect((ctx as any).res.status).toBe(401)
  })

  it('does not call isProtectedRoute when isPublicRoute returns true', async () => {
    const isPublicRoute = vi.fn(() => true)
    const isProtectedRoute = vi.fn(() => false)
    const middleware = createJwtPermission({ isPublicRoute, isProtectedRoute })
    const ctx = makeHoaCtx({ request: { method: 'GET', url: '/anything' } })
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(isProtectedRoute).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledOnce()
  })

  it('skips built-in route-list logic when both custom functions are provided', async () => {
    // Both custom functions provided → needBuiltinRoutes = false
    // publicRoutes/protectedRoutes arrays should be totally ignored
    const isPublicRoute = vi.fn(() => false)
    const isProtectedRoute = vi.fn(() => false)
    const middleware = createJwtPermission({
      isPublicRoute,
      isProtectedRoute,
      publicRoutes: [{ method: 'GET', path: '/api/anything' }],
      protectedRoutes: [{ method: 'GET', path: '/api/anything' }],
    })
    // Both custom fns return false → unknown route → passes through
    const ctx = makeHoaCtx({ request: { method: 'GET', url: '/api/anything' } })
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('passes through unknown route when both custom functions return false', async () => {
    const middleware = createJwtPermission({
      isPublicRoute: () => false,
      isProtectedRoute: () => false,
    })
    const ctx = makeHoaCtx({ request: { method: 'GET', url: '/any' } })
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(next).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// createJwtPermission — custom unauthorizedResponse
// ---------------------------------------------------------------------------

describe('createJwtPermission – custom unauthorizedResponse', () => {
  it('invokes custom handler instead of built-in on 401', async () => {
    const customResponse = vi.fn()
    const middleware = createJwtPermission({
      protectedRoutes: [{ method: 'GET', path: '/api/secret' }],
      unauthorizedResponse: customResponse,
    })
    const ctx = makeHoaCtx({ request: { method: 'GET', url: '/api/secret' }, state: {} })
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(customResponse).toHaveBeenCalledWith(ctx)
    expect(next).not.toHaveBeenCalled()
  })

  it('does not call custom handler when route is public', async () => {
    const customResponse = vi.fn()
    const middleware = createJwtPermission({
      publicRoutes: [{ method: 'GET', path: '/api/open' }],
      unauthorizedResponse: customResponse,
    })
    const ctx = makeHoaCtx({ request: { method: 'GET', url: '/api/open' } })
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(customResponse).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// createJwtPermission — next() is optional
// ---------------------------------------------------------------------------

describe('createJwtPermission – optional next()', () => {
  it('resolves without error when next is not provided (public route)', async () => {
    const middleware = createJwtPermission({
      publicRoutes: [{ method: 'GET', path: '/api/test' }],
    })
    const ctx = makeHoaCtx({ request: { method: 'GET', url: '/api/test' } })
    await expect(middleware(ctx)).resolves.toBeUndefined()
  })

  it('resolves without error when next is not provided (protected + authenticated)', async () => {
    const middleware = createJwtPermission({
      protectedRoutes: [{ method: 'GET', path: '/api/secure' }],
    })
    const ctx = makeHoaCtx({
      request: { method: 'GET', url: '/api/secure' },
      state: { user: { id: 1 } },
    })
    await expect(middleware(ctx)).resolves.toBeUndefined()
  })

  it('resolves without error when next is not provided (unknown route)', async () => {
    const middleware = createJwtPermission({ publicRoutes: [], protectedRoutes: [] })
    const ctx = makeHoaCtx({ request: { method: 'GET', url: '/anything' } })
    await expect(middleware(ctx)).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// createJwtPermission — autoDiscovery
// ---------------------------------------------------------------------------

describe('createJwtPermission – autoDiscovery', () => {
  function makeAppCtx(
    publicRoutes: RouteRule[],
    protectedRoutes: RouteRule[],
    method = 'GET',
    url = '/',
    user?: unknown,
  ): PermissionContext {
    return {
      request: { method, url },
      state: user !== undefined ? { user } : {},
      res: {},
      app: { $routes: { publicRoutes, protectedRoutes } },
    }
  }

  it('reads public routes from app.$routes when autoDiscovery is true', async () => {
    const middleware = createJwtPermission({ autoDiscovery: true })
    const ctx = makeAppCtx(
      [{ method: 'POST', path: '/api/login' }],
      [],
      'POST',
      '/api/login',
    )
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('returns 401 for auto-discovered protected route without user', async () => {
    const middleware = createJwtPermission({ autoDiscovery: true })
    const ctx = makeAppCtx([], [{ method: 'GET', path: '/api/secret' }], 'GET', '/api/secret')
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(next).not.toHaveBeenCalled()
    expect((ctx as any).res.status).toBe(401)
  })

  it('passes through auto-discovered protected route with authenticated user', async () => {
    const middleware = createJwtPermission({ autoDiscovery: true })
    const ctx = makeAppCtx(
      [],
      [{ method: 'GET', path: '/api/secret' }],
      'GET',
      '/api/secret',
      { id: 1 },
    )
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('caches routes after the first request', async () => {
    const middleware = createJwtPermission({ autoDiscovery: true })

    const app = {
      $routes: {
        publicRoutes: [{ method: 'GET', path: '/api/cached' }],
        protectedRoutes: [],
      },
    }

    // First request — app is present, routes get cached
    const ctx1 = makeHoaCtx({ request: { method: 'GET', url: '/api/cached' }, app })
    const next1 = vi.fn(noop)
    await middleware(ctx1, next1)
    expect(next1).toHaveBeenCalledOnce()

    // Second request — no app on ctx, but routes should still be cached
    const ctx2 = makeHoaCtx({ request: { method: 'GET', url: '/api/cached' } })
    const next2 = vi.fn(noop)
    await middleware(ctx2, next2)
    expect(next2).toHaveBeenCalledOnce()
  })

  it('does not read app.$routes when autoDiscovery is false', async () => {
    const middleware = createJwtPermission({ autoDiscovery: false })
    // Even with app.$routes populated, routes are not loaded
    const ctx = makeAppCtx(
      [],
      [{ method: 'GET', path: '/api/secret' }],
      'GET',
      '/api/secret',
    )
    const next = vi.fn(noop)
    // With autoDiscovery off and no manual routes: unknown route → passes through
    await middleware(ctx, next)
    expect(next).toHaveBeenCalledOnce()
    expect((ctx as any).res.status).toBeUndefined()
  })

  it('uses ctx.state.app as fallback when ctx.app is absent', async () => {
    const middleware = createJwtPermission({ autoDiscovery: true })
    const ctx: PermissionContext = {
      request: { method: 'GET', url: '/api/state-pub' },
      state: {
        app: {
          $routes: {
            publicRoutes: [{ method: 'GET', path: '/api/state-pub' }],
            protectedRoutes: [],
          },
        },
      },
      res: {},
    }
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('uses manual publicRoutes alongside auto-discovered protectedRoutes', async () => {
    const middleware = createJwtPermission({
      autoDiscovery: true,
      publicRoutes: [{ method: 'GET', path: '/api/manual-pub' }],
      // protectedRoutes not provided → will be read from app.$routes
    })
    const ctx = makeAppCtx(
      [], // autoRouter provides no public routes (manual takes over)
      [{ method: 'GET', path: '/api/auto-prot' }],
      'GET',
      '/api/manual-pub',
    )
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('uses manual protectedRoutes alongside auto-discovered publicRoutes', async () => {
    const middleware = createJwtPermission({
      autoDiscovery: true,
      protectedRoutes: [{ method: 'GET', path: '/api/manual-prot' }],
      // publicRoutes not provided → will be read from app.$routes
    })
    // The auto-router provides a public route but we also add a manual protected route
    const ctx = makeAppCtx(
      [{ method: 'GET', path: '/api/auto-pub' }],
      [], // autoRouter has no protected routes
      'GET',
      '/api/manual-prot',
    )
    ctx.state = {} // no user
    const next = vi.fn(noop)
    await middleware(ctx, next)
    expect(next).not.toHaveBeenCalled()
    expect((ctx as any).res.status).toBe(401)
  })

  it('gracefully handles missing app.$routes (no crash)', async () => {
    const middleware = createJwtPermission({ autoDiscovery: true })
    // app exists but has no $routes
    const ctx = makeHoaCtx({
      request: { method: 'GET', url: '/api/test' },
      app: {} as any,
      state: {},
    })
    const next = vi.fn(noop)
    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(next).toHaveBeenCalledOnce()
  })
})
