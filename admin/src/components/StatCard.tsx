interface StatCardProps {
  label: string
  value: number | undefined
  meta: string
  icon: string
}

export default function StatCard({ label, value, meta, icon }: StatCardProps) {
  return (
    <article className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <div className="stat-value">
        {new Intl.NumberFormat().format(Number(value || 0))}
      </div>
      <p className="stat-meta">{meta}</p>
    </article>
  )
}