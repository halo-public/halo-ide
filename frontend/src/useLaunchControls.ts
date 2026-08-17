import { useCallback, useEffect, useState } from 'react'
import { api } from './api/client'
import type { LaunchConfig, LaunchRun, TaskConfig } from './api/types'

export function useLaunchControls(
  workspaceRoot: string | undefined,
  onOutput: (text: string, run: LaunchRun | null) => void,
) {
  const [configs, setConfigs] = useState<LaunchConfig[]>([])
  const [tasks, setTasks] = useState<TaskConfig[]>([])
  const [selected, setSelected] = useState('')
  const [selectedTask, setSelectedTask] = useState('')
  const [run, setRun] = useState<LaunchRun | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .getLaunchConfigs()
      .then((list) => {
        setConfigs(list)
        setSelected((prev) => (list.some((c) => c.name === prev) ? prev : list[0]?.name ?? ''))
      })
      .catch(() => setConfigs([]))

    api
      .getTasks()
      .then((list) => {
        setTasks(list)
        setSelectedTask((prev) => (list.some((t) => t.label === prev) ? prev : list[0]?.label ?? ''))
      })
      .catch(() => setTasks([]))
  }, [workspaceRoot])

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
        }
      } catch {
        /* ignore */
      }
    }, 500)
    return () => window.clearInterval(timer)
  }, [run, onOutput])

  const play = useCallback(async () => {
    if (!selected) return
    setBusy(true)
    try {
      const started = await api.startLaunch(selected)
      setRun(started)
      onOutput('', started)
    } catch (e) {
      onOutput(e instanceof Error ? e.message : 'Failed to start', null)
    } finally {
      setBusy(false)
    }
  }, [selected, onOutput])

  const runTask = useCallback(async () => {
    if (!selectedTask) return
    setBusy(true)
    try {
      const started = await api.startTask(selectedTask)
      setRun(started)
      onOutput('', started)
    } catch (e) {
      onOutput(e instanceof Error ? e.message : 'Failed to start task', null)
    } finally {
      setBusy(false)
    }
  }, [selectedTask, onOutput])

  const stop = useCallback(async () => {
    if (!run) return
    await api.stopLaunch(run.id)
    const out = await api.getLaunchOutput(run.id)
    const stopped = { ...run, status: 'failed' as const }
    setRun(stopped)
    onOutput(out.output, stopped)
  }, [run, onOutput])

  return {
    configs,
    tasks,
    selected,
    setSelected,
    selectedTask,
    setSelectedTask,
    run,
    busy,
    play,
    stop,
    runTask,
  }
}
