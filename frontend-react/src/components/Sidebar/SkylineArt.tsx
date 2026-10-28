/** Decorative line drawing of a Village skyline (civic dome, homes, palms)
 * for the foot of the sidebar. Purely ornamental, hidden from assistive tech. */
export default function SkylineArt() {
  return (
    <svg className="skyline-art" viewBox="0 0 200 64" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round">
        {/* ground */}
        <path d="M4 60h192" />
        {/* house, left */}
        <path d="M14 60V44l12-9 12 9v16M22 60v-8h8v8" />
        {/* civic hall with dome */}
        <path d="M48 60V38h44v22M48 38l22-8 22 8M58 60V46M70 60V46M82 60V46" />
        <path d="M62 30.5a8 8 0 0 1 16 0" />
        <path d="M70 22.5v-4" />
        {/* townhomes */}
        <path d="M100 60V42l9-7 9 7v18M118 60V46l8-6 8 6v14M106 48h6M124 50h4" />
        {/* palm trees */}
        <path d="M150 60c1-10 2-19 1-27" />
        <path d="M151 33c-5-4-11-4-14-1M151 33c4-5 10-6 14-4M151 33c-1-5-5-8-9-8M151 33c2-5 6-7 10-6" />
        <path d="M176 60c-1-8-1-15 1-22" />
        <path d="M177 38c-4-4-9-4-12-2M177 38c3-4 8-5 12-3M177 38c0-4 3-7 7-7" />
        {/* water */}
        <path d="M10 64c5-2 10 2 15 0s10 2 15 0M150 64c5-2 10 2 15 0s10 2 15 0" opacity="0.6" />
      </g>
    </svg>
  );
}
