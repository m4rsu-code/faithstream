type EscapeHandler = () => void;

const escapeStack: EscapeHandler[] = [];

const handleEscape = (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || !escapeStack.length) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  escapeStack[escapeStack.length - 1]?.();
};

/** Registers an Escape action in modal order so nested dialogs close before their parent. */
export const registerModalEscape = (handler: EscapeHandler) => {
  escapeStack.push(handler);
  if (escapeStack.length === 1) window.addEventListener('keydown', handleEscape, true);
  return () => {
    const index = escapeStack.lastIndexOf(handler);
    if (index >= 0) escapeStack.splice(index, 1);
    if (!escapeStack.length) window.removeEventListener('keydown', handleEscape, true);
  };
};
