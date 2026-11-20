import type { Messages } from "@/lib/i18n/dictionaries";

export function ControllerHintBar({ messages }: { messages: Messages }) {
  return (
    <div className="controller-hint-bar" aria-label={messages.controller.controlsLabel}>
      <span><kbd>✕</kbd>{messages.controller.select}</span>
      <span><kbd>△</kbd>{messages.controller.filters}</span>
      <span><kbd>□</kbd>{messages.controller.favorite}</span>
      <span><kbd>○</kbd>{messages.controller.back}</span>
      <span><kbd>L1 / R1</kbd>{messages.controller.sections}</span>
    </div>
  );
}
