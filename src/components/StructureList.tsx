// 键盘与读屏的结构寻址入口：buildIndex 的每个非原子节点一项，按 id 层级缩进。
// 每项 aria-label = 面包屑路径 + 该节点局部朗读（narrate L1），点击等同点选公式。

import { breadcrumbOf, type AddrEntry } from '../lib/address'
import { narrate, zhNumbers } from '../lib/narrate'

interface Props {
  index: Map<string, AddrEntry>
  selectedId: string
  onSelect: (id: string) => void
}

export default function StructureList({ index, selectedId, onSelect }: Props) {
  if (!index.size) return null
  return (
    <details className="struct-list" open>
      <summary>按结构点名</summary>
      <ul>
        {[...index.entries()].map(([id, entry]) => {
          const depth = id.split('.').length - 1
          const path = breadcrumbOf(index, id)
            .map((c) => c.label)
            .join(' › ')
          return (
            <li key={id} style={{ paddingLeft: `${depth * 0.9}rem` }}>
              <button
                type="button"
                aria-label={zhNumbers(`${path}，${narrate(entry.node, 1)}`)}
                aria-current={selectedId === id ? 'true' : undefined}
                onClick={() => onSelect(id)}
              >
                {entry.label}
              </button>
            </li>
          )
        })}
      </ul>
    </details>
  )
}