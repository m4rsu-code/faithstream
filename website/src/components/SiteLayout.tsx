import type { ReactNode } from 'react'
import Footer from './Footer'
import Navbar from './Navbar'

export default function SiteLayout({ children, currentPath }: { children: ReactNode; currentPath: string }) {
  return <><Navbar currentPath={currentPath} /><main>{children}</main><Footer /></>
}
