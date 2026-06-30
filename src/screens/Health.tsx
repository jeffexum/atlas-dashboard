import React from 'react';

const cardBase: React.CSSProperties = {
  background: 'var(--card)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-card)',
  border: '1px solid var(--line)',
};

const sleepDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const sleepValues = [6.5, 7.0, 8.0, 7.5, 6.0, 7.0, 7.4];
const sleepMax = 9;
const sleepGoal = 8;
const sleepChartH = 100;

const stepDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const stepValues = [7200, 9100, 8400, 10200, 6800, 8432, 9000];
const stepMax = 11000;
const stepGoal = 10000;
const stepChartH = 100;

function StatCard({
  eyebrow,
  value,
  deltaBg,
  deltaColor,
  delta,
  secondary,
}: {
  eyebrow: string;
  value: string;
  deltaBg: string;
  deltaColor: string;
  delta: string;
  secondary: string;
}) {
  return (
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
        {eyebrow}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 28,
            fontWeight: 600,
            color: 'var(--ink)',
            lineHeight: 1,
          }}
        >
          {value}
        </span>
        <span
          style={{
            padding: '2px 7px',
            borderRadius: 12,
            fontSize: 11,
            fontFamily: 'JetBrains Mono, monospace',
            background: deltaBg,
            color: deltaColor,
            fontWeight: 500,
          }}
        >
          {delta}
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--mut)' }}>{secondary}</div>
    </div>
  );
}

function BarChart({
  values,
  maxVal,
  goalVal,
  chartH,
  todayIdx,
  barColor,
  todayColor,
  dayLabels,
  goalLabel,
}: {
  values: number[];
  maxVal: number;
  goalVal: number;
  chartH: number;
  todayIdx: number;
  barColor: string;
  todayColor: string;
  dayLabels: string[];
  goalLabel: string;
}) {
  const goalPct = goalVal / maxVal;
  const goalY = chartH * (1 - goalPct);

  return (
    <div style={{ position: 'relative', marginTop: 8 }}>
      {/* Chart area */}
      <div
        style={{
          position: 'relative',
          height: chartH,
          display: 'flex',
          alignItems: 'flex-end',
          gap: 4,
          paddingRight: 32,
        }}
      >
        {/* Goal line */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 32,
            top: goalY,
            height: 1,
            borderTop: '1px dashed var(--p2)',
            zIndex: 2,
          }}
        />
        <span
          style={{
            position: 'absolute',
            right: 0,
            top: goalY - 8,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9,
            color: 'var(--p2)',
          }}
        >
          {goalLabel}
        </span>

        {values.map((v, i) => {
          const pct = v / maxVal;
          const h = Math.max(pct * chartH, 3);
          const isToday = i === todayIdx;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: h,
                background: isToday ? todayColor : barColor,
                opacity: isToday ? 1 : 0.7,
                borderRadius: '3px 3px 0 0',
                transition: 'height 0.3s ease',
              }}
            />
          );
        })}
      </div>

      {/* Day labels */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          paddingRight: 32,
          marginTop: 4,
        }}
      >
        {dayLabels.map((d, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              textAlign: 'center',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 9,
              color: i === todayIdx ? 'var(--ink)' : 'var(--faint)',
              fontWeight: i === todayIdx ? 600 : 400,
            }}
          >
            {d}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Health() {
  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Top row: 3 stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <StatCard
          eyebrow="Sleep"
          value="7h 24m"
          deltaBg="rgba(40,180,100,0.12)"
          deltaColor="oklch(0.45 0.12 162)"
          delta="+18 min"
          secondary="Goal: 8h · 93%"
        />
        <StatCard
          eyebrow="Steps"
          value="8,432"
          deltaBg="rgba(220,80,60,0.1)"
          deltaColor="var(--p1)"
          delta="−1,568"
          secondary="Goal: 10,000 · 84%"
        />
        <StatCard
          eyebrow="Active Mins"
          value="47 min"
          deltaBg="rgba(40,180,100,0.12)"
          deltaColor="oklch(0.45 0.12 162)"
          delta="+12 min"
          secondary="Goal: 30 min · ✓"
        />
      </div>

      {/* Bottom row: 2 bar chart cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Sleep chart */}
        <div style={{ ...cardBase, padding: '16px 18px' }}>
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10.5,
              color: 'var(--faint)',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              marginBottom: 2,
            }}
          >
            Sleep · Last 7 Days
          </div>
          <BarChart
            values={sleepValues}
            maxVal={sleepMax}
            goalVal={sleepGoal}
            chartH={sleepChartH}
            todayIdx={6}
            barColor="var(--blue)"
            todayColor="var(--accent)"
            dayLabels={sleepDays}
            goalLabel="goal"
          />
        </div>

        {/* Steps chart */}
        <div style={{ ...cardBase, padding: '16px 18px' }}>
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10.5,
              color: 'var(--faint)',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              marginBottom: 2,
            }}
          >
            Steps · Last 7 Days
          </div>
          <BarChart
            values={stepValues}
            maxVal={stepMax}
            goalVal={stepGoal}
            chartH={stepChartH}
            todayIdx={5}
            barColor="var(--warm)"
            todayColor="var(--accent)"
            dayLabels={stepDays}
            goalLabel="goal"
          />
        </div>
      </div>
    </div>
  );
}
