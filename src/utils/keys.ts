export function matchesHoldKey(event: KeyboardEvent, holdKey: string) {
  switch (holdKey) {
    case "alt":
      return event.key === "Alt";
    case "shift":
      return event.key === "Shift";
    case "control":
      return event.key === "Control";
    case "meta":
      return event.key === "Meta";
    default:
      return false;
  }
}
