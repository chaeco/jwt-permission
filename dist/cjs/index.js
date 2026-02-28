"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jwtAuth = exports.jwtPermission = void 0;
exports.createJwtPermission = createJwtPermission;
exports.getCurrentUser = getCurrentUser;
exports.isAuthenticated = isAuthenticated;
/**
 * 默认的未授权响应处理
 * - Hoa 风格：写入 ctx.res.status / ctx.res.body
 * - Koa 风格（ctx.res 不存在时）：写入 ctx.status / ctx.body
 * - 其他框架：请通过 options.unauthorizedResponse 自定义
 */
function defaultUnauthorizedResponse(ctx) {
    const body = {
        success: false,
        message: '访问此资源需要有效的 JWT token',
        code: 'UNAUTHORIZED',
    };
    if (ctx.res !== undefined) {
        // Hoa 风格
        ctx.res.status = 401;
        ctx.res.body = body;
    }
    else {
        // Koa 风格
        ctx.status = 401;
        ctx.body = body;
    }
}
/**
 * 模块级路由正则缓存（所有中间件实例共享）
 * 路由路径是静态字符串，共享缓存安全且能减少重复编译
 */
const _regexCache = new Map();
/**
 * 将路由路径转换为正则表达式（结果会被缓存）
 * - 对静态路径段进行转义，避免 `.`、`+` 等特殊字符被解释为正则元字符
 * - 将 :param 风格的动态段替换为 [^/]+
 *
 * 示例：/api/v1.0/users/:id → /^\/api\/v1\.0\/users\/[^/]+$/
 */
function pathToRegex(routePath) {
    const cached = _regexCache.get(routePath);
    if (cached)
        return cached;
    const pattern = routePath
        .split('/')
        .map(segment => segment.startsWith(':')
        ? '[^/]+'
        : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('/');
    const regex = new RegExp(`^${pattern}$`);
    _regexCache.set(routePath, regex);
    return regex;
}
/**
 * 检查请求是否匹配路由列表中的某条规则
 * 支持路径参数（如 /api/users/:userId）和静态路径的精确匹配
 */
function matchesRoute(routes, method, path) {
    // route.method 同样大写化，确保与入参统一，兼容规则中混用大小写的情况
    return routes.some(route => route.method.toUpperCase() === method && pathToRegex(route.path).test(path));
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
function createJwtPermission(options = {}) {
    const { publicRoutes: userPublicRoutes, protectedRoutes: userProtectedRoutes, autoDiscovery = true, unauthorizedResponse = defaultUnauthorizedResponse, isPublicRoute: customIsPublicRoute, isProtectedRoute: customIsProtectedRoute, } = options;
    // 两侧均由自定义函数覆盖时，无需解析内置路由列表；此值由初始化选项决定，运行期不变，提前计算避免每次请求重复运算
    const needBuiltinRoutes = !customIsPublicRoute || !customIsProtectedRoute;
    // 缓存自动发现的路由，避免每次请求重复读取 app.$routes
    // 注意：路由在首次请求时读取并固定，后续运行时动态注册的路由不会被感知
    let cachedPublicRoutes;
    let cachedProtectedRoutes;
    return async (ctx, next) => {
        // 默认空数组，仅在 needBuiltinRoutes 时按需填充
        let publicRoutes = [];
        let protectedRoutes = [];
        if (needBuiltinRoutes) {
            if (autoDiscovery && (!userPublicRoutes || !userProtectedRoutes)) {
                // 仅在各自未缓存时才读取 app.$routes，避免已提供一侧导致另一侧永远触发查询
                const needPublic = !userPublicRoutes && cachedPublicRoutes === undefined;
                const needProtected = !userProtectedRoutes && cachedProtectedRoutes === undefined;
                if (needPublic || needProtected) {
                    // ctx.app 已在 PermissionContext 中声明，无需强转
                    const app = (ctx.app ?? ctx.state?.app);
                    if (app?.$routes) {
                        if (needPublic)
                            cachedPublicRoutes = app.$routes.publicRoutes ?? [];
                        if (needProtected)
                            cachedProtectedRoutes = app.$routes.protectedRoutes ?? [];
                    }
                }
                publicRoutes = userPublicRoutes ?? cachedPublicRoutes ?? [];
                protectedRoutes = userProtectedRoutes ?? cachedProtectedRoutes ?? [];
            }
            else {
                publicRoutes = userPublicRoutes ?? [];
                protectedRoutes = userProtectedRoutes ?? [];
            }
        }
        // 统一转为大写，兼容路由规则大小写不一致的情况
        const method = (ctx.request?.method ?? ctx.req?.method ?? 'GET').toUpperCase();
        // 不强制断言类型，直接用 String() 安全转换，兼容 URL 对象
        const rawUrl = ctx.request?.url ?? ctx.req?.url ?? '/';
        const rawPath = String(rawUrl).split('?')[0];
        // 对路径进行 URL 解码，防止通过 %xx 编码绕过路由匹配
        // 例如 /api/users/%69nfo 解码后才能正确匹配规则 /api/users/info
        let path;
        try {
            path = decodeURIComponent(rawPath);
        }
        catch {
            // 路径包含非法编码序列时保持原始值，避免中断请求
            path = rawPath;
        }
        // 自定义匹配优先，其次使用内置路由规则
        const isPublic = customIsPublicRoute
            ? customIsPublicRoute(method, path)
            : matchesRoute(publicRoutes, method, path);
        // 公开路由：直接放行
        if (isPublic) {
            await next?.();
            return;
        }
        const isProtected = customIsProtectedRoute
            ? customIsProtectedRoute(method, path)
            : matchesRoute(protectedRoutes, method, path);
        // 受保护路由：检查上游 JWT 解析中间件是否已将用户信息写入 ctx.state.user
        if (isProtected) {
            if (!ctx.state?.user) {
                unauthorizedResponse(ctx);
                return;
            }
            await next?.();
            return;
        }
        // 未在任何路由列表中的路由：默认放行
        await next?.();
    };
}
/**
 * createJwtPermission 的别名，可按个人偏好选用
 */
exports.jwtPermission = createJwtPermission;
/**
 * createJwtPermission 的别名，可按个人偏好选用
 */
exports.jwtAuth = createJwtPermission;
/**
 * 获取当前请求的用户信息
 * @param ctx 框架上下文
 * @returns 用户对象，未认证时返回 null
 */
function getCurrentUser(ctx) {
    return ctx.state?.user ?? null;
}
/**
 * 检查当前请求是否已通过认证
 * @param ctx 框架上下文
 * @returns 已认证返回 true，否则返回 false
 */
function isAuthenticated(ctx) {
    return getCurrentUser(ctx) !== null;
}
