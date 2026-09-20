export function DemoNotice() {
  return <>
    <aside className="demo-notice" role="note" aria-label="Fictional demonstration notice">
      <strong>Fictional demonstration</strong>
      <span>Use the sample documents. Uploads are disabled. Do not enter confidential information. No agreements are signed here.</span>
    </aside>
    <style>{`
      .demo-notice { position:fixed; z-index:45; top:0; left:0; right:0; height:64px; padding:12px 24px; display:flex; align-items:center; justify-content:center; gap:16px; background:#fff8e8; border-bottom:1px solid #eadbb2; color:#624619; font-size:13px; line-height:1.45; }
      .demo-notice strong { white-space:nowrap; }
      .demo-mode .app-shell { padding-top:64px; }
      .demo-mode .sidebar { top:64px; }
      .demo-mode .topbar { top:64px; }
      @media(max-width:767px) {
        .demo-notice { height:104px; padding:12px 16px; flex-direction:column; align-items:flex-start; justify-content:center; gap:3px; font-size:12px; }
        .demo-mode .app-shell { padding-top:104px; }
        .demo-mode .topbar { top:104px; }
      }
    `}</style>
  </>;
}
