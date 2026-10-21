/**
 * A message with inline markup as React nodes, for islands. The same tags and
 * the same rules as `Rich.astro`.
 *
 *   const t = useT()
 *   <p>{renderRich(t.rich('lesson.sendHint'), { key: { el: 'kbd', class: 'mf-kbd' } }, t)}</p>
 */

import { Fragment, createElement, type ReactNode } from 'react'
import type { RichNode } from './rich'
import { resolveTag, type RichTags } from './richTags'
import type { Translator } from './translator'

export function renderRich(
  nodes: readonly RichNode[],
  tags?: RichTags,
  t?: Pick<Translator, 'href'>,
): ReactNode {
  return nodes.map((node, index) => {
    if (typeof node === 'string') return <Fragment key={index}>{node}</Fragment>
    const spec = resolveTag(node.tag, tags)
    const children = renderRich(node.children, tags, t)
    if (!spec) return <Fragment key={index}>{children}</Fragment>
    const href = spec.href === undefined ? undefined : t ? t.href(spec.href) : spec.href
    return createElement(
      spec.el ?? 'span',
      {
        key: index,
        href,
        className: spec.class,
        rel: spec.rel,
        title: spec.title,
        lang: spec.lang,
        target: spec.target,
        'aria-hidden': spec['aria-hidden'],
      },
      children,
    )
  })
}
