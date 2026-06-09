# Changelog

All notable changes to `@chaeco/jwt-permission` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.0.2] - 2026-06-09

### Added

- **AI tool skills** — bundled skill file (`SKILL.md`) for Claude Code and OpenAI Codex, guiding AI coding assistants on correct middleware order, framework-specific setup (Hoa / Koa / Express), route rule format, and common mistakes
- **`init-skills` CLI** — `npx jwt-permission-init-skills` copies the skill file into `.claude/skills/` and `.codex/skills/` of the consumer project
- **CLAUDE.md** — project-level AI usage guide for library consumers
- `.claude/settings.local.json` — PreCommit hook (`npm test && npm run build`) and permission allowlist

### Changed

- `package.json` added `bin` entry (`jwt-permission-init-skills`), `files` whitelist for included skill directories

### Tests

- Expanded from 52 to 56 tests: mixed-case HTTP method matching, `+` regex escaping in static path segments, double-manual route lists bypassing auto-discovery, `$routes` keys falling back to `[]` when undefined
- Coverage: **100% statements / branches / functions / lines**

### Docs

- README (EN + ZH) added "AI Tool Skills" section with one-liner install command

---

## [1.0.1] - 2026-02-28

### Changed

- **Package renamed** from `@chaeco/hoa-jwt-permission` to `@chaeco/jwt-permission`
- **Framework decoupled** — removed `hoa` peer dependency; the middleware now works with Hoa, Koa, Express, and any framework following the `ctx.state.user` convention
- `defaultUnauthorizedResponse` now auto-detects framework style: writes to `ctx.res` (Hoa) or `ctx.status`/`ctx.body` (Koa); other frameworks must provide a custom `unauthorizedResponse`
- `createJwtPermission` is now generic (`<TContext extends PermissionContext>`) for full type-safety with custom contexts
- `getCurrentUser` and `isAuthenticated` are now generic; return type changed from `any` to `unknown`
- Replaced `HoaContext` / `HoaMiddleware` with the new framework-agnostic `PermissionContext` / `PermissionMiddleware` types
- `package.json` description updated to reflect framework-agnostic positioning
- `repository.url` updated from `git@github.com:mflix-team/packages.git` to `https://github.com/chaeco/jwt-permission.git`; `repository.directory` field removed (standalone repo)
- Installation method updated to `npm install github:chaeco/jwt-permission`

### Fixed

- **Security: URL encoding bypass** — request path is now `decodeURIComponent`-decoded before matching, preventing `%xx`-encoded paths (e.g. `/api/users/%69nfo`) from bypassing route rules
- **Security: regex injection** — route path segments are now properly escaped before being compiled into regex, preventing `.` / `+` / `$` etc. in version-style paths (e.g. `/api/v1.0/`) from being misinterpreted as regex metacharacters
- **Bug: HTTP method case mismatch** — `route.method` is now `.toUpperCase()`-normalized during matching, fixing silent mismatches when rules use lowercase method names
- **Bug: public routes did not support path parameters** — both public and protected lists now share the same `pathToRegex` matcher; previously public routes only supported exact string comparison
- **Bug: stale `app.$routes` cache** — each side (`publicRoutes` / `protectedRoutes`) now caches independently; providing only one side no longer causes the other to re-query `app.$routes` on every request
- Removed redundant `(ctx as any).app` cast — `app` is now declared on `PermissionContext` directly

### Performance

- Route regexes are now compiled once and cached in a module-level `Map`, shared across all middleware instances
- `needBuiltinRoutes` is evaluated once at factory time instead of on every request
- When both `isPublicRoute` and `isProtectedRoute` are provided, all route list initialization is skipped entirely

### Tests

- Added full unit test suite (`tests/index.test.ts`) with **52 test cases** using Vitest
- Coverage: **100% statements / functions / lines**, **97.05% branches** (V8)
- Added `vitest.config.ts` with coverage thresholds (statements/functions/lines ≥ 90%, branches ≥ 85%)
- Added `npm run test`, `npm run test:watch`, `npm run coverage` scripts

### Docs

- README rewritten in English as the default; Chinese version moved to `README-zh.md`
- Added Koa and Express usage examples
- Corrected `createHandler` parameter order in examples (`handler` first, `meta` second)
- Updated all references from `@chaeco/hoa-auto-router` to `@chaeco/auto-router`
- Updated type definition examples to reflect exported types
- Added CHANGELOG

---

## [1.0.0] - 2026-11-21

### Added

- Initial release as `@chaeco/hoa-jwt-permission`
- JWT permission middleware for Hoa.js
- Auto-discovery via `@chaeco/hoa-auto-router`
- Manual `publicRoutes` / `protectedRoutes` configuration
- Path parameter matching (`:param` syntax)
- Custom route matching via `isPublicRoute` / `isProtectedRoute`
- Custom unauthorized response via `unauthorizedResponse`
- TypeScript support
