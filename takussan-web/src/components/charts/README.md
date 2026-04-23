# Charts — TCK-032 Reporting

**Chart library choice: pure SVG + Tailwind (no runtime dependency).**

Rationale:
1. Zero bundle weight — adding Recharts (~40 KB gz) or Chart.js (~80 KB gz) for
   two line/bar charts was overkill.
2. React 19 Server Components friendly — our charts render server-side without
   `'use client'` unless they handle hover.
3. Matches the existing minimalist design language (Tailwind CSS 4, utility-first).

Each chart accepts a typed `{ labels: string[]; series: Array<{ name; values }>; }`
and renders into a responsive viewBox. If the project ever needs richer
interactivity, swap the inside of `LineChart`/`BarChart` for a Recharts component
— the consumer API stays stable.
