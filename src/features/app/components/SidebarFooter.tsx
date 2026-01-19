type SidebarFooterProps = {
  sessionPercent: number | null;
  weeklyPercent: number | null;
  sessionResetLabel: string | null;
  weeklyResetLabel: string | null;
  creditsLabel: string | null;
  showWeekly: boolean;
};

export function SidebarFooter({
  sessionPercent,
  weeklyPercent,
  sessionResetLabel,
  weeklyResetLabel,
  creditsLabel,
  showWeekly,
}: SidebarFooterProps) {
  return (
    <div className="sidebar-footer">
      <div className="usage-bars">
        <div className="usage-block">
          <div className="usage-label">
            <span className="usage-title">
              <span>Session</span>
              {sessionResetLabel && (
                <span className="usage-reset">· {sessionResetLabel}</span>
              )}
            </span>
            <span className="usage-value">
              {sessionPercent === null ? "--" : `${sessionPercent}%`}
            </span>
          </div>
          <div className="usage-bar">
            <span
              className="usage-bar-fill"
              style={{ width: `${sessionPercent ?? 0}%` }}
            />
          </div>
        </div>
        {showWeekly && (
          <div className="usage-block">
            <div className="usage-label">
              <span className="usage-title">
                <span>Weekly</span>
                {weeklyResetLabel && (
                  <span className="usage-reset">· {weeklyResetLabel}</span>
                )}
              </span>
              <span className="usage-value">
                {weeklyPercent === null ? "--" : `${weeklyPercent}%`}
              </span>
            </div>
            <div className="usage-bar">
              <span
                className="usage-bar-fill"
                style={{ width: `${weeklyPercent ?? 0}%` }}
              />
            </div>
          </div>
        )}
      </div>
      {creditsLabel && <div className="usage-meta">{creditsLabel}</div>}
    </div>
  );
}
