import { useEffect, useMemo, useRef, useState } from 'react';
import { useShortcut } from '@ui-sdk/react/shortcuts';
import { Tabs, TabsList, TabsPanel, TabsTab } from '@ui-sdk/react/tabs';
import { Button } from '@ui-sdk/react/button';
import type { AnnotationMode, DictFile, MetaIndex, PersistedState } from './types';
import { buildAnnotationBlocks } from './lib/annotations';
import { DEFAULT_VERSION, loadDict, loadMeta, loadOfficialConf } from './lib/dict';
import { parseConf, decodeConfBytes } from './lib/parseConf';
import { analyze } from './lib/analyze';
import { evaluateRisks } from './lib/risks';
import { describeDirective } from './lib/describe';
import { replaceSecrets } from './lib/secrets';
import { insertDirective } from './lib/search';
import { indexOfficialLines } from './lib/official';
import { normalizeConfig } from './lib/normalizeConf';
import { exportOriginal, exportWithComments, exportWithSecrets, suggestFileName } from './lib/exportConf';
import { loadState, saveState } from './lib/persistence';
import { aliases } from './data/aliases';
import zhNotes from './data/zh-notes.json';
import { Toolbar } from './components/Toolbar';
import { SummaryBar } from './components/SummaryBar';
import { ComparisonList } from './components/ComparisonList';
import { Editor } from './components/Editor';
import { OfficialPane } from './components/OfficialPane';
import { DetailPanel } from './components/DetailPanel';
import { SearchPalette } from './components/SearchPalette';
import { EmptyState } from './components/EmptyState';
import type { ExportKind } from './components/ExportMenu';

const notes = zhNotes as Record<string, string>;

export default function App() {
  const [initial] = useState<PersistedState | null>(() => loadState());
  const [line, setLine] = useState(initial?.line ?? DEFAULT_VERSION);
  const [text, setText] = useState(initial?.text ?? '');
  const [onlyDiff, setOnlyDiff] = useState(initial?.onlyDiff ?? false);
  const [showZh, setShowZh] = useState(initial?.showZh ?? true);
  const [annotationMode, setAnnotationMode] = useState<AnnotationMode>(initial?.annotationMode ?? 'missing');
  const [bottomCollapsed, setBottomCollapsed] = useState(initial?.bottomCollapsed ?? false);

  const [dict, setDict] = useState<DictFile | null>(null);
  const [meta, setMeta] = useState<MetaIndex>({});
  const [official, setOfficial] = useState<{ text: string; tag: string; publishedAt?: string } | null>(null);
  const [dictError, setDictError] = useState<string | null>(null);
  const [cursorLine, setCursorLine] = useState(1);
  const [jump, setJump] = useState<{ lineNo: number; nonce: number } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [vault, setVault] = useState<Map<string, string>>(new Map());
  const [notice, setNotice] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setDict(null);
    setOfficial(null);
    Promise.all([loadDict(line), loadMeta(), loadOfficialConf(line)])
      .then(([nextDict, nextMeta, nextOfficial]) => {
        if (cancelled) return;
        setDict(nextDict);
        setMeta(nextMeta);
        setOfficial({ text: nextOfficial, tag: nextDict.tag, publishedAt: nextDict.publishedAt });
        setDictError(null);
      })
      .catch((error: Error) => {
        if (!cancelled) setDictError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [line]);

  const parsed = useMemo(() => parseConf(text), [text]);
  const analysis = useMemo(
    () => (dict ? analyze(parsed, dict, meta, line, aliases) : null),
    [parsed, dict, meta, line],
  );
  const warnings = useMemo(() => (dict && analysis ? evaluateRisks(analysis, dict) : []), [dict, analysis]);
  const blocks = useMemo(
    () => (analysis ? buildAnnotationBlocks(analysis.lines, analysis.byLine, annotationMode, onlyDiff) : []),
    [analysis, annotationMode, onlyDiff],
  );
  const officialIndex = useMemo(() => (official ? indexOfficialLines(official.text) : new Map()), [official]);

  const officialHighlights = useMemo(() => {
    const lines = new Set<number>();
    if (!analysis) return lines;
    for (const [lineNo, entry] of analysis.byLine) {
      if (entry.status !== 'changed' && entry.status !== 'unknown' && entry.status !== 'newer' && entry.status !== 'duplicate') {
        continue;
      }
      const name = analysis.lines[lineNo - 1]?.name;
      const target = name ? officialIndex.get(name) : undefined;
      if (target) lines.add(target);
    }
    return lines;
  }, [analysis, officialIndex]);

  const cursorAnalysis = analysis?.byLine.get(cursorLine);
  const cursorArgs = parsed.find((item) => item.lineNo === cursorLine)?.args ?? [];
  const view = useMemo(
    () => describeDirective(cursorAnalysis?.doc, cursorAnalysis, notes, showZh, cursorArgs),
    [cursorAnalysis, showZh, cursorArgs],
  );

  const officialFocus = useMemo(() => {
    if (!cursorAnalysis?.doc) return null;
    const lineNo = officialIndex.get(cursorAnalysis.doc.name);
    return lineNo ? { lineNo, nonce: cursorLine } : null;
  }, [cursorAnalysis, officialIndex, cursorLine]);

  useEffect(() => {
    if (!dict) return;
    try {
      saveState({ v: 1, line, text, annotationMode, onlyDiff, showZh, bottomCollapsed });
    } catch {
      // 手写密码时不落盘，避免明文进 localStorage
    }
  }, [dict, line, text, annotationMode, onlyDiff, showZh, bottomCollapsed]);

  useShortcut('mod+k', () => setSearchOpen(true), { description: '搜索配置项' });

  const importText = (raw: string, source: string | null, normalize = true) => {
    const { text: replaced, vault: nextVault, found } = replaceSecrets(raw);
    let next = replaced;
    let sortNote = '';
    if (normalize && officialIndex.size > 0) {
      const normalized = normalizeConfig(replaced, officialIndex);
      next = normalized.text;
      sortNote = `已移除 ${normalized.droppedComments} 行注释，并按官方顺序重排 ${normalized.kept} 行配置`;
      if (normalized.unknown.length) sortNote += `；${normalized.unknown.length} 行无法识别的指令排在末尾`;
      sortNote += '。';
    }
    setText(next);
    setVault(nextVault);
    setFileName(source);
    setCursorLine(1);
    setNotice([sortNote, found ? `已把 ${found} 处密码替换为 \${env_*} 占位符。` : ''].filter(Boolean).join(' '));
  };

  const loadOfficialIntoEditor = () => {
    if (!official) return;
    importText(official.text, `redis-${line}.conf`, false);
  };

  const readFile = async (file: File) => {
    const { text: decoded, warning } = decodeConfBytes(await file.arrayBuffer());
    if (warning) setNotice(warning);
    importText(decoded, file.name);
  };

  const jumpToLine = (lineNo: number) => {
    setCursorLine(lineNo);
    setJump({ lineNo, nonce: Date.now() });
  };

  const handleJumpKind = (kind: 'changed' | 'unknown' | 'removed' | 'newer' | 'duplicate' | 'missing') => {
    if (kind === 'missing') {
      setSearchOpen(true);
      return;
    }
    if (!analysis) return;
    for (const [lineNo, entry] of analysis.byLine) {
      if (entry.status === kind) {
        jumpToLine(lineNo);
        return;
      }
    }
  };

  const handleInsertDefault = () => {
    const doc = cursorAnalysis?.doc;
    if (!doc || doc.defaultValue === null) return;
    const rows = text.split('\n');
    const current = rows[cursorLine - 1] ?? '';
    const indent = /^\s*/.exec(current)?.[0] ?? '';
    rows[cursorLine - 1] = `${indent}${doc.name} ${doc.defaultValue}`;
    setText(rows.join('\n'));
  };

  const handleCommitComment = (lineNo: number, comment: string[]) => {
    const rows = text.split('\n');
    const block = comment.map((row) => (row ? `# ${row}` : '#'));
    rows.splice(lineNo - 1, 0, ...block);
    setText(rows.join('\n'));
  };

  const handlePick = (name: string, exists: boolean) => {
    if (!dict || !analysis) return;
    if (exists) {
      const lineNo = analysis.firstLineOf.get(name);
      if (lineNo) jumpToLine(lineNo);
      return;
    }
    const doc = dict.directives.find((directive) => directive.name === name);
    if (!doc) return;
    const result = insertDirective(text, parsed, doc, dict);
    setText(result.text);
    jumpToLine(result.lineNo);
  };

  const download = (content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = suggestFileName(fileName);
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = (kind: ExportKind) => {
    if (!dict) return;
    if (kind === 'original') download(exportOriginal(text));
    else if (kind === 'comments') download(exportWithComments(parsed, dict));
    else {
      if (!vault.size) return;
      const ok = window.confirm('导出的文件将包含明文密码，确认继续？');
      if (ok) download(exportWithSecrets(text, vault));
    }
  };

  return (
    <main
      className="app"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files?.[0];
        if (file) void readFile(file);
      }}
    >
      <Toolbar
        line={line}
        onLineChange={setLine}
        annotationMode={annotationMode}
        onAnnotationModeChange={setAnnotationMode}
        onlyDiff={onlyDiff}
        onOnlyDiffChange={setOnlyDiff}
        showZh={showZh}
        onShowZhChange={setShowZh}
        onUpload={(file) => void readFile(file)}
        onLoadOfficial={loadOfficialIntoEditor}
        onClear={() => {
          setText('');
          setVault(new Map());
          setFileName(null);
          setNotice(null);
          setCursorLine(1);
        }}
        onOpenSearch={() => setSearchOpen(true)}
        onExport={handleExport}
        canRestoreSecrets={vault.size > 0}
      />

      {analysis ? (
        <SummaryBar
          counts={analysis.counts}
          missing={analysis.missing}
          warningCount={warnings.length}
          onJump={handleJumpKind}
        />
      ) : null}

      {notice ? <div className="banner">{notice}</div> : null}
      {dictError ? <div className="banner">字典加载失败：{dictError}</div> : null}

      <div className="app-body">
        <div className="workspace">
          <section className="pane" aria-label="你的配置">
            <div className="pane-head">
              <strong>你的配置</strong>
              {analysis ? <span>{parsed.length} 行 · 已改 {analysis.counts.changed}</span> : null}
              <span className="spacer" />
              <span className="pane-hint">可直接编辑；导入文件时会去注释、按官方顺序重排</span>
            </div>
            {text.trim() === '' ? (
              <EmptyState onOfficial={loadOfficialIntoEditor} onUpload={() => fileInput.current?.click()} />
            ) : analysis ? (
              <Editor
                value={text}
                result={analysis}
                blocks={blocks}
                onlyDiff={onlyDiff}
                jumpTo={jump}
                onChange={setText}
                onCursorLine={setCursorLine}
                onCommitComment={handleCommitComment}
              />
            ) : (
              <div className="empty">正在加载 {line} 的配置项字典…</div>
            )}
          </section>

          <section className="pane pane-official" aria-label="官方完整配置">
            {official ? (
              <OfficialPane
                text={official.text}
                tag={official.tag}
                publishedAt={official.publishedAt}
                dict={dict}
                annotationMode={annotationMode}
                highlightLines={officialHighlights}
                focus={officialFocus}
              />
            ) : (
              <div className="empty">正在加载 {line} 的官方 conf…</div>
            )}
          </section>
        </div>

        <div className={`bottom${bottomCollapsed ? ' is-collapsed' : ''}`}>
          <Tabs defaultValue="compare">
            <div className="bottom-head">
              <TabsList aria-label="配置视图">
                <TabsTab value="compare">配置对比</TabsTab>
                <TabsTab value="detail">配置项说明</TabsTab>
              </TabsList>
              <span className="spacer" />
              <Button
                aria-label={bottomCollapsed ? '展开下方面板' : '收起下方面板'}
                onClick={() => setBottomCollapsed(!bottomCollapsed)}
              >
                {bottomCollapsed ? '展开' : '收起'}
              </Button>
            </div>
            <TabsPanel value="compare" className="tab-panel">
              {analysis && dict ? (
                <ComparisonList
                  result={analysis}
                  dict={dict}
                  warnings={warnings}
                  onlyDiff={onlyDiff}
                  onJump={jumpToLine}
                />
              ) : (
                <p className="compare-empty">正在加载…</p>
              )}
            </TabsPanel>
            <TabsPanel value="detail" className="tab-panel">
              <DetailPanel
                view={view}
                lineNo={cursorAnalysis ? cursorLine : null}
                onInsertDefault={handleInsertDefault}
                onCopy={() => {
                  if (view.defaultText) void navigator.clipboard?.writeText(view.defaultText);
                }}
              />
            </TabsPanel>
          </Tabs>
        </div>
      </div>

      <div className="footnote">
        左边是你的配置（导入时自动去注释、按官方顺序重排），右边是当前版本官方完整 redis.conf；所有解析都在浏览器内完成，配置内容不会上传。
      </div>

      <input
        ref={fileInput}
        type="file"
        accept=".conf,.config,.txt"
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void readFile(file);
          event.target.value = '';
        }}
      />

      <SearchPalette
        open={searchOpen}
        onOpenChange={setSearchOpen}
        dict={dict}
        configured={new Set(analysis?.firstLineOf.keys() ?? [])}
        onPick={handlePick}
      />
    </main>
  );
}
