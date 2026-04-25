# Graphait M1 — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Graphait M1 frontend — force-directed agent graph, Kanban task board, and human agent inbox — connecting to the M1 backend REST API.

**Architecture:** Vite + React 18 + TypeScript. React Flow dla grafu, shadcn/ui dla komponentów, TanStack Query dla data fetching. Auth przez JWT (localStorage). Routing przez React Router v6.

**Tech Stack:** React 18, TypeScript 5, Vite 5, React Flow 12, shadcn/ui, TanStack Query v5, React Router v6, Tailwind CSS 3, Vitest + Testing Library

**Prerequisite:** Backend M1 running at `http://localhost:8000`.

---

## File Map

```
frontend/
  index.html
  vite.config.ts
  tsconfig.json
  tailwind.config.js
  postcss.config.js
  package.json
  src/
    main.tsx
    App.tsx
    lib/
      api.ts               # fetch wrapper — base URL, auth header injection
      auth.ts              # JWT localStorage helpers
      queryClient.ts       # TanStack Query client
    types/
      index.ts             # Agent, Task, Comment, GraphData, etc.
    hooks/
      useAuth.ts           # login, logout, register, currentUser
      useAgents.ts         # list, create, update, delete agents
      useTasks.ts          # list, create, update, get tasks
      useComments.ts       # list, add comments
      useGraph.ts          # graph data, create/delete relationships
    components/
      ui/                  # shadcn/ui generated components (button, input, etc.)
      layout/
        AppShell.tsx       # sidebar + main content area
        Sidebar.tsx        # nav links
      GraphView/
        index.tsx          # ReactFlow wrapper
        AgentNode.tsx      # custom node (name, role, type badge)
        AgentPanel.tsx     # slide-in panel on agent click
        AddAgentModal.tsx
      TaskBoard/
        index.tsx          # Kanban board
        KanbanColumn.tsx
        TaskCard.tsx
        TaskDetailModal.tsx
        CommentThread.tsx
        AddTaskModal.tsx
      Inbox/
        index.tsx          # human agent task inbox
        InboxItem.tsx
      Auth/
        LoginPage.tsx
        RegisterPage.tsx
    pages/
      GraphPage.tsx
      TasksPage.tsx
      InboxPage.tsx
  vitest.config.ts
  src/test/
    setup.ts
    components/
      AgentNode.test.tsx
      TaskCard.test.tsx
      InboxItem.test.tsx
```

---

## Task 1: Project setup

**Files:**
- Create: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`
- Create: `frontend/tailwind.config.js`, `frontend/postcss.config.js`, `frontend/index.html`
- Create: `frontend/src/main.tsx`, `frontend/src/App.tsx`

- [ ] **Scaffold with Vite**

```bash
cd /path/to/graphait
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

- [ ] **Install dependencies**

```bash
npm install @xyflow/react @tanstack/react-query react-router-dom lucide-react clsx tailwind-merge class-variance-authority
npm install -D tailwindcss postcss autoprefixer vitest @testing-library/react @testing-library/jest-dom @vitest/ui jsdom
npx tailwindcss init -p
```

- [ ] **Install and init shadcn/ui**

```bash
npx shadcn@latest init
# When prompted: style=default, base color=slate, CSS variables=yes
npx shadcn@latest add button input label card badge separator sheet dialog
```

- [ ] **Update `vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
})
```

- [ ] **Update `tsconfig.json`** — add path alias

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

- [ ] **Update `tailwind.config.js`**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

- [ ] **Create `frontend/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
```

- [ ] **Create `frontend/src/test/setup.ts`**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Verify dev server starts**

```bash
npm run dev
# Expected: VITE ready at http://localhost:5173
```

- [ ] **Commit**

```bash
cd ..
git add frontend/
git commit -m "feat: frontend project scaffold — vite + react + shadcn"
```

---

## Task 2: Types + API client + auth helpers

**Files:**
- Create: `frontend/src/types/index.ts`
- Create: `frontend/src/lib/api.ts`, `frontend/src/lib/auth.ts`, `frontend/src/lib/queryClient.ts`

- [ ] **Create `frontend/src/types/index.ts`**

```typescript
export type AgentType = 'human' | 'ai'
export type RelationshipType = 'reports_to' | 'collaborates_with'
export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled' | 'waiting_approval' | 'approved' | 'rejected'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type TaskType = 'task' | 'approval_request'

export interface Agent {
  id: string
  org_id: string
  name: string
  role_title: string
  type: AgentType
  connector_type: string | null
  system_prompt: string | null
  authority_scope: Record<string, unknown> | null
  is_active: boolean
}

export interface AgentCreate {
  name: string
  role_title: string
  type: AgentType
  connector_type?: string
  connector_config?: Record<string, unknown>
  system_prompt?: string
  authority_scope?: Record<string, unknown>
}

export interface GraphNode {
  id: string
  name: string
  role_title: string
  type: AgentType
  is_active: boolean
}

export interface GraphEdge {
  id: string
  from_agent_id: string
  to_agent_id: string
  type: RelationshipType
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface Task {
  id: string
  org_id: string
  number: number | null
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  task_type: TaskType
  assignee_id: string | null
  creator_id: string
  parent_task_id: string | null
}

export interface TaskCreate {
  title: string
  description?: string
  priority?: TaskPriority
  assignee_id?: string
  parent_task_id?: string
}

export interface Comment {
  id: string
  task_id: string
  author_id: string
  content: string
  is_system: boolean
}

export interface CurrentUser {
  id: string
  email: string
  role: 'admin' | 'member'
  org_id: string
}
```

- [ ] **Create `frontend/src/lib/auth.ts`**

```typescript
const TOKEN_KEY = 'graphait_token'

export const authStorage = {
  getToken: (): string | null => localStorage.getItem(TOKEN_KEY),
  setToken: (token: string): void => localStorage.setItem(TOKEN_KEY, token),
  clearToken: (): void => localStorage.removeItem(TOKEN_KEY),
}
```

- [ ] **Create `frontend/src/lib/api.ts`**

```typescript
import { authStorage } from '@/lib/auth'

const BASE = '/api/v1'

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = authStorage.getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers as Record<string, string> ?? {}),
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.detail ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

export { ApiError }
```

- [ ] **Create `frontend/src/lib/queryClient.ts`**

```typescript
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})
```

- [ ] **Write failing tests** — `frontend/src/test/components/api.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { authStorage } from '@/lib/auth'

describe('authStorage', () => {
  beforeEach(() => authStorage.clearToken())

  it('stores and retrieves token', () => {
    authStorage.setToken('abc123')
    expect(authStorage.getToken()).toBe('abc123')
  })

  it('returns null when no token', () => {
    expect(authStorage.getToken()).toBeNull()
  })

  it('clears token', () => {
    authStorage.setToken('xyz')
    authStorage.clearToken()
    expect(authStorage.getToken()).toBeNull()
  })
})
```

- [ ] **Run — expect PASS**

```bash
npm run test -- src/test/components/api.test.ts
```

- [ ] **Commit**

```bash
git add frontend/src/
git commit -m "feat: frontend types, api client, auth storage"
```

---

## Task 3: Hooks (useAuth, useAgents, useTasks, useGraph)

**Files:**
- Create: `frontend/src/hooks/useAuth.ts`, `useAgents.ts`, `useTasks.ts`, `useComments.ts`, `useGraph.ts`

- [ ] **Create `frontend/src/hooks/useAuth.ts`**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { authStorage } from '@/lib/auth'
import { CurrentUser } from '@/types'

export function useCurrentUser() {
  return useQuery<CurrentUser>({
    queryKey: ['me'],
    queryFn: () => api.get<CurrentUser>('/auth/me'),
    enabled: !!authStorage.getToken(),
    retry: false,
  })
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      api.post<{ access_token: string }>('/auth/login', data),
    onSuccess: (data) => {
      authStorage.setToken(data.access_token)
      qc.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

export function useRegister() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { org_name: string; org_slug: string; email: string; password: string }) =>
      api.post<{ access_token: string }>('/auth/register', data),
    onSuccess: (data) => {
      authStorage.setToken(data.access_token)
      qc.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return () => {
    authStorage.clearToken()
    qc.clear()
  }
}
```

- [ ] **Create `frontend/src/hooks/useAgents.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Agent, AgentCreate } from '@/types'

export function useAgents() {
  return useQuery<Agent[]>({ queryKey: ['agents'], queryFn: () => api.get<Agent[]>('/agents') })
}

export function useCreateAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: AgentCreate) => api.post<Agent>('/agents', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  })
}

export function useUpdateAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<AgentCreate> & { id: string }) =>
      api.patch<Agent>(`/agents/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] })
      qc.invalidateQueries({ queryKey: ['graph'] })
    },
  })
}

export function useDeleteAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/agents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] })
      qc.invalidateQueries({ queryKey: ['graph'] })
    },
  })
}
```

- [ ] **Create `frontend/src/hooks/useTasks.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Task, TaskCreate, TaskStatus } from '@/types'

export function useTasks(assigneeId?: string) {
  const params = assigneeId ? `?assignee_id=${assigneeId}` : ''
  return useQuery<Task[]>({
    queryKey: ['tasks', assigneeId],
    queryFn: () => api.get<Task[]>(`/tasks${params}`),
  })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: TaskCreate) => api.post<Task>('/tasks', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

export function useUpdateTaskStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      api.patch<Task>(`/tasks/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}
```

- [ ] **Create `frontend/src/hooks/useComments.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Comment } from '@/types'

export function useComments(taskId: string) {
  return useQuery<Comment[]>({
    queryKey: ['comments', taskId],
    queryFn: () => api.get<Comment[]>(`/tasks/${taskId}/comments`),
  })
}

export function useAddComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, content }: { taskId: string; content: string }) =>
      api.post<Comment>(`/tasks/${taskId}/comments`, { content }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['comments', vars.taskId] }),
  })
}
```

- [ ] **Create `frontend/src/hooks/useGraph.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { GraphData, RelationshipType } from '@/types'

export function useGraphData() {
  return useQuery<GraphData>({ queryKey: ['graph'], queryFn: () => api.get<GraphData>('/graph') })
}

export function useCreateRelationship() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { from_agent_id: string; to_agent_id: string; type: RelationshipType }) =>
      api.post('/graph/relationships', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['graph'] }),
  })
}

export function useDeleteRelationship() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (relId: string) => api.delete(`/graph/relationships/${relId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['graph'] }),
  })
}
```

- [ ] **Commit**

```bash
git add frontend/src/hooks/
git commit -m "feat: frontend data hooks (auth, agents, tasks, graph)"
```

---

## Task 4: Auth pages + App routing

**Files:**
- Create: `frontend/src/components/Auth/LoginPage.tsx`, `RegisterPage.tsx`
- Create: `frontend/src/App.tsx` (routing)

- [ ] **Create `frontend/src/components/Auth/LoginPage.tsx`**

```tsx
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'
import { useLogin } from '@/hooks/useAuth'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const login = useLogin()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await login.mutateAsync({ email, password })
    navigate('/graph')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader><CardTitle>Sign in to Graphait</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            {login.error && <p className="text-sm text-destructive">{login.error.message}</p>}
            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending ? 'Signing in…' : 'Sign in'}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              No account? <Link to="/register" className="underline">Register</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Create `frontend/src/components/Auth/RegisterPage.tsx`**

```tsx
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'
import { useRegister } from '@/hooks/useAuth'

export function RegisterPage() {
  const [form, setForm] = useState({ org_name: '', org_slug: '', email: '', password: '' })
  const register = useRegister()
  const navigate = useNavigate()

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await register.mutateAsync(form)
    navigate('/graph')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader><CardTitle>Create your organization</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {([['org_name', 'Organization name'], ['org_slug', 'Slug (URL-safe)'], ['email', 'Email'], ['password', 'Password']] as const).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={key}>{label}</Label>
                <Input id={key} type={key === 'password' ? 'password' : 'text'} value={form[key]} onChange={set(key)} required />
              </div>
            ))}
            {register.error && <p className="text-sm text-destructive">{register.error.message}</p>}
            <Button type="submit" className="w-full" disabled={register.isPending}>
              {register.isPending ? 'Creating…' : 'Create organization'}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              Have an account? <Link to="/login" className="underline">Sign in</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Create `frontend/src/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { authStorage } from '@/lib/auth'
import { LoginPage } from '@/components/Auth/LoginPage'
import { RegisterPage } from '@/components/Auth/RegisterPage'
import { GraphPage } from '@/pages/GraphPage'
import { TasksPage } from '@/pages/TasksPage'
import { InboxPage } from '@/pages/InboxPage'
import { AppShell } from '@/components/layout/AppShell'

function RequireAuth({ children }: { children: React.ReactNode }) {
  return authStorage.getToken() ? <>{children}</> : <Navigate to="/login" replace />
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<RequireAuth><AppShell /></RequireAuth>}>
            <Route index element={<Navigate to="/graph" replace />} />
            <Route path="graph" element={<GraphPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="inbox" element={<InboxPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
```

- [ ] **Create skeleton pages** so routing doesn't break

```tsx
// frontend/src/pages/GraphPage.tsx
export function GraphPage() { return <div>Graph View</div> }

// frontend/src/pages/TasksPage.tsx
export function TasksPage() { return <div>Task Board</div> }

// frontend/src/pages/InboxPage.tsx
export function InboxPage() { return <div>Inbox</div> }
```

- [ ] **Create `frontend/src/components/layout/AppShell.tsx`**

```tsx
import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'

export function AppShell() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Create `frontend/src/components/layout/Sidebar.tsx`**

```tsx
import { NavLink } from 'react-router-dom'
import { GitFork, LayoutKanban, Inbox } from 'lucide-react'
import { useLogout } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'

const links = [
  { to: '/graph', icon: GitFork, label: 'Graph' },
  { to: '/tasks', icon: LayoutKanban, label: 'Tasks' },
  { to: '/inbox', icon: Inbox, label: 'Inbox' },
]

export function Sidebar() {
  const logout = useLogout()
  return (
    <aside className="w-56 border-r flex flex-col bg-muted/30">
      <div className="p-4 font-bold text-lg border-b">Graphait</div>
      <nav className="flex-1 p-2 space-y-1">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} className={({ isActive }) =>
            `flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'}`
          }>
            <Icon className="h-4 w-4" />{label}
          </NavLink>
        ))}
      </nav>
      <div className="p-2 border-t">
        <Button variant="ghost" size="sm" className="w-full" onClick={logout}>Sign out</Button>
      </div>
    </aside>
  )
}
```

- [ ] **Update `frontend/src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

- [ ] **Verify login flow works end-to-end**

```bash
npm run dev
# Open http://localhost:5173
# Register an org → should redirect to /graph
# Sign out → should redirect to /login
```

- [ ] **Commit**

```bash
git add frontend/src/
git commit -m "feat: auth pages + app routing + layout shell"
```

---

## Task 5: Graph View (React Flow)

**Files:**
- Create: `frontend/src/components/GraphView/index.tsx`
- Create: `frontend/src/components/GraphView/AgentNode.tsx`
- Create: `frontend/src/components/GraphView/AgentPanel.tsx`
- Create: `frontend/src/components/GraphView/AddAgentModal.tsx`
- Modify: `frontend/src/pages/GraphPage.tsx`

- [ ] **Create `frontend/src/components/GraphView/AgentNode.tsx`**

```tsx
import { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { Badge } from '@/components/ui/badge'
import { GraphNode } from '@/types'

export const AgentNode = memo(({ data, selected }: NodeProps) => {
  const node = data as GraphNode
  return (
    <div className={`px-4 py-3 rounded-lg border-2 bg-background shadow-sm min-w-[140px] transition-colors
      ${node.type === 'human' ? 'border-blue-500' : 'border-emerald-500'}
      ${selected ? 'ring-2 ring-ring ring-offset-1' : ''}
      ${!node.is_active ? 'opacity-50' : ''}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground" />
      <div className="font-semibold text-sm truncate max-w-[120px]">{node.name}</div>
      <div className="text-xs text-muted-foreground truncate">{node.role_title}</div>
      <Badge variant={node.type === 'human' ? 'secondary' : 'outline'} className="mt-1 text-xs">
        {node.type === 'human' ? '👤 human' : '🤖 ai'}
      </Badge>
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground" />
    </div>
  )
})
AgentNode.displayName = 'AgentNode'
```

- [ ] **Create `frontend/src/components/GraphView/AgentPanel.tsx`**

```tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Agent } from '@/types'
import { useDeleteAgent } from '@/hooks/useAgents'

interface Props {
  agent: Agent | null
  onClose: () => void
}

export function AgentPanel({ agent, onClose }: Props) {
  const deleteAgent = useDeleteAgent()

  if (!agent) return null

  return (
    <Sheet open={!!agent} onOpenChange={open => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {agent.name}
            <Badge variant={agent.type === 'human' ? 'secondary' : 'outline'}>
              {agent.type}
            </Badge>
          </SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3 text-sm">
          <div><span className="text-muted-foreground">Role:</span> {agent.role_title}</div>
          {agent.connector_type && (
            <div><span className="text-muted-foreground">Connector:</span> {agent.connector_type}</div>
          )}
          {agent.system_prompt && (
            <div>
              <span className="text-muted-foreground">System prompt:</span>
              <p className="mt-1 p-2 bg-muted rounded text-xs font-mono">{agent.system_prompt}</p>
            </div>
          )}
        </div>
        <div className="mt-6">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => { deleteAgent.mutate(agent.id); onClose() }}
          >
            Remove agent
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Create `frontend/src/components/GraphView/AddAgentModal.tsx`**

```tsx
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateAgent } from '@/hooks/useAgents'
import { AgentType } from '@/types'

interface Props { open: boolean; onClose: () => void }

export function AddAgentModal({ open, onClose }: Props) {
  const [name, setName] = useState('')
  const [roleTitle, setRoleTitle] = useState('')
  const [type, setType] = useState<AgentType>('ai')
  const createAgent = useCreateAgent()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createAgent.mutateAsync({ name, role_title: roleTitle, type })
    setName(''); setRoleTitle(''); setType('ai')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add agent</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. CTO" />
          </div>
          <div className="space-y-1">
            <Label>Role title</Label>
            <Input value={roleTitle} onChange={e => setRoleTitle(e.target.value)} required placeholder="e.g. Chief Technology Officer" />
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <div className="flex gap-2">
              {(['ai', 'human'] as AgentType[]).map(t => (
                <Button key={t} type="button" variant={type === t ? 'default' : 'outline'} size="sm" onClick={() => setType(t)}>
                  {t === 'ai' ? '🤖 AI' : '👤 Human'}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={createAgent.isPending}>Add agent</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Create `frontend/src/components/GraphView/index.tsx`**

```tsx
import { useCallback, useState } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge,
  Connection, Edge, Node, MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useGraphData, useCreateRelationship, useDeleteRelationship } from '@/hooks/useGraph'
import { AgentNode } from './AgentNode'
import { AgentPanel } from './AgentPanel'
import { AddAgentModal } from './AddAgentModal'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { Agent, GraphNode } from '@/types'
import { useAgents } from '@/hooks/useAgents'

const nodeTypes = { agentNode: AgentNode }

function toFlowNodes(nodes: GraphNode[]): Node[] {
  return nodes.map((n, i) => ({
    id: n.id,
    type: 'agentNode',
    position: { x: 200 + (i % 4) * 200, y: 100 + Math.floor(i / 4) * 150 },
    data: n,
  }))
}

function toFlowEdges(edges: { id: string; from_agent_id: string; to_agent_id: string; type: string }[]): Edge[] {
  return edges.map(e => ({
    id: e.id,
    source: e.from_agent_id,
    target: e.to_agent_id,
    label: e.type === 'reports_to' ? '' : 'collab',
    animated: e.type === 'collaborates_with',
    markerEnd: { type: MarkerType.ArrowClosed },
    style: e.type === 'collaborates_with' ? { strokeDasharray: '5,5' } : {},
  }))
}

export function GraphView() {
  const { data: graphData } = useGraphData()
  const { data: agents } = useAgents()
  const createRel = useCreateRelationship()
  const deleteRel = useDeleteRelationship()

  const [nodes, , onNodesChange] = useNodesState(graphData ? toFlowNodes(graphData.nodes) : [])
  const [edges, , onEdgesChange] = useEdgesState(graphData ? toFlowEdges(graphData.edges) : [])
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const onConnect = useCallback((connection: Connection) => {
    createRel.mutate({
      from_agent_id: connection.source!,
      to_agent_id: connection.target!,
      type: 'reports_to',
    })
  }, [createRel])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const agent = agents?.find(a => a.id === node.id)
    if (agent) setSelectedAgent(agent)
  }, [agents])

  const onEdgeDoubleClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    if (confirm('Remove this relationship?')) deleteRel.mutate(edge.id)
  }, [deleteRel])

  return (
    <div className="h-full relative">
      <div className="absolute top-4 right-4 z-10">
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add agent
        </Button>
      </div>
      <ReactFlow
        nodes={graphData ? toFlowNodes(graphData.nodes) : nodes}
        edges={graphData ? toFlowEdges(graphData.edges) : edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeDoubleClick={onEdgeDoubleClick}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
      <AgentPanel agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
      <AddAgentModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}
```

- [ ] **Update `frontend/src/pages/GraphPage.tsx`**

```tsx
import { GraphView } from '@/components/GraphView'

export function GraphPage() {
  return <div className="h-full"><GraphView /></div>
}
```

- [ ] **Write failing tests** — `frontend/src/test/components/AgentNode.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import { AgentNode } from '@/components/GraphView/AgentNode'

const mockNode = {
  id: '1',
  data: { id: '1', name: 'CEO Bot', role_title: 'CEO', type: 'ai' as const, is_active: true },
  selected: false,
  type: 'agentNode',
  position: { x: 0, y: 0 },
  dragging: false,
  zIndex: 0,
  isConnectable: true,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
}

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Top: 'top', Bottom: 'bottom' },
}))

describe('AgentNode', () => {
  it('renders agent name and role', () => {
    render(<AgentNode {...mockNode} />)
    expect(screen.getByText('CEO Bot')).toBeInTheDocument()
    expect(screen.getByText('CEO')).toBeInTheDocument()
  })

  it('shows ai badge for AI agents', () => {
    render(<AgentNode {...mockNode} />)
    expect(screen.getByText('🤖 ai')).toBeInTheDocument()
  })
})
```

- [ ] **Run — expect PASS**

```bash
npm run test -- src/test/components/AgentNode.test.tsx
```

- [ ] **Commit**

```bash
git add frontend/src/
git commit -m "feat: graph view — React Flow with agent nodes, panel, add modal"
```

---

## Task 6: Task Board (Kanban)

**Files:**
- Create: `frontend/src/components/TaskBoard/index.tsx`
- Create: `frontend/src/components/TaskBoard/KanbanColumn.tsx`
- Create: `frontend/src/components/TaskBoard/TaskCard.tsx`
- Create: `frontend/src/components/TaskBoard/TaskDetailModal.tsx`
- Create: `frontend/src/components/TaskBoard/CommentThread.tsx`
- Create: `frontend/src/components/TaskBoard/AddTaskModal.tsx`
- Modify: `frontend/src/pages/TasksPage.tsx`

- [ ] **Create `frontend/src/components/TaskBoard/TaskCard.tsx`**

```tsx
import { Task } from '@/types'
import { Badge } from '@/components/ui/badge'

const priorityColors: Record<string, string> = {
  low: 'bg-slate-100 text-slate-700',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}

interface Props { task: Task; onClick: () => void }

export function TaskCard({ task, onClick }: Props) {
  return (
    <div
      onClick={onClick}
      className="p-3 bg-background border rounded-md shadow-sm cursor-pointer hover:border-ring transition-colors space-y-1"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium leading-snug">{task.title}</span>
        <span className="text-xs text-muted-foreground shrink-0">#{task.number}</span>
      </div>
      <Badge className={`text-xs ${priorityColors[task.priority]}`}>{task.priority}</Badge>
    </div>
  )
}
```

- [ ] **Create `frontend/src/components/TaskBoard/CommentThread.tsx`**

```tsx
import { useState } from 'react'
import { useComments, useAddComment } from '@/hooks/useComments'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function CommentThread({ taskId }: { taskId: string }) {
  const { data: comments } = useComments(taskId)
  const addComment = useAddComment()
  const [content, setContent] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return
    await addComment.mutateAsync({ taskId, content })
    setContent('')
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {comments?.map(c => (
          <div key={c.id} className={`text-sm p-2 rounded ${c.is_system ? 'bg-muted text-muted-foreground italic' : 'bg-muted/50'}`}>
            {c.content}
          </div>
        ))}
        {!comments?.length && <p className="text-xs text-muted-foreground">No comments yet.</p>}
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <Input value={content} onChange={e => setContent(e.target.value)} placeholder="Add a comment…" className="text-sm" />
        <Button size="sm" type="submit" disabled={addComment.isPending}>Post</Button>
      </form>
    </div>
  )
}
```

- [ ] **Create `frontend/src/components/TaskBoard/TaskDetailModal.tsx`**

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Task, TaskStatus } from '@/types'
import { CommentThread } from './CommentThread'
import { useUpdateTaskStatus } from '@/hooks/useTasks'

const statusTransitions: Record<string, TaskStatus[]> = {
  todo: ['in_progress'],
  in_progress: ['in_review', 'done'],
  in_review: ['done', 'in_progress'],
  done: [],
}

interface Props { task: Task | null; onClose: () => void }

export function TaskDetailModal({ task, onClose }: Props) {
  const updateStatus = useUpdateTaskStatus()
  if (!task) return null

  const nextStatuses = statusTransitions[task.status] ?? []

  return (
    <Dialog open={!!task} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm font-normal">#{task.number}</span>
            {task.title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1 text-sm">
          <Badge>{task.status}</Badge>
          <Badge variant="outline">{task.priority}</Badge>
        </div>
        {task.description && <p className="text-sm text-muted-foreground">{task.description}</p>}
        {nextStatuses.length > 0 && (
          <div className="flex gap-2">
            {nextStatuses.map(s => (
              <Button key={s} size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: task.id, status: s })}>
                → {s}
              </Button>
            ))}
          </div>
        )}
        <Separator />
        <CommentThread taskId={task.id} />
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Create `frontend/src/components/TaskBoard/KanbanColumn.tsx`**

```tsx
import { Task } from '@/types'
import { TaskCard } from './TaskCard'

interface Props { title: string; tasks: Task[]; onTaskClick: (t: Task) => void }

export function KanbanColumn({ title, tasks, onTaskClick }: Props) {
  return (
    <div className="flex flex-col w-64 shrink-0">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm">{title}</span>
        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{tasks.length}</span>
      </div>
      <div className="space-y-2 min-h-[80px]">
        {tasks.map(t => <TaskCard key={t.id} task={t} onClick={() => onTaskClick(t)} />)}
      </div>
    </div>
  )
}
```

- [ ] **Create `frontend/src/components/TaskBoard/AddTaskModal.tsx`**

```tsx
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateTask } from '@/hooks/useTasks'

interface Props { open: boolean; onClose: () => void }

export function AddTaskModal({ open, onClose }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const createTask = useCreateTask()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createTask.mutateAsync({ title, description: description || undefined })
    setTitle(''); setDescription('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New task</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} required placeholder="What needs to be done?" />
          </div>
          <div className="space-y-1">
            <Label>Description (optional)</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="More details…" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={createTask.isPending}>Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Create `frontend/src/components/TaskBoard/index.tsx`**

```tsx
import { useState } from 'react'
import { useTasks } from '@/hooks/useTasks'
import { KanbanColumn } from './KanbanColumn'
import { TaskDetailModal } from './TaskDetailModal'
import { AddTaskModal } from './AddTaskModal'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { Task, TaskStatus } from '@/types'

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'todo', label: 'To Do' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'in_review', label: 'In Review' },
  { status: 'done', label: 'Done' },
]

export function TaskBoard() {
  const { data: tasks } = useTasks()
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Task Board</h1>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New task
        </Button>
      </div>
      <div className="flex gap-4 overflow-x-auto flex-1">
        {COLUMNS.map(({ status, label }) => (
          <KanbanColumn
            key={status}
            title={label}
            tasks={(tasks ?? []).filter(t => t.status === status)}
            onTaskClick={setSelectedTask}
          />
        ))}
      </div>
      <TaskDetailModal task={selectedTask} onClose={() => setSelectedTask(null)} />
      <AddTaskModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}
```

- [ ] **Update `frontend/src/pages/TasksPage.tsx`**

```tsx
import { TaskBoard } from '@/components/TaskBoard'

export function TasksPage() {
  return <TaskBoard />
}
```

- [ ] **Write failing tests** — `frontend/src/test/components/TaskCard.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TaskCard } from '@/components/TaskBoard/TaskCard'
import { Task } from '@/types'

const mockTask: Task = {
  id: 'task-1', org_id: 'org-1', number: 7,
  title: 'Fix login bug', description: null, status: 'todo',
  priority: 'high', task_type: 'task',
  assignee_id: null, creator_id: 'agent-1', parent_task_id: null,
}

describe('TaskCard', () => {
  it('renders title and number', () => {
    render(<TaskCard task={mockTask} onClick={() => {}} />)
    expect(screen.getByText('Fix login bug')).toBeInTheDocument()
    expect(screen.getByText('#7')).toBeInTheDocument()
  })

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn()
    render(<TaskCard task={mockTask} onClick={onClick} />)
    await userEvent.click(screen.getByText('Fix login bug'))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
```

Add to `package.json` devDependencies:
```json
"@testing-library/user-event": "^14.5.2"
```
Then run `npm install`.

- [ ] **Run — expect PASS**

```bash
npm run test -- src/test/components/TaskCard.test.tsx
```

- [ ] **Commit**

```bash
git add frontend/src/
git commit -m "feat: kanban task board with comments"
```

---

## Task 7: Human Agent Inbox

**Files:**
- Create: `frontend/src/components/Inbox/index.tsx`
- Create: `frontend/src/components/Inbox/InboxItem.tsx`
- Modify: `frontend/src/pages/InboxPage.tsx`

- [ ] **Create `frontend/src/components/Inbox/InboxItem.tsx`**

```tsx
import { Task } from '@/types'
import { Badge } from '@/components/ui/badge'

const statusColors: Record<string, string> = {
  todo: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-blue-100 text-blue-700',
  waiting_approval: 'bg-yellow-100 text-yellow-700',
  in_review: 'bg-purple-100 text-purple-700',
}

interface Props { task: Task; onClick: () => void }

export function InboxItem({ task, onClick }: Props) {
  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between p-4 border rounded-lg bg-background hover:border-ring cursor-pointer transition-colors"
    >
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          {task.task_type === 'approval_request' && (
            <Badge variant="destructive" className="text-xs">Approval needed</Badge>
          )}
          <span className="font-medium text-sm">{task.title}</span>
        </div>
        <span className="text-xs text-muted-foreground">#{task.number} · {task.priority} priority</span>
      </div>
      <Badge className={`text-xs shrink-0 ${statusColors[task.status] ?? ''}`}>{task.status}</Badge>
    </div>
  )
}
```

- [ ] **Create `frontend/src/components/Inbox/index.tsx`**

```tsx
import { useState } from 'react'
import { useTasks } from '@/hooks/useTasks'
import { useCurrentUser } from '@/hooks/useAuth'
import { useAgents } from '@/hooks/useAgents'
import { InboxItem } from './InboxItem'
import { TaskDetailModal } from '@/components/TaskBoard/TaskDetailModal'
import { Task } from '@/types'

const ACTIVE_STATUSES = new Set(['todo', 'in_progress', 'in_review', 'waiting_approval'])

export function Inbox() {
  const { data: user } = useCurrentUser()
  const { data: agents } = useAgents()
  const myAgent = agents?.find(a => a.type === 'human')  // user's linked agent
  const { data: tasks } = useTasks(myAgent?.id)
  const [selected, setSelected] = useState<Task | null>(null)

  const activeTasks = (tasks ?? []).filter(t => ACTIVE_STATUSES.has(t.status))

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold mb-1">Inbox</h1>
      <p className="text-sm text-muted-foreground mb-6">Tasks assigned to you</p>
      {activeTasks.length === 0 ? (
        <p className="text-muted-foreground text-sm">No active tasks. 🎉</p>
      ) : (
        <div className="space-y-2">
          {activeTasks.map(t => <InboxItem key={t.id} task={t} onClick={() => setSelected(t)} />)}
        </div>
      )}
      <TaskDetailModal task={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
```

- [ ] **Update `frontend/src/pages/InboxPage.tsx`**

```tsx
import { Inbox } from '@/components/Inbox'

export function InboxPage() {
  return <Inbox />
}
```

- [ ] **Write failing test** — `frontend/src/test/components/InboxItem.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import { InboxItem } from '@/components/Inbox/InboxItem'
import { Task } from '@/types'

const task: Task = {
  id: 't1', org_id: 'o1', number: 3, title: 'Review PR',
  description: null, status: 'in_review', priority: 'medium',
  task_type: 'task', assignee_id: 'a1', creator_id: 'a2', parent_task_id: null,
}

describe('InboxItem', () => {
  it('renders task title and number', () => {
    render(<InboxItem task={task} onClick={() => {}} />)
    expect(screen.getByText('Review PR')).toBeInTheDocument()
    expect(screen.getByText(/#3/)).toBeInTheDocument()
  })

  it('shows approval badge for approval_request tasks', () => {
    render(<InboxItem task={{ ...task, task_type: 'approval_request' }} onClick={() => {}} />)
    expect(screen.getByText('Approval needed')).toBeInTheDocument()
  })
})
```

- [ ] **Run — expect PASS**

```bash
npm run test -- src/test/components/InboxItem.test.tsx
```

- [ ] **Run full test suite**

```bash
npm run test
# All tests pass
```

- [ ] **Commit**

```bash
git add frontend/src/
git commit -m "feat: human agent inbox"
```

---

## Task 8: Docker Compose — add frontend service

**Files:**
- Create: `frontend/Dockerfile`
- Modify: `docker-compose.yml`

- [ ] **Create `frontend/Dockerfile`**

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

- [ ] **Create `frontend/nginx.conf`**

```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;

  location /api/ {
    proxy_pass http://api:8000/api/;
    proxy_set_header Host $host;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

- [ ] **Add frontend service to `docker-compose.yml`**

```yaml
  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - api
```

- [ ] **Smoke test full stack**

```bash
docker compose up --build
# Open http://localhost
# Register → /graph should show empty React Flow canvas
# Add an agent → node appears on graph
# Go to Tasks → create a task
# Go to Inbox → if user has linked agent, task appears
docker compose down
```

- [ ] **Final commit**

```bash
git add .
git commit -m "feat: complete M1 frontend — graph, task board, inbox + docker"
```

---

## Self-Review Notes

- `Inbox` finds the user's agent by `type === 'human'` — assumes one human agent per user. If user has multiple human agents, only first shown. Acceptable for M1.
- React Flow graph doesn't persist node positions — layout resets on refresh. Storing positions in DB is a M2 improvement.
- `AgentPanel` shows delete only — edit form is a M2 feature.
- Task board doesn't support drag-and-drop status change — status changes via TaskDetailModal only. DnD is M2.
- `AddTaskModal` doesn't let you assign the task to an agent — assignee selection is a M2 improvement.
