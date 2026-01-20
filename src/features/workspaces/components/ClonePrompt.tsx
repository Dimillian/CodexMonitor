import { useEffect, useRef } from "react";
import { createFocusTrap } from "focus-trap";

type ClonePromptProps = {
  workspaceName: string;
  copyName: string;
  copiesFolder: string;
  suggestedCopiesFolder?: string | null;
  error?: string | null;
  onCopyNameChange: (value: string) => void;
  onChooseCopiesFolder: () => void;
  onUseSuggestedCopiesFolder: () => void;
  onClearCopiesFolder: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  isBusy?: boolean;
};

/**
 * Clone workspace modal with focus trap for accessibility
 *
 * This component implements a focus trap to ensure keyboard users
 * cannot navigate outside the modal while it's open. This is
 * critical for WCAG 2.1 compliance and accessible modals.
 */
export function ClonePrompt({
  workspaceName,
  copyName,
  copiesFolder,
  suggestedCopiesFolder = null,
  error = null,
  onCopyNameChange,
  onChooseCopiesFolder,
  onUseSuggestedCopiesFolder,
  onClearCopiesFolder,
  onCancel,
  onConfirm,
  isBusy = false,
}: ClonePromptProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const focusTrapRef = useRef<ReturnType<typeof createFocusTrap> | null>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const isModalMountedRef = useRef(false);

  // Ref callback to ensure focus trap is set up after modal is mounted
  const setModalRef = (node: HTMLDivElement | null) => {
    modalRef.current = node;
    isModalMountedRef.current = node !== null;
  };

  useEffect(() => {
    // Only run when modal is actually mounted in DOM
    if (!isModalMountedRef.current || !modalRef.current) {
      return;
    }

    // Store the element that had focus before modal opened
    previousActiveElement.current = document.activeElement as HTMLElement;

    // Create focus trap with fallback for safety
    const trap = createFocusTrap(modalRef.current, {
      clickOutsideDeactivates: true,
      escapeDeactivates: false, // We handle this ourselves
      fallbackFocus: inputRef.current || undefined,
    });

    // Check if trap was created successfully
    if (!trap) {
      console.warn("Focus trap creation failed - keyboard navigation may be limited");
      return;
    }

    focusTrapRef.current = trap;

    // Activate the trap
    try {
      trap.activate();
    } catch (e) {
      console.error("Failed to activate focus trap:", e);
      return;
    }

    // Focus and select the input
    inputRef.current?.focus();
    inputRef.current?.select();

    // Cleanup: deactivate trap and restore focus
    return () => {
      if (focusTrapRef.current) {
        try {
          focusTrapRef.current.deactivate();
        } catch (e) {
          console.error("Failed to deactivate focus trap:", e);
        }
        focusTrapRef.current = null;
      }

      // Restore focus to previous element
      if (previousActiveElement.current) {
        try {
          previousActiveElement.current.focus();
        } catch (e) {
          // Element might have been removed from DOM
          console.warn("Failed to restore focus:", e);
        }
      }
    };
    // Empty deps - effect runs once per mount cycle
    // The ref callback ensures re-run when modal remounts
  }, []);

  const canCreate = copyName.trim().length > 0 && copiesFolder.trim().length > 0;
  const showSuggested =
    Boolean(suggestedCopiesFolder) && copiesFolder.trim().length === 0;

  return (
    <div className="clone-modal" role="dialog" aria-modal="true" aria-labelledby="clone-modal-title">
      <div
        className="clone-modal-backdrop"
        onClick={() => {
          if (!isBusy) {
            onCancel();
          }
        }}
      />
      <div className="clone-modal-card" ref={setModalRef} tabIndex={-1}>
        <div className="clone-modal-title" id="clone-modal-title">New clone agent</div>
        <div className="clone-modal-subtitle">
          Create a new working copy of "{workspaceName}".
        </div>
        <label className="clone-modal-label" htmlFor="clone-copy-name">
          Copy name
        </label>
        <input
          id="clone-copy-name"
          ref={inputRef}
          className="clone-modal-input"
          value={copyName}
          onChange={(event) => onCopyNameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              if (!isBusy) {
                onCancel();
              }
            }
            if (event.key === "Enter" && canCreate && !isBusy) {
              event.preventDefault();
              onConfirm();
            }
          }}
        />
        <label className="clone-modal-label" htmlFor="clone-copies-folder">
          Copies folder
        </label>
        <div className="clone-modal-folder-row">
          <textarea
            id="clone-copies-folder"
            className="clone-modal-input clone-modal-input--path"
            value={copiesFolder}
            placeholder="Not set"
            readOnly
            rows={1}
            wrap="off"
            onFocus={(event) => {
              const value = event.currentTarget.value;
              event.currentTarget.setSelectionRange(value.length, value.length);
              requestAnimationFrame(() => {
                event.currentTarget.scrollLeft = event.currentTarget.scrollWidth;
              });
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                if (!isBusy) {
                  onCancel();
                }
              }
              if (event.key === "Enter" && canCreate && !isBusy) {
                event.preventDefault();
                onConfirm();
              }
            }}
          ></textarea>
          <button
            type="button"
            className="ghost clone-modal-button"
            onClick={onChooseCopiesFolder}
            disabled={isBusy}
          >
            Choose…
          </button>
          <button
            type="button"
            className="ghost clone-modal-button"
            onClick={onClearCopiesFolder}
            disabled={isBusy || copiesFolder.trim().length === 0}
          >
            Clear
          </button>
        </div>
        {showSuggested && (
          <div className="clone-modal-suggested">
            <div className="clone-modal-suggested-label">Suggested</div>
            <div className="clone-modal-suggested-row">
              <textarea
                className="clone-modal-suggested-path clone-modal-input--path"
                value={suggestedCopiesFolder ?? ""}
                readOnly
                rows={1}
                wrap="off"
                aria-label="Suggested copies folder"
                title={suggestedCopiesFolder ?? ""}
                onFocus={(event) => {
                  const value = event.currentTarget.value;
                  event.currentTarget.setSelectionRange(value.length, value.length);
                  requestAnimationFrame(() => {
                    event.currentTarget.scrollLeft = event.currentTarget.scrollWidth;
                  });
                }}
              ></textarea>
              <button
                type="button"
                className="ghost clone-modal-button"
                onClick={async () => {
                  if (!suggestedCopiesFolder) {
                    return;
                  }
                  try {
                    await navigator.clipboard.writeText(suggestedCopiesFolder);
                  } catch {
                    // Ignore clipboard failures (e.g. permission denied).
                  }
                }}
                disabled={isBusy || !suggestedCopiesFolder}
              >
                Copy
              </button>
              <button
                type="button"
                className="ghost clone-modal-button"
                onClick={onUseSuggestedCopiesFolder}
                disabled={isBusy}
              >
                Use suggested
              </button>
            </div>
          </div>
        )}
        {error && <div className="clone-modal-error" role="alert">{error}</div>}
        <div className="clone-modal-actions">
          <button
            className="ghost clone-modal-button"
            onClick={onCancel}
            type="button"
            disabled={isBusy}
          >
            Cancel
          </button>
          <button
            className="primary clone-modal-button"
            onClick={onConfirm}
            type="button"
            disabled={isBusy || !canCreate}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
