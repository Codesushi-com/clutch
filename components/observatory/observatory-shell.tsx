'use client'

/**
 * ObservatoryShell Component
 * Main tabbed layout for the Observatory dashboard
 * Replaces the old Work Loop page with a modern tabbed interface
 */

import { useCallback, useMemo, useState } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ObservatoryTab, ComingSoon } from './observatory-tab'
import { TimeRangeToggle, TimeRange } from './time-range-toggle'

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

export function ObservatoryShell() {
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

  // Determine if we should show the time range toggle
  const showTimeRange = ['analytics', 'models', 'prompts'].includes(activeTab)

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
        {showTimeRange && (
          <TimeRangeToggle value={timeRange} onChange={setTimeRange} />
        )}
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
            <ComingSoon
              title="Live Dashboard"
              description="Real-time view of active agents, sessions, and work loop status."
            />
          </ObservatoryTab>
        </TabsContent>

        {/* Triage Tab */}
        <TabsContent value="triage">
          <ObservatoryTab>
            <ComingSoon
              title="Triage"
              description="Review and manage blocked tasks requiring human attention."
            />
          </ObservatoryTab>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics">
          <ObservatoryTab>
            <ComingSoon
              title="Analytics"
              description={`View performance metrics and trends over ${timeRange}.`}
            />
          </ObservatoryTab>
        </TabsContent>

        {/* Models Tab */}
        <TabsContent value="models">
          <ObservatoryTab>
            <ComingSoon
              title="Models"
              description={`Analyze model usage, costs, and performance over ${timeRange}.`}
            />
          </ObservatoryTab>
        </TabsContent>

        {/* Prompts Tab */}
        <TabsContent value="prompts">
          <ObservatoryTab>
            <ComingSoon
              title="Prompts"
              description={`Review prompt effectiveness and evolution over ${timeRange}.`}
            />
          </ObservatoryTab>
        </TabsContent>
      </Tabs>
    </div>
  )
}
