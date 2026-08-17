export interface WorkspaceInfo {
  root: string
  name: string
}

export interface WorkspaceChatInfo {
  root: string
  chatsPath: string
}

export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  size?: number | null
  modified?: string | null
}

export interface FileContent {
  path: string
  content: string
  language: string
}

export interface SearchMatch {
  path: string
  line: number
  column: number
  preview: string
}

export interface SearchReplaceResult {
  fileCount: number
  replacementCount: number
  paths: string[]
}

export interface SearchQuery {
  q: string
  gitignore?: boolean
  regex?: boolean
  matchCase?: boolean
  include?: string
  exclude?: string
}

export interface LaunchConfig {
  name: string
  type: string
  request: string
  program?: string | null
  cwd?: string | null
  args?: string[] | null
  preLaunchTask?: string | null
}

export interface TaskConfig {
  label: string
  type: string
  command?: string | null
  cwd?: string | null
  args?: string[] | null
}

export interface LaunchRun {
  id: string
  configName: string
  status: string
  startedAt: string
  endedAt?: string | null
  exitCode?: number | null
}

export interface GitStatusFile {
  path: string
  stagedStatus: string
  worktreeStatus: string
}

export interface GitStatus {
  branch: string
  upstream?: string | null
  isDetached: boolean
  hasUncommittedChanges: boolean
  hasUntrackedFiles: boolean
  aheadBy: number
  behindBy: number
  files: GitStatusFile[]
}

export interface GitRef {
  name: string
  isCurrent: boolean
  isRemote: boolean
}

export interface GitSidebar {
  status: GitStatus
  branches: GitRef[]
}

export interface ChatSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  copilotSessionId?: string | null
  provider?: string | null
  model?: string | null
}

export interface ChatAttachment {
  id: string
  name: string
  kind: string
  path?: string | null
  mimeType?: string | null
  dataBase64?: string | null
}

export interface ChatToolCall {
  id: string
  name: string
  status: 'pending' | 'running' | 'complete' | 'error' | string
  detail?: string | null
  arguments?: string | null
  result?: string | null
  error?: string | null
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | string
  content: string
  createdAt: string
  attachments?: ChatAttachment[] | null
  toolCalls?: ChatToolCall[] | null
}

export interface ChatDetail {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  copilotSessionId?: string | null
  messages: ChatMessage[]
  provider?: string | null
  model?: string | null
}

export interface MessageAttachmentRequest {
  kind: 'file' | 'blob'
  path?: string
  name?: string
  mimeType?: string
  dataBase64?: string
}

export interface CopilotStatus {
  connected: boolean
  authenticated: boolean
  message?: string | null
  provider?: string | null
  model?: string | null
}

export interface CopilotModel {
  id: string
  name: string
  provider?: string | null
  policyState?: string | null
}

export interface ProviderOption {
  id: string
  name: string
  requiresApiKey?: boolean
  configured?: boolean
}

export interface ProviderSettings {
  provider: string
  apiKey?: string | null
  baseUrl?: string | null
  model?: string | null
}

export interface AiSettings {
  providers: ProviderSettings[]
}

export interface AuraWireDetectResult {
  installed: boolean
  running: boolean
  baseUrl?: string | null
  message?: string | null
}

export interface OllamaPullEvent {
  status?: string | null
  error?: string | null
  total?: number | null
  completed?: number | null
  digest?: string | null
}

export interface OllamaTestResult {
  ok: boolean
  reply?: string | null
  message?: string | null
  elapsedMs: number
}

export interface CredentialsSettings {
  gitHubPat?: string | null
}

export type PendingAttachment =
  | { kind: 'file'; path: string; name: string }
  | { kind: 'blob'; name: string; mimeType: string; dataBase64: string }

export interface EditorCursor {
  line: number
  column: number
}

export interface ProblemItem {
  id: string
  path: string
  line: number
  column: number
  severity: 'error' | 'warning' | 'info'
  message: string
}

export interface OutlineSymbol {
  name: string
  kind: string
  line: number
}

export interface CursorChatImportCandidate {
  id: string
  title: string
  subtitle?: string | null
  workspacePath?: string | null
  createdAt: string
  updatedAt: string
  mode?: string | null
}

export interface PluginInfo {
  id: string
  name: string
  version: string
  main: string
  path: string
}

export interface PluginSource {
  id: string
  name: string
  version: string
  main: string
  source: string
}
