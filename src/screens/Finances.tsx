import React from 'react';

const cardBase: React.CSSProperties = {
  background: 'var(--card)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-card)',
  border: '1px solid var(--line)',
};

interface Transaction {
  merchant: string;
  date: string;
  category: string;
  amount: string;
  positive: boolean;
}

const transactions: Transaction[] = [
  { merchant: 'Whole Foods Market', date: 'Jun 28', category: 'Food', amount: '-$67.40', positive: false },
  { merchant: 'Netflix', date: 'Jun 27', category: 'Leisure', amount: '-$15.99', positive: false },
  { merchant: 'Uber', date: 'Jun 27', category: 'Transport', amount: '-$23.50', positive: false },
  { merchant: 'Salary deposit', date: 'Jun 25', category: 'Income', amount: '+$4,200.00', positive: true },
  { merchant: 'Equinox', date: 'Jun 24', category: 'Health', amount: '-$89.00', positive: false },
];

interface SpendCategory {
  name: string;
  amount: number;
  budget: number;
  color: string;
}

const spendCategories: SpendCategory[] = [
  { name: 'Housing', amount: 1450, budget: 1500, color: 'var(--blue)' },
  { name: 'Food', amount: 380, budget: 500, color: 'var(--accent)' },
  { name: 'Transport', amount: 124, budget: 200, color: 'var(--warm)' },
  { name: 'Leisure', amount: 89, budget: 300, color: 'var(--violet)' },
];

const netWorthSegments = [
  { label: 'Retirement', pct: 0.55, color: 'var(--blue)' },
  { label: 'Brokerage', pct: 0.28, color: 'var(--accent)' },
  { label: 'Savings', pct: 0.17, color: 'var(--p2)' },
];

function CategoryChip({ label }: { label: string }) {
  const colorMap: Record<string, { bg: string; color: string }> = {
    Food: { bg: 'rgba(40,140,100,0.12)', color: 'var(--accent)' },
    Leisure: { bg: 'rgba(80,60,180,0.12)', color: 'var(--violet)' },
    Transport: { bg: 'rgba(80,90,170,0.12)', color: 'var(--warm)' },
    Income: { bg: 'rgba(40,180,100,0.12)', color: 'oklch(0.45 0.12 162)' },
    Health: { bg: 'rgba(80,120,210,0.12)', color: 'var(--blue)' },
  };
  const c = colorMap[label] || { bg: 'var(--line2)', color: 'var(--mut)' };
  return (
    <span
      style={{
        padding: '2px 6px',
        borderRadius: 'var(--radius-chip)',
        fontSize: 10,
        fontFamily: 'JetBrains Mono, monospace',
        background: c.bg,
        color: c.color,
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

export default function Finances() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 16,
        padding: 16,
        alignItems: 'start',
      }}
    >
      {/* Left column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Net Worth card */}
        <div style={{ ...cardBase, padding: '18px 20px' }}>
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10.5,
              color: 'var(--faint)',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              marginBottom: 8,
            }}
          >
            Net Worth
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 30,
                fontWeight: 600,
                color: 'var(--ink)',
                lineHeight: 1,
              }}
            >
              $148,200
            </span>
            <span
              style={{
                padding: '2px 7px',
                borderRadius: 12,
                fontSize: 11,
                fontFamily: 'JetBrains Mono, monospace',
                background: 'rgba(40,180,100,0.12)',
                color: 'oklch(0.45 0.12 162)',
                fontWeight: 500,
              }}
            >
              +1.8% ↑ this month
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--mut)', marginBottom: 16 }}>
            across 4 accounts · updated today
          </div>

          {/* Segmented bar */}
          <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 }}>
            {netWorthSegments.map((seg) => (
              <div
                key={seg.label}
                style={{
                  flex: seg.pct,
                  background: seg.color,
                  borderRadius: 3,
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            {netWorthSegments.map((seg) => (
              <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: seg.color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 11, color: 'var(--mut)' }}>
                  {seg.label} {Math.round(seg.pct * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Spending card */}
        <div style={{ ...cardBase, padding: 16 }}>
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10.5,
              color: 'var(--faint)',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              marginBottom: 10,
            }}
          >
            Spending · June
          </div>

          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>$2,043</span>
            <span style={{ fontSize: 12, color: 'var(--mut)' }}>of $2,500 budget</span>
          </div>

          {/* Overall progress bar */}
          <div
            style={{
              width: '100%',
              height: 6,
              background: 'var(--line2)',
              borderRadius: 3,
              overflow: 'hidden',
              marginBottom: 16,
            }}
          >
            <div
              style={{
                width: `${(2043 / 2500) * 100}%`,
                height: '100%',
                background: 'var(--accent)',
                borderRadius: 3,
              }}
            />
          </div>

          {/* Category rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {spendCategories.map((cat) => {
              const pct = cat.amount / cat.budget;
              return (
                <div key={cat.name}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: cat.color,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{ fontSize: 13, color: 'var(--ink)', flex: 1, fontWeight: 500 }}
                    >
                      {cat.name}
                    </span>
                    <span
                      style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: 12,
                        color: 'var(--ink2)',
                      }}
                    >
                      ${cat.amount.toLocaleString()}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--mut)', minWidth: 36 }}>
                      / ${cat.budget.toLocaleString()}
                    </span>
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: 3,
                      background: 'var(--line2)',
                      borderRadius: 2,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(pct * 100, 100)}%`,
                        height: '100%',
                        background: cat.color,
                        borderRadius: 2,
                        opacity: pct > 0.9 ? 1 : 0.75,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Recent Transactions */}
        <div style={{ ...cardBase, padding: '16px 0' }}>
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10.5,
              color: 'var(--faint)',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              padding: '0 16px 10px',
              borderBottom: '1px solid var(--line2)',
            }}
          >
            Recent Transactions
          </div>
          <div>
            {transactions.map((tx, i) => (
              <div key={i}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '11px 16px',
                    gap: 10,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--ink)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        marginBottom: 3,
                      }}
                    >
                      {tx.merchant}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: 11,
                          color: 'var(--faint)',
                        }}
                      >
                        {tx.date}
                      </span>
                      <CategoryChip label={tx.category} />
                    </div>
                  </div>
                  <span
                    style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: 13,
                      fontWeight: 600,
                      color: tx.positive ? 'oklch(0.45 0.12 162)' : 'var(--p1)',
                      flexShrink: 0,
                    }}
                  >
                    {tx.amount}
                  </span>
                </div>
                {i < transactions.length - 1 && (
                  <div
                    style={{
                      height: 1,
                      background: 'var(--line2)',
                      margin: '0 16px',
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Scout callout */}
        <div
          style={{
            background: 'var(--accentbg)',
            borderRadius: 'var(--radius-card)',
            borderLeft: '3px solid var(--accent)',
            padding: '14px 16px',
          }}
        >
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11,
              color: 'var(--accent)',
              fontWeight: 600,
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ fontSize: 14 }}>◎</span>
            Scout
          </div>
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.6,
              color: 'var(--ink2)',
              margin: '0 0 12px 0',
            }}
          >
            Your food spending is 24% under budget this month. At this rate, you'll save an extra
            $120. Consider moving it to your emergency fund.
          </p>
          <button
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontSize: 12,
              color: 'var(--accent)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontWeight: 600,
            }}
          >
            Review plan →
          </button>
        </div>
      </div>
    </div>
  );
}
