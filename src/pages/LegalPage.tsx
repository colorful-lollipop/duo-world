import { navigate } from "../lib/router";
import { Icon } from "../components/Icon";
import { LEGAL_PRIVACY, LEGAL_TERMS, type LegalDoc } from "../lib/legal";

export function LegalPage({ doc }: { doc: LegalDoc }) {
  const other = doc.id === "terms" ? LEGAL_PRIVACY : LEGAL_TERMS;
  return (
    <main className="legal-page">
      <header className="legal-head">
        <button className="icon-button" onClick={() => navigate("/")} aria-label="回首页">
          <Icon name="back" size={20} />
        </button>
        <div className="legal-title">
          <h1>{doc.title}</h1>
          <p className="small-print muted">更新于 {doc.updated}</p>
        </div>
        <button className="text-button" onClick={() => navigate("/" + other.id)}>
          {other.title} →
        </button>
      </header>
      <div className="legal-body">
        <p className="legal-intro">{doc.intro}</p>
        {doc.sections.map((s) => (
          <section key={s.heading}>
            <h2>{s.heading}</h2>
            {s.body.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </section>
        ))}
        <p className="legal-foot">
          返回 <button className="text-button" onClick={() => navigate("/")}>首页</button>
        </p>
      </div>
    </main>
  );
}
