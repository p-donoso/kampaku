"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

interface ChatMarkdownProps {
  content: string;
  className?: string;
}

export function ChatMarkdown({ content, className = "" }: ChatMarkdownProps) {
  const [failed, setFailed] = useState(false);

  if (failed || !content.trim()) {
    return <div className={`whitespace-pre-wrap ${className}`}>{content}</div>;
  }

  try {
    return (
      <div className={`chat-markdown text-sm leading-relaxed ${className}`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSanitize]}
          components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand underline">
              {children}
            </a>
          ),
          code: ({ className: codeClassName, children }) => {
            const isBlock = codeClassName?.includes("language-");
            if (isBlock) {
              return (
                <pre className="my-2 overflow-x-auto rounded-lg bg-elevated/80 p-3 text-xs">
                  <code>{children}</code>
                </pre>
              );
            }
            return <code className="rounded bg-elevated/80 px-1 py-0.5 text-xs">{children}</code>;
          },
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="min-w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border border-border px-2 py-1 text-left">{children}</th>,
          td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-brand/40 pl-3 text-secondary">{children}</blockquote>
          ),
          h1: ({ children }) => <h1 className="mb-2 mt-3 text-base font-semibold">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-3 text-sm font-semibold">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-1 mt-2 text-sm font-medium">{children}</h3>,
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
          p: ({ children }) => <p className="my-1">{children}</p>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
    );
  } catch {
    setFailed(true);
    return <div className={`whitespace-pre-wrap ${className}`}>{content}</div>;
  }
}
