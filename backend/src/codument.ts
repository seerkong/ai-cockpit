import { readdir } from 'node:fs/promises'
import path from 'node:path'

export type CodumentTrackSummary = {
  trackId: string
  trackName: string
  status: string
  statusSymbol: '[x]' | '[~]' | '[ ]'
}

export type CodumentSubtaskNode = {
  id: string
  name: string
  status: string
  statusSymbol: '[x]' | '[~]' | '[ ]'
}

export type CodumentTaskNode = {
  id: string
  name: string
  status: string
  statusSymbol: '[x]' | '[~]' | '[ ]'
  subtasks: CodumentSubtaskNode[]
}

export type CodumentPhaseNode = {
  id: string
  name: string
  status: string
  statusSymbol: '[x]' | '[~]' | '[ ]'
  tasks: CodumentTaskNode[]
}

export type CodumentTrackTree = {
  trackId: string
  trackName: string
  status: string
  statusSymbol: '[x]' | '[~]' | '[ ]'
  phases: CodumentPhaseNode[]
}

type TrackRow = {
  trackId: string
  trackName: string
  status: 'new' | 'in_progress' | 'completed' | 'cancelled'
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return match ? decodeXml(match[1]!.trim()) : ''
}

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const attrRegex = /([A-Za-z_:][A-Za-z0-9:._-]*)\s*=\s*(['"])(.*?)\2/g
  let match: RegExpExecArray | null
  while (true) {
    match = attrRegex.exec(raw)
    if (!match) break
    attrs[match[1]] = decodeXml(match[3] ?? '')
  }
  return attrs
}

function normalizeTrackStatus(input: string): 'new' | 'in_progress' | 'completed' | 'cancelled' {
  const normalized = input.trim().toLowerCase()
  if (normalized === 'completed') return 'completed'
  if (normalized === 'cancelled') return 'cancelled'
  if (normalized === 'in_progress') return 'in_progress'
  return 'new'
}

function normalizeTaskStatus(input: string): 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED' | 'CANCELLED' {
  const normalized = input.trim().toUpperCase()
  if (normalized === 'DONE' || normalized === 'COMPLETED') return 'DONE'
  if (normalized === 'IN_PROGRESS') return 'IN_PROGRESS'
  if (normalized === 'BLOCKED') return 'BLOCKED'
  if (normalized === 'CANCELLED') return 'CANCELLED'
  return 'TODO'
}

function statusToSymbol(status: string): '[x]' | '[~]' | '[ ]' {
  const normalized = status.trim().toUpperCase()
  if (normalized === 'DONE' || normalized === 'COMPLETED') return '[x]'
  if (normalized === 'IN_PROGRESS') return '[~]'
  return '[ ]'
}

function aggregateStatus(children: string[]): 'TODO' | 'IN_PROGRESS' | 'DONE' {
  if (!children.length) return 'TODO'
  if (children.every((value) => normalizeTaskStatus(value) === 'DONE')) return 'DONE'
  if (children.every((value) => normalizeTaskStatus(value) === 'TODO')) return 'TODO'
  return 'IN_PROGRESS'
}

async function readText(filePath: string): Promise<string | null> {
  const file = Bun.file(filePath)
  if (!(await file.exists())) return null
  return file.text()
}

function parseTracksMarkdown(content: string): TrackRow[] {
  const rows: TrackRow[] = []
  const lines = content.split(/\r?\n/)
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line.startsWith('|')) continue

    const cells = line
      .split('|')
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0)

    if (cells.length < 4) continue
    if (/^track\s*id$/i.test(cells[0] ?? '')) continue
    if ((cells[0] ?? '').replace(/-/g, '') === '') continue

    const statusCell = cells[2] ?? ''
    let status: TrackRow['status'] = 'new'
    if (statusCell.includes('[~]')) status = 'in_progress'
    else if (statusCell.includes('[x]')) status = 'completed'
    else if (statusCell.toLowerCase().includes('cancel')) status = 'cancelled'

    rows.push({
      trackId: cells[0] ?? '',
      trackName: cells[1] ?? '',
      status,
    })
  }
  return rows
}

function parseSubtasks(taskBody: string): CodumentSubtaskNode[] {
  const subtasks: CodumentSubtaskNode[] = []
  const subtaskRegex = /<subtask\b([^>]*)\/?>(?:[\s\S]*?<\/subtask>)?/g
  let match: RegExpExecArray | null
  while (true) {
    match = subtaskRegex.exec(taskBody)
    if (!match) break
    const attrs = parseAttributes(match[1] ?? '')
    const status = normalizeTaskStatus(attrs.status ?? 'TODO')
    subtasks.push({
      id: attrs.id ?? '',
      name: attrs.name ?? attrs.id ?? 'Unnamed subtask',
      status,
      statusSymbol: statusToSymbol(status),
    })
  }
  return subtasks
}

function parseTasks(phaseBody: string): CodumentTaskNode[] {
  const tasks: CodumentTaskNode[] = []
  const taskRegex = /<task\b([^>]*)>([\s\S]*?)<\/task>/g
  let match: RegExpExecArray | null
  while (true) {
    match = taskRegex.exec(phaseBody)
    if (!match) break
    const attrs = parseAttributes(match[1] ?? '')
    const body = match[2] ?? ''
    const subtasks = parseSubtasks(body)
    const explicitStatus = normalizeTaskStatus(attrs.status ?? 'TODO')
    const status = explicitStatus === 'TODO' && subtasks.length > 0
      ? aggregateStatus(subtasks.map((item) => item.status))
      : explicitStatus

    tasks.push({
      id: attrs.id ?? '',
      name: attrs.name ?? attrs.id ?? 'Unnamed task',
      status,
      statusSymbol: statusToSymbol(status),
      subtasks,
    })
  }
  return tasks
}

function parsePhases(xml: string): CodumentPhaseNode[] {
  const phases: CodumentPhaseNode[] = []
  const phaseRegex = /<phase\b([^>]*)>([\s\S]*?)<\/phase>/g
  let match: RegExpExecArray | null
  while (true) {
    match = phaseRegex.exec(xml)
    if (!match) break
    const attrs = parseAttributes(match[1] ?? '')
    const body = match[2] ?? ''
    const tasks = parseTasks(body)
    const status = aggregateStatus(tasks.map((item) => item.status))
    phases.push({
      id: attrs.id ?? '',
      name: attrs.name ?? attrs.id ?? 'Unnamed phase',
      status,
      statusSymbol: statusToSymbol(status),
      tasks,
    })
  }
  return phases
}

export async function listCodumentTracks(workspaceDirectory: string): Promise<{
  tracks: CodumentTrackSummary[]
  defaultTrackId: string
}> {
  const codumentRoot = path.join(workspaceDirectory, 'codument')
  const tracksDir = path.join(codumentRoot, 'tracks')
  const tracksMdPath = path.join(codumentRoot, 'tracks.md')

  const rows = parseTracksMarkdown((await readText(tracksMdPath)) ?? '')
  const rowOrder = new Map<string, number>()
  rows.forEach((row, index) => {
    rowOrder.set(row.trackId, index)
  })

  const trackDirs = await readdir(tracksDir, { withFileTypes: true }).catch(() => [])
  const tracks: CodumentTrackSummary[] = []

  for (const entry of trackDirs) {
    if (!entry.isDirectory()) continue
    const trackId = entry.name
    const planPath = path.join(tracksDir, trackId, 'plan.xml')
    const plan = await readText(planPath)
    if (!plan) continue

    const planTrackName = extractTag(plan, 'track_name')
    const planStatus = normalizeTrackStatus(extractTag(plan, 'status'))
    const row = rows.find((item) => item.trackId === trackId)
    const status = row?.status ?? planStatus

    tracks.push({
      trackId,
      trackName: row?.trackName || planTrackName || trackId,
      status,
      statusSymbol: statusToSymbol(status),
    })
  }

  tracks.sort((a, b) => {
    const aOrder = rowOrder.has(a.trackId) ? rowOrder.get(a.trackId)! : Number.MAX_SAFE_INTEGER
    const bOrder = rowOrder.has(b.trackId) ? rowOrder.get(b.trackId)! : Number.MAX_SAFE_INTEGER
    if (aOrder !== bOrder) return aOrder - bOrder
    return a.trackId.localeCompare(b.trackId)
  })

  const present = new Set(tracks.map((item) => item.trackId))
  let defaultTrackId = ''
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i]
    if (row.status !== 'in_progress') continue
    if (!present.has(row.trackId)) continue
    defaultTrackId = row.trackId
    break
  }

  if (!defaultTrackId) {
    for (let i = tracks.length - 1; i >= 0; i -= 1) {
      const item = tracks[i]
      if (item.status === 'in_progress') {
        defaultTrackId = item.trackId
        break
      }
    }
  }

  return { tracks, defaultTrackId }
}

export async function loadCodumentTrackTree(
  workspaceDirectory: string,
  trackId: string,
): Promise<CodumentTrackTree | null> {
  const planPath = path.join(workspaceDirectory, 'codument', 'tracks', trackId, 'plan.xml')
  const plan = await readText(planPath)
  if (!plan) return null

  const trackName = extractTag(plan, 'track_name') || trackId
  const status = normalizeTrackStatus(extractTag(plan, 'status'))
  const phases = parsePhases(plan)

  return {
    trackId,
    trackName,
    status,
    statusSymbol: statusToSymbol(status),
    phases,
  }
}
