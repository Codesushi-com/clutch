import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity, BarChart3, Clock, Settings } from "lucide-react"

export default function HomePage() {
  return (
    <div className="container mx-auto p-6">
      <div className="space-y-6">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold">🦞 The Trap</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            A custom dashboard and control center for OpenClaw. Built for visibility, control, and sanity.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center space-x-2 text-lg">
                <Activity className="h-5 w-5" />
                <span>Sessions</span>
              </CardTitle>
              <CardDescription>
                Monitor and control all OpenClaw agent sessions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/sessions">
                <Button className="w-full">
                  View Sessions
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow opacity-50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center space-x-2 text-lg">
                <Clock className="h-5 w-5" />
                <span>Cron Jobs</span>
              </CardTitle>
              <CardDescription>
                Manage scheduled tasks and automation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" disabled>
                Coming Soon
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow opacity-50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center space-x-2 text-lg">
                <BarChart3 className="h-5 w-5" />
                <span>Analytics</span>
              </CardTitle>
              <CardDescription>
                Token usage and cost tracking
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" disabled>
                Coming Soon
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow opacity-50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center space-x-2 text-lg">
                <Settings className="h-5 w-5" />
                <span>Settings</span>
              </CardTitle>
              <CardDescription>
                Configure The Trap preferences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" disabled>
                Coming Soon
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}