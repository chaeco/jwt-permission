# hoa-jwt-permission

JWT 权限管理中间件，用于 Hoa.js 框架的路由权限控制。

## 功能

- ✅ 基于路由配置的权限管理
- ✅ 自动从 autoRouter 发现路由权限信息（无需手动维护列表）
- ✅ 支持公开路由和受保护路由
- ✅ 支持路径参数匹配（如 `/api/users/:userId`）
- ✅ 自定义路由匹配逻辑
- ✅ 自定义未授权错误响应
- ✅ 完整的 TypeScript 支持

## 安装

使用 SSH：

```bash
npm install git+ssh://git@github.com/chaeco/hoa-jwt-permission.git
```

或使用 HTTPS：

```bash
npm install git+https://github.com/chaeco/hoa-jwt-permission.git
```

## 快速开始

### 方式 1: 自动发现（推荐）

配合 `@chaeco/hoa-auto-router` 使用，自动读取路由权限信息：

```typescript
import { jwtAuth } from '@chaeco/hoa-jwt-permission'
import { autoRouter } from '@chaeco/hoa-auto-router'

// autoRouter 会发现 controllers/ 中的路由，并提取权限元数据
app.extend(
  autoRouter({
    defaultRequiresAuth: false,
  })
)

// jwtAuth 自动从 autoRouter 读取权限配置
app.use(
  jwtAuth({
    autoDiscovery: true,
  })
)
```

### 方式 2: 手动配置

```typescript
import { jwtAuth } from '@chaeco/hoa-jwt-permission'

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

### 在控制器中使用

```typescript
import { getCurrentUser } from '@chaeco/hoa-jwt-permission'

async function getInfoHandler(ctx) {
  const user = getCurrentUser(ctx)
  ctx.res.body = { success: true, data: user }
}
```

## API

### `jwtAuth(options)`

创建 JWT 权限中间件（`createJwtPermission` 的简写别名）。

**参数**：

- `options` (object)
  - `autoDiscovery` (boolean) - 是否启用自动发现（默认 true）
  - `publicRoutes` (RouteRule[]) - 公开路由列表（可选）
  - `protectedRoutes` (RouteRule[]) - 受保护路由列表（可选）
  - `unauthorizedResponse` (function) - 自定义未授权响应
  - `isPublicRoute` (function) - 自定义公开路由检查逻辑
  - `isProtectedRoute` (function) - 自定义受保护路由检查逻辑

**返回**：HoaMiddleware

### `createJwtPermission(options)`

与 `jwtAuth()` 功能相同（长名称版本）。

### `getCurrentUser(ctx)`

获取当前认证的用户信息。

```typescript
const user = getCurrentUser(ctx)
// user = { id: 1, username: 'demo', ... }
```

### `isAuthenticated(ctx)`

检查用户是否已认证。

```typescript
if (isAuthenticated(ctx)) {
  // 用户已认证
}
```

## 与 autoRouter 配合使用

### 在控制器中标记权限

```typescript
// controllers/users/get-info.ts
import { createHandler } from '@chaeco/hoa-auto-router'

export default createHandler(
  { requiresAuth: true }, // 标记需要认证
  async (ctx, user) => {
    return { success: true, data: user }
  }
)

// controllers/auth/post-login.ts
export default createHandler(
  { requiresAuth: false }, // 标记公开接口
  async ctx => {
    // 登录逻辑
  }
)
```

### 工作流程

1. `autoRouter` 扫描 `controllers/` 目录
2. 提取 `createHandler()` 的 `requiresAuth` 元数据
3. 将路由信息存储到 `app.$routes`
4. `jwtAuth` 启动时自动从 `app.$routes` 读取配置
5. **无需重复定义路由列表！**

## 路由规则

### 基本配置

```typescript
const routes = [
  { method: 'GET', path: '/api/users' },
  { method: 'POST', path: '/api/posts' },
  { method: 'DELETE', path: '/api/posts/:id' },
]
```

### 支持的 HTTP 方法

- GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS

### 路径参数匹配

支持 `:paramName` 格式的参数：

```typescript
{ method: 'GET', path: '/api/users/:userId/posts/:postId' }
// 匹配：/api/users/123/posts/456
```

## 自定义匹配逻辑

```typescript
const jwtAuth = jwtAuth({
  isPublicRoute: (method, path) => {
    // 自定义逻辑
    return path.startsWith('/api/public')
  },
  isProtectedRoute: (method, path) => {
    // 自定义逻辑
    return path.startsWith('/api/admin')
  },
})
```

## 自定义错误响应

```typescript
const jwtAuth = jwtAuth({
  autoDiscovery: true,
  unauthorizedResponse: ctx => {
    ctx.res.status = 401
    ctx.res.body = {
      success: false,
      message: '需要身份验证',
      code: 'AUTH_REQUIRED',
    }
  },
})
```

## 与 @hoajs/jwt 配合使用

中间件顺序很重要：

```typescript
import { jwt } from '@hoajs/jwt'
import { jwtAuth } from '@chaeco/hoa-jwt-permission'

const middlewares = [
  // ... 其他中间件 ...

  // 第1层：@hoajs/jwt 验证 token 有效性
  jwt({ secret: config.jwtSecret, algorithms: ['HS256'] }),

  // 第2层：jwtAuth 检查路由权限
  jwtAuth({
    autoDiscovery: true, // 自动从 autoRouter 发现
  }),

  // ... 其他中间件 ...
]

middlewares.forEach(middleware => app.use(middleware))
```

## 执行流程

```text
请求到达
  ↓
[1] @hoajs/jwt（验证 token）
  ├─ 提取并验证 token 签名和过期时间
  ├─ 如果有效 → 存储到 ctx.state.user
  └─ 如果无效 → 返回 401
  ↓
[2] autoRouter（发现并注册路由）
  ├─ 从 controllers/ 提取路由
  ├─ 收集权限元数据（requiresAuth）
  └─ 存储到 app.$routes
  ↓
[3] jwtAuth（检查路由权限）
  ├─ 检查是否公开路由 → 放行
  ├─ 检查是否受保护路由
  │  ├─ 有 ctx.state.user → 放行
  │  └─ 无 ctx.state.user → 返回 401
  └─ 其他路由 → 放行
  ↓
处理器（业务逻辑）
```

## 最佳实践

✅ **应该做**：

- 使用 `autoDiscovery: true` 与 autoRouter 配合
- 在控制器中用 `createHandler()` 明确标记权限要求
- 在中间件后面的控制器中使用 `getCurrentUser()`
- 定期审计路由权限配置
- 使用强 JWT secret

❌ **不应该做**：

- 混合使用自动发现和手动配置
- 忘记在 `@hoajs/jwt` 之后使用此中间件
- 在路由匹配中使用正则表达式（使用 `:paramName` 格式）
- 硬编码敏感端点的权限配置

## 示例

### 完整示例（推荐：与 autoRouter 配合）

```typescript
import { Hoa } from 'hoa'
import { jwt } from '@hoajs/jwt'
import { jwtAuth, getCurrentUser } from '@chaeco/hoa-jwt-permission'
import { autoRouter } from '@chaeco/hoa-auto-router'
import config from './config'

const app = new Hoa()

// 第1层：JWT 验证
app.use(jwt({ secret: config.jwtSecret, algorithms: ['HS256'] }))

// 第2层：权限检查（自动发现）
app.use(jwtAuth({ autoDiscovery: true }))

// 路由发现
app.extend(
  autoRouter({
    defaultRequiresAuth: false,
  })
)

// 处理器示例
app.get('/api/users/info', async ctx => {
  const user = getCurrentUser(ctx)
  ctx.res.body = { success: true, data: user }
})

app.listen(3000)
```

### 类型定义

```typescript
interface RouteRule {
  method: string
  path: string
}

interface JwtPermissionOptions {
  autoDiscovery?: boolean
  publicRoutes?: RouteRule[]
  protectedRoutes?: RouteRule[]
  unauthorizedResponse?: (ctx: HoaContext) => void
  isPublicRoute?: (method: string, path: string) => boolean
  isProtectedRoute?: (method: string, path: string) => boolean
}
```

## 常见问题

**Q: 自动发现和手动配置能混合使用吗？**

A: 不建议混合使用。建议要么使用 `autoDiscovery: true` 配合 `autoRouter`，要么完全手动配置路由列表。

**Q: 如何排除特定路由？**

A: 使用 `publicRoutes` 明确指定公开路由即可

```typescript
jwtAuth({
  publicRoutes: [
    { method: 'POST', path: '/api/auth/login' },
    { method: 'POST', path: '/api/users/register' },
    { method: 'GET', path: '/api/health' },
  ],
})
```

**Q: 如何处理刷新 token？**

A: 在登录端点中实现 token 刷新逻辑，标记为公开路由

```typescript
{
  method: 'POST',
  path: '/api/auth/refresh',  // 公开端点
}
```

**Q: 多租户应用如何使用？**

A: 在 `unauthorizedResponse` 中添加租户信息校验

```typescript
unauthorizedResponse: ctx => {
  const user = ctx.state.user
  const tenantId = ctx.params.tenantId
  
  if (user.tenantId !== tenantId) {
    ctx.res.status = 403
    ctx.res.body = { error: '无权访问' }
  }
}
```

## 集成示例

### 与 Express 集成

如果使用 Express 而非 Hoa，需要编写适配器：

```typescript
const expressJwtAuth = (options) => {
  const middleware = jwtAuth(options)
  return (req, res, next) => {
    // 适配 Express 到 Hoa 上下文
    const ctx = { state: {}, req, res }
    middleware(ctx, next)
  }
}
```

### 日志集成

```typescript
import { jwtAuth } from '@chaeco/hoa-jwt-permission'
import { logger } from '@chaeco/logger'

const jwtAuthMiddleware = jwtAuth({
  autoDiscovery: true,
  unauthorizedResponse: ctx => {
    logger.warn(`未授权访问: ${ctx.req.method} ${ctx.req.url}`)
    ctx.res.status = 401
    ctx.res.body = { error: '未授权' }
  },
})
```

## 性能考虑

- ✅ 路由匹配使用高效的正则表达式
- ✅ Token 验证由 `@hoajs/jwt` 处理
- ✅ 权限检查为同步操作，无性能开销
- ✅ 自动发现仅在中间件初始化时执行一次

## 更新日志

### v1.0.0 (2024-01)

- 初始发布
- 支持自动发现
- 支持手动配置
- 自定义匹配逻辑
- TypeScript 支持

## 许可

ISC
