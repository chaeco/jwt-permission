---
name: jwt-permission
description: >-
  JWT route permission middleware for Node.js (Hoa, Koa, Express, etc.).
  Used when adding JWT-based access control to API routes.
  Enforces correct middleware order, framework-specific setup, route rule
  format, and auth best practices.
---

## JWT Permission Middleware

Framework-agnostic middleware that enforces JWT auth gating on API routes.
It does **not** verify tokens — it reads `ctx.state.user` (set by an upstream
JWT parser) and blocks or allows the request based on route rules.

### Quick start

```typescript
import { jwtAuth } from '@chaeco/jwt-permission'

// JWT parser MUST run first
app.use(jwtParser({ secret: process.env.JWT_SECRET! }))
app.use(jwtAuth({ autoDiscovery: true }))
```

### Exports

| Export | Purpose |
|--------|---------|
| `jwtAuth(options)` | Create middleware |
| `createJwtPermission<T>(options)` | Same, with explicit generic context type |
| `getCurrentUser(ctx)` | Returns `ctx.state?.user ?? null` |
| `isAuthenticated(ctx)` | Returns `getCurrentUser(ctx) !== null` |

### Core rules

**Middleware order.** The JWT parser that writes `ctx.state.user` MUST run before
`jwtAuth`. If reversed, every request returns 401.

**Three config patterns — pick one:**
- `autoDiscovery: true` — with `@chaeco/auto-router`; routes inherit auth from controller metadata
- `publicRoutes` + `protectedRoutes` — manual arrays
- `isPublicRoute` + `isProtectedRoute` — custom callbacks (fastest: skips internal list parsing)

**Route rule format:** method (case-insensitive), path must start with `/`, supports
`:param` segments. No wildcards — use callback matchers instead.
Trailing slash is significant (`/api/users` ≠ `/api/users/`).

**Framework auto-detection.** The built-in `unauthorizedResponse` handles Hoa
(`ctx.res.body`) and Koa (`ctx.body`). Express and other frameworks **must**
provide a custom `unauthorizedResponse`.

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `autoDiscovery` | `boolean` | `true` | Read routes from `app.$routes` (requires `@chaeco/auto-router`) |
| `publicRoutes` | `RouteRule[]` | `[]` | Routes that skip JWT check |
| `protectedRoutes` | `RouteRule[]` | `[]` | Routes that require `ctx.state.user` |
| `unauthorizedResponse` | `(ctx) => void` | built-in | Custom 401 handler |
| `isPublicRoute` | `(method, path) => boolean` | — | Custom public matcher |
| `isProtectedRoute` | `(method, path) => boolean` | — | Custom protected matcher |

### Guardrails

- ❌ Never place `jwtAuth` before the JWT parsing middleware
- ❌ Never use wildcards (`*`) in `RouteRule.path` — use callback matchers
- ❌ Never assume `jwtAuth` verifies tokens — it only checks `ctx.state.user`
- ❌ Never forget `unauthorizedResponse` for Express — the built-in only covers Hoa/Koa
- ❌ Never use paths without a leading `/`

### Framework examples

**Hoa (recommended path):**
```typescript
import { jwt } from '@hoajs/jwt'
import { jwtAuth } from '@chaeco/jwt-permission'

app.use(jwt({ secret: process.env.JWT_SECRET!, algorithms: ['HS256'] }))
app.use(jwtAuth({ autoDiscovery: true }))
```

**Koa:**
```typescript
import koaJwt from 'koa-jwt'
import { jwtAuth } from '@chaeco/jwt-permission'

app.use(koaJwt({ secret: process.env.JWT_SECRET! }))
app.use(jwtAuth({
  publicRoutes: [{ method: 'POST', path: '/api/auth/login' }],
  protectedRoutes: [{ method: 'GET', path: '/api/profile' }],
}))
```

**Express (needs manual bridge):**
```typescript
import { expressjwt } from 'express-jwt'
import { jwtAuth } from '@chaeco/jwt-permission'

app.use((req, res, next) => {
  expressjwt({ secret: process.env.JWT_SECRET!, algorithms: ['HS256'] })(req, res, () => {
    ;(req as any).state = { user: (req as any).auth }
    next()
  })
})

const permission = jwtAuth({
  publicRoutes: [{ method: 'POST', path: '/api/auth/login' }],
  protectedRoutes: [{ method: 'GET', path: '/api/profile' }],
  unauthorizedResponse: ctx => {
    ;(ctx as any).res.status(401).json({ success: false, code: 'UNAUTHORIZED' })
  },
})

app.use((req, res, next) => {
  permission({ req, res, state: (req as any).state ?? {} } as any, next as any)
})
```

**Path parameters:**
```typescript
protectedRoutes: [
  { method: 'GET', path: '/api/users/:userId' },
  { method: 'GET', path: '/api/users/:userId/posts/:postId' },
]
```

**Custom matchers (prefix-based):**
```typescript
app.use(jwtAuth({
  isPublicRoute: (m, p) => p.startsWith('/api/public/'),
  isProtectedRoute: (m, p) => p.startsWith('/api/'),
}))
```

**Mixed auto-discovery + manual routes (each side independent):**
```typescript
app.use(jwtAuth({
  autoDiscovery: true,
  publicRoutes: [
    { method: 'GET', path: '/api/health' },
    { method: 'GET', path: '/api/metrics' },
  ],
  // protectedRoutes auto-discovered from controller metadata
}))
```
