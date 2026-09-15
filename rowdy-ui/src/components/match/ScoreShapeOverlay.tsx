interface ScoreShapeOverlayProps {
  value: number | "" | null | undefined;
  par: number;
  /** Post-match holes draw the shapes in the muted divider colour. */
  muted?: boolean;
}

/**
 * Birdie circles and bogey squares over a score — one ring per stroke under or
 * over par, the way they're drawn on a paper card. Shared by the editable
 * ScoreInputCell and the read-only captains' match card so the two can't drift.
 * Render it inside a `relative` box the size of the score cell.
 */
export function ScoreShapeOverlay({ value, par, muted = false }: ScoreShapeOverlayProps) {
  if (typeof value !== "number" || !par) return null;

  // Number of circles: 1 for birdie (1 under), 2 for eagle (2 under), etc.
  const circleCount = Math.max(0, par - value);
  // Number of squares: 1 for bogey (1 over), 2 for double bogey (2 over), etc.
  const squareCount = Math.max(0, value - par);
  const borderColor = muted ? 'var(--divider)' : 'var(--text-primary)';

  if (circleCount > 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {/* Outer circles for eagle+ (2+ under par) */}
        {circleCount >= 2 && (
          <div
            className="absolute rounded-full"
            style={{ width: '32px', height: '32px', borderWidth: '1px', borderColor, borderStyle: 'solid' }}
          />
        )}
        {circleCount >= 3 && (
          <div
            className="absolute rounded-full"
            style={{ width: '24px', height: '24px', borderWidth: '1px', borderColor, borderStyle: 'solid' }}
          />
        )}
        {circleCount >= 4 && (
          <div
            className="absolute rounded-full"
            style={{ width: '20px', height: '20px', borderWidth: '1px', borderColor, borderStyle: 'solid' }}
          />
        )}
        {/* Inner circle for birdie (always shown when under par) */}
        <div
          className="absolute rounded-full"
          style={{ width: '28px', height: '28px', borderWidth: '1px', borderColor, borderStyle: 'solid' }}
        />
      </div>
    );
  }

  if (squareCount > 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {/* Outer squares for double bogey+ (2+ over par) */}
        {squareCount >= 2 && (
          <div
            className="absolute"
            style={{ width: '32px', height: '32px', borderWidth: '1px', borderColor, borderStyle: 'solid', borderRadius: '3px' }}
          />
        )}
        {squareCount >= 3 && (
          <div
            className="absolute"
            style={{ width: '24px', height: '24px', borderWidth: '1px', borderColor, borderStyle: 'solid', borderRadius: '3px' }}
          />
        )}
        {squareCount >= 4 && (
          <div
            className="absolute"
            style={{ width: '20px', height: '20px', borderWidth: '1px', borderColor, borderStyle: 'solid', borderRadius: '3px' }}
          />
        )}
        {/* Inner square for bogey (always shown when over par) */}
        <div
          className="absolute"
          style={{ width: '28px', height: '28px', borderWidth: '1px', borderColor, borderStyle: 'solid', borderRadius: '3px' }}
        />
      </div>
    );
  }

  return null;
}
