# Memos Frontend Guide for AI Agents

This document provides comprehensive guidance for AI agents working with the Memos frontend codebase. It covers architecture, workflows, conventions, and key patterns specific to the React/TypeScript frontend.

## Project Overview

Memos frontend is a single-page application built with:
- **Framework:** React 18.3 + TypeScript 5.x
- **Build Tool:** Vite 7
- **State Management:** React Query v5 (server) + React Context (client)
- **Styling:** Tailwind CSS v4 via `@tailwindcss/vite`
- **UI Components:** Radix UI primitives
- **API Client:** Connect RPC via `@connectrpc/connect-web`
- **Linting/Formatting:** Biome

## Architecture

```
web/src/
├── main.tsx            # React 入口，Provider 配置
├── App.tsx             # 根组件，全局 Effect
├── index.css           # 全局样式，Tailwind 导入
├── connect.ts          # Connect RPC 客户端配置
├── auth-state.ts       # Token 状态管理
├── i18n.ts             # i18next 国际化配置
├── instance-config.ts  # 实例配置
│
├── components/         # React 组件库
│   ├── memo/           # Memo 相关组件
│   ├── editor/         # 编辑器组件
│   ├── user/           # 用户相关组件
│   └── ui/             # 通用 UI 组件 (基于 Radix)
│
├── contexts/           # React Context (客户端状态)
│   ├── AuthContext.tsx         # 认证状态
│   ├── InstanceContext.tsx     # 实例配置
│   ├── ViewContext.tsx         # 布局/排序偏好
│   └── MemoFilterContext.tsx   # 过滤器状态，URL 同步
│
├── hooks/              # 自定义 Hooks
│   ├── useMemoQueries.ts       # Memo CRUD 操作
│   ├── useUserQueries.ts       # 用户操作
│   ├── useAttachmentQueries.ts # 附件操作
│   ├── useInstanceQueries.ts   # 实例配置操作
│   └── ...                     # 其他 Hooks
│
├── lib/                # 工具库
│   ├── query-client.ts # React Query 配置
│   └── utils.ts        # 通用工具函数
│
├── pages/              # 页面组件
│   ├── Home.tsx
│   ├── Explore.tsx
│   ├── Settings.tsx
│   └── ...
│
├── router/             # 路由配置
├── layouts/            # 布局组件
├── themes/             # 主题配置
├── locales/            # i18n 翻译文件
├── utils/              # 工具函数
├── helpers/            # 辅助函数
└── types/              # TypeScript 类型
    └── proto/api/v1/   # 从 .proto 生成的类型
```

## Key Architectural Patterns

### 1. State Management: React Query + Context

**React Query (Server State):**
- All API calls go through custom hooks in `hooks/`
- Query keys organized by resource type
- Configuration in `lib/query-client.ts`:
  - Default staleTime: 30s
  - gcTime: 5min
  - Automatic refetch on window focus, reconnect

```typescript
// Example: useMemoQueries.ts
export const memoKeys = {
  all: ["memos"] as const,
  lists: () => [...memoKeys.all, "list"] as const,
  list: (filter: string) => [...memoKeys.lists(), filter] as const,
  details: () => [...memoKeys.all, "detail"] as const,
  detail: (name: string) => [...memoKeys.details(), name] as const,
};

export const useMemos = (filter: string) => {
  return useQuery({
    queryKey: memoKeys.list(filter),
    queryFn: () => memoServiceClient.listMemos({ filter }),
  });
};

export const useCreateMemo = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memo: CreateMemoRequest) => 
      memoServiceClient.createMemo(memo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memoKeys.lists() });
    },
  });
};
```

**React Context (Client State):**
- `AuthContext`: Current user, auth initialization, logout
- `InstanceContext`: Instance profile, settings, custom branding
- `ViewContext`: Layout mode (LIST/MASONRY), sort order
- `MemoFilterContext`: Active filters, shortcut selection, URL sync

```typescript
// Usage example
import { useAuth } from "@/contexts/AuthContext";
import { useView } from "@/contexts/ViewContext";

const MyComponent = () => {
  const { currentUser, isLoggedIn } = useAuth();
  const { layout, toggleSortOrder } = useView();
  // ...
};
```

### 2. API Communication: Connect RPC

**Client Setup (`connect.ts`):**
- Uses `@connectrpc/connect-web` with binary format for refresh, JSON for main
- Auth interceptor automatically adds Bearer token
- Token refresh with single-flight pattern (prevents duplicate refreshes)
- Redirect to login on auth failure

```typescript
// Service clients available:
import { 
  instanceServiceClient,
  authServiceClient,
  userServiceClient,
  memoServiceClient,
  attachmentServiceClient,
  shortcutServiceClient,
  activityServiceClient,
  identityProviderServiceClient,
} from "@/connect";
```

**Token Refresh Flow:**
1. Request fails with `Code.Unauthenticated`
2. Call `refreshAuthClient.refreshToken({})` (uses refresh cookie)
3. Update access token in state
4. Retry original request with new token
5. On refresh failure, redirect to `/auth`


### 3. Daily Memo System

**Concept:**
- One memo per day acts as a container/journal
- Identified by title format: `# YYYY-MM-DD`
- Created automatically in "Inbox" or "Daily" view if missing

**Implementation (`hooks/useDailyMemo.ts`):**
- **Query**: Filters memos by `creator_id` and `created_ts` (start/end of day)
- **Title Check**: `isDailyMemoForDate(memo)` verifies title prefix
- **Caching**: 30s stale time, specific query key `['daily-memo', 'YYYY-MM-DD']`

### 4. Annotation System

**Concept:**
- "Comments" are repurposed as "Annotations" or "Sidebar Notes"
- UI: Inline sidebar or dedicated panel

**Hook (`hooks/useAnnotations.ts`):**
- Wraps `createMemoComment`, `updateMemo`, `deleteMemo`
- Provides simple interface: `addAnnotation`, `deleteAnnotation`
- Manages optimistic UI updates (via React Query cache invalidation)

### 5. Component Patterns

**Functional Components with Hooks:**
```typescript
interface MemoCardProps {
  memo: Memo;
  showCreator?: boolean;
}

const MemoCard: React.FC<MemoCardProps> = ({ memo, showCreator = true }) => {
  const { t } = useTranslation();
  const navigate = useNavigateTo();
  
  const handleClick = useCallback(() => {
    navigate(`/memo/${memo.uid}`);
  }, [memo.uid, navigate]);
  
  return (
    <div className="memo-card" onClick={handleClick}>
      {/* ... */}
    </div>
  );
};
```

**Performance Optimization:**
- Use `useMemo` for expensive computations
- Use `useCallback` for stable function references
- Avoid inline object/array in props
- Use React Query's `select` for data transformation

### 4. Styling with Tailwind CSS v4

**Configuration:**
- Plugin: `@tailwindcss/vite`
- Imported in `index.css`
- Use `clsx` and `tailwind-merge` for conditional classes

```typescript
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Utility function
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Usage
<div className={cn(
  "flex items-center gap-2",
  isActive && "bg-blue-500",
  className
)} />
```

**Theming:**
- Theme files in `themes/`
- CSS variables for dynamic theming
- Dark mode support

### 6. Feature Components

**Memo Timer (`components/MemoTimer`):**
- **Data Model**: `TimerData` (accumulated seconds, is_running, last_start_timestamp) in Memo payload
- **Logic**:
  - `calculateTimerDuration`: Computes real-time elapsed duration
  - `calculateNewTimerState`: Toggles stats and updates timestamp
- **Persistence**: Updates `timer` field in `Memo` via `updateMask`

## Development Commands

```bash
# Install dependencies
pnpm install

# Start development server (proxies to localhost:8081)
pnpm dev

# Type checking + lint
pnpm lint

# Auto-fix lint issues
pnpm lint:fix

# Format code
pnpm format

# Build for production
pnpm build

# Build and copy to backend (for embedding)
pnpm release
```

## Key Workflows

### Adding a New Page

1. **Create Page Component:**
   ```typescript
   // src/pages/NewPage.tsx
   import { useMemos } from "@/hooks/useMemoQueries";
   
   const NewPage = () => {
     const { data: memos, isLoading } = useMemos({ filter: "..." });
     
     if (isLoading) return <Loading />;
     
     return (
       <div>
         {memos?.map(memo => <MemoCard key={memo.uid} memo={memo} />)}
       </div>
     );
   };
   
   export default NewPage;
   ```

2. **Add Route:**
   - Edit `router/index.tsx` or relevant router file
   - Add lazy loading for better performance

3. **Add Navigation (if needed):**
   - Update sidebar or navigation components

### Creating a New React Query Hook

1. **Define Query Keys:**
   ```typescript
   // hooks/useNewResourceQueries.ts
   export const newResourceKeys = {
     all: ["new-resources"] as const,
     lists: () => [...newResourceKeys.all, "list"] as const,
     list: (filter: string) => [...newResourceKeys.lists(), filter] as const,
     details: () => [...newResourceKeys.all, "detail"] as const,
     detail: (id: string) => [...newResourceKeys.details(), id] as const,
   };
   ```

2. **Create Query Hook:**
   ```typescript
   export const useNewResources = (filter: string) => {
     return useQuery({
       queryKey: newResourceKeys.list(filter),
       queryFn: () => serviceClient.listResources({ filter }),
     });
   };
   ```

3. **Create Mutation Hook:**
   ```typescript
   export const useCreateNewResource = () => {
     const queryClient = useQueryClient();
     return useMutation({
       mutationFn: (data: CreateRequest) => 
         serviceClient.createResource(data),
       onSuccess: () => {
         queryClient.invalidateQueries({ 
           queryKey: newResourceKeys.lists() 
         });
       },
     });
   };
   ```

### Adding a New Context

1. **Create Context File:**
   ```typescript
   // contexts/NewContext.tsx
   import { createContext, useContext, useState, ReactNode } from "react";
   
   interface NewContextValue {
     value: string;
     setValue: (v: string) => void;
   }
   
   const NewContext = createContext<NewContextValue | null>(null);
   
   export const NewProvider = ({ children }: { children: ReactNode }) => {
     const [value, setValue] = useState("");
     
     return (
       <NewContext.Provider value={{ value, setValue }}>
         {children}
       </NewContext.Provider>
     );
   };
   
   export const useNew = () => {
     const context = useContext(NewContext);
     if (!context) {
       throw new Error("useNew must be used within NewProvider");
     }
     return context;
   };
   ```

2. **Add Provider to App:**
   - Wrap in `main.tsx` or appropriate layout

### Using Generated Proto Types

After running `cd proto && buf generate`, TypeScript types are available:

```typescript
import { Memo, CreateMemoRequest } from "@/types/proto/api/v1/memo_service_pb";
import { User } from "@/types/proto/api/v1/user_service_pb";

// Types are automatically inferred from service client methods
const memo = await memoServiceClient.getMemo({ name: "memos/123" });
// memo is typed as Memo
```

## Code Conventions

### TypeScript

**File Naming:**
- Components: `PascalCase.tsx`
- Hooks: `use*.ts`
- Utils: `camelCase.ts`
- Types: `*.types.ts` or inline

**Imports:**
- Absolute imports with `@/` alias
- Group: React, third-party, local
- Auto-organized by Biome

```typescript
// Preferred import order
import { useState, useCallback } from "react";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";

import { useMemos } from "@/hooks/useMemoQueries";
import { Button } from "@/components/ui/Button";
```

**Props Interfaces:**
```typescript
interface Props {
  // Required props first
  id: string;
  onSubmit: (data: FormData) => void;
  
  // Optional props with defaults
  className?: string;
  disabled?: boolean;
}

const Component: React.FC<Props> = ({ 
  id, 
  onSubmit, 
  className = "", 
  disabled = false 
}) => {
  // ...
};
```

### React

**Component Structure:**
```typescript
const MyComponent: React.FC<Props> = (props) => {
  // 1. Destructure props
  const { id, name } = props;
  
  // 2. Context hooks
  const { currentUser } = useAuth();
  
  // 3. State hooks
  const [isOpen, setIsOpen] = useState(false);
  
  // 4. Query hooks
  const { data, isLoading } = useQuery(...);
  
  // 5. Computed values / useMemo
  const filteredData = useMemo(() => ..., [deps]);
  
  // 6. Callbacks / useCallback
  const handleClick = useCallback(() => ..., [deps]);
  
  // 7. Effects
  useEffect(() => ..., [deps]);
  
  // 8. Early returns (loading, error)
  if (isLoading) return <Loading />;
  
  // 9. Main render
  return (...);
};
```

**Event Handlers:**
- Prefix with `handle`: `handleClick`, `handleSubmit`
- Use `useCallback` for stable references

**Conditional Rendering:**
```typescript
// Early return for loading/error states
if (isLoading) return <Loading />;
if (error) return <Error message={error.message} />;

// Short conditions inline
{isVisible && <Component />}

// Ternary for simple either/or
{isActive ? <Active /> : <Inactive />}

// Complex conditions - extract to variable or function
const Content = () => {
  if (type === "a") return <A />;
  if (type === "b") return <B />;
  return <Default />;
};
```

### Styling

**Class Ordering:**
1. Layout (display, position)
2. Sizing (width, height)
3. Spacing (margin, padding)
4. Colors (background, text)
5. Effects (shadow, opacity)
6. Interactions (hover, focus)

```typescript
<div className="
  flex flex-col items-center
  w-full max-w-2xl
  p-4 gap-2
  bg-white dark:bg-gray-800
  rounded-lg shadow-md
  hover:shadow-lg transition-shadow
" />
```

## Important Files Reference

| File | Purpose |
|------|---------|
| `src/connect.ts` | Connect RPC client, auth interceptor, token refresh |
| `src/auth-state.ts` | Access token state management |
| `src/lib/query-client.ts` | React Query client configuration |
| `src/contexts/AuthContext.tsx` | Authentication state, login/logout |
| `src/contexts/InstanceContext.tsx` | Instance profile and settings |
| `src/contexts/ViewContext.tsx` | UI layout preferences |
| `src/contexts/MemoFilterContext.tsx` | Filter state, URL sync |
| `src/hooks/useMemoQueries.ts` | Memo queries and mutations |
| `src/hooks/useUserQueries.ts` | User queries and mutations |
| `vite.config.mts` | Vite build config, dev proxy |
| `biome.json` | Linting and formatting rules |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEV_PROXY_SERVER` | `http://localhost:8081` | Backend proxy target for dev |

## Debugging

### React Query DevTools

Available in development mode (bottom-left icon):
- Inspect query cache
- View query state (fresh, stale, fetching)
- Trigger refetches manually
- Clear cache

### React DevTools

- Inspect component tree
- View props and state
- Debug Context values

### Network Debugging

- Check Connect RPC requests in Network tab
- Look for `/memos.api.v1.*` endpoints
- Verify `Authorization` header is present

### Common Issues

**Token Refresh Loop:**
- Check if refresh endpoint returns valid token
- Verify cookie is being sent (credentials: include)

**Query Not Updating:**
- Verify `invalidateQueries` is called with correct key
- Check if staleTime is too long

**Type Errors with Proto:**
- Regenerate: `cd proto && buf generate`
- Restart TypeScript server

## Testing

### Type Checking

```bash
pnpm lint
```

This runs:
- `tsc --noEmit` - TypeScript type checking
- `biome check src` - Lint rules

### Manual Testing

Currently, frontend relies on:
- TypeScript for static type safety
- Manual browser testing
- React Query DevTools for API debugging

## Performance Considerations

### Code Splitting

Manual chunks configured in `vite.config.mts`:
- `utils-vendor`: dayjs, lodash-es
- `mermaid-vendor`: mermaid
- `leaflet-vendor`: leaflet, react-leaflet

### React Query Optimization

- Infinite queries for large lists (pagination)
- Selective refetching with query key structure
- Optimistic updates for better UX

### Component Optimization

- Lazy loading for heavy components
- `useMemo` / `useCallback` for expensive operations
- Avoid unnecessary re-renders with stable references

## Dependencies Overview

### Core UI
- `react`, `react-dom` - React 18.3
- `react-router-dom` - Routing
- `@radix-ui/*` - UI primitives
- `lucide-react` - Icons

### State & Data
- `@tanstack/react-query` - Server state
- `@connectrpc/connect`, `@connectrpc/connect-web` - RPC client

### Styling
- `tailwindcss`, `@tailwindcss/vite` - CSS framework
- `clsx`, `tailwind-merge` - Class utilities
- `class-variance-authority` - Variant management

### Markdown & Visualization
- `react-markdown`, `remark-*`, `rehype-*` - Markdown rendering
- `mermaid` - Diagrams
- `highlight.js` - Code highlighting
- `react-force-graph-2d` - Graph visualization
- `leaflet`, `react-leaflet` - Maps

### Utilities
- `dayjs` - Date handling
- `lodash-es` - Utilities
- `i18next`, `react-i18next` - Internationalization
- `fuse.js` - Fuzzy search
