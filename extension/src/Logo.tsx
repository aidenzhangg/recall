/** The Recall mark: a flat green R on a dark tile. Same shapes as public/favicon.svg and the extension icons. */
export default function Logo({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 128 128" aria-hidden="true">
    <rect width="128" height="128" rx="28" fill="#14181f" />
    <g fill="#b4f06e">
      <path fillRule="evenodd" d="M36 30h34a22 22 0 0 1 0 44H52v24H36zm16 14v16h18a8 8 0 0 0 0-16z" />
      <path d="M55 70h18l21 28H76z" />
    </g>
  </svg>
}
