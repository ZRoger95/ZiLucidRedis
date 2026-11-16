import { Button } from '@ui-sdk/react/button';
import type { DetailView } from '../lib/describe';

interface DetailPanelProps {
  view: DetailView;
  lineNo: number | null;
  onInsertDefault: () => void;
  onCopy: () => void;
}

export function DetailPanel({ view, lineNo, onInsertDefault, onCopy }: DetailPanelProps) {
  if (!view.name) {
    return (
      <aside className="detail" aria-label="配置项详情">
        <p style={{ color: 'var(--muted)' }}>{view.body[0] ?? '把光标放到某条配置上查看说明。'}</p>
      </aside>
    );
  }

  return (
    <aside className="detail" aria-label="配置项详情">
      <div className="detail-head">
        <h2>{view.name}</h2>
        <div className="meta">
          {view.section}
          {lineNo ? ` · 第 ${lineNo} 行` : ''}
          {view.status ? (
            <>
              {' · '}
              <span className={`badge ${view.status}`}>{view.statusText}</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="detail-grid">
        <div>
          <section className="compare-card" aria-label="当前值与默认值对比">
            <div className={`compare-row ${view.isDiff ? 'is-diff' : ''}`}>
              <span className="compare-label">你的配置</span>
              <code>{view.currentText}</code>
            </div>
            <div className="compare-row">
              <span className="compare-label">官方默认</span>
              <code>{view.defaultText}</code>
            </div>
            {view.rangeText ? (
              <div className="compare-row">
                <span className="compare-label">取值范围</span>
                <code>{view.rangeText}</code>
              </div>
            ) : null}
            <div className="compare-note">
              {view.isDiff ? '与默认值不同' : view.status === 'no-default' ? '官方未给出默认值' : '与默认值一致'}
            </div>
          </section>

          <div className="actions">
            <Button onClick={onInsertDefault} disabled={lineNo === null}>
              改回默认值
            </Button>
            <Button onClick={onCopy}>复制默认值</Button>
          </div>
        </div>

        <div>
          <section className="detail-section">
            <h3>中文摘要</h3>
            <p className={view.zhText ? '' : 'placeholder'}>
              {view.zhText ?? '这一项还没有整理中文摘要，可直接看下方官方说明。'}
            </p>
          </section>

          <section className="detail-section">
            <h3>官方说明</h3>
            {view.body.map((row, index) => (
              <p key={`${index}-${row.slice(0, 12)}`}>{row || ' '}</p>
            ))}
          </section>

          <p style={{ marginTop: 12 }}>
            <a href={view.docUrl} target="_blank" rel="noreferrer">
              官方配置文档 ↗
            </a>
          </p>
        </div>
      </div>
    </aside>
  );
}
