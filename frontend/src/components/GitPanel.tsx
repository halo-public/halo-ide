import {
  ArrowDownToLine,
  ArrowUpToLine,
  Check,
  ChevronDown,
  ChevronRight,
  GitBranch,
  RefreshCw,
  RotateCcw,
  Undo2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import type { GitRef, GitSidebar, GitStatusFile, LaunchRun } from '../api/types'

interface Props {
  onOutput: (text: string, run: LaunchRun | null) => void
  refreshKey?: number
  onOpenDiff?: (path: string) => void
  showToolbar?: boolean
}

const POLL_INTERVAL_MS = 500

function statusLabel(file: GitStatusFile) {
  if (file.stagedStatus !== 'unmodified' && file.worktreeStatus !== 'unmodified') return 'staged + unstaged'
  if (file.stagedStatus !== 'unmodified') return 'staged'
  if (file.worktreeStatus === 'untracked') return 'untracked'
  if (file.worktreeStatus !== 'unmodified') return 'unstaged'
  return 'clean'
}

function branchGroup(branches: GitRef[], remote: boolean) {
  return branches.filter((branch) => branch.isRemote === remote)
}

export function GitPanel({ onOutput, refreshKey = 0, onOpenDiff, showToolbar = true }: Props) {
  const [sidebar, setSidebar] = useState<GitSidebar | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [checkoutTarget, setCheckoutTarget] = useState('')
  const [commitMessage, setCommitMessage] = useState('')
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])
  const [run, setRun] = useState<LaunchRun | null>(null)
  const [branchesExpanded, setBranchesExpanded] = useState({
    local: true,
    remote: true,
  })
  const [sectionsExpanded, setSectionsExpanded] = useState({
    branches: true,
    changes: true,
  })

  const refresh = async () => {
    setError(null)
    try {
      const next = await api.getGitStatus()
      setSidebar(next)
      setSelectedPaths((prev) => prev.filter((path) => next.status.files.some((file) => file.path === path)))
    } catch (e) {
      setSidebar(null)
      setSelectedPaths([])
      setError(e instanceof Error ? e.message : 'Failed to load Git status')
    }
  }

  useEffect(() => {
    void refresh()
  }, [refreshKey])

  useEffect(() => {
    if (!run || run.status !== 'running') return
    const timer = window.setInterval(async () => {
      try {
        const latest = await api.getLaunchOutput(run.id)
        onOutput(latest.output, run)
        const next = await api.getLaunchRun(run.id)
        setRun(next)
        if (next.status !== 'running') {
          const out = await api.getLaunchOutput(next.id)
          onOutput(out.output, next)
          await refresh()
        }
      } catch {
        // Surface operation failures through the output panel only.
      }
    }, POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [run, onOutput])

  const status = sidebar?.status ?? null
  const selectedSet = useMemo(() => new Set(selectedPaths), [selectedPaths])
  const localBranches = useMemo(() => branchGroup(sidebar?.branches ?? [], false), [sidebar])
  const remoteBranches = useMemo(() => branchGroup(sidebar?.branches ?? [], true), [sidebar])

  const branchSummary = useMemo(() => {
    if (!status) return ''
    const remote = status.upstream ? ` -> ${status.upstream}` : ''
    const aheadBehind = [
      status.aheadBy > 0 ? `ahead ${status.aheadBy}` : '',
      status.behindBy > 0 ? `behind ${status.behindBy}` : '',
    ]
      .filter(Boolean)
      .join(', ')
    return `${status.branch}${status.isDetached ? ' (detached)' : ''}${remote}${aheadBehind ? ` · ${aheadBehind}` : ''}`
  }, [status])

  const selectedFiles = status?.files.filter((file) => selectedSet.has(file.path)) ?? []
  const canStage = selectedFiles.some((file) => file.worktreeStatus !== 'unmodified')
  const canUnstage = selectedFiles.some((file) => file.stagedStatus !== 'unmodified')
  const canDiscard = selectedFiles.some((file) => file.worktreeStatus !== 'unmodified' && file.worktreeStatus !== 'untracked')

  const runOperation = async (operation: string, argument?: string, paths?: string[]) => {
    setBusy(true)
    try {
      const started = await api.runGitOperation(operation, argument, paths)
      setRun(started)
      onOutput('', started)
      if (operation === 'commit') setCommitMessage('')
    } catch (e) {
      onOutput(e instanceof Error ? e.message : `Failed to run git ${operation}`, null)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const toggleSelection = (path: string) => {
    setSelectedPaths((prev) => (prev.includes(path) ? prev.filter((item) => item !== path) : [...prev, path]))
  }

  const toggleBranchGroup = (group: 'local' | 'remote') => {
    setBranchesExpanded((prev) => ({ ...prev, [group]: !prev[group] }))
  }

  const toggleSection = (section: 'branches' | 'changes') => {
    setSectionsExpanded((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  return (
    <div className="git-panel">
      {showToolbar && (
        <div className="git-toolbar git-toolbar-main">
          <button className="primary-btn" onClick={() => void runOperation('fetch')} disabled={busy || run?.status === 'running'}>
            <RefreshCw size={14} />
            Fetch
          </button>
          <button className="primary-btn" onClick={() => void runOperation('pull')} disabled={busy || run?.status === 'running'}>
            <ArrowDownToLine size={14} />
            Pull
          </button>
          <button className="primary-btn" onClick={() => void runOperation('push')} disabled={busy || run?.status === 'running'}>
            <ArrowUpToLine size={14} />
            Push
          </button>
        </div>
      )}

      <div className="git-status-card">
        <div className="git-branch-row">
          <GitBranch size={14} />
          <span>{branchSummary || 'No branch information'}</span>
        </div>
        {status && (
          <div className="git-meta">
            <span>{status.hasUncommittedChanges ? 'Changes present' : 'Working tree clean'}</span>
            {status.hasUntrackedFiles && <span>Untracked files</span>}
          </div>
        )}
      </div>

      <div className="git-checkout-row">
        <input
          list="git-branches"
          value={checkoutTarget}
          placeholder="Branch to checkout…"
          onChange={(e) => setCheckoutTarget(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && checkoutTarget.trim()) {
              void runOperation('checkout', checkoutTarget.trim())
            }
          }}
        />
        <button
          className="primary-btn"
          onClick={() => void runOperation('checkout', checkoutTarget.trim())}
          disabled={!checkoutTarget.trim() || busy || run?.status === 'running'}
        >
          Checkout
        </button>
        <datalist id="git-branches">
          {localBranches.concat(remoteBranches).map((branch) => (
            <option key={branch.name} value={branch.name} />
          ))}
        </datalist>
      </div>

      <div className="git-collapsible-section">
        <button
          type="button"
          className="git-section-toggle"
          onClick={() => toggleSection('branches')}
          aria-expanded={sectionsExpanded.branches}
        >
          <span className="git-section-toggle-icon">
            {sectionsExpanded.branches ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span className="git-section-title">Branches</span>
          </span>
        </button>
        {sectionsExpanded.branches && (
          <div className="git-branch-lists">
            <div className="git-branch-group">
              <button
                type="button"
                className="git-section-toggle git-subsection-toggle"
                onClick={() => toggleBranchGroup('local')}
                aria-expanded={branchesExpanded.local}
              >
                {branchesExpanded.local ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span className="git-section-title">Local branches</span>
              </button>
              {branchesExpanded.local && (
                <div className="git-branch-items">
                  {localBranches.length === 0 ? (
                    <div className="muted" style={{ fontSize: 12 }}>No local branches</div>
                  ) : (
                    localBranches.map((branch) => (
                      <button
                        key={branch.name}
                        className={`git-branch-item ${branch.isCurrent ? 'active' : ''}`}
                        onClick={() => {
                          setCheckoutTarget(branch.name)
                          if (!branch.isCurrent) void runOperation('checkout', branch.name)
                        }}
                        disabled={busy || run?.status === 'running'}
                      >
                        <span>{branch.name}</span>
                        {branch.isCurrent && <Check size={12} />}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="git-branch-group">
              <button
                type="button"
                className="git-section-toggle git-subsection-toggle"
                onClick={() => toggleBranchGroup('remote')}
                aria-expanded={branchesExpanded.remote}
              >
                {branchesExpanded.remote ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span className="git-section-title">Remote branches</span>
              </button>
              {branchesExpanded.remote && (
                <div className="git-branch-items">
                  {remoteBranches.length === 0 ? (
                    <div className="muted" style={{ fontSize: 12 }}>No remote branches</div>
                  ) : (
                    remoteBranches.map((branch) => (
                      <button
                        key={branch.name}
                        className="git-branch-item"
                        onClick={() => setCheckoutTarget(branch.name)}
                      >
                        <span>{branch.name}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
 
      <div className="git-collapsible-section">
        <button
          type="button"
          className="git-section-toggle"
          onClick={() => toggleSection('changes')}
          aria-expanded={sectionsExpanded.changes}
        >
          <span className="git-section-toggle-icon">
            {sectionsExpanded.changes ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span className="git-section-title">Changes</span>
          </span>
        </button>
        {sectionsExpanded.changes && (
          <div className="git-file-list">
            {!status && !error && <div className="muted" style={{ padding: 8, fontSize: 12 }}>Loading Git status…</div>}
            {status?.files.length === 0 && <div className="muted" style={{ padding: 8, fontSize: 12 }}>No changed files</div>}
            {status?.files.map((file) => (
              <label key={file.path} className={`git-file-item ${selectedSet.has(file.path) ? 'selected' : ''}`}>
                <div className="git-file-top">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(file.path)}
                    onChange={() => toggleSelection(file.path)}
                  />
                  <div
                    className="git-file-path"
                    role="button"
                    title="Open diff vs HEAD"
                    onClick={(e) => {
                      e.preventDefault()
                      onOpenDiff?.(file.path)
                    }}
                  >
                    {file.path}
                  </div>
                </div>
                <div className="git-file-state">
                  <span>{statusLabel(file)}</span>
                  <span>{file.stagedStatus}</span>
                  <span>{file.worktreeStatus}</span>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="git-toolbar">
        <button
          className="primary-btn"
          onClick={() => void runOperation('stage', undefined, selectedPaths)}
          disabled={!canStage || busy || run?.status === 'running'}
        >
          <Check size={14} />
          Stage
        </button>
        <button
          className="primary-btn"
          onClick={() => void runOperation('unstage', undefined, selectedPaths)}
          disabled={!canUnstage || busy || run?.status === 'running'}
        >
          <Undo2 size={14} />
          Unstage
        </button>
        <button
          className="primary-btn"
          onClick={() => void runOperation('discard', undefined, selectedPaths)}
          disabled={!canDiscard || busy || run?.status === 'running'}
        >
          <RotateCcw size={14} />
          Discard
        </button>
      </div>

      <div className="git-commit-box">
        <input
          value={commitMessage}
          placeholder="Commit message…"
          onChange={(e) => setCommitMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && commitMessage.trim()) {
              void runOperation('commit', commitMessage.trim())
            }
          }}
        />
        <button
          className="primary-btn"
          onClick={() => void runOperation('commit', commitMessage.trim())}
          disabled={!commitMessage.trim() || busy || run?.status === 'running'}
        >
          Commit
        </button>
      </div>

      {error && <div className="error-text" style={{ padding: 8 }}>{error}</div>}

    </div>
  )
}
