import type { Metadata } from "next";
import "./globals.css";
import { ConnectionStatus } from "@/components/connection-status";

export const metadata: Metadata = {
  title: "The Trap - OpenClaw Dashboard",
  description: "A custom dashboard and control center for OpenClaw",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="min-h-screen bg-background">
          {/* Navigation Header */}
          <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center h-16">
                {/* Logo/Title */}
                <div className="flex items-center">
                  <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                    🦞 The Trap
                  </h1>
                </div>

                {/* Navigation Links (placeholder) */}
                <nav className="hidden md:flex space-x-8">
                  <a 
                    href="#" 
                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 px-3 py-2 text-sm font-medium"
                  >
                    Sessions
                  </a>
                  <a 
                    href="#" 
                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 px-3 py-2 text-sm font-medium"
                  >
                    Analytics
                  </a>
                  <a 
                    href="#" 
                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 px-3 py-2 text-sm font-medium"
                  >
                    Cron
                  </a>
                </nav>

                {/* Connection Status */}
                <div className="flex items-center">
                  <ConnectionStatus websocketUrl="ws://localhost:8080/ws" />
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}