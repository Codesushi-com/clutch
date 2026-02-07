export default function ProjectPromptLabPage() {
  return (
    <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
      <div className="text-center max-w-md px-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-4">
          Project Prompt Lab
        </h1>
        <p className="text-[var(--text-secondary)] mb-6">
          Project-specific prompt management is coming soon. 
          Use the global Prompt Lab to manage prompts across all projects.
        </p>
        <a
          href="/prompts"
          className="inline-flex items-center px-4 py-2 bg-[var(--accent)] text-[var(--accent-foreground)] rounded-lg hover:opacity-90 transition-opacity"
        >
          Go to Prompt Lab →
        </a>
      </div>
    </div>
  )
}
