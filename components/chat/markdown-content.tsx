"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"

interface MarkdownContentProps {
  content: string
  className?: string
  variant?: "chat" | "document"
}

export function MarkdownContent({ content, className = "", variant = "chat" }: MarkdownContentProps) {
  const isDocument = variant === "document"

  return (
    <div className={`markdown-content chat-text ${isDocument ? "overflow-auto" : "overflow-hidden"} ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Headers - larger for documents, compact for chat
          h1: ({ children }) => isDocument ? (
            <h1 className="text-2xl font-bold mb-4 mt-6 first:mt-0 text-[var(--text-primary)] border-b border-[var(--border)] pb-2">
              {children}
            </h1>
          ) : (
            <h3 className="text-base font-semibold mb-2 mt-4 first:mt-0 text-[var(--text-primary)]">
              {children}
            </h3>
          ),
          h2: ({ children }) => isDocument ? (
            <h2 className="text-xl font-semibold mb-3 mt-5 first:mt-0 text-[var(--text-primary)]">
              {children}
            </h2>
          ) : (
            <h4 className="text-base font-medium mb-2 mt-3 first:mt-0 text-[var(--text-primary)]">
              {children}
            </h4>
          ),
          h3: ({ children }) => isDocument ? (
            <h3 className="text-lg font-semibold mb-2 mt-4 first:mt-0 text-[var(--text-primary)]">
              {children}
            </h3>
          ) : (
            <h5 className="text-sm font-medium mb-1 mt-2 first:mt-0 text-[var(--text-primary)]">
              {children}
            </h5>
          ),
          h4: ({ children }) => isDocument ? (
            <h4 className="text-base font-semibold mb-2 mt-3 first:mt-0 text-[var(--text-primary)]">
              {children}
            </h4>
          ) : (
            <h6 className="text-sm font-medium mb-1 mt-2 first:mt-0 text-[var(--text-primary)]">
              {children}
            </h6>
          ),
          h5: ({ children }) => isDocument ? (
            <h5 className="text-sm font-semibold mb-2 mt-3 first:mt-0 text-[var(--text-primary)]">
              {children}
            </h5>
          ) : (
            <h6 className="text-sm font-medium mb-1 mt-2 first:mt-0 text-[var(--text-primary)]">
              {children}
            </h6>
          ),
          h6: ({ children }) => isDocument ? (
            <h6 className="text-sm font-semibold mb-2 mt-3 first:mt-0 text-[var(--text-primary)]">
              {children}
            </h6>
          ) : (
            <h6 className="text-sm font-medium mb-1 mt-2 first:mt-0 text-[var(--text-primary)]">
              {children}
            </h6>
          ),

          // Paragraphs
          p: ({ children }) => (
            <p className={`leading-relaxed font-normal ${isDocument ? "text-base mb-4 last:mb-0" : "text-base mb-2 last:mb-0"}`}>
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
              return isDocument ? (
                <pre className="bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg p-4 my-4 overflow-x-auto text-sm max-w-full min-w-0">
                  <code className={className} {...props}>
                    {children}
                  </code>
                </pre>
              ) : (
                <pre className="bg-[var(--bg-primary)] border border-[var(--border)] rounded p-3 my-2 overflow-x-auto text-xs max-w-full min-w-0">
                  <code className={className} {...props}>
                    {children}
                  </code>
                </pre>
              )
            } else {
              // Inline code
              return (
                <code
                  className={`bg-[var(--bg-primary)] border border-[var(--border)] rounded font-mono break-all ${isDocument ? "px-1.5 py-0.5 text-sm" : "px-1.5 py-0.5 text-xs"}`}
                  {...props}
                >
                  {children}
                </code>
              )
            }
          },

          // Lists
          ul: ({ children }) => (
            <ul className={`list-disc ${isDocument ? "ml-5 mb-4 space-y-2" : "list-inside mb-2 space-y-1"}`}>
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className={`list-decimal ${isDocument ? "ml-5 mb-4 space-y-2" : "list-inside mb-2 space-y-1"}`}>
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className={`leading-relaxed font-normal ${isDocument ? "text-base pl-1" : "text-base"}`}>
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
            <blockquote className={`border-l-4 border-[var(--accent-blue)] italic opacity-90 ${isDocument ? "pl-4 my-4 py-1 bg-[var(--bg-primary)] rounded-r-lg" : "pl-3 my-2"}`}>
              {children}
            </blockquote>
          ),

          // Tables
          table: ({ children }) => isDocument ? (
            <div className="my-4 overflow-x-auto max-w-full min-w-0 rounded-lg border border-[var(--border)]">
              <table className="min-w-full text-sm">
                {children}
              </table>
            </div>
          ) : (
            <div className="my-2 overflow-x-auto max-w-full min-w-0">
              <table className="min-w-full border border-[var(--border)] text-xs">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[var(--bg-tertiary)]">
              {children}
            </thead>
          ),
          th: ({ children }) => isDocument ? (
            <th className="border-b border-[var(--border)] px-4 py-2 text-left font-semibold">
              {children}
            </th>
          ) : (
            <th className="border border-[var(--border)] px-2 py-1 text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => isDocument ? (
            <td className="border-b border-[var(--border)] px-4 py-2">
              {children}
            </td>
          ) : (
            <td className="border border-[var(--border)] px-2 py-1">
              {children}
            </td>
          ),

          // Horizontal rule
          hr: () => (
            <hr className={`border-t border-[var(--border)] ${isDocument ? "my-6" : "my-3"}`} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}