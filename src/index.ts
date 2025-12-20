import type { HoaContext, HoaMiddleware } from 'hoa'

/**
 * 路由配置对象
 */
export interface RouteRule {
  method: string
  path: string
}

/**
 * JWT 权限中间件选项
 */
export interface JwtPermissionOptions {
  /**
   * 公开路由列表（无需 JWT 验证）
   * 如果不提供，将尝试从 app.$routes.publicRoutes 读取
   */
  publicRoutes?: RouteRule[]

  /**
   * 受保护路由列表（必须 JWT 验证）
   * 如果不提供，将尝试从 app.$routes.protectedRoutes 读取
   */
  protectedRoutes?: RouteRule[]

  /**
   * 是否启用自动路由发现（从 autoRouter 收集的元数据）
   * 默认为 true，当设置为 true 且未提供路由列表时，将自动使用 autoRouter 的数据
   */
  autoDiscovery?: boolean

  /**
   * 自定义未授权错误响应
   */
  unauthorizedResponse?: (ctx: HoaContext) => void

  /**
   * 自定义路由匹配逻辑
   */
  isPublicRoute?: (method: string, path: string) => boolean
  isProtectedRoute?: (method: string, path: string) => boolean
}

/**
 * 默认的未授权响应
 */
function defaultUnauthorizedResponse(ctx: HoaContext): void {
  ctx.res.status = 401
  ctx.res.body = {
    success: false,
    message: '访问此资源需要有效的 JWT token',
    code: 'UNAUTHORIZED',
  }
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
export function createJwtPermission(options: JwtPermissionOptions = {}): HoaMiddleware {
  const {
    publicRoutes: userPublicRoutes,
    protectedRoutes: userProtectedRoutes,
    autoDiscovery = true,
    unauthorizedResponse = defaultUnauthorizedResponse,
    isPublicRoute: customIsPublicRoute,
    isProtectedRoute: customIsProtectedRoute,
  } = options

  return async (ctx: HoaContext, next?: () => Promise<void>) => {
    // 初始化路由列表
    let publicRoutes = userPublicRoutes || []
    let protectedRoutes = userProtectedRoutes || []

    // 尝试从 autoRouter 自动发现路由信息
    if (autoDiscovery && (!userPublicRoutes || !userProtectedRoutes)) {
      const app = (ctx.app || ctx.state?.app || (ctx as any).app) as any
      if (app?.$routes) {
        publicRoutes = userPublicRoutes || app.$routes.publicRoutes || []
        protectedRoutes = userProtectedRoutes || app.$routes.protectedRoutes || []
      }
    }

    // 内置的路由检查函数
    const builtInIsPublicRoute = (method: string, path: string): boolean => {
      return publicRoutes.some(route => route.method === method && route.path === path)
    }

    const builtInIsProtectedRoute = (method: string, path: string): boolean => {
      return protectedRoutes.some(route => {
        if (route.method !== method) return false

        // 支持路径参数匹配（如 /api/users/:userId）
        const routePattern = route.path.replace(/:\w+/g, '[^/]+')
        const regex = new RegExp(`^${routePattern}$`)
        return regex.test(path)
      })
    }

    // 使用自定义或内置的路由检查函数
    const checkIsPublicRoute = customIsPublicRoute || builtInIsPublicRoute
    const checkIsProtectedRoute = customIsProtectedRoute || builtInIsProtectedRoute

    const method = (ctx.request?.method || ctx.req?.method || 'GET') as string
    const url = ctx.request?.url || ctx.req?.url || '/'
    const path = (typeof url === 'string' ? url : url.toString()).split('?')[0] as string

    // 如果是公开路由，直接放行
    if (checkIsPublicRoute(method, path)) {
      if (next) await next()
      return
    }

    // 如果是受保护路由，检查是否有有效的 JWT token
    if (checkIsProtectedRoute(method, path)) {
      const user = ctx.state?.user

      if (!user) {
        unauthorizedResponse(ctx)
        return
      }

      // token 有效，继续处理请求
      if (next) await next()
      return
    }

    // 其他路由不做限制，直接放行
    if (next) await next()
  }
}

/**
 * JWT 权限中间件工厂函数（别名）
 * 与 createJwtPermission 功能相同
 */
export const jwtPermission = createJwtPermission

/**
 * JWT 认证中间件（简称）
 * 与 createJwtPermission 功能相同
 */
export const jwtAuth = createJwtPermission

/**
 * 获取当前请求的用户信息
 * @param ctx Hoa 上下文
 * @returns 用户对象或 null
 */
export function getCurrentUser(ctx: HoaContext): any {
  return ctx.state?.user || null
}

/**
 * 检查用户是否已认证
 * @param ctx Hoa 上下文
 * @returns 已认证返回 true
 */
export function isAuthenticated(ctx: HoaContext): boolean {
  return !!ctx.state?.user
}

export type { HoaContext, HoaMiddleware }
