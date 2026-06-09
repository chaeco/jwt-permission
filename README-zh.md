# @chaeco/jwt-permission

[English](./README.md) | 中文

[![version](https://img.shields.io/badge/version-1.0.1-blue.svg)](./CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen.svg)](./coverage)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](./package.json)

框架无关的 JWT 路由权限中间件，兼容 Hoa、Koa、Express 等 Node.js 框架。

## 功能

- ✅ 框架无关：兼容 Hoa、Koa、Express 等任意框架
- ✅ 基于路由配置的权限管理
- ✅ 自动从 `@chaeco/auto-router` 发现路由权限信息（无需手动维护列表）
- ✅ 支持公开路由和受保护路由
- ✅ 支持路径参数匹配（如 `/api/users/:userId`）
- ✅ URL 编码安全：自动解码路径，防止 `%xx` 编码绕过匹配
- ✅ 自定义路由匹配逻辑
- ✅ 自定义未授权错误响应
- ✅ 完整的 TypeScript 泛型支持

## 安装

此包尚未发布到 npm，可直接从 GitHub 安装：

```bash
npm install github:chaeco/jwt-permission
```

或指定版本标签：

```bash
npm install github:chaeco/jwt-permission#v1.0.1
```

## 快速开始

### 方式 1: 自动发现（推荐）

配合 `@chaeco/auto-router` 使用，自动读取路由权限信息：

```typescript
import { jwtAuth } from '@chaeco/jwt-permission'
import { autoRouter } from '@chaeco/auto-router'

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

### 在控制器中使用

```typescript
import { getCurrentUser } from '@chaeco/jwt-permission'

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

**返回**：`PermissionMiddleware<TContext>`

### `createJwtPermission<TContext>(options)`

与 `jwtAuth()` 功能相同（长名称版本），支持泛型传入自定义上下文类型。

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
import { createHandler } from '@chaeco/auto-router'

export default createHandler(
  async ctx => {
    ctx.res.body = { success: true, data: { userId: ctx.currentUser?.id } }
  },
  { requiresAuth: true }, // 标记需要认证
)

// controllers/auth/post-login.ts
export default createHandler(
  async ctx => {
    // 登录逻辑
  },
  { requiresAuth: false }, // 标记公开接口
)
```

### 工作流程

1. `autoRouter` 扫描 `controllers/` 目录
2. 提取 `createHandler()` 的 `requiresAuth` 元数据
3. 将路由信息存储到 `app.$routes`
4. `jwtAuth` 在**首次请求时**自动从 `app.$routes` 读取配置并缓存
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
import { createJwtPermission } from '@chaeco/jwt-permission'

const middleware = createJwtPermission({
  isPublicRoute: (method, path) => {
    return path.startsWith('/api/public')
  },
  isProtectedRoute: (method, path) => {
    return path.startsWith('/api/admin')
  },
})
```

## 自定义错误响应

```typescript
import { jwtAuth } from '@chaeco/jwt-permission'

const middleware = jwtAuth({
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

## 与 JWT 解析中间件配合使用

中间件顺序很重要，JWT 解析必须在权限检查之前执行，将用户信息写入 `ctx.state.user`：

```typescript
import { jwtAuth } from '@chaeco/jwt-permission'

// Hoa 示例（@hoajs/jwt 负责解析 token）
import { jwt } from '@hoajs/jwt'
app.use(jwt({ secret: config.jwtSecret, algorithms: ['HS256'] }))
app.use(jwtAuth({ autoDiscovery: true }))

// Koa 示例（koa-jwt 负责解析 token）
import koaJwt from 'koa-jwt'
app.use(koaJwt({ secret: config.jwtSecret }).unless({ path: [/\/public/] }))
app.use(jwtAuth({ autoDiscovery: true }))
```

## 执行流程

```text
请求到达
  ↓
[1] JWT 解析中间件（验证 token）
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

- 忘记在 JWT token 解析中间件之后使用本中间件
- 在路由规则中使用通配符（`*`），请改用 `isPublicRoute` / `isProtectedRoute`
- 硬编码敏感端点的权限配置（应在控制器中用 `createHandler` 声明）

## 示例

### 完整示例（Hoa + autoRouter）

```typescript
import { Hoa } from 'hoa'
import { jwt } from '@hoajs/jwt'
import { jwtAuth, getCurrentUser } from '@chaeco/jwt-permission'
import { autoRouter } from '@chaeco/auto-router'
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

### 完整示例（Koa）

```typescript
import Koa from 'koa'
import koaJwt from 'koa-jwt'
import { jwtAuth, getCurrentUser } from '@chaeco/jwt-permission'

const app = new Koa()

// 第1层：JWT 解析（写入 ctx.state.user）
app.use(koaJwt({ secret: config.jwtSecret }))

// 第2层：权限检查
app.use(
  jwtAuth({
    publicRoutes: [
      { method: 'POST', path: '/api/auth/login' },
    ],
    protectedRoutes: [
      { method: 'GET', path: '/api/profile' },
    ],
  })
)

app.listen(3000)
```

### 完整示例（Express）

Express 的 req/res 结构与 Hoa/Koa 不同，需通过 `unauthorizedResponse` 自定义响应写入方式：

```typescript
import express from 'express'
import { expressjwt } from 'express-jwt'
import { jwtAuth } from '@chaeco/jwt-permission'

const app = express()

// 第1层：JWT 解析（express-jwt 将 payload 写入 req.auth）
// 注意：需自行将 req.auth 桥接到 ctx.state.user
app.use((req, res, next) => {
  expressjwt({ secret: config.jwtSecret, algorithms: ['HS256'] })(req, res, () => {
    ;(req as any).state = { user: (req as any).auth }
    next()
  })
})

// 第2层：权限检查
const jwtPermission = jwtAuth({
  publicRoutes: [{ method: 'POST', path: '/api/auth/login' }],
  protectedRoutes: [{ method: 'GET', path: '/api/profile' }],
  unauthorizedResponse: ctx => {
    // Express 风格响应
    ;(ctx as any).res.status(401).json({ success: false, code: 'UNAUTHORIZED' })
  },
})

app.use((req, res, next) => {
  const ctx = { req, res, state: (req as any).state ?? {} }
  jwtPermission(ctx as any, next as any)
})

app.listen(3000)
```

### 类型定义

```typescript
import type {
  HttpMethod,
  PermissionContext,
  PermissionMiddleware,
  RouteRule,
  JwtPermissionOptions,
} from '@chaeco/jwt-permission'

// 所有类型均从包中直接导出，无需手动声明
```

## 常见问题

**Q: 自动发现和手动配置能混合使用吗？**

A: 可以。`autoDiscovery` 仅在对应一侧（`publicRoutes` 或 `protectedRoutes`）未手动提供时才生效，两者互不干扰，可按需分别指定。

**Q: 如何排除特定路由？**

A: 使用 `publicRoutes` 明确指定公开路由即可：

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

A: 将刷新端点标记为公开路由即可：

```typescript
{ method: 'POST', path: '/api/auth/refresh' }
```

**Q: 多租户应用如何使用？**

A: 在 `unauthorizedResponse` 中加入租户信息校验：

```typescript
unauthorizedResponse: ctx => {
  ctx.res.status = 403
  ctx.res.body = { error: '无权访问' }
}
```

## 性能说明

- ✅ 路由正则在首次使用时编译并缓存，后续请求直接复用
- ✅ 自动发现的路由在首次请求时读取并缓存，不重复查询 `app.$routes`
- ✅ 两侧均由自定义函数覆盖时，跳过所有路由列表解析逻辑
- ✅ Token 验证由上游 JWT 中间件负责，本中间件仅检查 `ctx.state.user` 是否存在

## AI 工具 Skills

本包内置了 Claude Code 和 OpenAI Codex 的 AI agent skill 文件。

安装后只需运行**一条命令**将 skills 复制进你的项目：

```bash
npx jwt-permission-init-skills
```

这会将 skill 文件放置到 `.claude/skills/jwt-permission/` 和 `.codex/skills/jwt-permission/`。
AI 工具将自动强制执行正确的中间件顺序、框架适配（Hoa / Koa / Express）、
路由规则格式和认证最佳实践。

## 更新日志

详见 [CHANGELOG.md](./CHANGELOG.md)。

## 许可

MIT
