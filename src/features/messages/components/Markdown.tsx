import ReactMarkdown from "react-markdown";
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
  onOpenFileLink?: (path: string) => void;
  onOpenFileLinkMenu?: (event: React.MouseEvent, path: string) => void;
};

export function Markdown({
  value,
  className,
  codeBlock,
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
        components={{
          a: ({ href, children }) => {
            const url = href ?? "";
            if (isFileLinkUrl(url)) {
              const path = decodeFileLink(url);
              return (
                <a
                  href={href}
                  onClick={(event) => handleFileLinkClick(event, path)}
                  onContextMenu={(event) =>
                    handleFileLinkContextMenu(event, path)
                  }
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
          code: ({ className, children }) => {
            const isInline = !className;
            if (!isInline) {
              return (
                <pre>
                  <code className={className}>{children}</code>
                </pre>
              );
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
                onContextMenu={(event) =>
                  handleFileLinkContextMenu(event, text)
                }
              >
                <code>{children}</code>
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
