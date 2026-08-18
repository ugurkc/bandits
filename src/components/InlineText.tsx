import { parseInline } from '../lib/inlineMarkdown'

export interface InlineTextProps {
  text: string
}

/** Renders **bold** and *italic* spans in otherwise-plain essay prose. */
export function InlineText({ text }: InlineTextProps) {
  return (
    <>
      {parseInline(text).map((node, i) => {
        switch (node.type) {
          case 'bold':
            return <strong key={i}>{node.text}</strong>
          case 'italic':
            return <em key={i}>{node.text}</em>
          default:
            return node.text
        }
      })}
    </>
  )
}
