import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  buildJsonFindMirrorHtml,
  escapeHtml,
  findMatchStarts,
  focusSelectAndScroll,
} from '../utils/jsonFind.js';

/**
 * Large monospace editor with Find-in-text (highlight mirror layer), Prev/Next, Enter, case toggle — same UX as Settings JSON find.
 */
export default function JsonTextSearchField({
  value,
  onChange,
  readOnly = false,
  rows = 16,
  minHeight,
  fontSize = '0.82rem',
  lineHeight = 1.5,
  padding = '0.75rem',
  findLabel = 'Find in JSON',
  placeholder = 'Search…',
  resize = 'vertical',
}) {
  const [jsonFind, setJsonFind] = useState('');
  const [jsonFindCaseSensitive, setJsonFindCaseSensitive] = useState(false);
  const [jsonFindIndex, setJsonFindIndex] = useState(-1);
  const jsonTextareaRef = useRef(null);
  const jsonHighlightPreRef = useRef(null);
  const jsonFindInputRef = useRef(null);

  const jsonFindNeedle = useMemo(() => jsonFind.trim(), [jsonFind]);
  const jsonFindStarts = useMemo(
    () =>
      jsonFindNeedle ? findMatchStarts(value, jsonFindNeedle, jsonFindCaseSensitive) : [],
    [value, jsonFindNeedle, jsonFindCaseSensitive]
  );
  const jsonFindCount = jsonFindStarts.length;

  const jsonFindHighlightHtml = useMemo(() => {
    if (!jsonFindNeedle || !jsonFindStarts.length) {
      return escapeHtml(value);
    }
    const idx =
      jsonFindIndex >= 0 && jsonFindIndex < jsonFindStarts.length ? jsonFindIndex : 0;
    const start = jsonFindStarts[idx];
    return buildJsonFindMirrorHtml(value, start, jsonFindNeedle.length);
  }, [value, jsonFindNeedle, jsonFindStarts, jsonFindIndex]);

  const syncJsonHighlightScroll = useCallback(() => {
    const ta = jsonTextareaRef.current;
    const pre = jsonHighlightPreRef.current;
    if (!ta || !pre) return;
    pre.scrollTop = ta.scrollTop;
    pre.scrollLeft = ta.scrollLeft;
  }, []);

  useLayoutEffect(() => {
    syncJsonHighlightScroll();
  }, [value, jsonFindNeedle, jsonFindCaseSensitive, jsonFindIndex, jsonFindHighlightHtml, syncJsonHighlightScroll]);

  useEffect(() => {
    const ta = jsonTextareaRef.current;
    if (!jsonFindNeedle || !ta) {
      if (!jsonFindNeedle) setJsonFindIndex(-1);
      return;
    }
    if (!jsonFindStarts.length) {
      setJsonFindIndex(-1);
      return;
    }
    setJsonFindIndex(0);
    const start = jsonFindStarts[0];
    focusSelectAndScroll(ta, start, jsonFindNeedle.length, {
      focusEditor: false,
      onAfterScroll: syncJsonHighlightScroll,
    });
  }, [jsonFindNeedle, jsonFindStarts, syncJsonHighlightScroll]);

  const textareaDims =
    minHeight != null
      ? { minHeight: typeof minHeight === 'number' ? `${minHeight}px` : minHeight }
      : {};

  return (
    <>
      <style>{`
          .json-text-search-highlight-layer {
            scrollbar-width: none;
            -ms-overflow-style: none;
          }
          .json-text-search-highlight-layer::-webkit-scrollbar {
            display: none;
          }
          .json-text-search-highlight-layer .json-text-search-mark {
            background: rgba(45, 212, 191, 0.55);
            color: #f8fafc;
            border-radius: 2px;
            padding: 0 1px;
          }
          textarea.json-text-search-target::selection {
            background: rgba(45, 212, 191, 0.55) !important;
            color: #f8fafc !important;
          }
          textarea.json-text-search-target::-moz-selection {
            background: rgba(45, 212, 191, 0.55) !important;
            color: #f8fafc !important;
          }
        `}</style>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          alignItems: 'center',
          marginBottom: '0.65rem',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flex: '1 1 180px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{findLabel}</span>
          <input
            ref={jsonFindInputRef}
            className="field-input"
            type="search"
            value={jsonFind}
            placeholder={placeholder}
            onChange={(e) => {
              const v = e.target.value;
              setJsonFind(v);
              if (!v.trim()) setJsonFindIndex(-1);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (!jsonFindCount || !jsonFindNeedle) return;
                const ta = jsonTextareaRef.current;
                if (!ta) return;
                const nextIdx = e.shiftKey
                  ? jsonFindIndex < 0
                    ? jsonFindCount - 1
                    : (jsonFindIndex - 1 + jsonFindCount) % jsonFindCount
                  : jsonFindIndex < 0
                    ? 0
                    : (jsonFindIndex + 1) % jsonFindCount;
                setJsonFindIndex(nextIdx);
                focusSelectAndScroll(ta, jsonFindStarts[nextIdx], jsonFindNeedle.length, {
                  focusEditor: true,
                  onAfterScroll: syncJsonHighlightScroll,
                });
              }
              if (e.key === 'Escape') {
                setJsonFind('');
                setJsonFindIndex(-1);
                jsonTextareaRef.current?.focus();
              }
            }}
            style={{ flex: 1, minWidth: 120 }}
          />
        </label>
        <span
          style={{
            fontSize: '0.78rem',
            color: jsonFindNeedle && jsonFindCount === 0 ? 'var(--danger, #f87171)' : 'var(--muted)',
          }}
        >
          {jsonFindNeedle
            ? jsonFindCount === 0
              ? 'Not found'
              : `${(jsonFindIndex >= 0 ? jsonFindIndex : 0) + 1} / ${jsonFindCount}`
            : ''}
        </span>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            fontSize: '0.78rem',
            color: 'var(--muted)',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={jsonFindCaseSensitive}
            onChange={(e) => setJsonFindCaseSensitive(e.target.checked)}
          />
          Match case
        </label>
        <button
          type="button"
          className="btn-ghost"
          style={{ fontSize: '0.82rem', padding: '0.25rem 0.55rem' }}
          disabled={!jsonFindCount}
          onClick={() => {
            const nextIdx =
              jsonFindIndex < 0 ? jsonFindCount - 1 : (jsonFindIndex - 1 + jsonFindCount) % jsonFindCount;
            setJsonFindIndex(nextIdx);
            const ta = jsonTextareaRef.current;
            if (ta && jsonFindNeedle)
              focusSelectAndScroll(ta, jsonFindStarts[nextIdx], jsonFindNeedle.length, {
                focusEditor: true,
                onAfterScroll: syncJsonHighlightScroll,
              });
          }}
        >
          Prev
        </button>
        <button
          type="button"
          className="btn-ghost"
          style={{ fontSize: '0.82rem', padding: '0.25rem 0.55rem' }}
          disabled={!jsonFindCount}
          onClick={() => {
            const nextIdx = jsonFindIndex < 0 ? 0 : (jsonFindIndex + 1) % jsonFindCount;
            setJsonFindIndex(nextIdx);
            const ta = jsonTextareaRef.current;
            if (ta && jsonFindNeedle)
              focusSelectAndScroll(ta, jsonFindStarts[nextIdx], jsonFindNeedle.length, {
                focusEditor: true,
                onAfterScroll: syncJsonHighlightScroll,
              });
          }}
        >
          Next
        </button>
      </div>
      <div
        style={{
          position: 'relative',
          width: '100%',
          borderRadius: 10,
          border: '1px solid var(--border)',
          background: 'rgba(0,0,0,0.35)',
        }}
      >
        <pre
          ref={jsonHighlightPreRef}
          className="json-text-search-highlight-layer"
          // eslint-disable-next-line react/no-danger -- escaped text + single mark for find
          dangerouslySetInnerHTML={{ __html: jsonFindHighlightHtml }}
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            margin: 0,
            overflow: 'auto',
            fontFamily: 'var(--mono)',
            fontSize,
            lineHeight,
            padding,
            whiteSpace: 'pre',
            tabSize: 2,
            color: 'var(--text)',
            pointerEvents: 'none',
          }}
        />
        <textarea
          ref={jsonTextareaRef}
          className="json-text-search-target"
          readOnly={readOnly}
          value={value}
          onChange={(e) => !readOnly && onChange(e.target.value)}
          onScroll={(e) => {
            const ta = e.target;
            const pre = jsonHighlightPreRef.current;
            if (pre) {
              pre.scrollTop = ta.scrollTop;
              pre.scrollLeft = ta.scrollLeft;
            }
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
              e.preventDefault();
              jsonFindInputRef.current?.focus();
              jsonFindInputRef.current?.select();
            }
          }}
          rows={minHeight != null ? undefined : rows}
          spellCheck={false}
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'block',
            width: '100%',
            boxSizing: 'border-box',
            fontFamily: 'var(--mono)',
            fontSize,
            lineHeight,
            padding,
            margin: 0,
            border: 'none',
            borderRadius: 10,
            background: 'transparent',
            color: 'transparent',
            caretColor: 'var(--text)',
            whiteSpace: 'pre',
            overflow: 'auto',
            tabSize: 2,
            resize: readOnly ? 'none' : resize,
            ...textareaDims,
          }}
        />
      </div>
    </>
  );
}
