import { useEffect, useMemo, useRef, useState } from "react";
import X from "lucide-react/dist/esm/icons/x";

type UsageMetric = "tokens" | "time";

type LocalUsageDay = {
  day: string;
  totalTokens: number;
  agentTimeMs?: number | null;
  agentRuns?: number | null;
};

type UsageDetailsModalProps = {
  isOpen: boolean;
  days: LocalUsageDay[];
  usageMetric: UsageMetric;
  onClose: () => void;
};

type UsageTabId = "usage";

type UsageTab = {
  id: UsageTabId;
  label: string;
};

const TABS: UsageTab[] = [{ id: "usage", label: "Usage" }];

const pad2 = (value: number) => String(value).padStart(2, "0");

const formatIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  return `${year}-${month}-${day}`;
};

const parseIsoDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
};

const addDays = (date: Date, offset: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + offset);
  return next;
};

const diffDays = (start: Date, end: Date) => {
  const startMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endMidnight = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const diffMs = endMidnight.getTime() - startMidnight.getTime();
  return Math.floor(diffMs / 86400000) + 1;
};

const getMonthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const getMonthDays = (date: Date) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  return new Date(year, month + 1, 0).getDate();
};

const shiftMonth = (date: Date, offset: number) =>
  new Date(date.getFullYear(), date.getMonth() + offset, 1);

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const isBetween = (value: Date, start: Date, end: Date) => {
  const startTime = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const endTime = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  const valueTime = new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  return valueTime >= startTime && valueTime <= endTime;
};

const sortByDay = (items: LocalUsageDay[]) =>
  [...items].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

const formatDayLabel = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return value;
  }
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
};

const formatCount = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return "--";
  }
  return new Intl.NumberFormat().format(value);
};

const formatDuration = (valueMs: number | null | undefined) => {
  if (valueMs === null || valueMs === undefined) {
    return "--";
  }
  const totalSeconds = Math.max(0, Math.round(valueMs / 1000));
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (totalMinutes > 0) {
    return `${totalMinutes}m`;
  }
  return `${totalSeconds}s`;
};

export function UsageDetailsModal({
  isOpen,
  days,
  usageMetric,
  onClose,
}: UsageDetailsModalProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const initRef = useRef(false);
  const sortedDays = useMemo(() => sortByDay(days), [days]);
  const minDateValue = sortedDays.length ? sortedDays[0].day : null;
  const maxDateValue = sortedDays.length ? sortedDays[sortedDays.length - 1].day : null;
  const minDate = useMemo(
    () => (minDateValue ? parseIsoDate(minDateValue) : null),
    [minDateValue],
  );
  const maxDate = useMemo(
    () => (maxDateValue ? parseIsoDate(maxDateValue) : null),
    [maxDateValue],
  );

  const [activeTab, setActiveTab] = useState<UsageTabId>("usage");
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null);
  const [draftStart, setDraftStart] = useState<Date | null>(null);
  const [draftEnd, setDraftEnd] = useState<Date | null>(null);
  const [pickerMonth, setPickerMonth] = useState<Date | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      initRef.current = false;
      setIsPickerOpen(false);
      return;
    }
    if (!maxDate || initRef.current) {
      return;
    }
    const end = maxDate;
    const start = addDays(end, -6);
    const clampedStart =
      minDate && start < minDate ? minDate : start;
    setRangeStart(clampedStart);
    setRangeEnd(end);
    setDraftStart(clampedStart);
    setDraftEnd(end);
    setPickerMonth(getMonthStart(end));
    initRef.current = true;
  }, [isOpen, maxDate, minDate]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      closeRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isPickerOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      if (!popoverRef.current) {
        return;
      }
      if (!popoverRef.current.contains(event.target as Node)) {
        setIsPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isPickerOpen]);

  const rangeLabel = (() => {
    if (!rangeStart || !rangeEnd) {
      return "Select a range";
    }
    const formatter = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "2-digit",
    });
    return `${formatter.format(rangeStart)} - ${formatter.format(rangeEnd)}`;
  })();

  const isRangeValid = Boolean(rangeStart && rangeEnd && rangeStart <= rangeEnd);
  const activePreset = rangeStart && rangeEnd ? diffDays(rangeStart, rangeEnd) : null;

  const filteredDays = useMemo(() => {
    if (!isRangeValid || !rangeStart || !rangeEnd) {
      return [] as LocalUsageDay[];
    }
    const startIso = formatIsoDate(rangeStart);
    const endIso = formatIsoDate(rangeEnd);
    return sortedDays.filter((day) => day.day >= startIso && day.day <= endIso);
  }, [isRangeValid, rangeStart, rangeEnd, sortedDays]);

  const maxUsageValue = Math.max(
    1,
    ...filteredDays.map((day) =>
      usageMetric === "tokens" ? day.totalTokens : day.agentTimeMs ?? 0,
    ),
  );

  const handlePresetClick = (daysCount: number) => {
    if (!maxDate) {
      return;
    }
    const end = rangeEnd ?? maxDate;
    const start = addDays(end, -(daysCount - 1));
    const clampedStart =
      minDate && start < minDate ? minDate : start;
    setRangeStart(clampedStart);
    setRangeEnd(end);
    setDraftStart(clampedStart);
    setDraftEnd(end);
  };

  const handleTogglePicker = () => {
    if (!maxDate) {
      return;
    }
    const start = rangeStart ?? maxDate;
    const end = rangeEnd ?? maxDate;
    setDraftStart(start);
    setDraftEnd(end);
    setPickerMonth(getMonthStart(end));
    setIsPickerOpen((prev) => !prev);
  };

  const handleDayClick = (date: Date) => {
    if (!maxDate) {
      return;
    }
    const clamped =
      minDate && date < minDate ? minDate : date > maxDate ? maxDate : date;
    if (!draftStart || (draftStart && draftEnd)) {
      setDraftStart(clamped);
      setDraftEnd(null);
      return;
    }
    if (clamped < draftStart) {
      setDraftStart(clamped);
      return;
    }
    setDraftEnd(clamped);
  };

  const handleApplyPicker = () => {
    if (!draftStart || !draftEnd) {
      return;
    }
    setRangeStart(draftStart);
    setRangeEnd(draftEnd);
    setIsPickerOpen(false);
  };

  const handleCancelPicker = () => {
    setDraftStart(rangeStart);
    setDraftEnd(rangeEnd);
    setIsPickerOpen(false);
  };

  if (!isOpen) {
    return null;
  }

  const monthToRender = pickerMonth ?? (rangeEnd ?? maxDate ?? new Date());
  const monthStart = getMonthStart(monthToRender);
  const monthDays = getMonthDays(monthToRender);
  const monthStartWeekday = monthStart.getDay();
  const monthLabel = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(monthStart);

  return (
    <div className="settings-overlay usage-overlay" role="dialog" aria-modal="true">
      <div className="settings-backdrop" onClick={onClose} />
      <div className="settings-window usage-window">
        <div className="settings-titlebar">
          <div className="settings-title">Usage details</div>
          <button
            ref={closeRef}
            type="button"
            className="ghost icon-button settings-close"
            onClick={onClose}
            aria-label="Close usage details"
          >
            <X aria-hidden />
          </button>
        </div>
        <div className="settings-body">
          <aside className="settings-sidebar">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={
                  activeTab === tab.id ? "settings-nav active" : "settings-nav"
                }
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </aside>
          <div className="settings-content usage-content">
            {activeTab === "usage" && (
              <div className="usage-panel">
                <div className="usage-range-row">
                  <div className="usage-range-popover" ref={popoverRef}>
                    <button
                      type="button"
                      className={
                        isPickerOpen
                          ? "usage-range-trigger is-open"
                          : "usage-range-trigger"
                      }
                      onClick={handleTogglePicker}
                    >
                      <span className="usage-range-label">{rangeLabel}</span>
                      <span className="usage-range-chevron" aria-hidden>
                        {isPickerOpen ? "▴" : "▾"}
                      </span>
                    </button>
                    {isPickerOpen && (
                      <div className="usage-picker-popover">
                        <div className="usage-picker">
                          <div className="usage-picker-header">
                            <span className="usage-picker-title">{monthLabel}</span>
                            <div className="usage-picker-nav">
                              <button
                                type="button"
                                className="ghost usage-nav-button"
                                onClick={() => setPickerMonth(shiftMonth(monthStart, -1))}
                                aria-label="Previous month"
                              >
                                ‹
                              </button>
                              <button
                                type="button"
                                className="ghost usage-nav-button"
                                onClick={() => setPickerMonth(shiftMonth(monthStart, 1))}
                                aria-label="Next month"
                              >
                                ›
                              </button>
                            </div>
                          </div>
                          <div className="usage-weekdays">
                            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
                              <span key={day}>{day}</span>
                            ))}
                          </div>
                          <div className="usage-days">
                            {Array.from({ length: monthStartWeekday }).map((_, index) => (
                              <span key={`blank-${index}`} className="usage-day is-blank" />
                            ))}
                            {Array.from({ length: monthDays }).map((_, index) => {
                              const dayNumber = index + 1;
                              const date = new Date(
                                monthStart.getFullYear(),
                                monthStart.getMonth(),
                                dayNumber,
                              );
                              const isDisabled =
                                (minDate ? date < minDate : false) ||
                                (maxDate ? date > maxDate : false);
                              const isStart = draftStart ? isSameDay(date, draftStart) : false;
                              const isEnd = draftEnd ? isSameDay(date, draftEnd) : false;
                              const inRange =
                                draftStart && draftEnd
                                  ? isBetween(date, draftStart, draftEnd)
                                  : false;
                              return (
                                <button
                                  key={date.toISOString()}
                                  type="button"
                                  className={
                                    isStart || isEnd
                                      ? "usage-day is-selected"
                                      : inRange
                                        ? "usage-day is-in-range"
                                        : "usage-day"
                                  }
                                  disabled={isDisabled}
                                  onClick={() => handleDayClick(date)}
                                >
                                  {dayNumber}
                                </button>
                              );
                            })}
                          </div>
                          <div className="usage-picker-actions">
                            <button
                              type="button"
                              className="ghost usage-action"
                              onClick={handleCancelPicker}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="usage-action primary"
                              onClick={handleApplyPicker}
                              disabled={!draftStart || !draftEnd}
                            >
                              Apply
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="usage-quick" role="group" aria-label="Quick ranges">
                    {[1, 7, 30].map((daysCount) => (
                      <button
                        key={daysCount}
                        type="button"
                        className={
                          activePreset === daysCount
                            ? "usage-quick-button is-active"
                            : "usage-quick-button"
                        }
                        onClick={() => handlePresetClick(daysCount)}
                      >
                        {daysCount}d
                      </button>
                    ))}
                  </div>
                </div>
                {!isRangeValid && (
                  <div className="usage-range-error">Start date must be before end date.</div>
                )}
                <div className="usage-panel-scroll">
                  <div className="usage-chart-card">
                    {filteredDays.length === 0 ? (
                      <div className="usage-empty">No usage data for this range.</div>
                    ) : (
                      <div className="usage-chart-scroll">
                        <div className="usage-chart-track" role="list">
                          {filteredDays.map((day) => {
                            const value =
                              usageMetric === "tokens"
                                ? day.totalTokens
                                : day.agentTimeMs ?? 0;
                            const height = Math.max(
                              6,
                              Math.round((value / maxUsageValue) * 100),
                            );
                            const tooltip =
                              usageMetric === "tokens"
                                ? `${formatDayLabel(day.day)} · ${formatCount(day.totalTokens)} tokens`
                                : `${formatDayLabel(day.day)} · ${formatDuration(day.agentTimeMs ?? 0)} agent time`;
                            return (
                              <div
                                className="usage-bar"
                                role="listitem"
                                key={day.day}
                                data-value={tooltip}
                                title={tooltip}
                              >
                                <span className="usage-bar-fill" style={{ height: `${height}%` }} />
                                <span className="usage-bar-label">{formatDayLabel(day.day)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
