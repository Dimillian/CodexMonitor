import { useEffect, useMemo, useState } from "react";
import type {
  RequestUserInputRequest,
  RequestUserInputResponse,
} from "../../../types";

type RequestUserInputMessageProps = {
  requests: RequestUserInputRequest[];
  activeThreadId: string | null;
  activeWorkspaceId?: string | null;
  onSubmit: (
    request: RequestUserInputRequest,
    response: RequestUserInputResponse,
  ) => void;
};

type SelectionState = Record<string, number | null>;
type NotesState = Record<string, string>;

export function RequestUserInputMessage({
  requests,
  activeThreadId,
  activeWorkspaceId,
  onSubmit,
}: RequestUserInputMessageProps) {
  const activeRequests = useMemo(
    () =>
      requests.filter((request) => {
        if (!activeThreadId) {
          return false;
        }
        if (request.params.thread_id !== activeThreadId) {
          return false;
        }
        if (activeWorkspaceId && request.workspace_id !== activeWorkspaceId) {
          return false;
        }
        return true;
      }),
    [requests, activeThreadId, activeWorkspaceId],
  );
  const activeRequest = activeRequests[0];
  const [selections, setSelections] = useState<SelectionState>({});
  const [notes, setNotes] = useState<NotesState>({});

  useEffect(() => {
    if (!activeRequest) {
      setSelections({});
      setNotes({});
      return;
    }
    const nextSelections: SelectionState = {};
    const nextNotes: NotesState = {};
    activeRequest.params.questions.forEach((question, index) => {
      const key = question.id || `question-${index}`;
      nextSelections[key] = null;
      nextNotes[key] = "";
    });
    setSelections(nextSelections);
    setNotes(nextNotes);
  }, [activeRequest]);

  if (!activeRequest) {
    return null;
  }

  const { questions } = activeRequest.params;
  const totalRequests = activeRequests.length;

  const buildAnswers = () => {
    const answers: RequestUserInputResponse["answers"] = {};
    questions.forEach((question, index) => {
      if (!question.id) {
        return;
      }
      const answerList: string[] = [];
      const key = question.id || `question-${index}`;
      const selectedIndex = selections[key];
      const options = question.options ?? [];
      const hasOptions = options.length > 0;
      if (hasOptions && selectedIndex !== null) {
        const selected = options[selectedIndex];
        const selectedValue =
          selected?.label?.trim() || selected?.description?.trim() || "";
        if (selectedValue) {
          answerList.push(selectedValue);
        }
      }
      const note = (notes[key] ?? "").trim();
      if (note) {
        if (hasOptions) {
          answerList.push(`用户备注: ${note}`);
        } else {
          answerList.push(note);
        }
      }
      answers[question.id] = { answers: answerList };
    });
    return answers;
  };

  const handleSelect = (questionId: string, optionIndex: number) => {
    setSelections((current) => ({ ...current, [questionId]: optionIndex }));
  };

  const handleNotesChange = (questionId: string, value: string) => {
    setNotes((current) => ({ ...current, [questionId]: value }));
  };

  const handleSubmit = () => {
    onSubmit(activeRequest, { answers: buildAnswers() });
  };

  return (
    <div className="message request-user-input-message">
      <div
        className="bubble request-user-input-card"
        role="group"
        aria-label="需要用户输入"
      >
        <div className="request-user-input-header">
          <div className="request-user-input-title">需要你的输入</div>
          {totalRequests > 1 ? (
            <div className="request-user-input-queue">
              {`请求 1 / ${totalRequests}`}
            </div>
          ) : null}
        </div>
        <div className="request-user-input-body">
          {questions.length ? (
            questions.map((question, index) => {
              const questionId = question.id || `question-${index}`;
              const selectedIndex = selections[questionId];
              const options = question.options ?? [];
              const notePlaceholder = question.isOther
                ? "填写你的答案（可选）"
                : options.length
                ? "添加备注（可选）"
                : "填写你的答案（可选）";
              return (
                <section key={questionId} className="request-user-input-question">
                  {question.header ? (
                    <div className="request-user-input-question-header">
                      {question.header}
                    </div>
                  ) : null}
                  <div className="request-user-input-question-text">
                    {question.question}
                  </div>
                  {options.length ? (
                    <div className="request-user-input-options">
                      {options.map((option, optionIndex) => (
                        <button
                          key={`${questionId}-${optionIndex}`}
                          type="button"
                          className={`request-user-input-option${
                            selectedIndex === optionIndex ? " is-selected" : ""
                          }`}
                          onClick={() => handleSelect(questionId, optionIndex)}
                        >
                          <span className="request-user-input-option-label">
                            {option.label}
                          </span>
                          {option.description ? (
                            <span className="request-user-input-option-description">
                              {option.description}
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <textarea
                    className="request-user-input-notes"
                    placeholder={notePlaceholder}
                    value={notes[questionId] ?? ""}
                    onChange={(event) =>
                      handleNotesChange(questionId, event.target.value)
                    }
                    rows={2}
                  />
                </section>
              );
            })
          ) : (
            <div className="request-user-input-empty">
              未提供可回答的问题。
            </div>
          )}
        </div>
        <div className="request-user-input-actions">
          <button className="primary" onClick={handleSubmit}>
            提交
          </button>
        </div>
      </div>
    </div>
  );
}
