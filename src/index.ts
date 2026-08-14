/** 合法的 HTTP 请求方法 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'

/** autoRouter 应用的最小接口约定 */
export interface RouterApp {
  $routes?: {
    publicRoutes?: RouteRule[]
    protectedRoutes?: RouteRule[]
  }
}

/**
 * 中间件上下文的最小接口约定，框架无关
 *
 * 兼容以下框架风格：
 * - Hoa：ctx.res.status / ctx.res.body（响应写入 ctx.res）
 * - Koa：ctx.status / ctx.body（响应直接写在 ctx 上）
 * - Express / 其他：可通过 options.unauthorizedResponse 完全自定义
 */
export interface PermissionContext {
  /** 框架封装的请求对象（Koa/Hoa 风格） */
  request?: { method?: string; url?: string | { toString(): string } }
  /** Node.js 原生请求对象 */
  req?: { method?: string; url?: string }
  /** 框架封装的响应对象（Hoa 风格）*/
  res?: { status?: number; body?: unknown }
  /** Koa 风格的响应状态码（直接挂在 ctx 上） */
  status?: number
  /** Koa 风格的响应体（直接挂在 ctx 上） */
  body?: unknown
  /** 请求状态（Koa/Hoa 约定，存放 user 等信息） */
  state?: { user?: unknown; app?: unknown;[key: string]: unknown }
  /** 应用实例（用于 autoDiscovery 读取 app.$routes） */
  app?: unknown
  [key: string]: unknown
}

/**
 * 框架无关的中间件类型
 * next 为可选，兼容不传 next 的调用方式
 */
export type PermissionMiddleware<TContext extends PermissionContext = PermissionContext> =
  (ctx: TContext, next?: () => Promise<void>) => Promise<void>

/**
 * 路由配置对象
 */
export interface RouteRule {
  /** HTTP 方法，大小写不敏感 */
  method: HttpMethod | Lowercase<HttpMethod>
  /**
   * 路由路径，需以 `/` 开头
   * - 支持 :param 风格的路径参数（如 `/api/users/:id`）
   * - 末尾斜杠严格区分（`/api/users` 与 `/api/users/` 视为不同路径）
   * - 不支持通配符（`*`），如需通配请使用 isPublicRoute / isProtectedRoute 自定义匹配
   */
  path: string
}

/**
 * JWT 权限中间件选项
 * @template TContext 框架上下文类型，默认为 PermissionContext
 */
export interface JwtPermissionOptions<TContext extends PermissionContext = PermissionContext> {
  /**
   * 公开路由列表（无需 JWT 验证）
   * 若不提供，将尝试从 app.$routes.publicRoutes 自动读取
   */
  publicRoutes?: RouteRule[]

  /**
   * 受保护路由列表（需要 JWT 验证）
   * 若不提供，将尝试从 app.$routes.protectedRoutes 自动读取
   */
  protectedRoutes?: RouteRule[]

  /**
   * 是否启用自动路由发现（从 autoRouter 收集的元数据）
   * 默认为 true，当路由列表未全部提供时，将自动从 app.$routes 补充
   */
  autoDiscovery?: boolean

  /**
   * 自定义未授权错误响应
   * 若不提供，内置实现会自动兼容 Hoa（ctx.res）和 Koa（ctx.status/body）风格
   * 其他框架（如 Express）请务必提供此选项
   */
  unauthorizedResponse?: (ctx: TContext) => void

  /**
   * 自定义路由匹配逻辑（优先于内置匹配规则）
   * @param method 请求方法，已统一转为大写（如 `'GET'`、`'POST'`）
   * @param path 请求路径，已完成 URL 解码，不含查询字符串（如 `/api/users/123`）
   */
  isPublicRoute?: (method: string, path: string) => boolean
  isProtectedRoute?: (method: string, path: string) => boolean

  /**
   * 是否对未匹配任何路由规则的请求返回 401
   * - false（默认）：未匹配路由直接放行（宽松模式）
   * - true：未匹配路由返回 401（严格模式，推荐生产环境使用）
   */
  defaultDeny?: boolean

  /**
   * 未授权请求时的回调钩子（用于日志、审计、监控指标）
   * @param ctx 框架上下文
   * @param reason 拒绝原因
   */
  onUnauthorized?: (ctx: TContext, reason: 'no_user' | 'default_deny') => void
}

/**
 * 默认的未授权响应处理
 * - Hoa 风格：写入 ctx.res.status / ctx.res.body
 * - Koa 风格（ctx.res 不存在时）：写入 ctx.status / ctx.body
 * - 其他框架：请通过 options.unauthorizedResponse 自定义
 */
function defaultUnauthorizedResponse(ctx: PermissionContext): void {
  const body = {
    success: false,
    message: '访问此资源需要有效的 JWT token',
    code: 'UNAUTHORIZED',
  }
  if (ctx.res != null) {
    // Hoa 风格
    ctx.res.status = 401
    ctx.res.body = body
  } else {
    // Koa 风格
    ctx.status = 401
    ctx.body = body
  }
}

/**
 * 模块级路由正则缓存（所有中间件实例共享）
 * 路由路径是静态字符串，共享缓存安全且能减少重复编译。
 * 采用 LRU 淘汰，上限防止动态路由场景下缓存无限增长。
 */
const _regexCache = new Map<string, RegExp>()
const _REGEX_CACHE_MAX = 1000

/**
 * 将路由路径转换为正则表达式（结果会被缓存，LRU 淘汰）
 * - 对静态路径段进行转义，避免 `.`、`+` 等特殊字符被解释为正则元字符
 * - 将 :param 风格的动态段替换为 [^/]+
 *
 * 示例：/api/v1.0/users/:id → /^\/api\/v1\.0\/users\/[^/]+$/
 */
function pathToRegex(routePath: string): RegExp {
  const cached = _regexCache.get(routePath)
  if (cached) {
    // 刷新 LRU 顺序
    _regexCache.delete(routePath)
    _regexCache.set(routePath, cached)
    return cached
  }
  const pattern = routePath
    .split('/')
    .map(segment =>
      segment.startsWith(':')
        ? '[^/]+'
        : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('/')
  const regex = new RegExp(`^${pattern}$`)
  _regexCache.set(routePath, regex)
  // 超限时淘汰最早插入的项
  if (_regexCache.size > _REGEX_CACHE_MAX) {
    const oldest = _regexCache.keys().next().value
    if (oldest !== undefined) _regexCache.delete(oldest)
  }
  return regex
}

/**
 * 检查请求是否匹配路由列表中的某条规则
 * 支持路径参数（如 /api/users/:userId）和静态路径的精确匹配
 */
function matchesRoute(routes: RouteRule[], method: string, path: string): boolean {
  // route.method 同样大写化，确保与入参统一，兼容规则中混用大小写的情况
  return routes.some(route => route.method.toUpperCase() === method && pathToRegex(route.path).test(path))
}

/**
 * 创建 JWT 权限中间件
 *
 * 功能：
 * - 基于路由配置控制 JWT 认证要求
 * - 支持公开路由和受保护路由
 * - 支持路径参数匹配（如 /api/users/:userId）
 * - 支持自动路由发现（从 autoRouter 的元数据读取）
 * - 支持自定义匹配逻辑
 *
 * 使用方式：
 *   // 方式 1: 硬编码路由列表
 *   app.use(createJwtPermission({
 *     publicRoutes: [
 *       { method: 'POST', path: '/api/auth/login' },
 *     ],
 *     protectedRoutes: [
 *       { method: 'GET', path: '/api/users/info' },
 *     ],
 *   }))
 *
 *   // 方式 2: 自动从 autoRouter 发现（推荐）
 *   app.use(createJwtPermission())
 *   // 此时会自动读取 app.$routes 中的路由信息
 */
export function createJwtPermission<TContext extends PermissionContext = PermissionContext>(
  options: JwtPermissionOptions<TContext> = {},
): PermissionMiddleware<TContext> {
  const {
    publicRoutes: userPublicRoutes,
    protectedRoutes: userProtectedRoutes,
    autoDiscovery = true,
    defaultDeny = false,
    unauthorizedResponse = defaultUnauthorizedResponse as (ctx: TContext) => void,
    onUnauthorized,
    isPublicRoute: customIsPublicRoute,
    isProtectedRoute: customIsProtectedRoute,
  } = options

  // 两侧均由自定义函数覆盖时，无需解析内置路由列表
  const needBuiltinRoutes = !customIsPublicRoute || !customIsProtectedRoute

  // 当 autoDiscovery 关闭或两侧路由均已提供时，在工厂函数中一次性解析完毕
  // 否则需要延迟到请求时通过 autoDiscovery 从 app.$routes 读取
  // 注意：运行时动态注册的路由不会被感知
  let resolvedPublicRoutes: RouteRule[] | undefined
  let resolvedProtectedRoutes: RouteRule[] | undefined
  let needsRuntimeDiscovery: boolean

  if (needBuiltinRoutes) {
    const bothProvided = !!(userPublicRoutes && userProtectedRoutes)
    if (!autoDiscovery || bothProvided) {
      resolvedPublicRoutes = userPublicRoutes ?? []
      resolvedProtectedRoutes = userProtectedRoutes ?? []
      needsRuntimeDiscovery = false
    } else {
      resolvedPublicRoutes = userPublicRoutes
      resolvedProtectedRoutes = userProtectedRoutes
      needsRuntimeDiscovery = true
    }
  } else {
    needsRuntimeDiscovery = false
  }

  return async (ctx: TContext, next?: () => Promise<void>) => {
    let publicRoutes: RouteRule[] = []
    let protectedRoutes: RouteRule[] = []

    if (needBuiltinRoutes) {
      if (needsRuntimeDiscovery && (!resolvedPublicRoutes || !resolvedProtectedRoutes)) {
        // 按需从 app.$routes 读取并缓存，仅补充缺失的一侧
        if (resolvedPublicRoutes === undefined) {
          const app = (ctx.app ?? ctx.state?.app) as RouterApp | undefined
          resolvedPublicRoutes = app?.$routes?.publicRoutes ?? []
        }
        if (resolvedProtectedRoutes === undefined) {
          const app = (ctx.app ?? ctx.state?.app) as RouterApp | undefined
          resolvedProtectedRoutes = app?.$routes?.protectedRoutes ?? []
        }
      }
      publicRoutes = resolvedPublicRoutes!
      protectedRoutes = resolvedProtectedRoutes!
    }

    // 统一转为大写，兼容路由规则大小写不一致的情况
    const method = (ctx.request?.method ?? ctx.req?.method ?? 'GET').toUpperCase()
    // 不强制断言类型，直接用 String() 安全转换，兼容 URL 对象
    const rawUrl = ctx.request?.url ?? ctx.req?.url ?? '/'
    const rawPath = String(rawUrl).split('?')[0]
    // 对路径进行 URL 解码，防止通过 %xx 编码绕过路由匹配
    // 例如 /api/users/%69nfo 解码后才能正确匹配规则 /api/users/info
    let path: string
    try {
      path = decodeURIComponent(rawPath)
    } catch {
      // 路径包含非法编码序列时保持原始值，避免中断请求
      path = rawPath
    }

    // 自定义匹配优先，其次使用内置路由规则
    const isPublic = customIsPublicRoute
      ? customIsPublicRoute(method, path)
      : matchesRoute(publicRoutes, method, path)

    // 公开路由：直接放行
    if (isPublic) {
      await next?.()
      return
    }

    const isProtected = customIsProtectedRoute
      ? customIsProtectedRoute(method, path)
      : matchesRoute(protectedRoutes, method, path)

    // 受保护路由：检查上游 JWT 解析中间件是否已将用户信息写入 ctx.state.user
    if (isProtected) {
      if (!ctx.state?.user) {
        try { onUnauthorized?.(ctx, 'no_user') } catch { /* 回调错误不应阻塞响应 */ }
        unauthorizedResponse(ctx)
        return
      }
      await next?.()
      return
    }

    // 未在任何路由列表中的路由
    if (defaultDeny) {
      try { onUnauthorized?.(ctx, 'default_deny') } catch { /* 回调错误不应阻塞响应 */ }
      unauthorizedResponse(ctx)
      return
    }
    await next?.()
  }
}

/**
 * createJwtPermission 的别名
 */
export const jwtAuth = createJwtPermission

/**
 * 获取当前请求的用户信息
 * @param ctx 框架上下文
 * @returns 用户对象，未认证时返回 null
 */
export function getCurrentUser<TContext extends PermissionContext = PermissionContext>(
  ctx: TContext,
): unknown {
  return ctx.state?.user ?? null
}

/**
 * 检查当前请求是否已通过认证
 * @param ctx 框架上下文
 * @returns 已认证返回 true，否则返回 false
 */
export function isAuthenticated<TContext extends PermissionContext = PermissionContext>(
  ctx: TContext,
): boolean {
  return getCurrentUser(ctx) !== null
}
