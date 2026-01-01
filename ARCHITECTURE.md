# Memos Architecture Overview

> 一页式架构图与数据流文档

## 🏗️ 整体架构图

```mermaid
graph TB
    subgraph "Frontend 前端层"
        Browser[浏览器/客户端]
        React[React 18.3 + TypeScript]
        Vite[Vite 7 Dev Server]
        RQ[React Query v5]
        Contexts[React Contexts]
        ConnectClient[Connect RPC Client]
    end

    subgraph "API Gateway API 网关层"
        Echo[Echo HTTP Server]
        Connect[Connect RPC<br/>浏览器主路径]
        Gateway[gRPC-Gateway<br/>REST API]
        AuthMW[Auth Interceptors]
        CORS[CORS Middleware]
    end

    subgraph "Service Layer 服务层"
        AuthSvc[AuthService]
        UserSvc[UserService]
        MemoSvc[MemoService]
        AttachSvc[AttachmentService]
        ShortcutSvc[ShortcutService]
        InstanceSvc[InstanceService]
        IdpSvc[IdentityProviderService]
        ActivitySvc[ActivityService]
    end

    subgraph "Store Layer 存储层"
        Store[Store Wrapper]
        Cache[In-Memory Cache]
        Driver[Driver Interface]
    end

    subgraph "Database 数据库层"
        SQLite[(SQLite)]
        MySQL[(MySQL)]
        Postgres[(PostgreSQL)]
    end

    subgraph "Plugin System 插件系统"
        Scheduler[Scheduler]
        Email[Email]
        Webhook[Webhook]
        Markdown[Markdown]
        S3[S3 Storage]
        Filter[CEL Filter]
    end

    Browser --> React
    React --> RQ
    React --> Contexts
    RQ --> ConnectClient
    ConnectClient --> Connect
    
    Vite -.-> |proxy| Echo
    
    Echo --> Connect
    Echo --> Gateway
    Connect --> AuthMW
    Gateway --> AuthMW
    AuthMW --> CORS
    
    CORS --> AuthSvc
    CORS --> UserSvc
    CORS --> MemoSvc
    CORS --> AttachSvc
    CORS --> ShortcutSvc
    CORS --> InstanceSvc
    CORS --> IdpSvc
    CORS --> ActivitySvc
    
    AuthSvc --> Store
    UserSvc --> Store
    MemoSvc --> Store
    AttachSvc --> Store
    ShortcutSvc --> Store
    InstanceSvc --> Store
    IdpSvc --> Store
    ActivitySvc --> Store
    
    Store --> Cache
    Store --> Driver
    
    Driver --> SQLite
    Driver --> MySQL
    Driver --> Postgres
    
    MemoSvc --> Markdown
    MemoSvc --> Filter
    AttachSvc --> S3
    UserSvc --> Scheduler
    AuthSvc --> Email
    MemoSvc --> Webhook

    classDef frontend fill:#61DAFB,stroke:#333,color:#000
    classDef gateway fill:#00ADD8,stroke:#333,color:#fff
    classDef service fill:#FFD700,stroke:#333,color:#000
    classDef store fill:#90EE90,stroke:#333,color:#000
    classDef db fill:#FF6B6B,stroke:#333,color:#fff
    classDef plugin fill:#DDA0DD,stroke:#333,color:#000
    
    class Browser,React,Vite,RQ,Contexts,ConnectClient frontend
    class Echo,Connect,Gateway,AuthMW,CORS gateway
    class AuthSvc,UserSvc,MemoSvc,AttachSvc,ShortcutSvc,InstanceSvc,IdpSvc,ActivitySvc service
    class Store,Cache,Driver store
    class SQLite,MySQL,Postgres db
    class Scheduler,Email,Webhook,Markdown,S3,Filter plugin
```

---

## 🔄 数据流图

```mermaid
sequenceDiagram
    participant U as 用户浏览器
    participant F as React Frontend
    participant RQ as React Query
    participant C as Connect Client
    participant A as API Gateway (Echo)
    participant I as Auth Interceptor
    participant S as Service Layer
    participant ST as Store Layer
    participant D as Database

    Note over U,D: 典型的 Memo 创建流程

    U->>F: 1. 用户输入内容并点击保存
    F->>RQ: 2. 触发 useMutation
    RQ->>C: 3. 调用 memoServiceClient.createMemo()
    C->>A: 4. Connect RPC over HTTP<br/>POST /memos.api.v1.MemoService/CreateMemo
    A->>I: 5. 经过 Connect Interceptor 链
    
    Note right of I: MetadataInterceptor<br/>LoggingInterceptor<br/>RecoveryInterceptor<br/>AuthInterceptor
    
    I->>I: 6. 解析 JWT Token<br/>验证用户身份
    I->>S: 7. 调用 MemoService.CreateMemo()
    S->>S: 8. 业务逻辑验证<br/>Markdown 解析<br/>提取标签/链接/任务
    S->>ST: 9. store.CreateMemo()
    ST->>D: 10. SQL INSERT
    D-->>ST: 11. 返回新创建的 Memo
    ST-->>S: 12. 返回 Memo 对象
    S-->>I: 13. 返回 gRPC Response
    I-->>A: 14. 序列化为 Protobuf
    A-->>C: 15. HTTP 200 + Binary/JSON
    C-->>RQ: 16. 类型安全的响应
    RQ->>RQ: 17. 更新缓存<br/>触发 invalidateQueries
    RQ-->>F: 18. 返回新 Memo 数据
    F-->>U: 19. UI 更新显示新 Memo
```

### MemoService.CreateMemo 详细时序图

```mermaid
sequenceDiagram
    participant C as Connect Client
    participant I as Auth Interceptor
    participant MS as MemoService
    participant FU as fetchCurrentUser()
    participant STORE as Store Layer
    participant MP as memopayload<br/>RebuildMemoPayload
    participant MD as MarkdownService
    participant ATT as SetMemoAttachments()
    participant REL as SetMemoRelations()
    participant CVT as convertMemoFromStore()
    participant WH as DispatchWebhook
    participant D as Database

    Note over C,D: MemoService.CreateMemo 服务层详细流程

    C->>I: CreateMemoRequest
    I->>MS: 1. CreateMemo(ctx, request)
    
    rect rgb(255, 245, 230)
        Note right of MS: 用户认证阶段
        MS->>FU: 2. fetchCurrentUser(ctx)
        FU->>STORE: GetUser()
        STORE->>D: SELECT user
        D-->>STORE: user row
        STORE-->>FU: *store.User
        FU-->>MS: user, nil
        MS->>MS: 3. 检查用户是否为空
    end

    rect rgb(230, 245, 255)
        Note right of MS: UID 生成与验证阶段
        MS->>MS: 4. 处理 memo_id<br/>若为空则 shortuuid.New()<br/>否则验证 UIDMatcher 格式
    end

    rect rgb(245, 255, 230)
        Note right of MS: 构建 store.Memo 对象
        MS->>MS: 5. 创建 store.Memo{<br/>  UID, CreatorID,<br/>  Content, Visibility<br/>}
    end

    rect rgb(255, 230, 245)
        Note right of MS: 实例设置验证阶段
        MS->>STORE: 6. GetInstanceMemoRelatedSetting(ctx)
        STORE->>D: SELECT setting
        D-->>STORE: setting row
        STORE-->>MS: *MemoRelatedSetting
        MS->>MS: 7. 检查 DisallowPublicVisibility
        MS->>MS: 8. getContentLengthLimit(ctx)
        MS->>MS: 9. 验证内容长度
    end

    rect rgb(230, 255, 245)
        Note right of MS: Markdown 解析阶段
        MS->>MP: 10. RebuildMemoPayload(memo, markdownService)
        MP->>MD: 11. Parse(content)
        MD-->>MP: AST Nodes
        MP->>MP: 12. 提取 Tags, Links,<br/>Tasks, Code Blocks
        MP-->>MS: 更新 memo.Payload
        MS->>MS: 13. 处理 Location (如有)
    end

    rect rgb(245, 230, 255)
        Note right of MS: 数据持久化阶段
        MS->>STORE: 14. CreateMemo(ctx, create)
        STORE->>D: 15. INSERT INTO memo
        alt 唯一约束冲突
            D-->>STORE: UNIQUE constraint failed
            STORE-->>MS: error
            MS-->>I: AlreadyExists error
        else 成功
            D-->>STORE: new memo row
            STORE-->>MS: *store.Memo
        end
    end

    rect rgb(255, 240, 230)
        Note right of MS: 附件处理阶段 (如有)
        opt request.Memo.Attachments > 0
            MS->>ATT: 16. SetMemoAttachments()
            ATT->>STORE: UpdateAttachment()
            STORE->>D: UPDATE attachment SET memo_id
            D-->>STORE: affected rows
            STORE-->>ATT: nil
            ATT-->>MS: response, nil
            MS->>STORE: 17. ListAttachments(memo_id)
            STORE->>D: SELECT attachments
            D-->>STORE: attachment rows
            STORE-->>MS: []*store.Attachment
        end
    end

    rect rgb(230, 240, 255)
        Note right of MS: 关系处理阶段 (如有)
        opt request.Memo.Relations > 0
            MS->>REL: 18. SetMemoRelations()
            REL->>STORE: UpsertMemoRelation()
            STORE->>D: INSERT/UPDATE relations
            D-->>STORE: affected rows
            STORE-->>REL: nil
            REL-->>MS: response, nil
        end
    end

    rect rgb(245, 245, 230)
        Note right of MS: 响应转换阶段
        MS->>CVT: 19. convertMemoFromStore()
        CVT->>CVT: 20. 转换 Visibility<br/>格式化 CreateTime/UpdateTime<br/>构建 Resource Name
        CVT-->>MS: *v1pb.Memo
    end

    rect rgb(240, 230, 245)
        Note right of MS: Webhook 分发阶段
        MS->>WH: 21. DispatchMemoCreatedWebhook()
        WH->>STORE: ListWebhooks(creatorID)
        STORE->>D: SELECT webhooks
        D-->>STORE: webhook rows
        STORE-->>WH: []*store.Webhook
        WH->>WH: 22. 异步 HTTP POST<br/>到各 Webhook URL
        WH-->>MS: nil (错误仅记录日志)
    end

    MS-->>I: 23. 返回 *v1pb.Memo
    I-->>C: 24. gRPC Response
```

---

## 🔐 认证流程

```mermaid
flowchart LR
    subgraph "认证方式"
        JWT[JWT Access Token<br/>短期 15分钟]
        PAT[Personal Access Token<br/>长期有效]
        Cookie[Refresh Token<br/>HttpOnly Cookie]
    end

    subgraph "认证流程"
        Login[用户登录]
        Verify[Token 验证]
        Refresh[Token 刷新]
    end

    Login --> |SignIn API| JWT
    Login --> |SignIn API| Cookie
    JWT --> |Authorization Header| Verify
    PAT --> |Authorization Header| Verify
    Cookie --> |自动发送| Refresh
    Refresh --> |返回新| JWT

    style JWT fill:#4CAF50,color:#fff
    style PAT fill:#2196F3,color:#fff
    style Cookie fill:#FF9800,color:#fff
```

---

## 📊 数据库迁移流程

```mermaid
flowchart TD
    Start[启动应用] --> Check{数据库已初始化?}
    Check -->|否| ApplyLatest[应用 LATEST.sql<br/>完整 Schema]
    Check -->|是| GetVersion[获取当前版本<br/>instance_setting]
    GetVersion --> CheckMin{版本 >= 0.22.0?}
    CheckMin -->|否| Error[错误: 需先升级到 0.25.x]
    CheckMin -->|是| Compare{需要迁移?}
    Compare -->|否| Done[完成]
    Compare -->|是| Migrate[应用增量迁移<br/>单事务执行]
    ApplyLatest --> Demo{Demo 模式?}
    Migrate --> UpdateVer[更新版本号]
    UpdateVer --> Demo
    Demo -->|是| Seed[加载种子数据]
    Demo -->|否| Done
    Seed --> Done

    subgraph "迁移文件结构"
        direction LR
        MigDir[store/migration/]
        SQLite[sqlite/0.XX/NN__desc.sql]
        MySQL[mysql/0.XX/NN__desc.sql]
        Postgres[postgres/0.XX/NN__desc.sql]
        MigDir --> SQLite
        MigDir --> MySQL
        MigDir --> Postgres
    end

    style Error fill:#FF6B6B,color:#fff
    style Done fill:#4CAF50,color:#fff
```

---

## 📁 项目目录结构

```mermaid
graph TB
    Root[memos/]
    
    subgraph Backend
        CMD[cmd/memos/]
        Server[server/]
        Store[store/]
        Plugin[plugin/]
        Internal[internal/]
        Proto[proto/]
    end
    
    subgraph Frontend
        Web[web/]
        Src[src/]
        Components[components/]
        Contexts[contexts/]
        Hooks[hooks/]
        Pages[pages/]
        Types[types/proto/]
    end
    
    Root --> CMD
    Root --> Server
    Root --> Store
    Root --> Plugin
    Root --> Internal
    Root --> Proto
    Root --> Web
    
    Web --> Src
    Src --> Components
    Src --> Contexts
    Src --> Hooks
    Src --> Pages
    Src --> Types
    
    Server --> |router/api/v1/| Services[服务实现]
    Server --> |auth/| Auth[认证模块]
    Server --> |runner/| Runner[后台任务]
    
    Store --> |db/| Drivers[数据库驱动]
    Store --> |migration/| Migrations[迁移文件]

    style Root fill:#FFD700,stroke:#333,color:#000
    style Backend fill:#00ADD8,stroke:#333,color:#fff
    style Frontend fill:#61DAFB,stroke:#333,color:#000
```

---

## 🗂️ 关键文件摘录

### 后端关键文件

| 分类 | 文件路径 | 职责描述 |
|------|---------|---------|
| **入口点** | `cmd/memos/main.go` | Cobra CLI 入口，Profile 配置，服务器初始化 |
| **服务器** | `server/server.go` | Echo HTTP 服务器，健康检查，后台任务启动 |
| **API 注册** | `server/router/api/v1/v1.go` | gRPC-Gateway + Connect RPC 注册，服务绑定 |
| **公开端点** | `server/router/api/v1/acl_config.go` | 无需认证的公开 API 白名单配置 |
| **认证拦截器** | `server/router/api/v1/connect_interceptors.go` | Metadata/Logging/Recovery/Auth 拦截器链 |
| **认证逻辑** | `server/auth/authenticator.go` | JWT V2 + PAT 验证逻辑 |
| **Connect 服务** | `server/router/api/v1/connect_services.go` | Connect RPC Handler 注册 |
| **Memo 服务** | `server/router/api/v1/memo_service.go` | Memo CRUD 业务逻辑 |
| **User 服务** | `server/router/api/v1/user_service.go` | 用户管理业务逻辑 |
| **存储包装器** | `store/store.go` | Store 封装，缓存管理 |
| **驱动接口** | `store/driver.go` | 数据库驱动统一接口定义 |
| **迁移器** | `store/migrator.go` | Schema 版本管理，迁移执行 |
| **SQLite 驱动** | `store/db/sqlite/sqlite.go` | SQLite 具体实现 |

### 前端关键文件

| 分类 | 文件路径 | 职责描述 |
|------|---------|---------|
| **入口** | `web/src/main.tsx` | React 应用入口，Provider 配置 |
| **根组件** | `web/src/App.tsx` | 应用根组件，全局 Effect |
| **Connect 客户端** | `web/src/connect.ts` | RPC 客户端创建，Token 刷新拦截器 |
| **Query Client** | `web/src/lib/query-client.ts` | React Query 配置 |
| **Auth Context** | `web/src/contexts/AuthContext.tsx` | 用户认证状态管理 |
| **Instance Context** | `web/src/contexts/InstanceContext.tsx` | 实例配置状态管理 |
| **View Context** | `web/src/contexts/ViewContext.tsx` | UI 偏好设置（布局/排序）|
| **Memo Filter Context** | `web/src/contexts/MemoFilterContext.tsx` | 过滤器状态，URL 同步 |
| **Memo Queries** | `web/src/hooks/useMemoQueries.ts` | Memo CRUD Hooks |
| **User Queries** | `web/src/hooks/useUserQueries.ts` | 用户操作 Hooks |
| **Vite 配置** | `web/vite.config.mts` | 开发代理，构建配置 |
| **Biome 配置** | `web/biome.json` | 代码格式化/Lint 配置 |

### Proto 关键文件

| 文件路径 | 职责描述 |
|---------|---------|
| `proto/api/v1/memo_service.proto` | Memo 服务 RPC 定义 |
| `proto/api/v1/user_service.proto` | 用户服务 RPC 定义 |
| `proto/api/v1/auth_service.proto` | 认证服务 RPC 定义 |
| `proto/api/v1/instance_service.proto` | 实例服务 RPC 定义 |
| `proto/api/v1/attachment_service.proto` | 附件服务 RPC 定义 |
| `proto/buf.gen.yaml` | Buf 代码生成配置 |
| `proto/buf.yaml` | Buf lint/breaking 规则 |
| `proto/gen/api/v1/` | 生成的 Go 代码 |
| `web/src/types/proto/api/v1/` | 生成的 TypeScript 代码 |

### 迁移关键文件

| 文件路径 | 职责描述 |
|---------|---------|
| `store/migration/sqlite/LATEST.sql` | SQLite 完整 Schema（新安装用）|
| `store/migration/mysql/LATEST.sql` | MySQL 完整 Schema |
| `store/migration/postgres/LATEST.sql` | PostgreSQL 完整 Schema |
| `store/migration/{driver}/0.XX/*.sql` | 增量迁移脚本 |
| `store/seed/` | Demo 模式种子数据 |

---

## ⚡ 技术栈速览

| 层级 | 技术选型 | 版本 |
|-----|---------|-----|
| **后端语言** | Go | 1.25 |
| **HTTP 框架** | Echo | v4 |
| **API 协议** | gRPC + Connect RPC | - |
| **Protobuf** | Protocol Buffers v2 + buf | 2.x |
| **前端框架** | React | 18.3 |
| **前端语言** | TypeScript | 5.x |
| **构建工具** | Vite | 7.x |
| **状态管理** | React Query + Context | v5 |
| **CSS 框架** | Tailwind CSS | v4 |
| **UI 组件** | Radix UI | - |
| **Linting** | Biome (前端) / golangci-lint (后端) | - |
| **数据库** | SQLite / MySQL / PostgreSQL | - |

---

## 🔗 快速导航

- **后端开发**: 参见 [`server/AGENTS.md`](./server/AGENTS.md)
- **前端开发**: 参见 [`web/AGENTS.md`](./web/AGENTS.md)
- **完整指南**: 参见 [`AGENTS.md`](./AGENTS.md)
