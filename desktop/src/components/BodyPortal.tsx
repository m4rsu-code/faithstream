import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Shows full-screen layers (previews, dialogs) at the top of the window, outside the page,
 * so the header, sidebar and footer can never appear on top of them.
 */
export default function BodyPortal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}
