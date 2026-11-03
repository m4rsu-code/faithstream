import type { ReactNode } from 'react';

export default function PageFooter({ children = 'Private operational data' }: { children?: ReactNode }) {
  return <footer className="page-footer"><span>FaithStream Admin</span><span>{children}</span></footer>;
}
