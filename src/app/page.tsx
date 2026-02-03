export default function Home() {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Welcome to The Trap
        </h2>
        <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          Your custom dashboard and control center for OpenClaw. See what&apos;s running, 
          kill what needs killing, and keep work organized.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Session Management Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Sessions
          </h3>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            View and manage all active sessions and sub-agents
          </p>
          <div className="mt-4">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              Coming Soon
            </span>
          </div>
        </div>

        {/* Analytics Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Analytics
          </h3>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            Token usage, costs, and usage patterns
          </p>
          <div className="mt-4">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              Coming Soon
            </span>
          </div>
        </div>

        {/* Cron Management Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Cron Jobs
          </h3>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            View, trigger, and manage scheduled tasks
          </p>
          <div className="mt-4">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              Coming Soon
            </span>
          </div>
        </div>
      </div>

      {/* Connection Status Demo */}
      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Connection Status
        </h3>
        <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
          The connection indicator in the top-right corner shows the WebSocket connection status:
        </p>
        <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
          <li className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span>Green = Connected to OpenClaw</span>
          </li>
          <li className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500"></div>
            <span>Red = Disconnected</span>
          </li>
          <li className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></div>
            <span>Yellow (pulsing) = Reconnecting</span>
          </li>
        </ul>
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-4">
          Hover over the indicator for connection details including uptime and error information.
        </p>
      </div>
    </div>
  );
}