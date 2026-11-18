import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import type { ExportKind } from './components/ExportMenu';
import type { AnnotationMode, DictFile, MetaIndex, PersistedState } from './types';

import { DetailPanel } from './components/DetailPanel';
import { DiffView } from './components/DiffView';
import { Editor } from './components/Editor';
import { EmptyState } from './components/EmptyState';
import { OfficialPane } from './components/OfficialPane';
import { SearchPalette } from './components/SearchPalette';
import { SummaryBar } from './components/SummaryBar';
import { Toolbar } from './components/Toolbar';
import { aliases } from './data/aliases';
import zhNotes from './data/zh-notes.json';
import { useShortcut } from './hooks/useShortcut';
import { analyze } from './lib/analyze';
import { buildAnnotationBlocks } from './lib/annotations';
import { describeDirective } from './lib/describe';
import { DEFAULT_VERSION, loadDict, loadMeta, loadOfficialConf } from './lib/dict';
import { applyDefaultLine, buildDiff } from './lib/diff';
import { exportOriginal, exportWithComments, exportWithSecrets, suggestFileName } from './lib/exportConf';
import { normalizeConfig } from './lib/normalizeConf';
import { indexOfficialLines } from './lib/official';
import { decodeConfBytes, parseConf } from './lib/parseConf';
import { loadState, saveState } from './lib/persistence';
import { evaluateRisks } from './lib/risks';
import { insertDirective } from './lib/search';
import { replaceSecrets } from './lib/secrets';
import { cn } from './lib/utils';

const notes = zhNotes as Record<string, string>;

interface VersionData {
  line: string;
  dict: DictFile;
  official: { text: string; tag: string; publishedAt?: string };
}

export default function App() {
  const [initial] = useState<PersistedState | null>(() => loadState());
  const [line, setLine] = useState(initial?.line ?? DEFAULT_VERSION);
  const [text, setText] = useState(initial?.text ?? '');
  const [onlyDiff, setOnlyDiff] = useState(initial?.onlyDiff ?? false);
  const [showZh, setShowZh] = useState(initial?.showZh ?? true);
  const [annotationMode, setAnnotationMode] = useState<AnnotationMode>(initial?.annotationMode ?? 'missing');
  const [bottomCollapsed, setBottomCollapsed] = useState(initial?.bottomCollapsed ?? false);

  const [versionData, setVersionData] = useState<VersionData | null>(null);
  const [meta, setMeta] = useState<MetaIndex>({});
  const [dictError, setDictError] = useState<{ line: string; message: string } | null>(null);
  const [cursorLine, setCursorLine] = useState(1);
  const [jump, setJump] = useState<{ lineNo: number; nonce: number; focus?: boolean } | null>(null);
  const [editorFocusNonce, setEditorFocusNonce] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [vault, setVault] = useState<Map<string, string>>(new Map());
  const [notice, setNotice] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // 版本数据在加载完成前保持“未就绪”，用版本号比对代替 effect 里的同步 setState(null)
  const dict = versionData?.line === line ? versionData.dict : null;
  const official = versionData?.line === line ? versionData.official : null;
  const activeDictError = dictError?.line === line ? dictError.message : null;

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadDict(line), loadMeta(), loadOfficialConf(line)])
      .then(([nextDict, nextMeta, nextOfficial]) => {
        if (cancelled) {
          return;
        }
        setVersionData({
          line,
          dict: nextDict,
          official: { text: nextOfficial, tag: nextDict.tag, publishedAt: nextDict.publishedAt },
        });
        setMeta(nextMeta);
        setDictError(null);
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setDictError({ line, message: error.message });
        }
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
  const diff = useMemo(
    () => (dict && analysis ? buildDiff(analysis, dict, warnings, { onlyDiff }) : null),
    [dict, analysis, warnings, onlyDiff],
  );
  const riskLines = useMemo(() => new Set(warnings.flatMap((warning) => warning.lineNos)), [warnings]);
  const hasContent = useMemo(() => parsed.some((item) => item.kind === 'directive'), [parsed]);
  const baseline = official ? [official.tag, official.publishedAt?.slice(0, 10)].filter(Boolean).join(' · ') : '';
  const blocks = useMemo(
    () => (analysis ? buildAnnotationBlocks(analysis.lines, analysis.byLine, annotationMode, onlyDiff) : []),
    [analysis, annotationMode, onlyDiff],
  );
  const officialIndex = useMemo(() => (official ? indexOfficialLines(official.text) : new Map()), [official]);

  const officialHighlights = useMemo(() => {
    const lines = new Set<number>();
    if (!analysis) {
      return lines;
    }
    for (const [lineNo, entry] of analysis.byLine) {
      if (
        entry.status !== 'changed' &&
        entry.status !== 'unknown' &&
        entry.status !== 'newer' &&
        entry.status !== 'duplicate'
      ) {
        continue;
      }
      const name = analysis.lines[lineNo - 1]?.name;
      const target = name ? officialIndex.get(name) : undefined;
      if (target) {
        lines.add(target);
      }
    }
    return lines;
  }, [analysis, officialIndex]);

  const cursorAnalysis = analysis?.byLine.get(cursorLine);
  const view = useMemo(() => {
    const cursorArgs = parsed.find((item) => item.lineNo === cursorLine)?.args ?? [];
    return describeDirective(cursorAnalysis?.doc, cursorAnalysis, notes, showZh, cursorArgs);
  }, [cursorAnalysis, cursorLine, parsed, showZh]);

  const officialFocus = useMemo(() => {
    if (!cursorAnalysis?.doc) {
      return null;
    }
    const lineNo = officialIndex.get(cursorAnalysis.doc.name);
    return lineNo ? { lineNo, nonce: cursorLine } : null;
  }, [cursorAnalysis, officialIndex, cursorLine]);

  // 写入 localStorage 属于外部系统副作用，只能放在 effect 里
  useEffect(() => {
    if (!dict) {
      return;
    }
    try {
      saveState({ v: 1, line, text, annotationMode, onlyDiff, showZh, bottomCollapsed });
    } catch {
      // 手写密码时不落盘，避免明文进 localStorage
    }
  }, [dict, line, text, annotationMode, onlyDiff, showZh, bottomCollapsed]);

  useShortcut('mod+k', () => setSearchOpen(true));

  const importText = (raw: string, source: string | null, normalize = true) => {
    const { text: replaced, vault: nextVault, found } = replaceSecrets(raw);
    let next = replaced;
    let sortNote = '';
    if (normalize && officialIndex.size > 0) {
      const normalized = normalizeConfig(replaced, officialIndex);
      next = normalized.text;
      sortNote = `已移除 ${normalized.droppedComments} 行注释，并按官方顺序重排 ${normalized.kept} 行配置`;
      if (normalized.unknown.length) {
        sortNote += `；${normalized.unknown.length} 行无法识别的指令排在末尾`;
      }
      sortNote += '。';
    }
    setText(next);
    setVault(nextVault);
    setFileName(source);
    setCursorLine(1);
    setNotice([sortNote, found ? `已把 ${found} 处密码替换为 \${env_*} 占位符。` : ''].filter(Boolean).join(' '));
  };

  const loadOfficialIntoEditor = () => {
    if (!official) {
      return;
    }
    importText(official.text, `redis-${line}.conf`, false);
  };

  const readFile = async (file: File) => {
    const { text: decoded, warning } = decodeConfBytes(await file.arrayBuffer());
    if (warning) {
      setNotice(warning);
    }
    importText(decoded, file.name);
  };

  const jumpToLine = (lineNo: number, focus = true) => {
    setCursorLine(lineNo);
    setJump({ lineNo, nonce: Date.now(), focus });
  };

  const handleJumpKind = (kind: 'changed' | 'unknown' | 'removed' | 'newer' | 'duplicate' | 'missing') => {
    if (kind === 'missing') {
      setSearchOpen(true);
      return;
    }
    if (!analysis) {
      return;
    }
    for (const [lineNo, entry] of analysis.byLine) {
      if (entry.status === kind) {
        jumpToLine(lineNo);
        return;
      }
    }
  };

  const handleInsertDefault = () => {
    const doc = cursorAnalysis?.doc;
    if (!doc || doc.defaultValue === null) {
      return;
    }
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
    if (!dict || !analysis) {
      return;
    }
    if (exists) {
      const lineNo = analysis.firstLineOf.get(name);
      if (lineNo) {
        jumpToLine(lineNo);
      }
      return;
    }
    const doc = dict.directives.find((directive) => directive.name === name);
    if (!doc) {
      return;
    }
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
    if (!dict) {
      return;
    }
    if (kind === 'original') {
      download(exportOriginal(text));
    } else if (kind === 'comments') {
      download(exportWithComments(parsed, dict));
    } else {
      if (!vault.size) {
        return;
      }
      const ok = window.confirm('导出的文件将包含明文密码，确认继续？');
      if (ok) {
        download(exportWithSecrets(text, vault));
      }
    }
  };

  let editorBody: ReactNode;
  if (text.trim() === '') {
    editorBody = <EmptyState onOfficial={loadOfficialIntoEditor} onUpload={() => fileInput.current?.click()} />;
  } else if (analysis) {
    editorBody = (
      <Editor
        value={text}
        result={analysis}
        blocks={blocks}
        onlyDiff={onlyDiff}
        forceVisibleLines={riskLines}
        jumpTo={jump}
        focusRequest={editorFocusNonce}
        onChange={setText}
        onCursorLine={setCursorLine}
        onCommitComment={handleCommitComment}
      />
    );
  } else {
    editorBody = (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">正在加载 {line} 的配置项字典…</div>
    );
  }

  return (
    <main
      className="flex h-full min-w-[1024px] flex-col"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files?.[0];
        if (file) {
          void readFile(file);
        }
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

      {notice ? (
        <div className="border-b border-[#fed7aa] bg-[#fff7ed] px-3.5 py-1.5 text-[13px] text-[#9a3412]">{notice}</div>
      ) : null}
      {activeDictError ? (
        <div className="border-b border-[#fed7aa] bg-[#fff7ed] px-3.5 py-1.5 text-[13px] text-[#9a3412]">
          字典加载失败：{activeDictError}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="grid min-h-[240px] flex-1 grid-cols-2">
          <section className="flex min-h-0 min-w-0 flex-col border-r border-line" aria-label="你的配置">
            <div className="flex items-baseline gap-2.5 border-b border-line bg-panel px-3 py-1.5 text-xs text-muted-foreground">
              <strong className="text-[13px] text-ink">你的配置</strong>
              {analysis ? (
                <span>
                  {parsed.length} 行 · 已改 {analysis.counts.changed}
                </span>
              ) : null}
              <span className="flex-1" />
              <span className="text-[#9aa1ad]">可直接编辑；导入文件时会去注释、按官方顺序重排</span>
            </div>
            {editorBody}
          </section>

          <section className="flex min-h-0 min-w-0 flex-col border-r-0 bg-[#fbfbfc]" aria-label="官方完整配置">
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
              <div className="flex flex-1 items-center justify-center text-muted-foreground">
                正在加载 {line} 的官方 conf…
              </div>
            )}
          </section>
        </div>

        <div
          className={cn(
            'flex flex-col border-t border-line',
            bottomCollapsed ? 'h-auto min-h-0' : 'h-[36vh] min-h-[220px]',
          )}
        >
          <Tabs defaultValue="compare" className="flex min-h-0 flex-1 flex-col">
            <div
              className={cn(
                'flex items-center gap-2 border-b border-line bg-panel px-3 py-1.5',
                bottomCollapsed && 'border-b-0',
              )}
            >
              <TabsList aria-label="配置视图" className="flex items-center gap-0.5 rounded-lg bg-[#eceef2] p-0.5">
                <TabsTrigger
                  value="compare"
                  className="rounded-md px-3.5 py-1.5 text-[13px] text-muted-foreground data-[state=active]:bg-white data-[state=active]:font-semibold data-[state=active]:text-ink data-[state=active]:shadow-sm"
                >
                  配置对比
                </TabsTrigger>
                <TabsTrigger
                  value="detail"
                  className="rounded-md px-3.5 py-1.5 text-[13px] text-muted-foreground data-[state=active]:bg-white data-[state=active]:font-semibold data-[state=active]:text-ink data-[state=active]:shadow-sm"
                >
                  配置项说明
                </TabsTrigger>
              </TabsList>
              <span className="flex-1" />
              <Button
                variant="outline"
                aria-label={bottomCollapsed ? '展开下方面板' : '收起下方面板'}
                onClick={() => setBottomCollapsed(!bottomCollapsed)}
              >
                {bottomCollapsed ? '展开' : '收起'}
              </Button>
            </div>
            <TabsContent
              value="compare"
              className={cn('min-h-0 flex-1 overflow-auto bg-white', bottomCollapsed && 'hidden')}
            >
              {diff ? (
                <DiffView
                  model={diff}
                  warnings={warnings}
                  onlyDiff={onlyDiff}
                  hasContent={hasContent}
                  baseline={baseline}
                  onJump={jumpToLine}
                  onRowActivate={(lineNo) => jumpToLine(lineNo, false)}
                  onEscape={() => setEditorFocusNonce((value) => value + 1)}
                  onApplyDefault={(lineNo, value) => setText(applyDefaultLine(text, lineNo, value))}
                />
              ) : (
                <p className="m-0 px-3.5 pt-2.5 pb-3.5 text-[13px] text-muted-foreground">正在加载…</p>
              )}
            </TabsContent>
            <TabsContent
              value="detail"
              className={cn('min-h-0 flex-1 overflow-auto bg-white', bottomCollapsed && 'hidden')}
            >
              <DetailPanel
                view={view}
                lineNo={cursorAnalysis ? cursorLine : null}
                onInsertDefault={handleInsertDefault}
                onCopy={() => {
                  if (view.defaultText) {
                    void navigator.clipboard?.writeText(view.defaultText);
                  }
                }}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <div className="border-t border-line bg-panel px-3.5 py-2 text-xs text-muted-foreground">
        左边是你的配置（导入时自动去注释、按官方顺序重排），右边是当前版本官方完整
        redis.conf；所有解析都在浏览器内完成，配置内容不会上传。
      </div>

      <input
        ref={fileInput}
        type="file"
        accept=".conf,.config,.txt"
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void readFile(file);
          }
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
