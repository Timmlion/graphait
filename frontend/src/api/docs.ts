import { apiFetch } from './client'

export interface FileEntry {
  name: string
  path: string
  is_dir: boolean
  size: number | null
}

export interface FileContent {
  path: string
  content: string
  is_markdown: boolean
}

export const docsApi = {
  list: () => apiFetch<FileEntry[]>('/docs'),
  content: (path: string) => apiFetch<FileContent>(`/docs/content?path=${encodeURIComponent(path)}`),
}
