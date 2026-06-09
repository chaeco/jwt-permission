# @chaeco/jwt-permission — AI Usage Guide

This file guides AI coding assistants (Claude Code, Codex, Copilot, etc.) on how to configure
`@chaeco/jwt-permission` correctly in consumer projects.

## What It Is

Framework-agnostic JWT route permission middleware. It does NOT verify tokens — it only checks
whether the upstream JWT middleware has placed a user payload on `ctx.state.user`.

## Critical: Middleware Order

```
[JWT parser] → [jwtAuth] → [route handlers]
```

The JWT parsing middleware MUST run BEFORE `jwtAuth`. `jwtAuth` only reads `ctx.state.user` — it
never touches the token itself. If the order is wrong, every request will get 401.

## Config Patterns

### Pattern A: Auto-discovery with `@chaeco/auto-router` (recommended)

Use when the project already uses `@chaeco/auto-router` for route discovery.

```typescript
import { jwtAuth } from '@chaeco/jwt-permission'

app.use(jwtAuth({ autoDiscovery: true }))
```

Routes are automatically classified as public or protected based on `createHandler()` metadata.

### Pattern B: Manual route lists

Use when routes are defined inline (Express, Koa without auto-router, etc.).

```typescript
import { jwtAuth } from '@chaeco/jwt-permission'

app.use(jwtAuth({
  publicRoutes: [
    { method: 'POST', path: '/api/auth/login' },
    { method: 'POST', path: '/api/auth/register' },
  ],
  protectedRoutes: [
    { method: 'GET', path: '/api/users/:id' },
    { method: 'DELETE', path: '/api/users/:id' },
  ],
}))
```

### Pattern C: Custom matcher functions

Use when route classification follows a convention (e.g., prefix-based).

```typescript
app.use(jwtAuth({
  isPublicRoute: (method, path) => path.startsWith('/api/public/'),
  isProtectedRoute: (method, path) => path.startsWith('/api/'),
}))
```

When both custom matchers are provided, internal route-list parsing is skipped entirely — fastest path.

## Framework-Specific Setup

### Hoa

```typescript
import { jwt } from '@hoajs/jwt'
import { jwtAuth } from '@chaeco/jwt-permission'

app.use(jwt({ secret: process.env.JWT_SECRET!, algorithms: ['HS256'] }))
app.use(jwtAuth({ autoDiscovery: true }))
```

### Koa

```typescript
import koaJwt from 'koa-jwt'
import { jwtAuth } from '@chaeco/jwt-permission'

app.use(koaJwt({ secret: process.env.JWT_SECRET! }))
app.use(jwtAuth({
  publicRoutes: [{ method: 'POST', path: '/api/auth/login' }],
  protectedRoutes: [{ method: 'GET', path: '/api/profile' }],
}))
```

### Express

Express does not have a native `ctx.state` convention. Bridge it manually:

```typescript
import { expressjwt } from 'express-jwt'
import { jwtAuth } from '@chaeco/jwt-permission'

// Bridge: req.auth → ctx.state.user
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

## Route Rule Format

```typescript
interface RouteRule {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'  // case-insensitive
  path: string  // must start with "/", supports ":param" segments, no wildcards
}
```

- Path params: `/api/users/:userId/posts/:postId`
- Trailing slash is significant: `/api/users` ≠ `/api/users/`
- Wildcards (`*`) are NOT supported — use `isPublicRoute`/`isProtectedRoute` for glob matching

## Retrieving the Authenticated User

```typescript
import { getCurrentUser, isAuthenticated } from '@chaeco/jwt-permission'

async function handler(ctx) {
  const user = getCurrentUser(ctx)   // → { id, username, ... } | null
  if (isAuthenticated(ctx)) {
    // ctx.state.user is present
  }
}
```

## Common Mistakes

1. **Middleware order backwards** — JWT parser must come before `jwtAuth`
2. **Missing `unauthorizedResponse` in Express** — the built-in default only handles Hoa/Koa style; Express needs a custom handler
3. **Wildcards in route rules** — use `isPublicRoute`/`isProtectedRoute` instead
4. **Assuming `jwtAuth` verifies tokens** — it doesn't. Token verification is the upstream middleware's job
5. **Route paths without leading `/`** — all paths must start with `/`

## Exported API

| Export | Purpose |
|--------|---------|
| `jwtAuth(options)` | Create middleware (alias for `createJwtPermission`) |
| `jwtPermission(options)` | Same as `jwtAuth` |
| `createJwtPermission<T>(options)` | Create middleware with explicit generic context type |
| `getCurrentUser(ctx)` | Read authenticated user from context |
| `isAuthenticated(ctx)` | Check if request is authenticated |

### Exported Types

```typescript
import type {
  HttpMethod,
  PermissionContext,
  PermissionMiddleware,
  RouteRule,
  JwtPermissionOptions,
} from '@chaeco/jwt-permission'
```
