import { visibleRegions, money } from '../shared/presentation';
import type { Workspace } from '../shared/schema';
export default function Chart({ state, palette }: { state: Workspace; palette?: 'blue' }) {
  const regions = visibleRegions(state);
  if (!state.result || !regions.length)
    return (
      <div className="empty-chart">No locations match the selected operating-period filter.</div>
    );
  const width = 700,
    height = 310,
    left = 65,
    right = 15,
    top = 25,
    bottom = 55,
    plotHeight = height - top - bottom;
  const values = regions.flatMap((r) => [r.previous, r.current]),
    min = Math.min(0, ...values),
    max = Math.max(1, ...values),
    range = max - min;
  const y = (v: number) => top + ((max - v) / range) * plotHeight,
    baseline = y(0),
    slot = (width - left - right) / regions.length,
    bar = Math.min(25, slot * 0.26);
  return (
    <div className="chart-wrap">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Revenue comparison for ${regions.length} regions. A full data table follows.`}
      >
        <title>Revenue comparison by region</title>
        {[0, 1, 2, 3, 4].map((i) => {
          const v = min + (range * i) / 4;
          return (
            <g key={i}>
              <line
                x1={left}
                x2={width - right}
                y1={y(v)}
                y2={y(v)}
                stroke="#343937"
                strokeDasharray="3 5"
              />
              <text x={left - 12} y={y(v) + 4} textAnchor="end" fill="#aeb7b1" fontSize="11">
                {Math.abs(v) >= 1000
                  ? `${v < 0 ? '-' : ''}$${Math.abs(v / 1000).toFixed(0)}k`
                  : money(v)}
              </text>
            </g>
          );
        })}
        <line x1={left} x2={width - right} y1={baseline} y2={baseline} stroke="#77857c" />
        {regions.map((r, i) => {
          const x = left + slot * (i + 0.5);
          return (
            <g key={r.region}>
              <rect
                x={x - bar - 3}
                y={Math.min(y(r.previous), baseline)}
                width={bar}
                height={Math.abs(baseline - y(r.previous))}
                rx="3"
                fill={palette === 'blue' ? '#587cac' : '#a9a4c7'}
              >
                <title>
                  {r.region}, previous: {money(r.previous)}
                </title>
              </rect>
              <rect
                x={x + 3}
                y={Math.min(y(r.current), baseline)}
                width={bar}
                height={Math.abs(baseline - y(r.current))}
                rx="3"
                fill={palette === 'blue' ? '#a5ceff' : '#c4ec8b'}
              >
                <title>
                  {r.region}, current: {money(r.current)}
                </title>
              </rect>
              <text x={x} y={height - 26} textAnchor="middle" fill="#d9e0dc" fontSize="12">
                {r.region.length > 12 ? r.region.slice(0, 11) + '…' : r.region}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
