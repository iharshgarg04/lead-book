/* Small presentational pieces specific to the Leads screens. */
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps, CSSProperties, ReactNode } from 'react'
import { fmtNext } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Lead } from '@/types'
import { CLOSED, dueState } from './model'

/** Legacy `.btn` look: bordered surface button, primary / link / danger variants, small size. */
export const btn = cva(
  'inline-flex items-center justify-center gap-[7px] whitespace-nowrap rounded-[9px] border font-semibold leading-none no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45 [&_svg]:size-4 [&_svg]:flex-none',
  {
    variants: {
      variant: {
        default: 'border-input bg-card text-foreground hover:border-ink-2',
        primary: 'border-primary bg-primary text-primary-foreground hover:border-primary/90 hover:bg-primary/90',
        link: 'border-transparent bg-transparent px-1.5 text-muted-foreground hover:text-foreground',
        danger: 'border-input bg-card text-destructive hover:border-ink-2',
        wa: 'border-input bg-card text-[#128C4A] hover:border-ink-2 dark:text-[#4ADE80]',
      },
      size: {
        md: 'px-3.5 py-2.5 text-[13.5px]',
        sm: 'rounded-lg px-2.5 py-[7px] text-[12.5px]',
      },
    },
    compoundVariants: [{ variant: 'link', className: 'px-1.5' }],
    defaultVariants: { variant: 'default', size: 'md' },
  },
)
export type BtnProps = ComponentProps<'button'> & VariantProps<typeof btn>
export function Btn({ variant, size, className, type = 'button', ...rest }: BtnProps) {
  return <button type={type} className={cn(btn({ variant, size }), className)} {...rest} />
}

/** Icon-only button used in the drawer bar. */
export function IconBtn({ className, ...rest }: ComponentProps<'button'>) {
  return (
    <button type="button" className={cn('grid size-9 place-items-center rounded-[9px] border border-transparent text-ink-2 hover:bg-muted disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent [&_svg]:size-[18px]', className)} {...rest} />
  )
}

/** Follow-up label: red when overdue, amber when due today. */
export function DuePill({ l }: { l: Pick<Lead, 'nextAt' | 'status'> }) {
  if (!l.nextAt || CLOSED.has(l.status)) return null
  const ds = dueState(l)
  return (
    <span className={cn('font-mono text-xs font-medium whitespace-nowrap text-ink-2',
      ds === 'overdue' && 'font-semibold text-destructive', ds === 'today' && 'font-semibold text-warn')}>
      {ds === 'overdue' ? 'Overdue · ' : ''}{fmtNext(l.nextAt)}
    </span>
  )
}

export const Tag = ({ children }: { children: ReactNode }) => (
  <span className="rounded-full border px-2 py-[3px] text-[11.5px] font-medium whitespace-nowrap text-muted-foreground">{children}</span>
)

/** Text with http(s) links made clickable (long URLs shortened). */
export function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<]+)/g)
  return (
    <>
      {parts.map((p, i) => (i % 2
        ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="text-primary underline">{p.length > 46 ? p.slice(0, 43) + '…' : p}</a>
        : p))}
    </>
  )
}

/** Drawer section heading (small caps label). */
export function SecTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn('mb-2.5 flex items-center gap-2 text-[11.5px] font-semibold tracking-[0.07em] text-muted-foreground uppercase', className)}>{children}</h3>
}

/** CSS custom property helper for inline styles. */
export const cssVar = (name: string, value: string) => ({ [name]: value }) as CSSProperties

/** Visually hidden but read by screen readers. */
export const SrOnly = ({ children }: { children: ReactNode }) => <span className="sr-only">{children}</span>

export const WhatsAppIcon = (props: ComponentProps<'svg'>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
    <path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z" />
    <path d="M9.5 9.5c.3 2 2 3.7 4 4l1-1 1.8.8c-.3 1-1.2 1.6-2.3 1.4a6 6 0 0 1-4.9-4.9c-.2-1.1.4-2 1.4-2.3l.8 1.8z" />
  </svg>
)
