'use strict';

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
    if (ctx.res != null) {
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
 * 路由路径是静态字符串，共享缓存安全且能减少重复编译。
 * 采用 LRU 淘汰，上限防止动态路由场景下缓存无限增长。
 */
const _regexCache = new Map();
const _REGEX_CACHE_MAX = 1000;
/**
 * 将路由路径转换为正则表达式（结果会被缓存，LRU 淘汰）
 * - 对静态路径段进行转义，避免 `.`、`+` 等特殊字符被解释为正则元字符
 * - 将 :param 风格的动态段替换为 [^/]+
 *
 * 示例：/api/v1.0/users/:id → /^\/api\/v1\.0\/users\/[^/]+$/
 */
function pathToRegex(routePath) {
    const cached = _regexCache.get(routePath);
    if (cached) {
        // 刷新 LRU 顺序
        _regexCache.delete(routePath);
        _regexCache.set(routePath, cached);
        return cached;
    }
    const pattern = routePath
        .split('/')
        .map(segment => segment.startsWith(':')
        ? '[^/]+'
        : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('/');
    const regex = new RegExp(`^${pattern}$`);
    _regexCache.set(routePath, regex);
    // 超限时淘汰最早插入的项
    if (_regexCache.size > _REGEX_CACHE_MAX) {
        const oldest = _regexCache.keys().next().value;
        if (oldest !== undefined)
            _regexCache.delete(oldest);
    }
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
    const { publicRoutes: userPublicRoutes, protectedRoutes: userProtectedRoutes, autoDiscovery = true, defaultDeny = false, unauthorizedResponse = defaultUnauthorizedResponse, onUnauthorized, isPublicRoute: customIsPublicRoute, isProtectedRoute: customIsProtectedRoute, } = options;
    // 两侧均由自定义函数覆盖时，无需解析内置路由列表
    const needBuiltinRoutes = !customIsPublicRoute || !customIsProtectedRoute;
    // 当 autoDiscovery 关闭或两侧路由均已提供时，在工厂函数中一次性解析完毕
    // 否则需要延迟到请求时通过 autoDiscovery 从 app.$routes 读取
    // 注意：运行时动态注册的路由不会被感知
    let resolvedPublicRoutes;
    let resolvedProtectedRoutes;
    let needsRuntimeDiscovery;
    if (needBuiltinRoutes) {
        const bothProvided = !!(userPublicRoutes && userProtectedRoutes);
        if (!autoDiscovery || bothProvided) {
            resolvedPublicRoutes = userPublicRoutes ?? [];
            resolvedProtectedRoutes = userProtectedRoutes ?? [];
            needsRuntimeDiscovery = false;
        }
        else {
            resolvedPublicRoutes = userPublicRoutes;
            resolvedProtectedRoutes = userProtectedRoutes;
            needsRuntimeDiscovery = true;
        }
    }
    else {
        needsRuntimeDiscovery = false;
    }
    return async (ctx, next) => {
        let publicRoutes = [];
        let protectedRoutes = [];
        if (needBuiltinRoutes) {
            if (needsRuntimeDiscovery && (!resolvedPublicRoutes || !resolvedProtectedRoutes)) {
                // 按需从 app.$routes 读取并缓存，仅补充缺失的一侧
                if (resolvedPublicRoutes === undefined) {
                    const app = (ctx.app ?? ctx.state?.app);
                    resolvedPublicRoutes = app?.$routes?.publicRoutes ?? [];
                }
                if (resolvedProtectedRoutes === undefined) {
                    const app = (ctx.app ?? ctx.state?.app);
                    resolvedProtectedRoutes = app?.$routes?.protectedRoutes ?? [];
                }
            }
            publicRoutes = resolvedPublicRoutes;
            protectedRoutes = resolvedProtectedRoutes;
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
                try {
                    onUnauthorized?.(ctx, 'no_user');
                }
                catch { /* 回调错误不应阻塞响应 */ }
                unauthorizedResponse(ctx);
                return;
            }
            await next?.();
            return;
        }
        // 未在任何路由列表中的路由
        if (defaultDeny) {
            try {
                onUnauthorized?.(ctx, 'default_deny');
            }
            catch { /* 回调错误不应阻塞响应 */ }
            unauthorizedResponse(ctx);
            return;
        }
        await next?.();
    };
}
/**
 * createJwtPermission 的别名
 */
const jwtAuth = createJwtPermission;
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

exports.createJwtPermission = createJwtPermission;
exports.getCurrentUser = getCurrentUser;
exports.isAuthenticated = isAuthenticated;
exports.jwtAuth = jwtAuth;
//# sourceMappingURL=index.js.map
