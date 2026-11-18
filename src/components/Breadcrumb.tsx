import type { Crumb } from '../lib/address'

interface Props {
  crumbs: Crumb[]
  onSelect: (id: string) => void
}

export default function Breadcrumb({ crumbs, onSelect }: Props) {
  if (!crumbs.length) return null
  return (
    <nav aria-label="当前位置" className="breadcrumb">
      <ol>
        {crumbs.map((c, i) => (
          <li key={c.id}>
            {i > 0 && (
              <span className="crumb-sep" aria-hidden="true">
                ›
              </span>
            )}
            <button
              type="button"
              className={i === crumbs.length - 1 ? 'crumb current' : 'crumb'}
              aria-current={i === crumbs.length - 1 ? 'location' : undefined}
              onClick={() => onSelect(c.id)}
            >
              {c.label}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}