import { Files, GitBranch, MessageSquare, Search, Settings } from 'lucide-react'

export type Activity = 'files' | 'search' | 'git' | 'chat'

interface Props {
  activity: Activity
  onChange: (activity: Activity) => void
  onOpenSettings: () => void
}

export function ActivityBar({ activity, onChange, onOpenSettings }: Props) {
  return (
    <nav className="activity-bar">
      <button
        className={`activity-btn ${activity === 'files' ? 'active' : ''}`}
        title="Explorer"
        onClick={() => onChange('files')}
      >
        <Files size={18} />
      </button>
      <button
        className={`activity-btn ${activity === 'search' ? 'active' : ''}`}
        title="Search"
        onClick={() => onChange('search')}
      >
        <Search size={18} />
      </button>
      <button
        className={`activity-btn ${activity === 'chat' ? 'active' : ''}`}
        title="Chat history"
        onClick={() => onChange('chat')}
      >
        <MessageSquare size={18} />
      </button>
      <button
        className={`activity-btn ${activity === 'git' ? 'active' : ''}`}
        title="Git"
        onClick={() => onChange('git')}
      >
        <GitBranch size={18} />
      </button>
      <div className="activity-spacer" />
      <button className="activity-btn" title="Settings" onClick={onOpenSettings}>
        <Settings size={18} />
      </button>
    </nav>
  )
}
