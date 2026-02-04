"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"

interface MarkdownContentProps {
  content: string
  className?: string
}

export function MarkdownContent({ content, className = "" }: MarkdownContentProps) {
  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Headers - limit to h3+ to avoid huge text
          h1: ({ children }) => (
            <h3 className="text-base font-semibold mb-2 mt-4 first:mt-0 text-[var(--text-primary)]">
              {children}
            </h3>
          ),
          h2: ({ children }) => (
            <h4 className="text-base font-medium mb-2 mt-3 first:mt-0 text-[var(--text-primary)]">
              {children}
            </h4>
          ),
          h3: ({ children }) => (
            <h5 className="text-sm font-medium mb-1 mt-2 first:mt-0 text-[var(--text-primary)]">
              {children}
            </h5>
          ),
          h4: ({ children }) => (
            <h6 className="text-sm font-medium mb-1 mt-2 first:mt-0 text-[var(--text-primary)]">
              {children}
            </h6>
          ),
          h5: ({ children }) => (
            <h6 className="text-sm font-medium mb-1 mt-2 first:mt-0 text-[var(--text-primary)]">
              {children}
            </h6>
          ),
          h6: ({ children }) => (
            <h6 className="text-sm font-medium mb-1 mt-2 first:mt-0 text-[var(--text-primary)]">
              {children}
            </h6>
          ),

          // Paragraphs
          p: ({ children }) => (
            <p className="text-sm leading-relaxed mb-2 last:mb-0">
              {children}
            </p>
          ),

          // Emphasis
          strong: ({ children }) => (
            <strong className="font-semibold text-[var(--text-primary)]">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic">
              {children}
            </em>
          ),
          del: ({ children }) => (
            <del className="line-through opacity-75">
              {children}
            </del>
          ),

          // Code
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || "")
            if (match) {
              // Block code (fenced)
              return (
                <pre className="bg-[var(--bg-primary)] border border-[var(--border)] rounded p-3 my-2 overflow-x-auto text-xs">
                  <code className={className} {...props}>
                    {children}
                  </code>
                </pre>
              )
            } else {
              // Inline code
              return (
                <code 
                  className="bg-[var(--bg-primary)] border border-[var(--border)] rounded px-1.5 py-0.5 text-xs font-mono"
                  {...props}
                >
                  {children}
                </code>
              )
            }
          },

          // Lists
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-2 space-y-1">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-2 space-y-1">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-sm leading-relaxed">
              {children}
            </li>
          ),

          // Links
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent-blue)] hover:text-[var(--accent-blue-hover)] underline underline-offset-2"
            >
              {children}
            </a>
          ),

          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-[var(--border)] pl-3 my-2 italic opacity-90">
              {children}
            </blockquote>
          ),

          // Tables
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="min-w-full border border-[var(--border)] text-xs">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[var(--bg-secondary)]">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="border border-[var(--border)] px-2 py-1 text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-[var(--border)] px-2 py-1">
              {children}
            </td>
          ),

          // Horizontal rule
          hr: () => (
            <hr className="border-t border-[var(--border)] my-3" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}