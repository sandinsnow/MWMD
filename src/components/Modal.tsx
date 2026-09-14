import { useRef, useState, type ReactElement } from "react";

interface PromptOpts {
  title: string;
  label?: string;
  initial?: string;
  okText?: string;
  cancelText?: string;
}

interface ConfirmOpts {
  title: string;
  message?: string;
  okText?: string;
  cancelText?: string;
  danger?: boolean;
}

export function useModal() {
  const [state, setState] = useState<
    { kind: "prompt"; opts: PromptOpts } | { kind: "confirm"; opts: ConfirmOpts } | null
  >(null);
  const [value, setValue] = useState("");
  const resolveRef = useRef<((v: any) => void) | null>(null);

  const close = (v: any) => {
    resolveRef.current?.(v);
    resolveRef.current = null;
    setState(null);
  };

  const prompt = (opts: PromptOpts): Promise<string | null> => {
    setValue(opts.initial ?? "");
    setState({ kind: "prompt", opts });
    return new Promise((res) => {
      resolveRef.current = res;
    });
  };

  const confirm = (opts: ConfirmOpts): Promise<boolean> => {
    setState({ kind: "confirm", opts });
    return new Promise((res) => {
      resolveRef.current = res;
    });
  };

  let element: ReactElement | null = null;
  if (state) {
    const isPrompt = state.kind === "prompt";
    const okText = state.opts.okText ?? "确定";
    const cancelText = state.opts.cancelText ?? "取消";
    const okDisabled = isPrompt && !value.trim();
    const onOk = () => close(isPrompt ? (value.trim() || null) : true);
    const onCancel = () => close(isPrompt ? null : false);

    element = (
      <div className="modal-mask" onMouseDown={onCancel}>
        <div className="modal modal-sm" onMouseDown={(e) => e.stopPropagation()}>
          <h2>{state.opts.title}</h2>
          {isPrompt ? (
            <>
              {(state.opts as PromptOpts).label && (
                <p className="modal-label">{(state.opts as PromptOpts).label}</p>
              )}
              <input
                autoFocus
                className="modal-input"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !okDisabled) onOk();
                  if (e.key === "Escape") onCancel();
                }}
              />
            </>
          ) : (
            (state.opts as ConfirmOpts).message && (
              <p className="modal-label">{(state.opts as ConfirmOpts).message}</p>
            )
          )}
          <div className="modal-actions">
            <button className="ghost" onClick={onCancel}>
              {cancelText}
            </button>
            <button
              className={(state.kind === "confirm" && (state.opts as ConfirmOpts).danger) ? "danger" : "primary"}
              onClick={onOk}
              disabled={okDisabled}
            >
              {okText}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return { prompt, confirm, element };
}
