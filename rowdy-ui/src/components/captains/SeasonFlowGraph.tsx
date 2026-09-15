import { memo, useId } from "react";
import {
  HOLES_PER_ROUND,
  type CaptainsPeak,
  type CaptainsSeriesPoint,
} from "../../utils/captainsMatchScoring";

const AS_GRAY = "#94a3b8";

export type SeasonFlowGraphProps = {
  /** One point per hole that counted, from summarizeCaptainsMatch. */
  series: CaptainsSeriesPoint[];
  totalRounds: number;
  colorA: string;
  colorB: string;
  photoA?: string;
  photoB?: string;
  peakA: CaptainsPeak | null;
  peakB: CaptainsPeak | null;
  /** True once the match is decided — rings the final point. */
  decided?: boolean;
};

/**
 * The season-long flow of the captains' match: the running margin after every
 * hole of every round, on an axis that always spans the whole schedule (the way
 * the match page's graph always shows 18 holes), so it shows both the swings and
 * how far through the season they are.
 *
 * Same visual language as MatchFlowGraph — tinted halves, dashed All Square
 * line, leader-coloured segments — but built for up to 360 points: dots only
 * mark where each round finished, and faint dividers separate the rounds.
 */
function SeasonFlowGraph({
  series,
  totalRounds,
  colorA,
  colorB,
  photoA,
  photoB,
  peakA,
  peakB,
  decided = false,
}: SeasonFlowGraphProps) {
  const clipId = `season-flow-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const height = 150;
  const padding = { top: 20, right: 4, bottom: 25, left: 12 }; // left padding for the photos
  const chartWidth = 100 - padding.left - padding.right; // as percentage
  const chartHeight = height - padding.top - padding.bottom;
  const rounds = Math.max(1, totalRounds);
  const slots = rounds * HOLES_PER_ROUND;

  const maxLead = Math.max(3, ...series.map((p) => Math.abs(p.margin)));
  const centerY = padding.top + chartHeight / 2;
  const getX = (slot: number) => padding.left + (slot / slots) * chartWidth;
  const getY = (margin: number) => centerY - margin * ((chartHeight / 2 - 10) / maxLead);
  const pointColor = (margin: number) => (margin > 0 ? colorA : margin < 0 ? colorB : AS_GRAY);

  // A grid line per hole of lead until that would turn a blowout into stripes.
  const gridStep = maxLead <= 6 ? 1 : maxLead <= 15 ? 3 : 5;
  const gridMargins: number[] = [];
  for (let m = gridStep; m <= maxLead; m += gridStep) gridMargins.push(m, -m);

  // The line starts from All Square before round 1's first hole.
  const points = [{ x: 0, margin: 0 }, ...series];
  const current = series.length > 0 ? series[series.length - 1] : null;
  const roundEnds = series.filter((p, i) => series[i + 1]?.roundNumber !== p.roundNumber && p !== current);
  const labelRounds = Array.from({ length: rounds }, (_, i) => i + 1).filter(
    (r) => r === 1 || r % 5 === 0 || r === rounds
  );

  return (
    <div className="card p-4">
      <h3 className="text-sm font-bold uppercase text-muted-foreground tracking-wide text-center mb-3">
        Match Flow
      </h3>

      <svg width="100%" height={height} style={{ overflow: "visible" }} aria-hidden="true">
        <defs>
          <clipPath id={clipId} clipPathUnits="objectBoundingBox">
            <circle cx="0.5" cy="0.5" r="0.5" />
          </clipPath>
        </defs>

        {/* Background shading */}
        <rect
          x={`${padding.left}%`}
          y={padding.top}
          width={`${chartWidth}%`}
          height={chartHeight / 2}
          fill={colorA}
          fillOpacity={0.06}
        />
        <rect
          x={`${padding.left}%`}
          y={centerY}
          width={`${chartWidth}%`}
          height={chartHeight / 2}
          fill={colorB}
          fillOpacity={0.06}
        />

        {/* Center line (All Square) */}
        <line
          x1={`${padding.left}%`}
          y1={centerY}
          x2={`${padding.left + chartWidth}%`}
          y2={centerY}
          stroke={AS_GRAY}
          strokeWidth={1}
          strokeDasharray="4 4"
        />

        {gridMargins.map((m) => (
          <line
            key={`grid-${m}`}
            x1={`${padding.left}%`}
            y1={getY(m)}
            x2={`${padding.left + chartWidth}%`}
            y2={getY(m)}
            stroke="#e2e8f0"
            strokeWidth={0.5}
          />
        ))}

        {/* Round dividers */}
        {Array.from({ length: rounds - 1 }, (_, i) => (
          <line
            key={`round-${i}`}
            x1={`${getX((i + 1) * HOLES_PER_ROUND)}%`}
            y1={padding.top}
            x2={`${getX((i + 1) * HOLES_PER_ROUND)}%`}
            y2={padding.top + chartHeight}
            stroke="#e2e8f0"
            strokeWidth={0.75}
            strokeDasharray="2 3"
          />
        ))}

        {/* Y-axis player photos: A leads upward, B downward */}
        {photoA && (
          <image
            href={photoA}
            x={2}
            y={padding.top}
            width={24}
            height={24}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${clipId})`}
          />
        )}
        {photoB && (
          <image
            href={photoB}
            x={2}
            y={padding.top + chartHeight - 24}
            width={24}
            height={24}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${clipId})`}
          />
        )}
        <text x={14} y={centerY + 3} textAnchor="middle" fontSize={7} fill={AS_GRAY}>
          AS
        </text>

        {/* Line segments: gray only for All Square to All Square, otherwise the leader's colour */}
        {points.slice(1).map((p, i) => {
          const prev = points[i];
          const color =
            prev.margin === 0 && p.margin === 0 ? AS_GRAY : prev.margin > 0 || p.margin > 0 ? colorA : colorB;
          return (
            <line
              key={`seg-${p.x}`}
              x1={`${getX(prev.x)}%`}
              y1={getY(prev.margin)}
              x2={`${getX(p.x)}%`}
              y2={getY(p.margin)}
              stroke={color}
              strokeWidth={1.75}
              strokeLinecap="round"
            />
          );
        })}

        {/* Where each earlier round finished */}
        {roundEnds.map((p) => (
          <circle
            key={`end-${p.roundNumber}`}
            cx={`${getX(p.x)}%`}
            cy={getY(p.margin)}
            r={2.75}
            fill={pointColor(p.margin)}
            stroke="white"
            strokeWidth={1}
          />
        ))}

        {/* Where the match stands now */}
        {current && (
          <g>
            {decided && (
              <circle
                cx={`${getX(current.x)}%`}
                cy={getY(current.margin)}
                r={7.5}
                fill="none"
                stroke={pointColor(current.margin)}
                strokeWidth={1.5}
              />
            )}
            <circle
              cx={`${getX(current.x)}%`}
              cy={getY(current.margin)}
              r={4.5}
              fill={pointColor(current.margin)}
              stroke="white"
              strokeWidth={1.5}
            />
          </g>
        )}

        {/* Each side's biggest lead */}
        {peakA && (
          <text
            x={`${getX(peakA.x)}%`}
            y={getY(peakA.margin) - 8}
            textAnchor="middle"
            fontSize={8}
            fontWeight={600}
            fill={colorA}
          >
            {peakA.margin}UP
          </text>
        )}
        {peakB && (
          <text
            x={`${getX(peakB.x)}%`}
            y={getY(-peakB.margin) + 14}
            textAnchor="middle"
            fontSize={8}
            fontWeight={600}
            fill={colorB}
          >
            {peakB.margin}UP
          </text>
        )}

        {series.length === 0 && (
          <text
            x={`${padding.left + chartWidth / 2}%`}
            y={centerY - 10}
            textAnchor="middle"
            fontSize={9}
            fill={AS_GRAY}
          >
            No rounds played yet
          </text>
        )}

        {/* X-axis round labels */}
        {labelRounds.map((r) => (
          <text
            key={`label-${r}`}
            x={`${getX((r - 0.5) * HOLES_PER_ROUND)}%`}
            y={height - 5}
            textAnchor="middle"
            fontSize={9}
            fill={AS_GRAY}
          >
            R{r}
          </text>
        ))}
      </svg>
    </div>
  );
}

export default memo(SeasonFlowGraph);
