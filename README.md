# @chaeco/jwt-permission

English | [中文](./README-zh.md)

[![version](https://img.shields.io/badge/version-1.0.1-blue.svg)](./CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen.svg)](./coverage)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](./package.json)

Framework-agnostic JWT route permission middleware for Node.js. Compatible with Hoa, Koa, Express, and any framework that uses a `ctx.state.user` convention.

## Features

- ✅ **Framework-agnostic** — works with Hoa, Koa, Express, and more
- ✅ Route-based permission control
- ✅ Auto-discovery via `@chaeco/auto-router` — no manual route lists needed
- ✅ Public and protected route support
- ✅ Path parameter matching (e.g. `/api/users/:userId`)
- ✅ URL-decode safety — prevents `%xx` encoding bypass attacks
- ✅ Custom route matching logic
- ✅ Custom unauthorized response handler
- ✅ Full TypeScript generics support

## Installation

This package is not yet published to npm. Install directly from GitHub:

```bash
npm install github:chaeco/jwt-permission
```

Or pin to a specific tag:

```bash
npm install github:chaeco/jwt-permission#v1.0.1
```

## Quick Start

### Option 1: Auto-discovery (Recommended)

Use with `@chaeco/auto-router` to automatically read route permission metadata:

```typescript
import { jwtAuth } from '@chaeco/jwt-permission'
import { autoRouter } from '@chaeco/auto-router'

// autoRouter scans controllers/ and extracts permission metadata
app.extend(
  autoRouter({
    defaultRequiresAuth: false,
  })
)

// jwtAuth reads permission config automatically from autoRouter
app.use(
  jwtAuth({
    autoDiscovery: true,
  })
)
```

### Option 2: Manual configuration

```typescript
import { jwtAuth } from '@chaeco/jwt-permission'

app.use(
  jwtAuth({
    publicRoutes: [
      { method: 'POST', path: '/api/auth/login' },
      { method: 'POST', path: '/api/users/register' },
    ],
    protectedRoutes: [
      { method: 'GET', path: '/api/users/info' },
      { method: 'DELETE', path: '/api/users/:id' },
    ],
  })
)
```

### Using in a controller

```typescript
import { getCurrentUser } from '@chaeco/jwt-permission'

async function getInfoHandler(ctx) {
  const user = getCurrentUser(ctx)
  ctx.res.body = { success: true, data: user }
}
```

## API

### `jwtAuth(options)`

Creates a JWT permission middleware (shorthand alias for `createJwtPermission`).

**Options**:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `autoDiscovery` | `boolean` | `true` | Enable auto-discovery from `app.$routes` |
| `publicRoutes` | `RouteRule[]` | — | Routes that skip JWT verification |
| `protectedRoutes` | `RouteRule[]` | — | Routes that require JWT verification |
| `unauthorizedResponse` | `(ctx) => void` | built-in | Custom 401 response handler |
| `isPublicRoute` | `(method, path) => boolean` | — | Custom public route matcher (overrides built-in) |
| `isProtectedRoute` | `(method, path) => boolean` | — | Custom protected route matcher (overrides built-in) |

**Returns**: `PermissionMiddleware<TContext>`

> **Built-in `unauthorizedResponse`** auto-detects the framework style:
> - Hoa style: writes to `ctx.res.status` / `ctx.res.body`
> - Koa style: writes to `ctx.status` / `ctx.body`
> - Other frameworks (e.g. Express): **must** provide a custom `unauthorizedResponse`

### `createJwtPermission<TContext>(options)`

Same as `jwtAuth()`, with explicit generic support for custom context types:

```typescript
import { createJwtPermission } from '@chaeco/jwt-permission'
import type { MyAppContext } from './types'

const middleware = createJwtPermission<MyAppContext>({ ... })
```

### `getCurrentUser(ctx)`

Returns the authenticated user stored in `ctx.state.user`, or `null` if not authenticated.

```typescript
const user = getCurrentUser(ctx)
// { id: 1, username: 'alice', ... } | null
```

### `isAuthenticated(ctx)`

Returns `true` if `ctx.state.user` is present.

```typescript
if (isAuthenticated(ctx)) {
  // request is authenticated
}
```

## Integration with `@chaeco/auto-router`

### Marking permissions in controllers

```typescript
// controllers/users/get-info.ts
import { createHandler } from '@chaeco/auto-router'

export default createHandler(
  async ctx => {
    ctx.res.body = { success: true, data: ctx.state.user }
  },
  { requiresAuth: true },
)

// controllers/auth/post-login.ts
export default createHandler(
  async ctx => {
    // login logic
  },
  { requiresAuth: false },
)
```

### How it works

1. `autoRouter` scans the `controllers/` directory
2. Extracts `requiresAuth` metadata from `createHandler()` calls
3. Stores route info in `app.$routes`
4. `jwtAuth` reads and caches `app.$routes` **on the first request**
5. **No duplicated route lists needed!**

## Route Rules

### HTTP methods

`GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS` — case-insensitive.

### Path format

- Must start with `/`
- Trailing slash is significant (`/api/users` ≠ `/api/users/`)
- Supports `:paramName` syntax for dynamic segments
- Wildcards (`*`) are **not** supported — use `isPublicRoute` / `isProtectedRoute` instead

### Path parameter matching

```typescript
{ method: 'GET', path: '/api/users/:userId/posts/:postId' }
// matches: /api/users/123/posts/456
```

## Custom Route Matching

```typescript
import { createJwtPermission } from '@chaeco/jwt-permission'

const middleware = createJwtPermission({
  isPublicRoute: (method, path) => path.startsWith('/api/public'),
  isProtectedRoute: (method, path) => path.startsWith('/api/admin'),
})
```

> `method` is always uppercase (e.g. `'GET'`). `path` is URL-decoded and query-string-free.

## Custom Unauthorized Response

```typescript
import { jwtAuth } from '@chaeco/jwt-permission'

const middleware = jwtAuth({
  unauthorizedResponse: ctx => {
    ctx.res.status = 401
    ctx.res.body = {
      success: false,
      message: 'Authentication required',
      code: 'UNAUTHORIZED',
    }
  },
})
```

## Middleware Order

JWT token parsing **must run before** `jwtAuth`. The upstream JWT middleware is responsible for verifying the token and writing the decoded payload to `ctx.state.user`.

```typescript
// Hoa
import { jwt } from '@hoajs/jwt'
app.use(jwt({ secret: process.env.JWT_SECRET!, algorithms: ['HS256'] }))
app.use(jwtAuth({ autoDiscovery: true }))

// Koa
import koaJwt from 'koa-jwt'
app.use(koaJwt({ secret: process.env.JWT_SECRET! }))
app.use(jwtAuth({ autoDiscovery: true }))
```

## Request Flow

```text
Incoming request
  ↓
[1] JWT parsing middleware
  ├─ Verify token signature & expiry
  ├─ Valid   → write decoded payload to ctx.state.user
  └─ Invalid → return 401
  ↓
[2] autoRouter (route registration)
  ├─ Scan controllers/
  ├─ Collect requiresAuth metadata
  └─ Store in app.$routes
  ↓
[3] jwtAuth (permission check)
  ├─ Public route?    → pass through
  ├─ Protected route?
  │  ├─ ctx.state.user exists → pass through
  │  └─ ctx.state.user absent → return 401
  └─ Unknown route    → pass through (default allow)
  ↓
Route handler (business logic)
```

## Best Practices

✅ **Do**:

- Use `autoDiscovery: true` together with `@chaeco/auto-router`
- Explicitly mark route permissions with `createHandler()` in controllers
- Use `getCurrentUser()` in handlers after the middleware chain
- Regularly audit route permission configuration
- Use strong JWT secrets

❌ **Don't**:

- Forget to place JWT token-parsing middleware before `jwtAuth`
- Use wildcards (`*`) in route rules — use `isPublicRoute` / `isProtectedRoute` instead
- Hardcode permissions for sensitive endpoints — declare them with `createHandler` in controllers

## Examples

### Hoa + autoRouter (recommended)

```typescript
import { Hoa } from 'hoa'
import { jwt } from '@hoajs/jwt'
import { jwtAuth, getCurrentUser } from '@chaeco/jwt-permission'
import { autoRouter } from '@chaeco/auto-router'

const app = new Hoa()

app.use(jwt({ secret: process.env.JWT_SECRET!, algorithms: ['HS256'] }))
app.use(jwtAuth({ autoDiscovery: true }))
app.extend(autoRouter({ defaultRequiresAuth: false }))

app.get('/api/users/info', async ctx => {
  ctx.res.body = { success: true, data: getCurrentUser(ctx) }
})

app.listen(3000)
```

### Koa

```typescript
import Koa from 'koa'
import koaJwt from 'koa-jwt'
import { jwtAuth } from '@chaeco/jwt-permission'

const app = new Koa()

app.use(koaJwt({ secret: process.env.JWT_SECRET! }))
app.use(
  jwtAuth({
    publicRoutes: [{ method: 'POST', path: '/api/auth/login' }],
    protectedRoutes: [{ method: 'GET', path: '/api/profile' }],
  })
)

app.listen(3000)
```

### Express

Express uses a different `req`/`res` structure. Bridge `req.auth` to `ctx.state.user` and provide a custom `unauthorizedResponse`:

```typescript
import express from 'express'
import { expressjwt } from 'express-jwt'
import { jwtAuth } from '@chaeco/jwt-permission'

const app = express()

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

app.listen(3000)
```

## TypeScript

All types are exported directly from the package:

```typescript
import type {
  HttpMethod,
  PermissionContext,
  PermissionMiddleware,
  RouteRule,
  JwtPermissionOptions,
} from '@chaeco/jwt-permission'
```

## FAQ

**Q: Can I mix auto-discovery and manual configuration?**

A: Yes. `autoDiscovery` only fills in the side that is not manually provided (`publicRoutes` or `protectedRoutes`). Both sides are independent.

**Q: How do I make a route always public?**

```typescript
jwtAuth({
  publicRoutes: [
    { method: 'POST', path: '/api/auth/login' },
    { method: 'POST', path: '/api/users/register' },
    { method: 'GET', path: '/api/health' },
  ],
})
```

**Q: How do I handle token refresh?**

Mark the refresh endpoint as a public route:

```typescript
{ method: 'POST', path: '/api/auth/refresh' }
```

**Q: What happens to routes not in either list?**

They are allowed through by default (pass-through behavior).

## Performance

- ✅ Route regexes are compiled once and cached at module level
- ✅ Auto-discovered routes are read and cached on the first request only
- ✅ When both sides are covered by custom functions, all route list parsing is skipped
- ✅ Token verification is handled by the upstream JWT middleware — this middleware only checks whether `ctx.state.user` exists

## AI Tool Skills

This package includes AI agent skills for Claude Code and OpenAI Codex.

After installation, run **one command** to copy the skills into your project:

```bash
npx jwt-permission-init-skills
```

This places skill files into `.claude/skills/jwt-permission/` and `.codex/skills/jwt-permission/`.
AI tools will then enforce correct middleware order, framework-specific setup (Hoa / Koa / Express),
route rule format, and auth best practices when adding JWT permission checks.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

## License

MIT
