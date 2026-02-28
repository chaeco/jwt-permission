/** 合法的 HTTP 请求方法 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
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
    request?: {
        method?: string;
        url?: string | {
            toString(): string;
        };
    };
    /** Node.js 原生请求对象 */
    req?: {
        method?: string;
        url?: string;
    };
    /** 框架封装的响应对象（Hoa 风格）*/
    res?: {
        status?: number;
        body?: unknown;
    };
    /** Koa 风格的响应状态码（直接挂在 ctx 上） */
    status?: number;
    /** Koa 风格的响应体（直接挂在 ctx 上） */
    body?: unknown;
    /** 请求状态（Koa/Hoa 约定，存放 user 等信息） */
    state?: {
        user?: unknown;
        app?: unknown;
        [key: string]: unknown;
    };
    /** 应用实例（用于 autoDiscovery 读取 app.$routes） */
    app?: unknown;
    [key: string]: unknown;
}
/**
 * 框架无关的中间件类型
 * next 为可选，兼容不传 next 的调用方式
 */
export type PermissionMiddleware<TContext extends PermissionContext = PermissionContext> = (ctx: TContext, next?: () => Promise<void>) => Promise<void>;
/**
 * 路由配置对象
 */
export interface RouteRule {
    /** HTTP 方法，大小写不敏感 */
    method: HttpMethod | Lowercase<HttpMethod>;
    /**
     * 路由路径，需以 `/` 开头
     * - 支持 :param 风格的路径参数（如 `/api/users/:id`）
     * - 末尾斜杠严格区分（`/api/users` 与 `/api/users/` 视为不同路径）
     * - 不支持通配符（`*`），如需通配请使用 isPublicRoute / isProtectedRoute 自定义匹配
     */
    path: string;
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
    publicRoutes?: RouteRule[];
    /**
     * 受保护路由列表（需要 JWT 验证）
     * 若不提供，将尝试从 app.$routes.protectedRoutes 自动读取
     */
    protectedRoutes?: RouteRule[];
    /**
     * 是否启用自动路由发现（从 autoRouter 收集的元数据）
     * 默认为 true，当路由列表未全部提供时，将自动从 app.$routes 补充
     */
    autoDiscovery?: boolean;
    /**
     * 自定义未授权错误响应
     * 若不提供，内置实现会自动兼容 Hoa（ctx.res）和 Koa（ctx.status/body）风格
     * 其他框架（如 Express）请务必提供此选项
     */
    unauthorizedResponse?: (ctx: TContext) => void;
    /**
     * 自定义路由匹配逻辑（优先于内置匹配规则）
     * @param method 请求方法，已统一转为大写（如 `'GET'`、`'POST'`）
     * @param path 请求路径，已完成 URL 解码，不含查询字符串（如 `/api/users/123`）
     */
    isPublicRoute?: (method: string, path: string) => boolean;
    isProtectedRoute?: (method: string, path: string) => boolean;
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
export declare function createJwtPermission<TContext extends PermissionContext = PermissionContext>(options?: JwtPermissionOptions<TContext>): PermissionMiddleware<TContext>;
/**
 * createJwtPermission 的别名，可按个人偏好选用
 */
export declare const jwtPermission: typeof createJwtPermission;
/**
 * createJwtPermission 的别名，可按个人偏好选用
 */
export declare const jwtAuth: typeof createJwtPermission;
/**
 * 获取当前请求的用户信息
 * @param ctx 框架上下文
 * @returns 用户对象，未认证时返回 null
 */
export declare function getCurrentUser<TContext extends PermissionContext = PermissionContext>(ctx: TContext): unknown;
/**
 * 检查当前请求是否已通过认证
 * @param ctx 框架上下文
 * @returns 已认证返回 true，否则返回 false
 */
export declare function isAuthenticated<TContext extends PermissionContext = PermissionContext>(ctx: TContext): boolean;
