import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  decodeFileLink,
  isFileLinkUrl,
  isLinkableFilePath,
  remarkFileLinks,
  toFileLink,
} from "../../../utils/remarkFileLinks";

type MarkdownProps = {
  value: string;
  className?: string;
  codeBlock?: boolean;
  codeBlockStyle?: "default" | "message";
  codeBlockCopyUseModifier?: boolean;
  onOpenFileLink?: (path: string) => void;
  onOpenFileLinkMenu?: (event: React.MouseEvent, path: string) => void;
};

type CodeBlockProps = {
  className?: string;
  value: string;
  copyUseModifier: boolean;
};

type PreProps = {
  node?: {
    tagName?: string;
    children?: Array<{
      tagName?: string;
      properties?: { className?: string[] | string };
      children?: Array<{ value?: string }>;
    }>;
  };
  children?: ReactNode;
  copyUseModifier: boolean;
};

function extractLanguageTag(className?: string) {
  if (!className) {
    return null;
  }
  const match = className.match(/language-([\w-]+)/i);
  if (!match) {
    return null;
  }
  return match[1];
}

function extractCodeFromPre(node?: PreProps["node"]) {
  const codeNode = node?.children?.find((child) => child.tagName === "code");
  const className = codeNode?.properties?.className;
  const normalizedClassName = Array.isArray(className)
    ? className.join(" ")
    : className;
  const value =
    codeNode?.children?.map((child) => child.value ?? "").join("") ?? "";
  return {
    className: normalizedClassName,
    value: value.replace(/\n$/, ""),
  };
}

function CodeBlock({ className, value, copyUseModifier }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<number | null>(null);
  const languageTag = extractLanguageTag(className);
  const languageLabel = languageTag ?? "Code";
  const fencedValue = `\`\`\`${languageTag ?? ""}\n${value}\n\`\`\``;

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async (event: MouseEvent<HTMLButtonElement>) => {
    try {
      const shouldFence = copyUseModifier ? event.altKey : true;
      const nextValue = shouldFence ? fencedValue : value;
      await navigator.clipboard.writeText(nextValue);
      setCopied(true);
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopied(false);
      }, 1200);
    } catch {
      // No-op: clipboard errors can occur in restricted contexts.
    }
  };

  return (
    <div className="markdown-codeblock">
      <div className="markdown-codeblock-header">
        <span className="markdown-codeblock-language">{languageLabel}</span>
        <button
          type="button"
          className={`ghost markdown-codeblock-copy${copied ? " is-copied" : ""}`}
          onClick={handleCopy}
          aria-label="Copy code block"
          title={copied ? "Copied" : "Copy"}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code className={className}>{value}</code>
      </pre>
    </div>
  );
}

function PreBlock({ node, children, copyUseModifier }: PreProps) {
  const { className, value } = extractCodeFromPre(node);
  if (!className && !value && children) {
    return <pre>{children}</pre>;
  }
  return (
    <CodeBlock
      className={className}
      value={value}
      copyUseModifier={copyUseModifier}
    />
  );
}

export function Markdown({
  value,
  className,
  codeBlock,
  codeBlockStyle = "default",
  codeBlockCopyUseModifier = false,
  onOpenFileLink,
  onOpenFileLinkMenu,
}: MarkdownProps) {
  const content = codeBlock ? `\`\`\`\n${value}\n\`\`\`` : value;
  const handleFileLinkClick = (event: React.MouseEvent, path: string) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenFileLink?.(path);
  };
  const handleFileLinkContextMenu = (
    event: React.MouseEvent,
    path: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenFileLinkMenu?.(event, path);
  };
  const components: Components = {
    a: ({ href, children }) => {
      const url = href ?? "";
      if (isFileLinkUrl(url)) {
        const path = decodeFileLink(url);
        return (
          <a
            href={href}
            onClick={(event) => handleFileLinkClick(event, path)}
            onContextMenu={(event) => handleFileLinkContextMenu(event, path)}
          >
            {children}
          </a>
        );
      }
      const isExternal =
        url.startsWith("http://") ||
        url.startsWith("https://") ||
        url.startsWith("mailto:");

      if (!isExternal) {
        return <a href={href}>{children}</a>;
      }

      return (
        <a
          href={href}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void openUrl(url);
          }}
        >
          {children}
        </a>
      );
    },
    code: ({ className: codeClassName, children }) => {
      if (codeClassName) {
        return <code className={codeClassName}>{children}</code>;
      }
      const text = String(children ?? "").trim();
      if (!text || !isLinkableFilePath(text)) {
        return <code>{children}</code>;
      }
      const href = toFileLink(text);
      return (
        <a
          href={href}
          onClick={(event) => handleFileLinkClick(event, text)}
          onContextMenu={(event) => handleFileLinkContextMenu(event, text)}
        >
          <code>{children}</code>
        </a>
      );
    },
  };

  if (codeBlockStyle === "message") {
    components.pre = ({ node, children }) => (
      <PreBlock node={node as PreProps["node"]} copyUseModifier={codeBlockCopyUseModifier}>
        {children}
      </PreBlock>
    );
  }

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkFileLinks]}
        urlTransform={(url) => {
          const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url);
          if (
            isFileLinkUrl(url) ||
            url.startsWith("http://") ||
            url.startsWith("https://") ||
            url.startsWith("mailto:") ||
            url.startsWith("#") ||
            url.startsWith("/") ||
            url.startsWith("./") ||
            url.startsWith("../")
          ) {
            return url;
          }
          if (!hasScheme) {
            return url;
          }
          return "";
        }}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
