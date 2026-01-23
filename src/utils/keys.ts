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

type ComposingEvent = {
  isComposing?: boolean;
  keyCode?: number;
  nativeEvent?: {
    isComposing?: boolean;
    keyCode?: number;
  };
};

export function isComposingEvent(event: ComposingEvent) {
  return Boolean(
    event.isComposing ||
      event.keyCode === 229 ||
      event.nativeEvent?.isComposing ||
      event.nativeEvent?.keyCode === 229,
  );
}
