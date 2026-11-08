import { useEffect, useState } from "react";
import { BLOCKS, blockDef, newStep, type FieldDef } from "../scenarios/blocks";
import type { Scenario, Step, StepType } from "../scenarios/types";

interface Props {
  scenarios: Scenario[];
  onSave: (s: Scenario) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRun: (s: Scenario, input: string) => Promise<void>;
  onClose: () => void;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** Копия шагов с новыми id (для «дублировать»). */
const reId = (s: Step): Step =>
  s.type === "if"
    ? { ...s, id: crypto.randomUUID(), then: s.then.map(reId), else: s.else.map(reId) }
    : { ...s, id: crypto.randomUUID() };

export function ScenarioEditor({ scenarios, onSave, onDelete, onRun, onClose }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(scenarios[0]?.id ?? null);
  const [draft, setDraft] = useState<Scenario | null>(null);
  const [dirty, setDirty] = useState(false);
  const [phraseInput, setPhraseInput] = useState("");
  const [testInput, setTestInput] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const s = scenarios.find((x) => x.id === selectedId);
    setDraft(s ? clone(s) : null);
    setDirty(false);
    setStatus("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const update = (patch: Partial<Scenario>) => {
    if (!draft) return;
    setDraft({ ...draft, ...patch });
    setDirty(true);
  };

  const confirmLeave = () => !dirty || confirm("Есть несохранённые изменения. Отбросить их?");

  const select = (id: string) => {
    if (id !== selectedId && confirmLeave()) setSelectedId(id);
  };

  const create = async () => {
    if (!confirmLeave()) return;
    const s: Scenario = {
      id: crypto.randomUUID(),
      name: "Новый сценарий",
      enabled: true,
      phrases: [],
      steps: [newStep("say")],
      updated_at: Date.now(),
    };
    await onSave(s);
    setSelectedId(s.id);
    setDraft(clone(s));
    setDirty(false);
  };

  const save = async () => {
    if (!draft) return;
    await onSave({ ...draft, name: draft.name.trim() || "Без названия", updated_at: Date.now() });
    setDirty(false);
    setStatus("Сохранено");
  };

  const addPhrase = () => {
    const p = phraseInput.trim();
    if (!draft || !p || draft.phrases.includes(p)) return;
    update({ phrases: [...draft.phrases, p] });
    setPhraseInput("");
  };

  const run = async () => {
    if (!draft) return;
    setStatus("Выполняется…");
    try {
      await onRun(draft, testInput);
      setStatus("Готово ✓");
    } catch (e) {
      setStatus(`Ошибка: ${e instanceof Error ? e.message : e}`);
    }
  };

  return (
    <div className="overlay" onClick={() => confirmLeave() && onClose()}>
      <div className="glass panel editor" onClick={(e) => e.stopPropagation()}>
        <div className="editor__head">
          <h2>Блоки команд</h2>
          <button className="btn ghost" onClick={() => confirmLeave() && onClose()}>
            Закрыть
          </button>
        </div>

        <div className="editor__body">
          <aside className="editor__list">
            <button className="btn" onClick={create}>
              + Новый сценарий
            </button>
            {scenarios.map((s) => (
              <div
                key={s.id}
                className={`conv ${s.id === selectedId ? "conv--active" : ""} ${s.enabled ? "" : "conv--off"}`}
                onClick={() => select(s.id)}
              >
                <span className="conv__title">{s.name}</span>
                <span className="muted small">{s.phrases.length ? `${s.phrases.length} фр.` : ""}</span>
              </div>
            ))}
          </aside>

          {draft ? (
            <section className="editor__main">
              <div className="row">
                <input
                  className="editor__name"
                  value={draft.name}
                  onChange={(e) => update({ name: e.target.value })}
                />
                <label className="row small">
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(e) => update({ enabled: e.target.checked })}
                  />
                  Включён
                </label>
              </div>

              <div className="field">
                <span className="muted small">
                  Фразы-триггеры (голосом или текстом). «*» — любая часть фразы, она попадёт в {"{{ввод}}"}.
                </span>
                <div className="chips">
                  {draft.phrases.map((p) => (
                    <span key={p} className="chip">
                      {p}
                      <button onClick={() => update({ phrases: draft.phrases.filter((x) => x !== p) })}>✕</button>
                    </span>
                  ))}
                  <input
                    value={phraseInput}
                    placeholder="например: открой почту"
                    onChange={(e) => setPhraseInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addPhrase()}
                    onBlur={addPhrase}
                  />
                </div>
              </div>

              <StepList steps={draft.steps} onChange={(steps) => update({ steps })} />

              <p className="muted small hint">
                Переменные: {"{{ввод}}"}, {"{{время}}"}, {"{{дата}}"}, {"{{деньнедели}}"} и любые сохранённые блоками
                (поле «Сохранить в»).
              </p>

              <div className="editor__footer">
                <input
                  value={testInput}
                  placeholder="{{ввод}} для проверки"
                  onChange={(e) => setTestInput(e.target.value)}
                />
                <button className="btn ghost" onClick={run}>
                  ▶ Проверить
                </button>
                <button
                  className="btn ghost danger"
                  onClick={async () => {
                    if (!confirm(`Удалить сценарий «${draft.name}»?`)) return;
                    await onDelete(draft.id);
                    setDirty(false);
                    setSelectedId(scenarios.find((s) => s.id !== draft.id)?.id ?? null);
                  }}
                >
                  Удалить
                </button>
                <button className="btn" onClick={save} disabled={!dirty}>
                  Сохранить
                </button>
              </div>
              {status && <div className="small muted">{status}</div>}
            </section>
          ) : (
            <section className="editor__main empty">Создайте первый сценарий</section>
          )}
        </div>
      </div>
    </div>
  );
}

function StepList({ steps, onChange }: { steps: Step[]; onChange: (s: Step[]) => void }) {
  const [palette, setPalette] = useState(false);

  const set = (i: number, s: Step) => onChange(steps.map((x, j) => (j === i ? s : x)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    const copy = steps.slice();
    [copy[i], copy[j]] = [copy[j], copy[i]];
    onChange(copy);
  };
  const add = (type: StepType) => {
    onChange([...steps, newStep(type)]);
    setPalette(false);
  };

  return (
    <div className="steps">
      {steps.map((s, i) => (
        <StepCard
          key={s.id}
          step={s}
          onChange={(v) => set(i, v)}
          onUp={() => move(i, -1)}
          onDown={() => move(i, 1)}
          onDuplicate={() => onChange([...steps.slice(0, i + 1), reId(s), ...steps.slice(i + 1)])}
          onDelete={() => onChange(steps.filter((_, j) => j !== i))}
          first={i === 0}
          last={i === steps.length - 1}
        />
      ))}
      {palette ? (
        <div className="palette">
          {(["Ответ", "Действия", "Данные", "Логика"] as const).map((cat) => (
            <div key={cat} className="palette__group">
              <span className="muted small">{cat}</span>
              <div className="palette__items">
                {BLOCKS.filter((b) => b.category === cat).map((b) => (
                  <button key={b.type} style={{ borderColor: b.color }} onClick={() => add(b.type)}>
                    {b.icon} {b.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button className="btn ghost" onClick={() => setPalette(false)}>
            Отмена
          </button>
        </div>
      ) : (
        <button className="add-block" onClick={() => setPalette(true)}>
          + Добавить блок
        </button>
      )}
    </div>
  );
}

interface CardProps {
  step: Step;
  first: boolean;
  last: boolean;
  onChange: (s: Step) => void;
  onUp: () => void;
  onDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function StepCard({ step, first, last, onChange, onUp, onDown, onDuplicate, onDelete }: CardProps) {
  const def = blockDef(step.type);
  const values = step as unknown as Record<string, unknown>;
  const setField = (key: string, v: unknown) => onChange({ ...step, [key]: v } as Step);

  return (
    <div className="block" style={{ ["--block" as string]: def.color }}>
      <div className="block__head">
        <span className="block__title">
          {def.icon} {def.label}
        </span>
        <span className="block__tools">
          <button title="Выше" disabled={first} onClick={onUp}>↑</button>
          <button title="Ниже" disabled={last} onClick={onDown}>↓</button>
          <button title="Дублировать" onClick={onDuplicate}>⧉</button>
          <button title="Удалить" onClick={onDelete}>✕</button>
        </span>
      </div>

      {def.fields.length > 0 && (
        <div className="block__fields">
          {def.fields.map((f) => (
            <Field key={f.key} def={f} value={values[f.key]} onChange={(v) => setField(f.key, v)} />
          ))}
        </div>
      )}

      {step.type === "if" && (
        <div className="block__branches">
          <div className="branch">
            <span className="branch__label">Тогда</span>
            <StepList steps={step.then} onChange={(then) => onChange({ ...step, then })} />
          </div>
          <div className="branch">
            <span className="branch__label">Иначе</span>
            <StepList steps={step.else} onChange={(els) => onChange({ ...step, else: els })} />
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ def, value, onChange }: { def: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  if (def.kind === "checkbox") {
    return (
      <label className="row small field--check">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        {def.label}
      </label>
    );
  }
  return (
    <label className={`field ${def.kind === "textarea" ? "field--wide" : ""}`}>
      <span className="muted small">{def.label}</span>
      {def.kind === "textarea" ? (
        <textarea rows={2} value={String(value ?? "")} placeholder={def.placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : def.kind === "select" ? (
        <select value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {def.options!.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={def.kind === "number" ? "number" : "text"}
          value={String(value ?? "")}
          placeholder={def.placeholder}
          onChange={(e) => onChange(def.kind === "number" ? Number(e.target.value) : e.target.value)}
        />
      )}
    </label>
  );
}
