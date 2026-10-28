import type { GameMeta } from "../types";

export function GameSettings({
  meta,
  settings,
  onChange,
  disabled = false,
}: {
  meta: GameMeta;
  settings: Record<string, any>;
  onChange: (key: string, value: unknown) => void;
  disabled?: boolean;
}) {
  const current = (key: string, fallback: unknown) => (settings?.[key] !== undefined ? settings[key] : fallback);

  if (!meta.settings.length) return null;

  return (
    <div className={"game-settings " + (disabled ? "is-disabled" : "")}>
      {meta.settings.map((field) => {
        if (field.type === "select") {
          const value = current(field.key, field.default);
          return (
            <div className="setting-row" key={field.key}>
              <span className="setting-label">{field.label}</span>
              <div className="segmented">
                {field.options?.map((opt) => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    className={value === opt.value ? "active" : ""}
                    disabled={disabled}
                    onClick={() => onChange(field.key, opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          );
        }
        if (field.type === "multi") {
          const values: string[] = current(field.key, field.default) || [];
          const min = field.min || 1;
          return (
            <div className="setting-row" key={field.key}>
              <span className="setting-label">{field.label}</span>
              <div className="chip-row">
                {field.options?.map((opt) => {
                  const v = String(opt.value);
                  const on = values.includes(v);
                  return (
                    <button
                      key={v}
                      type="button"
                      className={"chip " + (on ? "active" : "")}
                      disabled={disabled || (on && values.length <= min)}
                      onClick={() => onChange(field.key, on ? values.filter((x) => x !== v) : [...values, v])}
                    >
                      {on ? "✓ " : ""}
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        }
        return (
          <label className="setting-row setting-text" key={field.key}>
            <span className="setting-label">{field.label}</span>
            <input
              value={String(current(field.key, field.default) ?? "")}
              maxLength={field.maxLength || 40}
              placeholder={field.placeholder}
              disabled={disabled}
              onChange={(e) => onChange(field.key, e.target.value)}
            />
          </label>
        );
      })}
    </div>
  );
}
