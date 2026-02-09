'use client'

/**
 * ObservatoryShell Component
 * Main tabbed layout for the Observatory dashboard
 * Replaces the old Work Loop page with a modern tabbed interface
 */

import { useCallback, useMemo, useState } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ObservatoryTab } from './observatory-tab'
import { TimeRangeToggle, TimeRange } from './time-range-toggle'
import { PromptsTab } from './prompts/prompts-tab'
import { TriageTab } from './triage/triage-tab'
import { ProjectFilter } from './project-filter'
import { LiveTab } from './live/live-tab'
import { AnalyticsTab } from './analytics/analytics-tab'
import { ModelsTab } from './models/models-tab'

type TabId = 'live' | 'triage' | 'analytics' | 'models' | 'prompts'

const TABS: { id: TabId; label: string }[] = [
  { id: 'live', label: 'Live' },
  { id: 'triage', label: 'Triage' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'models', label: 'Models' },
  { id: 'prompts', label: 'Prompts' },
]

const VALID_TAB_IDS = new Set<string>(TABS.map((t) => t.id))

function isValidTabId(value: string | null): value is TabId {
  return value !== null && VALID_TAB_IDS.has(value)
}

interface ObservatoryShellProps {
  /** If provided, locks the observatory to this project (disables project filter) */
  lockedProjectId?: string
}

export function ObservatoryShell({ lockedProjectId }: ObservatoryShellProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Derive active tab from URL (or default to 'live')
  const activeTab = useMemo<TabId>(() => {
    const tabFromUrl = searchParams.get('tab')
    return isValidTabId(tabFromUrl) ? tabFromUrl : 'live'
  }, [searchParams])

  // Update URL when tab changes
  const handleTabChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams)
      params.set('tab', value)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  // Time range state (shared across analytics, models, prompts)
  const [timeRange, setTimeRange] = useState<TimeRange>('24h')

  // Project filter state (for Live tab) - initialized to locked project if provided
  const [selectedProject, setSelectedProject] = useState<string | null>(lockedProjectId ?? null)

  // Determine if we should show the time range toggle
  const showTimeRange = ['analytics', 'models', 'prompts'].includes(activeTab)

  // Show project filter on Live tab (or always if locked)
  const showProjectFilter = activeTab === 'live' || lockedProjectId !== undefined

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Observatory</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Monitor, analyze, and optimize your AI agents
          </p>
        </div>
        <div className="flex items-center gap-3">
          {showProjectFilter && (
            <ProjectFilter
              value={selectedProject}
              onChange={setSelectedProject}
              locked={lockedProjectId}
            />
          )}
          {showTimeRange && (
            <TimeRangeToggle value={timeRange} onChange={setTimeRange} />
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Live Tab */}
        <TabsContent value="live">
          <ObservatoryTab>
            <LiveTab selectedProjectId={selectedProject} />
          </ObservatoryTab>
        </TabsContent>

        {/* Triage Tab */}
        <TabsContent value="triage">
          <ObservatoryTab>
            <TriageTab lockedProjectId={lockedProjectId} />
          </ObservatoryTab>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics">
          <ObservatoryTab>
            <AnalyticsTab timeRange={timeRange} lockedProjectId={lockedProjectId} />
          </ObservatoryTab>
        </TabsContent>

        {/* Models Tab */}
        <TabsContent value="models">
          <ObservatoryTab>
            <ModelsTab timeRange={timeRange} lockedProjectId={lockedProjectId} />
          </ObservatoryTab>
        </TabsContent>

        {/* Prompts Tab */}
        <TabsContent value="prompts">
          <ObservatoryTab>
            <PromptsTab timeRange={timeRange} lockedProjectId={lockedProjectId} />
          </ObservatoryTab>
        </TabsContent>
      </Tabs>
    </div>
  )
}
