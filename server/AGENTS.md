# Memos Backend Guide for AI Agents

This document provides comprehensive guidance for AI agents working with the Memos backend codebase. It covers architecture, workflows, conventions, and key patterns specific to the Go backend.

## Project Overview

Memos backend is a Go application providing:
- **Language:** Go 1.25
- **HTTP Framework:** Echo v4
- **API Protocol:** gRPC + Connect RPC + gRPC-Gateway (REST)
- **Protocol Buffers:** buf for code generation
- **Databases:** SQLite (default), MySQL, PostgreSQL
- **Authentication:** JWT (Access Token V2) + Personal Access Tokens (PAT)

## Architecture

```
backend structure:
├── cmd/memos/              # 应用入口
│   └── main.go             # Cobra CLI，Profile 配置，服务器初始化
│
├── server/                 # 服务器层
│   ├── server.go           # Echo HTTP 服务器，健康检查，后台任务
│   ├── auth/               # 认证模块
│   │   ├── authenticator.go    # JWT + PAT 验证
│   │   ├── context.go         # Context 工具函数
│   │   └── jwt.go             # JWT 签发/验证
│   │
│   ├── router/             # 路由层
│   │   ├── api/v1/         # API v1 服务实现
│   │   │   ├── v1.go           # 服务注册，Gateway + Connect 设置
│   │   │   ├── acl_config.go   # 公开端点白名单
│   │   │   ├── connect_interceptors.go # 拦截器链
│   │   │   ├── connect_services.go     # Connect Handler 注册
│   │   │   ├── connect_handler.go      # Handler 封装
│   │   │   ├── memo_service.go         # Memo 服务实现
│   │   │   ├── user_service.go         # User 服务实现
│   │   │   ├── auth_service.go         # Auth 服务实现
│   │   │   └── ...                     # 其他服务
│   │   ├── frontend/       # 前端静态文件服务
│   │   ├── fileserver/     # 原生 HTTP 文件服务 (媒体文件)
│   │   └── rss/            # RSS 订阅生成
│   │
│   └── runner/             # 后台任务
│       ├── memopayload/    # Memo 内容处理 (标签、链接、任务)
│       └── s3presign/      # S3 预签名 URL 管理
│
├── store/                  # 数据层
│   ├── store.go            # Store 包装器，缓存管理
│   ├── driver.go           # Driver 接口定义
│   ├── cache.go            # 内存缓存实现
│   ├── migrator.go         # 数据库迁移逻辑
│   ├── memo.go             # Memo 模型定义
│   ├── user.go             # User 模型定义
│   ├── attachment.go       # Attachment 模型定义
│   ├── db/                 # 数据库驱动实现
│   │   ├── db.go           # Driver 工厂
│   │   ├── sqlite/         # SQLite 实现
│   │   ├── mysql/          # MySQL 实现
│   │   └── postgres/       # PostgreSQL 实现
│   ├── migration/          # 迁移脚本 (嵌入式)
│   ├── seed/               # 种子数据 (Demo 模式)
│   └── test/               # 测试工具
│
├── proto/                  # Protocol Buffer 定义
│   ├── api/v1/             # API v1 服务定义
│   ├── store/              # 存储层 proto (内部)
│   └── gen/                # 生成的 Go 代码
│       ├── api/v1/         # API 服务生成代码
│       └── store/          # 存储层生成代码
│
├── plugin/                 # 插件系统
│   ├── scheduler/          # Cron 作业调度
│   ├── email/              # SMTP 邮件发送
│   ├── filter/             # CEL 过滤表达式
│   ├── webhook/            # Webhook 分发
│   ├── markdown/           # Markdown 解析 (goldmark)
│   ├── httpgetter/         # HTTP 内容获取
│   └── storage/s3/         # S3 兼容存储
│
└── internal/               # 内部工具
    ├── profile/            # 应用配置 Profile
    ├── version/            # 版本信息
    └── ...
```

## Key Architectural Patterns

### 1. API Layer: Dual Protocol

**Connect RPC (Browser Clients):**
- Protocol: `connectrpc.com/connect`
- Endpoint pattern: `/memos.api.v1.*`
- Binary format for performance
- Interceptor chain: Metadata → Logging → Recovery → Auth

```go
// server/router/api/v1/v1.go
connectInterceptors := connect.WithInterceptors(
    NewMetadataInterceptor(),      // HTTP headers → gRPC metadata
    NewLoggingInterceptor(logs),   // Request/response logging
    NewRecoveryInterceptor(logs),  // Panic recovery
    NewAuthInterceptor(store, secret),  // Authentication
)
```

**gRPC-Gateway (REST API):**
- Standard HTTP/JSON
- Endpoint pattern: `/api/v1/*`
- Same service implementations as Connect
- For external tools, CLI clients

```go
// Register gRPC-Gateway handlers
v1pb.RegisterMemoServiceHandlerServer(ctx, gwMux, s)
echoServer.Any("/api/v1/*", echo.WrapHandler(gwMux))
```

### 2. Authentication System

**JWT Access Tokens (V2):**
- Stateless verification
- 15-minute expiration
- Stored in memory (frontend)
- Header: `Authorization: Bearer <token>`

```go
// server/auth/authenticator.go
func (a *Authenticator) AuthenticateByAccessTokenV2(
    ctx context.Context, 
    token string,
) (*AccessTokenClaims, error) {
    claims, err := a.verifyAccessTokenV2(token)
    if err != nil {
        return nil, err
    }
    return claims, nil
}
```

**Personal Access Tokens (PAT):**
- Long-lived, stored in database
- SHA-256 hash for lookup
- Used for API automation

```go
// PAT lookup via store
result, err := a.store.GetUserByPATHash(ctx, sha256Hash(token))
```

**Refresh Tokens:**
- HttpOnly cookie based
- Long expiration (7 days)
- Used to obtain new access tokens

### 3. Service Layer Pattern

Each service follows this pattern:

```go
// server/router/api/v1/memo_service.go
func (s *APIV1Service) CreateMemo(
    ctx context.Context, 
    req *v1pb.CreateMemoRequest,
) (*v1pb.Memo, error) {
    // 1. Get authenticated user from context
    user, err := s.GetCurrentUser(ctx)
    if err != nil {
        return nil, status.Errorf(codes.Unauthenticated, "failed to get user")
    }
    
    // 2. Validate request
    if req.Content == "" {
        return nil, status.Errorf(codes.InvalidArgument, "content is required")
    }
    
    // 3. Business logic
    memo := &store.Memo{
        CreatorID: user.ID,
        Content:   req.Content,
        // ...
    }
    
    // 4. Store operation
    created, err := s.Store.CreateMemo(ctx, memo)
    if err != nil {
        return nil, status.Errorf(codes.Internal, "failed to create memo")
    }
    
    // 5. Convert to proto response
    return convertMemoToProto(created), nil
}
```

### 4. Store Layer: Driver Interface

All database operations go through the `Driver` interface:

```go
// store/driver.go
type Driver interface {
    GetDB() *sql.DB
    Close() error
    IsInitialized(ctx context.Context) (bool, error)
    
    // Memo operations
    CreateMemo(ctx context.Context, create *Memo) (*Memo, error)
    ListMemos(ctx context.Context, find *FindMemo) ([]*Memo, error)
    UpdateMemo(ctx context.Context, update *UpdateMemo) error
    DeleteMemo(ctx context.Context, delete *DeleteMemo) error
    
    // User operations
    CreateUser(ctx context.Context, create *User) (*User, error)
    ListUsers(ctx context.Context, find *FindUser) ([]*User, error)
    UpdateUser(ctx context.Context, update *UpdateUser) (*User, error)
    DeleteUser(ctx context.Context, delete *DeleteUser) error
    
    // ... other operations
}
```

**Three Implementations:**
- `store/db/sqlite/` - SQLite (modernc.org/sqlite)
- `store/db/mysql/` - MySQL (go-sql-driver/mysql)
- `store/db/postgres/` - PostgreSQL (lib/pq)

### 5. Caching Strategy

```go
// store/store.go
type Store struct {
    driver Driver
    
    instanceSettingCache *cache.Cache[string, *InstanceSetting]
    userCache            *cache.Cache[int, *User]
    userSettingCache     *cache.Cache[int, map[string]*UserSetting]
}
```

**Cache Configuration:**
- Default TTL: 10 minutes
- Cleanup interval: 5 minutes
- Max items: 1000
- Used for: instance settings, users, user settings

### 6. Database Migration System

**Migration Flow:**
1. `preMigrate`: Check if DB exists. If not, apply `LATEST.sql`
2. `checkMinimumUpgradeVersion`: Reject pre-0.22 installations
3. `applyMigrations`: Apply incremental migrations in single transaction
4. Demo mode: Seed with demo data

**Schema Versioning:**
- Stored in `instance_setting` table (key: `bb.general.version`)
- Format: `major.minor.patch`
- Migration files: `store/migration/{driver}/{version}/NN__description.sql`

```
store/migration/
├── sqlite/
│   ├── LATEST.sql              # 完整 schema (新安装)
│   ├── 0.22/01__migration.sql  # 增量迁移
│   ├── 0.23/01__migration.sql
│   └── ...
├── mysql/
│   └── ...
└── postgres/
    └── ...
```

## Development Commands

```bash
# Start dev server
go run ./cmd/memos --mode dev --port 8081

# Run all tests
go test ./...

# Run specific package tests
go test ./store/...
go test ./server/router/api/v1/test/...

# Run with coverage
go test -cover ./...

# Lint (golangci-lint)
golangci-lint run

# Format imports
goimports -w .

# Run with different database
DRIVER=mysql go run ./cmd/memos
DRIVER=postgres go run ./cmd/memos

# Regenerate proto
cd proto && buf generate

# Lint proto
cd proto && buf lint

# Check proto breaking changes
cd proto && buf breaking --against .git#main
```

## Key Workflows

### Adding a New API Endpoint

1. **Define in Protocol Buffer:**
   ```protobuf
   // proto/api/v1/new_service.proto
   service NewService {
     rpc CreateResource(CreateResourceRequest) returns (Resource) {
       option (google.api.http) = {
         post: "/api/v1/resources"
         body: "*"
       };
     }
   }
   
   message CreateResourceRequest {
     string name = 1;
   }
   
   message Resource {
     int32 id = 1;
     string name = 2;
   }
   ```

2. **Regenerate Code:**
   ```bash
   cd proto && buf generate
   ```

3. **Implement Service:**
   ```go
   // server/router/api/v1/new_service.go
   func (s *APIV1Service) CreateResource(
       ctx context.Context,
       req *v1pb.CreateResourceRequest,
   ) (*v1pb.Resource, error) {
       user, err := s.GetCurrentUser(ctx)
       if err != nil {
           return nil, status.Errorf(codes.Unauthenticated, "unauthorized")
       }
       
       // Validate
       if req.Name == "" {
           return nil, status.Errorf(codes.InvalidArgument, "name required")
       }
       
       // Create in store
       resource, err := s.Store.CreateResource(ctx, &store.Resource{
           Name:      req.Name,
           CreatorID: user.ID,
       })
       if err != nil {
           return nil, status.Errorf(codes.Internal, "failed to create")
       }
       
       return &v1pb.Resource{
           Id:   int32(resource.ID),
           Name: resource.Name,
       }, nil
   }
   ```

4. **Register Handler (if new service):**
   ```go
   // server/router/api/v1/v1.go
   v1pb.RegisterNewServiceHandlerServer(ctx, gwMux, s)
   
   // server/router/api/v1/connect_services.go
   connectMux.Handle(v1connect.NewNewServiceHandler(s, opts...))
   ```

5. **If Public Endpoint:**
   ```go
   // server/router/api/v1/acl_config.go
   var PublicMethods = map[string]struct{}{
       "/memos.api.v1.NewService/PublicMethod": {},
   }
   ```

### Database Schema Changes

1. **Create Migration Files (all drivers):**
   ```
   store/migration/sqlite/0.28/01__add_new_column.sql
   store/migration/mysql/0.28/01__add_new_column.sql
   store/migration/postgres/0.28/01__add_new_column.sql
   ```

2. **Update LATEST.sql (all drivers):**
   ```sql
   -- store/migration/sqlite/LATEST.sql
   ALTER TABLE memo ADD COLUMN new_field TEXT;
   ```

3. **Update Model (if new field):**
   ```go
   // store/memo.go
   type Memo struct {
       ID       int
       Content  string
       NewField string  // Add new field
       // ...
   }
   
   type UpdateMemo struct {
       ID       int
       NewField *string  // Optional for partial updates
   }
   ```

4. **Update Driver Implementation:**
   ```go
   // store/db/sqlite/memo.go
   func (d *Driver) CreateMemo(...) (*store.Memo, error) {
       _, err := d.db.ExecContext(ctx, `
           INSERT INTO memo (content, new_field, ...)
           VALUES (?, ?, ...)
       `, memo.Content, memo.NewField, ...)
   }
   ```

5. **Test Migration:**
   ```bash
   go test ./store/test/... -v
   ```

### Adding a New Store Model

1. **Create Model File:**
   ```go
   // store/new_model.go
   package store
   
   type NewModel struct {
       ID        int
       Name      string
       CreatorID int
       CreatedTs time.Time
   }
   
   type FindNewModel struct {
       ID        *int
       CreatorID *int
   }
   
   type UpdateNewModel struct {
       ID   int
       Name *string
   }
   
   type DeleteNewModel struct {
       ID int
   }
   ```

2. **Add to Driver Interface:**
   ```go
   // store/driver.go
   type Driver interface {
       // ... existing methods
       
       // NewModel methods
       CreateNewModel(ctx context.Context, create *NewModel) (*NewModel, error)
       ListNewModels(ctx context.Context, find *FindNewModel) ([]*NewModel, error)
       UpdateNewModel(ctx context.Context, update *UpdateNewModel) error
       DeleteNewModel(ctx context.Context, delete *DeleteNewModel) error
   }
   ```

3. **Implement for Each Driver:**
   - `store/db/sqlite/new_model.go`
   - `store/db/mysql/new_model.go`
   - `store/db/postgres/new_model.go`

4. **Create Migration Files:**
   - Add CREATE TABLE to LATEST.sql (all drivers)
   - Add incremental migration for existing installations

## Testing

### Test Pattern

```go
func TestMemoCreation(t *testing.T) {
    ctx := context.Background()
    store := test.NewTestingStore(ctx, t)
    
    // Create test user
    user, _ := createTestUser(ctx, store, t)
    
    // Execute operation
    memo, err := store.CreateMemo(ctx, &store.Memo{
        CreatorID: user.ID,
        Content:   "Test memo",
    })
    require.NoError(t, err)
    assert.NotNil(t, memo)
    assert.Equal(t, "Test memo", memo.Content)
}
```

### Test Utilities

- `store/test/store.go:22-35` - `NewTestingStore()` creates isolated DB
- `store/test/store.go:37-77` - `resetTestingDB()` cleans tables
- Test DB determined by `DRIVER` env var (default: sqlite)

### Running Tests

```bash
# All tests
go test ./...

# Specific package
go test ./store/...
go test ./server/router/api/v1/test/...

# With coverage
go test -cover ./...

# Verbose
go test -v ./store/test/...

# Multi-database testing
DRIVER=sqlite go test ./...
DRIVER=mysql DSN="user:pass@tcp(localhost:3306)/memos" go test ./...
DRIVER=postgres DSN="postgres://user:pass@localhost:5432/memos" go test ./...
```

## Code Conventions

### Error Handling

```go
// Use github.com/pkg/errors for wrapping
import "github.com/pkg/errors"

func doSomething() error {
    if err := operation(); err != nil {
        return errors.Wrap(err, "failed to do something")
    }
    return nil
}

// Return structured gRPC errors to clients
import "google.golang.org/grpc/status"
import "google.golang.org/grpc/codes"

func (s *Service) Method(ctx context.Context, req *Request) (*Response, error) {
    if req.Name == "" {
        return nil, status.Errorf(codes.InvalidArgument, "name is required")
    }
    
    result, err := s.store.Get(ctx, req.Name)
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            return nil, status.Errorf(codes.NotFound, "resource not found")
        }
        return nil, status.Errorf(codes.Internal, "failed to get resource")
    }
    
    return result, nil
}
```

### Naming Conventions

**Packages:**
- Lowercase, single word: `store`, `server`, `auth`
- No underscores or hyphens

**Types:**
- Interfaces: `Driver`, `Store`, `Service`
- Structs: PascalCase matching purpose
- Find/Update/Delete prefixes for query types

```go
type Memo struct { ... }
type FindMemo struct { ... }
type UpdateMemo struct { ... }
type DeleteMemo struct { ... }
```

**Methods:**
- PascalCase for exported
- camelCase for internal
- Verb first: `CreateMemo`, `ListMemos`, `UpdateMemo`

### Comments

```go
// Public functions MUST have comments (godot enforces)

// CreateMemo creates a new memo in the database.
// It returns the created memo with generated ID and timestamps.
func (s *Store) CreateMemo(ctx context.Context, memo *Memo) (*Memo, error) {
    // ...
}

// Use // for single-line comments
// Use /* */ for multi-line explanations if needed
```

### Imports

```go
import (
    // stdlib
    "context"
    "database/sql"
    "fmt"

    // third-party
    "github.com/labstack/echo/v4"
    "github.com/pkg/errors"

    // local
    "github.com/usememos/memos/store"
    v1pb "github.com/usememos/memos/proto/gen/api/v1"
)
```

Use `goimports -w .` to auto-format.

### Context Usage

```go
// Always pass context as first parameter
func DoSomething(ctx context.Context, param string) error

// Extract user from context (after auth middleware)
user, err := s.GetCurrentUser(ctx)

// Add values to context
ctx = context.WithValue(ctx, "key", value)

// Use context for cancellation
select {
case <-ctx.Done():
    return ctx.Err()
case result := <-resultCh:
    return result
}
```

## Important Files Reference

### Entry Points

| File | Purpose |
|------|---------|
| `cmd/memos/main.go` | CLI entry, Cobra commands, profile setup |
| `server/server.go` | Echo server init, route setup, background runners |

### API Layer

| File | Purpose |
|------|---------|
| `server/router/api/v1/v1.go` | Service registration, Gateway + Connect setup |
| `server/router/api/v1/acl_config.go` | Public endpoints whitelist (SINGLE SOURCE OF TRUTH) |
| `server/router/api/v1/connect_interceptors.go` | Interceptor chain implementation |
| `server/router/api/v1/connect_services.go` | Connect handler registration |
| `server/router/api/v1/memo_service.go` | Memo CRUD implementation |
| `server/router/api/v1/user_service.go` | User management implementation |
| `server/router/api/v1/auth_service.go` | Authentication endpoints |

### Authentication

| File | Purpose |
|------|---------|
| `server/auth/authenticator.go` | JWT + PAT verification |
| `server/auth/jwt.go` | JWT signing and parsing |
| `server/auth/context.go` | Context helpers for user extraction |

### Data Layer

| File | Purpose |
|------|---------|
| `store/store.go` | Store wrapper with caching |
| `store/driver.go` | Driver interface definition |
| `store/cache.go` | In-memory cache implementation |
| `store/migrator.go` | Migration execution logic |
| `store/db/db.go` | Driver factory |
| `store/db/sqlite/sqlite.go` | SQLite implementation |
| `store/db/mysql/mysql.go` | MySQL implementation |
| `store/db/postgres/postgres.go` | PostgreSQL implementation |

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MEMOS_MODE` | `dev` | Mode: `dev`, `prod`, `demo` |
| `MEMOS_PORT` | `8081` | HTTP port |
| `MEMOS_ADDR` | `` | Bind address (empty = all interfaces) |
| `MEMOS_DATA` | `~/.memos` | Data directory |
| `MEMOS_DRIVER` | `sqlite` | Database: `sqlite`, `mysql`, `postgres` |
| `MEMOS_DSN` | `` | Database connection string |
| `MEMOS_INSTANCE_URL` | `` | Instance base URL (for SSO) |

### CLI Flags

```bash
go run ./cmd/memos \
  --mode dev \
  --port 8081 \
  --addr localhost \
  --data ./data \
  --driver sqlite
```

## Debugging

### API Issues

1. **Check interceptor logs:**
   - `connect_interceptors.go` logs all requests
   - Enable verbose logging with `--mode dev`

2. **Verify endpoint ACL:**
   - Check `acl_config.go` for public endpoints
   - Non-listed endpoints require authentication

3. **Test with curl:**
   ```bash
   # REST API (via gRPC-Gateway)
   curl -H "Authorization: Bearer <token>" \
        http://localhost:8081/api/v1/memos
   
   # Connect RPC (binary)
   curl -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer <token>" \
        -d '{"filter":""}' \
        http://localhost:8081/memos.api.v1.MemoService/ListMemos
   ```

### Database Issues

1. **Check connection string:**
   - SQLite: file path
   - MySQL: `user:pass@tcp(host:port)/dbname`
   - PostgreSQL: `postgres://user:pass@host:port/dbname`

2. **Verify schema version:**
   ```sql
   SELECT * FROM instance_setting WHERE key = 'bb.general.version';
   ```

3. **Test migration:**
   ```bash
   go test ./store/test/... -v
   ```

### Logging

```go
import "log/slog"

// Info level
slog.Info("operation completed", "id", id, "count", count)

// Error level
slog.Error("operation failed", "error", err)

// With context
slog.InfoContext(ctx, "processing request", "method", method)
```

## Plugin System

Backend supports pluggable components in `plugin/`:

| Plugin | Purpose |
|--------|---------|
| `scheduler` | Cron-based job scheduling |
| `email` | SMTP email delivery |
| `filter` | CEL expression filtering |
| `webhook` | HTTP webhook dispatch |
| `markdown` | Markdown parsing (goldmark) |
| `httpgetter` | HTTP content fetching |
| `storage/s3` | S3-compatible storage |

Each plugin has its own README with usage examples.

## Performance Considerations

### Database

- Queries use pagination (`limit`, `offset`)
- WAL journal mode for SQLite (reduces locking)
- Parameterized queries prevent SQL injection
- Connection pooling for MySQL/PostgreSQL

### Caching

- In-memory cache for frequently accessed data
- Instance settings cached (reduces DB hits)
- User cache for auth lookups

### Concurrency

- Thumbnail generation limited to 3 concurrent operations
- Use semaphores for resource-intensive operations
- Context cancellation for long-running tasks

### HTTP

- Echo middleware stack optimized
- CORS headers cached
- Static files served with proper caching headers

## Security Notes

- JWT secrets generated randomly in prod mode
- PAT stored as SHA-256 hashes
- CSRF protection via SameSite cookies
- Input validation at service layer
- SQL injection prevention via parameterized queries
- Rate limiting recommended for production

## CI/CD

### GitHub Workflows

**Backend Tests** (`.github/workflows/backend-tests.yml`):
- Triggers: changes to `go.mod`, `go.sum`, `*.go` files
- Steps: `go mod tidy`, golangci-lint, all tests

**Proto Lint** (`.github/workflows/proto-linter.yml`):
- Triggers: changes to `.proto` files
- Steps: buf lint, buf breaking check

### Linting Configuration

**`.golangci.yaml`:**
- Linters: revive, govet, staticcheck, misspell, gocritic, etc.
- Formatter: goimports
- Forbidden: `fmt.Errorf` (use errors.Wrap), `ioutil.ReadDir`
