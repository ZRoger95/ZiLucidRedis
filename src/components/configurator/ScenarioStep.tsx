import { useState } from 'react';

import type {
  ClusterAnswers,
  ReplicaSentinelAnswers,
  ScenarioAnswers,
  ScenarioId,
  ScenarioPersistence,
  ScenarioProfile,
  ScenarioRegistry,
} from '@/types';

import { Callout } from '@/components/callout';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import scenarios from '@/data/scenarios.json';
import { formatBudget, parseBudget, SCENARIO_ID } from '@/lib/scenario';

import { StepHeader } from './StepHeader';

const REGISTRIES = scenarios as Record<ScenarioId, ScenarioRegistry>;

const STEP_META: Record<string, { summary: string; title: string }> = {
  __cluster_network__: { summary: '节点地址、认证方式与访问面；集群节点之间要能互通。', title: '网络与认证' },
  __cluster_persistence__: { summary: '数据能不能丢？选择崩溃与重启时的数据保护方式。', title: '持久化' },
  __cluster_resource__: { summary: '独占选规格档位；混部给出单个节点的内存预算。', title: '资源' },
  __scenario_access__: { summary: '谁来连这个 Redis？决定监听地址与认证强度。', title: '访问面' },
  __scenario_persistence__: { summary: '数据能不能丢？选择崩溃与重启时的数据保护方式。', title: '持久化' },
  __scenario_profile__: { summary: '这台 VPS 是只跑 Redis，还是与其他服务混部？', title: '部署画像' },
  __scenario_resource__: { summary: '独占选规格档位；混部给出 Redis 的内存预算。', title: '资源' },
  __repl_network__: { summary: '主库地址、认证方式与访问面。', title: '网络与认证' },
  __repl_persistence__: { summary: '数据能不能丢？选择崩溃与重启时的数据保护方式。', title: '持久化' },
  __repl_resource__: { summary: '独占选规格档位；混部给出 Redis 的内存预算。', title: '资源' },
};

interface ScenarioStepProps {
  stepId: string;
  scenarioId: ScenarioId;
  answers: ClusterAnswers | ReplicaSentinelAnswers | ScenarioAnswers;
  onChange: (patch: Partial<ClusterAnswers | ReplicaSentinelAnswers | ScenarioAnswers>) => void;
}

interface OptionProps {
  help?: string;
  id: string;
  label: string;
  summary: string;
  value: string;
}

function Option({ help, id, label, summary, value }: OptionProps) {
  return (
    <div className="rounded-md border border-line transition-colors [&:has([data-state=checked])]:border-primary/60">
      <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5">
        <RadioGroupItem aria-label={label} className="mt-1" id={id} value={value} />
        <span className="min-w-0 space-y-0.5">
          <span className="block text-[13px] font-medium text-ink">{label}</span>
          <span className="block text-[12px] leading-5 text-muted-foreground">{summary}</span>
        </span>
      </label>
      {help ? (
        <details className="ml-6 px-3 pb-2.5 text-[12px] text-muted-foreground">
          <summary className="cursor-pointer text-ink">官方说明</summary>
          <p className="mt-1 mb-0 leading-5">{help}</p>
        </details>
      ) : null}
    </div>
  );
}

interface ProfileAnswers {
  profile: ScenarioProfile;
}

function ProfileQuestion({
  answers,
  onChange,
}: {
  answers: ProfileAnswers;
  onChange: (patch: Partial<ProfileAnswers>) => void;
}) {
  return (
    <RadioGroup
      value={answers.profile}
      onValueChange={(value) => onChange({ profile: value as ScenarioProfile })}
      className="gap-2.5"
    >
      <Option
        id="profile-dedicated"
        value="dedicated"
        label="独占整机"
        summary="整台机器只跑 Redis，资源按规格档位估算"
      />
      <Option
        id="profile-shared"
        value="shared"
        label="与其他服务混部"
        summary="机器上还有别的服务，需要给出 Redis 的内存预算"
      />
    </RadioGroup>
  );
}

interface ResourceAnswers {
  profile: ScenarioProfile;
  tier?: string;
  budgetMb?: number;
}

function ResourceQuestion({
  answers,
  onChange,
  registry,
}: {
  answers: ResourceAnswers;
  onChange: (patch: Partial<ResourceAnswers>) => void;
  registry: ScenarioRegistry;
}) {
  const [unit, setUnit] = useState<'GB' | 'MB'>('GB');
  const [budgetText, setBudgetText] = useState<string | null>(null);
  const baseMb =
    answers.profile === 'dedicated'
      ? (registry.tiers.find((tier) => tier.id === answers.tier)?.ramMb ?? 0)
      : (answers.budgetMb ?? 0);
  const smallMemory =
    baseMb > 0 && baseMb <= 1024 ? (
      <Callout type="warning" title="小内存">
        <p>1G 及以下内存写密集时 fork 可能失败，持久化慎开，并务必设置 vm.overcommit_memory=1。</p>
      </Callout>
    ) : null;
  if (answers.profile === 'dedicated') {
    return (
      <div className="space-y-3">
        <RadioGroup value={answers.tier ?? ''} onValueChange={(value) => onChange({ tier: value })} className="gap-2.5">
          {registry.tiers.map((tier) => (
            <Option
              key={tier.id}
              id={`tier-${tier.id}`}
              value={tier.id}
              label={tier.label}
              summary={`内存 ${tier.ramMb}MB`}
            />
          ))}
        </RadioGroup>
        {smallMemory}
      </div>
    );
  }
  const display = budgetText ?? formatBudget(answers.budgetMb ?? 0, unit);
  const budgetInvalid = budgetText !== null && parseBudget(budgetText, unit).state === 'invalid';
  return (
    <div className="space-y-3">
      <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
        <span>打算给 Redis</span>
        <Input
          aria-invalid={budgetInvalid}
          aria-label="内存预算"
          className="w-32 font-mono"
          inputMode="decimal"
          value={display}
          onBlur={() => {
            if (budgetText === null) {
              return;
            }
            if (parseBudget(budgetText, unit).state === 'ok') {
              setBudgetText(null);
            }
          }}
          onChange={(event) => {
            const text = event.target.value;
            setBudgetText(text);
            const parsed = parseBudget(text, unit);
            onChange({ budgetMb: parsed.state === 'ok' ? parsed.mb : undefined });
          }}
        />
        <Select
          value={unit}
          onValueChange={(value) => {
            setUnit(value as 'GB' | 'MB');
            setBudgetText(null);
          }}
        >
          <SelectTrigger aria-label="预算单位" className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="GB">GB</SelectItem>
            <SelectItem value="MB">MB</SelectItem>
          </SelectContent>
        </Select>
      </span>
      {budgetInvalid ? (
        <p className="m-0 text-[11px] text-[#9a3412]" role="alert">
          请输入数字，例如 2.5；不接受其他字符。
        </p>
      ) : null}
      <Callout type="note" title="估算方式">
        <p>机器总内存减去其他服务常驻占用，再留余量；预设会再按 75% 落到 maxmemory，为 fork 与碎片留空间。</p>
      </Callout>
      {smallMemory}
    </div>
  );
}

interface PersistenceAnswers {
  persistence: ScenarioPersistence;
}

function PersistenceQuestion({
  answers,
  onChange,
  registry,
}: {
  answers: PersistenceAnswers;
  onChange: (patch: Partial<PersistenceAnswers>) => void;
  registry: ScenarioRegistry;
}) {
  return (
    <div className="space-y-3">
      <RadioGroup
        value={answers.persistence}
        onValueChange={(value) => onChange({ persistence: value as ScenarioPersistence })}
        className="gap-2.5"
      >
        {registry.persistence.map((option) => (
          <Option
            key={option.id}
            id={`persistence-${option.id}`}
            value={option.id}
            label={option.label}
            summary={option.summary}
            help={option.help}
          />
        ))}
      </RadioGroup>
      {answers.persistence === 'off' ? null : (
        <Callout type="warning" title="磁盘空间">
          <p>开持久化时磁盘剩余空间要够数据集的 2–3 倍（RDB 与 AOF 重写会同时落盘）。</p>
        </Callout>
      )}
    </div>
  );
}

function AccessQuestion({
  answers,
  onChange,
  registry,
}: {
  answers: ScenarioAnswers;
  onChange: (patch: Partial<ScenarioAnswers>) => void;
  registry: ScenarioRegistry;
}) {
  return (
    <div className="space-y-3">
      <RadioGroup
        value={answers.access}
        onValueChange={(value) => onChange({ access: value as ScenarioAnswers['access'] })}
        className="gap-2.5"
      >
        {registry.access.map((option) => (
          <Option
            key={option.id}
            id={`access-${option.id}`}
            value={option.id}
            label={option.label}
            summary={option.summary}
          />
        ))}
      </RadioGroup>
      {answers.access === 'intranet' ? (
        <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
          <span>内网 IP</span>
          <Input
            aria-label="内网 IP"
            className="w-56 font-mono"
            value={answers.bindIp ?? ''}
            onChange={(event) => onChange({ bindIp: event.target.value })}
          />
        </span>
      ) : null}
      {answers.access === 'local' ? null : (
        <div className="space-y-1">
          <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
            <span>连接密码</span>
            <Input
              aria-label="连接密码"
              type="password"
              className="w-56 font-mono"
              value={answers.password ?? ''}
              onChange={(event) => onChange({ password: event.target.value })}
            />
          </span>
          <p className="m-0 text-[11px] text-[#9a3412]">敏感值不保存，刷新后需重新填写。</p>
        </div>
      )}
      {answers.access === 'intranet' ? (
        <Callout type="note" title="防火墙">
          <p>只放行可信 IP 访问 6379 端口，不要把端口暴露到公网。</p>
        </Callout>
      ) : null}
      {answers.access === 'public' ? (
        <Callout type="warning" title="公网直连风险高">
          <p>
            强烈建议改用内网或隧道。仍要公网直连时：务必设强密码，在 SECURITY 步用 ACL 禁用 FLUSHALL / CONFIG
            等危险命令，并按 TLS/SSL 步指引启用加密传输。
          </p>
        </Callout>
      ) : null}
    </div>
  );
}

function ReplNetworkQuestion({
  answers,
  onChange,
  registry,
}: {
  answers: ReplicaSentinelAnswers;
  onChange: (patch: Partial<ReplicaSentinelAnswers>) => void;
  registry: ScenarioRegistry;
}) {
  return (
    <div className="space-y-3">
      <RadioGroup
        value={answers.access}
        onValueChange={(value) => onChange({ access: value as ReplicaSentinelAnswers['access'] })}
        className="gap-2.5"
      >
        {registry.access.map((option) => (
          <Option
            key={option.id}
            id={`repl-access-${option.id}`}
            value={option.id}
            label={option.label}
            summary={option.summary}
          />
        ))}
      </RadioGroup>
      <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
        <span>主库地址</span>
        <Input
          aria-label="主库地址"
          className="w-56 font-mono"
          value={answers.masterHost ?? ''}
          onChange={(event) => onChange({ masterHost: event.target.value })}
        />
      </span>
      <div className="space-y-1">
        <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
          <span>连接密码</span>
          <Input
            aria-label="连接密码"
            type="password"
            className="w-56 font-mono"
            value={answers.password ?? ''}
            onChange={(event) => onChange({ password: event.target.value })}
          />
        </span>
        <p className="m-0 text-[11px] text-[#9a3412]">敏感值不保存，刷新后需重新填写。</p>
      </div>
      {answers.access === 'intranet' ? (
        <Callout type="note" title="防火墙">
          <p>只放行可信 IP 访问 6379 / 6380 / 6381 与 26379–26381，不要把端口暴露到公网。</p>
        </Callout>
      ) : (
        <Callout type="warning" title="公网直连风险高">
          <p>
            强烈建议改用内网或隧道。仍要公网直连时：务必设强密码，主从与哨兵之间都使用同一密码，并按 TLS/SSL
            步指引启用加密传输。
          </p>
        </Callout>
      )}
    </div>
  );
}

function ClusterNetworkQuestion({
  answers,
  onChange,
  registry,
}: {
  answers: ClusterAnswers;
  onChange: (patch: Partial<ClusterAnswers>) => void;
  registry: ScenarioRegistry;
}) {
  return (
    <div className="space-y-3">
      <RadioGroup
        value={answers.access}
        onValueChange={(value) => onChange({ access: value as ClusterAnswers['access'] })}
        className="gap-2.5"
      >
        {registry.access.map((option) => (
          <Option
            key={option.id}
            id={`cluster-access-${option.id}`}
            value={option.id}
            label={option.label}
            summary={option.summary}
          />
        ))}
      </RadioGroup>
      <div className="space-y-1">
        <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
          <span>节点内网 IP</span>
          <Input
            aria-label="节点内网 IP"
            className="w-56 font-mono"
            value={answers.nodeIp ?? ''}
            onChange={(event) => onChange({ nodeIp: event.target.value })}
          />
        </span>
        <p className="m-0 text-[11px] text-muted-foreground">
          同一台机器跑多个实例时填本机地址；跨机部署需在生成后把每份文件的 bind 换成本机地址。
        </p>
      </div>
      <div className="space-y-1">
        <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
          <span>连接密码</span>
          <Input
            aria-label="连接密码"
            type="password"
            className="w-56 font-mono"
            value={answers.password ?? ''}
            onChange={(event) => onChange({ password: event.target.value })}
          />
        </span>
        <p className="m-0 text-[11px] text-[#9a3412]">六个节点共用同一密码；敏感值不保存，刷新后需重新填写。</p>
      </div>
      {answers.access === 'intranet' ? (
        <Callout type="note" title="防火墙">
          <p>放行 7000–7005 与总线端口 17000–17005，仅对可信内网开放；总线端口不放行会导致节点互相认为下线。</p>
        </Callout>
      ) : (
        <Callout type="warning" title="公网直连风险高">
          <p>
            强烈建议改用内网或隧道。仍要公网直连时：务必设强密码，六个节点使用同一密码，并为每个节点配置
            cluster-announce-ip，否则节点互相不可达。
          </p>
        </Callout>
      )}
    </div>
  );
}

export function ScenarioStep({ stepId, scenarioId, answers, onChange }: ScenarioStepProps) {
  const registry = REGISTRIES[scenarioId];
  const meta = STEP_META[stepId];
  const question = (() => {
    if (stepId === '__scenario_profile__') {
      return <ProfileQuestion answers={answers as ScenarioAnswers} onChange={onChange} />;
    }
    if (stepId === '__scenario_resource__') {
      return <ResourceQuestion answers={answers} onChange={onChange} registry={registry} />;
    }
    if (stepId === '__repl_resource__' || stepId === '__cluster_resource__') {
      return (
        <div className="space-y-3">
          <ProfileQuestion answers={answers} onChange={onChange} />
          <ResourceQuestion answers={answers} onChange={onChange} registry={registry} />
        </div>
      );
    }
    if (
      stepId === '__scenario_persistence__' ||
      stepId === '__repl_persistence__' ||
      stepId === '__cluster_persistence__'
    ) {
      return <PersistenceQuestion answers={answers} onChange={onChange} registry={registry} />;
    }
    if (stepId === '__scenario_access__') {
      return (
        <AccessQuestion answers={answers as ScenarioAnswers} onChange={onChange} registry={REGISTRIES[SCENARIO_ID]} />
      );
    }
    if (stepId === '__cluster_network__') {
      return (
        <ClusterNetworkQuestion
          answers={answers as ClusterAnswers}
          onChange={onChange as (patch: Partial<ClusterAnswers>) => void}
          registry={registry}
        />
      );
    }
    return (
      <ReplNetworkQuestion
        answers={answers as ReplicaSentinelAnswers}
        onChange={onChange as (patch: Partial<ReplicaSentinelAnswers>) => void}
        registry={registry}
      />
    );
  })();

  return (
    <div className="max-w-3xl space-y-6">
      <StepHeader crumb={`~/configurator · 问卷 · ${meta.title}`} title={meta.title} summary={meta.summary} />
      <Callout type="note" title="提示">
        <p>重新回答会覆盖预设项的修改</p>
        <p>答案逐步保存，刷新后进度不丢（密码除外）。</p>
      </Callout>
      {question}
    </div>
  );
}
