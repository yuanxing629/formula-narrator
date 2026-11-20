// 键盘与读屏的结构寻址入口：buildIndex 的每个非原子节点一项，按 id 层级缩进。
// 每项 aria-label = 面包屑路径 + 该节点局部朗读（narrate L1），点击等同点选公式。

import { useMemo } from 'react'
import { breadcrumbOf, type AddrEntry } from '../lib/address'
import { narrate, zhNumbers } from '../lib/narrate'

interface Props {
  index: Map<string, AddrEntry>
  selectedId: string
  onSelect: (id: string) => void
}

export default function StructureList({ index, selectedId, onSelect }: Props) {
  // 路径与局部朗读只随结构树重算，点选切换不重复跑 narrate
  const entries = useMemo(
    () =>
      [...index.entries()].map(([id, entry]) => ({
        id,
        label: entry.label,
        depth: id.split('.').length - 1,
        aria: zhNumbers(
          `${breadcrumbOf(index, id)
            .map((c) => c.label)
            .join(' › ')}，${narrate(entry.node, 1)}`,
        ),
      })),
    [index],
  )
  if (!index.size) return null
  return (
    <section className="panel struct-panel" aria-label="按结构点名">
      <details className="struct-list" open>
        <summary>按结构点名</summary>
        <ul>
          {entries.map((e) => (
            <li key={e.id} style={{ paddingLeft: `${e.depth * 0.9}rem` }}>
              <button
                type="button"
                aria-label={e.aria}
                aria-current={selectedId === e.id ? 'true' : undefined}
                onClick={() => onSelect(e.id)}
              >
                {e.label}
              </button>
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}