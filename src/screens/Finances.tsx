// Finances screen — placeholder until a real finance data source is connected.
// The previous version showed hardcoded demo numbers, which was misleading.

export default function Finances() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 16 }}>
      <div
        style={{
          background: 'var(--card)',
          borderRadius: 'var(--radius-card)',
          boxShadow: 'var(--shadow-card)',
          border: '1px solid var(--line)',
          padding: '48px 56px',
          textAlign: 'center',
          maxWidth: 420,
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 12 }}>💵</div>
        <div style={{ fontFamily: 'Newsreader, serif', fontSize: 20, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>
          Finances
        </div>
        <div style={{ fontSize: 13, color: 'var(--mut)', lineHeight: 1.6 }}>
          No finance source connected yet. Connect a bank, brokerage, or budgeting
          tool to see real balances, spending, and trends here.
        </div>
      </div>
    </div>
  );
}
